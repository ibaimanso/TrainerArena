import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { RateLimitService } from '../common/rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';
import { MatchesService } from '../rounds/matches.service';
import { JudgeCallsService } from './judge-calls.service';

class MessageDto {
  @IsString({ message: 'El mensaje es obligatorio.' })
  @IsNotEmpty({ message: 'El mensaje es obligatorio.' })
  @MaxLength(2000, { message: 'El mensaje no puede superar los 2000 caracteres.' })
  message!: string;
}

@Controller()
@UseGuards(AuthGuard)
export class JudgeCallsController {
  constructor(
    private readonly calls: JudgeCallsService,
    private readonly matches: MatchesService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService
  ) {}

  /** Player calls a judge (idempotent; 3/min, SPEC §14). */
  @Post('matches/:id/judge-call')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number
  ) {
    await this.rateLimit.consume(`judge-call:${user.id}`, 3, 60);
    const match = await this.matches.matchById(id);
    const call = await this.calls.createForMatch(match, user);
    return { call: { id: call.id, status: call.status } };
  }

  @Get('judge/queue')
  async queue(@CurrentUser() user: AuthenticatedUser) {
    return this.calls.queue(user);
  }

  @Get('judge/calls/:id')
  async detail(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    const call = await this.calls.callById(id);
    await this.calls.assertCanView(user, call);
    const [messages, match, tournament] = await Promise.all([
      this.prisma.judgeMessage.findMany({
        where: { judgeCallId: call.id },
        orderBy: { sentAt: 'asc' },
        include: { sender: { select: { id: true, name: true } } },
      }),
      this.prisma.match.findUnique({
        where: { id: call.matchId },
        include: {
          playerA: { select: { id: true, name: true } },
          playerB: { select: { id: true, name: true } },
          round: true,
        },
      }),
      this.prisma.tournament.findUnique({ where: { id: call.tournamentId } }),
    ]);
    const assignedJudge = call.assignedJudgeId
      ? await this.prisma.user.findUnique({
          where: { id: call.assignedJudgeId },
          select: { id: true, name: true },
        })
      : null;
    return {
      call: {
        id: call.id,
        status: call.status,
        createdById: call.createdById,
        assignedJudge,
        resolvedAt: call.resolvedAt?.toISOString() ?? null,
        tournamentSlug: tournament?.slug,
        tournamentName: tournament?.name,
        tableNumber: match?.tableNumber,
        roundNumber: match?.round.roundNumber,
        playerA: match?.playerA,
        playerB: match?.playerB,
      },
      messages: messages.map((m) => ({
        id: m.id,
        sender: m.sender,
        message: m.message,
        sentAt: m.sentAt.toISOString(),
      })),
    };
  }

  @Post('judge/calls/:id/take')
  @HttpCode(200)
  async take(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    const call = await this.calls.callById(id);
    const updated = await this.calls.take(user, call);
    return { call: { id: updated.id, status: updated.status } };
  }

  @Post('judge/calls/:id/messages')
  async message(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MessageDto
  ) {
    const call = await this.calls.callById(id);
    const created = await this.calls.sendMessage(user, call, dto.message);
    return {
      message: {
        id: created.id,
        sender: created.sender,
        message: created.message,
        sentAt: created.sentAt.toISOString(),
      },
    };
  }

  @Post('judge/calls/:id/resolve')
  @HttpCode(200)
  async resolve(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    const call = await this.calls.callById(id);
    const updated = await this.calls.resolve(user, call);
    return { call: { id: updated.id, status: updated.status } };
  }
}
