import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { REPORT_RESULTS, type ReportResult } from '@apptorneos/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { RateLimitService } from '../common/rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { MatchesService } from './matches.service';

class ReportDto {
  @IsIn(REPORT_RESULTS, { message: 'El resultado debe ser win, loss o draw.' })
  result!: ReportResult;

  @IsOptional()
  @IsString({ message: 'El marcador no es válido.' })
  @MaxLength(20, { message: 'El marcador no puede superar los 20 caracteres.' })
  score?: string;
}

@Controller()
@UseGuards(AuthGuard)
export class MatchesController {
  constructor(
    private readonly matches: MatchesService,
    private readonly tournaments: TournamentsService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService
  ) {}

  /** "Mi match" data (SPEC §12): the viewer's match in the current round; byes → 404. */
  @Get('tournaments/:slug/my-match')
  async myMatch(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    if (!tournament.currentRoundId) {
      throw new NotFoundException('No tienes partida en la ronda actual.');
    }
    const round = await this.prisma.round.findUniqueOrThrow({
      where: { id: tournament.currentRoundId },
    });
    const match = await this.prisma.match.findFirst({
      where: {
        roundId: round.id,
        isBye: false,
        OR: [{ playerAId: user.id }, { playerBId: user.id }],
      },
      include: {
        playerA: { select: { id: true, name: true } },
        playerB: { select: { id: true, name: true } },
        reports: true,
        result: true,
        judgeCalls: {
          where: { createdById: user.id, status: { in: ['open', 'in_progress'] } },
          include: { assignedJudge: { select: { id: true, name: true } } },
        },
      },
    });
    if (!match) {
      throw new NotFoundException('No tienes partida en la ronda actual.');
    }
    const isPlayerA = match.playerAId === user.id;
    const myReport = match.reports.find((r) => r.reporterId === user.id);
    const liveCall = match.judgeCalls[0] ?? null;
    return {
      match: {
        id: match.id,
        tableNumber: match.tableNumber,
        status: match.status,
        roundNumber: round.roundNumber,
        phase: round.phase,
        endsAt: round.endsAt?.toISOString() ?? null,
        roundStatus: round.status,
        opponent: isPlayerA ? match.playerB : match.playerA,
        myCheckIn: (isPlayerA ? match.checkInAAt : match.checkInBAt)?.toISOString() ?? null,
        opponentCheckIn:
          (isPlayerA ? match.checkInBAt : match.checkInAAt)?.toISOString() ?? null,
        myReport: myReport ? { result: myReport.result, score: myReport.score } : null,
        result: match.result
          ? { result: match.result.result, winnerId: match.result.winnerId, score: match.result.score }
          : null,
        bestOf: round.phase === 'swiss' ? tournament.swissBo : tournament.topCutBo,
        judgeCall: liveCall
          ? {
              id: liveCall.id,
              status: liveCall.status,
              assignedJudge: liveCall.assignedJudge,
            }
          : null,
      },
      serverNow: new Date().toISOString(),
    };
  }

  @Post('matches/:id/checkin')
  @HttpCode(200)
  async checkIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number
  ): Promise<{ ok: true }> {
    const match = await this.matches.matchById(id);
    await this.matches.checkIn(match, user.id);
    return { ok: true };
  }

  @Post('matches/:id/report')
  @HttpCode(200)
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReportDto
  ): Promise<{ ok: true }> {
    // 10/min per user (SPEC §14)
    await this.rateLimit.consume(`report:${user.id}`, 10, 60);
    const match = await this.matches.matchById(id);
    await this.matches.report(match, user.id, dto.result, dto.score ?? null);
    return { ok: true };
  }
}
