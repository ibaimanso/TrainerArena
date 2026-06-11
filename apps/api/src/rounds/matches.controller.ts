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
import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
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

class MatchMessageDto {
  @IsString({ message: 'El mensaje es obligatorio.' })
  @IsNotEmpty({ message: 'El mensaje es obligatorio.' })
  @MaxLength(2000, { message: 'El mensaje no puede superar los 2000 caracteres.' })
  message!: string;
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
      // Registered player before round 1: the page shows a countdown to startAt.
      if (
        tournament.status === 'registration_open' ||
        tournament.status === 'registration_closed'
      ) {
        const registration = await this.prisma.tournamentRegistration.findUnique({
          where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
        });
        if (registration && registration.status !== 'dropped') {
          return {
            match: null,
            notStarted: {
              name: tournament.name,
              startAt: tournament.startAt.toISOString(),
              status: tournament.status,
            },
            serverNow: new Date().toISOString(),
          };
        }
      }
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
    // TCG Live usernames come from the tournament registrations (SPEC §3).
    const playerIds = [match.playerAId, match.playerBId].filter((id): id is number => id !== null);
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id, userId: { in: playerIds } },
      select: { userId: true, tcgLiveUsername: true },
    });
    const tcgLiveByUser = new Map(registrations.map((r) => [r.userId, r.tcgLiveUsername]));
    const opponentUser = isPlayerA ? match.playerB : match.playerA;
    const opponent = opponentUser
      ? { ...opponentUser, tcgLiveUsername: tcgLiveByUser.get(opponentUser.id) ?? null }
      : null;
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
        checkInDeadline:
          round.startedAt && round.status === 'active'
            ? new Date(
                round.startedAt.getTime() + tournament.checkinMinutes * 60 * 1000
              ).toISOString()
            : null,
        opponent,
        myTcgLiveUsername: tcgLiveByUser.get(user.id) ?? null,
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

  /** Player-to-player chat (read also allowed to tournament judges/admin). */
  @Get('matches/:id/messages')
  async messages(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    const match = await this.matches.matchById(id);
    const messages = await this.matches.listMessages(match, user);
    return {
      readOnly: !this.matches.isChatOpen(match),
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        message: m.message,
        sentAt: m.sentAt.toISOString(),
      })),
    };
  }

  @Post('matches/:id/messages')
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MatchMessageDto
  ) {
    // 20/min per user, same spirit as SPEC §14 chat limits
    await this.rateLimit.consume(`match-message:${user.id}`, 20, 60);
    const match = await this.matches.matchById(id);
    const created = await this.matches.sendMessage(match, user.id, dto.message);
    return {
      message: {
        id: created.id,
        sender: created.sender,
        message: created.message,
        sentAt: created.sentAt.toISOString(),
      },
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
