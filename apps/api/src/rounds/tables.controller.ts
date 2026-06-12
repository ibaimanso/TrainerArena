import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Tournament } from '@prisma/client';
import {
  canResolveDispute,
  type MatchOutcome,
  type TournamentStatus,
} from '@apptorneos/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { MatchesService } from './matches.service';

const FORCE_OUTCOMES = [
  'a_wins',
  'b_wins',
  'draw',
  'forfeit_a',
  'forfeit_b',
  'forfeit_both',
] as const;

class ForceResultDto {
  @IsIn(FORCE_OUTCOMES, { message: 'El resultado no es válido.' })
  result!: (typeof FORCE_OUTCOMES)[number];

  @IsOptional()
  @IsString({ message: 'El marcador no es válido.' })
  @MaxLength(20, { message: 'El marcador no puede superar los 20 caracteres.' })
  score?: string;
}

/**
 * Round control board (judges + organizer): every table of the current round
 * with full info, and a result override for stalled tables.
 */
@Controller('judge')
@UseGuards(AuthGuard)
export class TablesController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly matches: MatchesService,
    private readonly prisma: PrismaService
  ) {}

  /** Approved judge of the tournament, its organizer, or a superadmin. */
  private async assertJudgeOrAdmin(
    user: AuthenticatedUser,
    tournament: Tournament
  ): Promise<void> {
    if (user.roles.includes('superadmin') || tournament.adminId === user.id) return;
    const application = await this.prisma.judgeApplication.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
    });
    if (application?.status !== 'approved') {
      throw new ForbiddenException('No eres juez aprobado ni organizador de este torneo.');
    }
  }

  @Get('tournaments/:slug/tables')
  async tables(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    await this.assertJudgeOrAdmin(user, tournament);
    if (!tournament.currentRoundId) {
      throw new NotFoundException('El torneo no tiene una ronda en curso.');
    }
    const round = await this.prisma.round.findUniqueOrThrow({
      where: { id: tournament.currentRoundId },
    });
    const matches = await this.prisma.match.findMany({
      where: { roundId: round.id },
      orderBy: { tableNumber: 'asc' },
      include: {
        playerA: { select: { id: true, name: true } },
        playerB: { select: { id: true, name: true } },
        reports: { include: { reporter: { select: { id: true, name: true } } } },
        result: true,
      },
    });
    // TCG Live usernames come from the registrations.
    const playerIds = matches.flatMap((m) =>
      [m.playerAId, m.playerBId].filter((id): id is number => id !== null)
    );
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, userId: { in: playerIds } },
      select: { userId: true, tcgLiveUsername: true },
    });
    const tcgByUser = new Map(registrations.map((r) => [r.userId, r.tcgLiveUsername]));

    const player = (p: { id: number; name: string } | null) =>
      p ? { id: p.id, name: p.name, tcgLiveUsername: tcgByUser.get(p.id) ?? null } : null;

    return {
      tournament: { slug: tournament.slug, name: tournament.name },
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        phase: round.phase,
        status: round.status,
        endsAt: round.endsAt?.toISOString() ?? null,
        bestOf: round.phase === 'swiss' ? tournament.swissBo : tournament.topCutBo,
      },
      matches: matches.map((m) => ({
        id: m.id,
        tableNumber: m.tableNumber,
        status: m.status,
        isBye: m.isBye,
        playerA: player(m.playerA),
        playerB: player(m.playerB),
        checkInA: m.checkInAAt?.toISOString() ?? null,
        checkInB: m.checkInBAt?.toISOString() ?? null,
        reports: m.reports.map((r) => ({
          reporter: r.reporter,
          result: r.result,
          score: r.score,
          reportedAt: r.reportedAt.toISOString(),
        })),
        result: m.result
          ? { result: m.result.result, winnerId: m.result.winnerId, score: m.result.score }
          : null,
      })),
      serverNow: new Date().toISOString(),
    };
  }

  @Post('matches/:id/force-result')
  @HttpCode(200)
  async forceResult(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ForceResultDto
  ): Promise<{ ok: true }> {
    const match = await this.matches.matchById(id);
    if (match.isBye) {
      throw new NotFoundException('Una mesa con bye no tiene resultado que forzar.');
    }
    const application = await this.prisma.judgeApplication.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId: match.round.tournamentId,
          userId: user.id,
        },
      },
    });
    // Same policy as dispute resolution: judge/organizer/superadmin, never a player of the match.
    const allowed = canResolveDispute(
      { id: user.id, roles: user.roles, emailVerified: true },
      {
        tournament: {
          id: match.round.tournament.id,
          adminId: match.round.tournament.adminId,
          status: match.round.tournament.status as TournamentStatus,
        },
        match: { playerAId: match.playerAId, playerBId: match.playerBId },
        isApprovedJudge: application?.status === 'approved',
      }
    );
    if (!allowed) {
      throw new ForbiddenException('No puedes forzar resultados en este torneo.');
    }
    await this.matches.forceResult(match, user.id, dto.result as MatchOutcome, dto.score ?? null);
    return { ok: true };
  }
}
