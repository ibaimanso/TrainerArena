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
import {
  canResolveDispute,
  type MatchOutcome,
  type TournamentStatus,
} from '@apptorneos/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { MatchesService } from './matches.service';

const DISPUTE_OUTCOMES = [
  'a_wins',
  'b_wins',
  'draw',
  'forfeit_a',
  'forfeit_b',
  'forfeit_both',
] as const;

class ResolveDisputeDto {
  @IsIn(DISPUTE_OUTCOMES, { message: 'El resultado no es válido.' })
  result!: (typeof DISPUTE_OUTCOMES)[number];

  @IsOptional()
  @IsString({ message: 'El marcador no es válido.' })
  @MaxLength(20, { message: 'El marcador no puede superar los 20 caracteres.' })
  score?: string;
}

@Controller('judge/disputes')
@UseGuards(AuthGuard)
export class DisputesController {
  constructor(
    private readonly matches: MatchesService,
    private readonly prisma: PrismaService
  ) {}

  private async assertCanResolve(
    user: AuthenticatedUser,
    match: Awaited<ReturnType<MatchesService['matchById']>>
  ): Promise<void> {
    const application = await this.prisma.judgeApplication.findUnique({
      where: {
        tournamentId_userId: {
          tournamentId: match.round.tournamentId,
          userId: user.id,
        },
      },
    });
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
      throw new ForbiddenException('No puedes resolver disputas de este torneo.');
    }
  }

  /** Dispute detail: both reports with reporter, value, score and time (SPEC §6.7). */
  @Get(':matchId')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId', ParseIntPipe) matchId: number
  ) {
    const match = await this.matches.matchById(matchId);
    if (match.status !== 'disputed') {
      throw new NotFoundException('La partida no está en disputa.');
    }
    await this.assertCanResolve(user, match);
    const reports = await this.prisma.matchReport.findMany({
      where: { matchId: match.id },
      include: { reporter: { select: { id: true, name: true } } },
      orderBy: { reportedAt: 'asc' },
    });
    const [playerA, playerB] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: match.playerAId }, select: { id: true, name: true } }),
      match.playerBId
        ? this.prisma.user.findUnique({ where: { id: match.playerBId }, select: { id: true, name: true } })
        : null,
    ]);
    return {
      match: {
        id: match.id,
        tableNumber: match.tableNumber,
        roundNumber: match.round.roundNumber,
        tournamentSlug: match.round.tournament.slug,
        tournamentName: match.round.tournament.name,
        playerA,
        playerB,
      },
      reports: reports.map((r) => ({
        reporter: r.reporter,
        result: r.result,
        score: r.score,
        reportedAt: r.reportedAt.toISOString(),
      })),
    };
  }

  @Post(':matchId/resolve')
  @HttpCode(200)
  async resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('matchId', ParseIntPipe) matchId: number,
    @Body() dto: ResolveDisputeDto
  ): Promise<{ ok: true }> {
    const match = await this.matches.matchById(matchId);
    if (match.status !== 'disputed') {
      throw new NotFoundException('La partida no está en disputa.');
    }
    await this.assertCanResolve(user, match);
    await this.matches.resolveDispute(match, user.id, dto.result as MatchOutcome, dto.score ?? null);
    return { ok: true };
  }
}
