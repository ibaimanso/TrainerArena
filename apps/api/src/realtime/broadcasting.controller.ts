import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IsNotEmpty, IsString } from 'class-validator';
import { AllowUnverified, AuthGuard, Public } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from './realtime.service';

class ChannelAuthDto {
  @IsString()
  @IsNotEmpty()
  socket_id!: string;

  @IsString()
  @IsNotEmpty()
  channel_name!: string;
}

const PLAYER_CHANNEL = /^private-tournament\.(\d+)\.player\.(\d+)$/;
const JUDGES_CHANNEL = /^private-tournament\.(\d+)\.judges$/;
const ADMIN_CHANNEL = /^private-tournament\.(\d+)\.admin$/;
const MATCH_CHANNEL = /^private-match\.(\d+)$/;
const JUDGE_CALL_CHANNEL = /^private-judge_call\.(\d+)$/;

/** Private channel authorization (SPEC §11 table). */
@Controller()
export class BroadcastingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService
  ) {}

  /** Public client config for pusher-js (key/host/port, never the secret). */
  @Public()
  @UseGuards(AuthGuard)
  @Get('realtime/config')
  clientConfig() {
    return {
      key: this.config.get<string>('PUSHER_APP_KEY', 'apptorneos-key'),
      host: this.config.get<string>('PUBLIC_PUSHER_HOST', 'localhost'),
      port: Number(this.config.get<string>('PUBLIC_PUSHER_PORT', '6001')),
      useTls: this.config.get<string>('PUBLIC_PUSHER_USE_TLS') === 'true',
    };
  }

  @UseGuards(AuthGuard)
  @AllowUnverified()
  @Post('broadcasting/auth')
  @HttpCode(200)
  async authorize(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChannelAuthDto) {
    const channel = dto.channel_name;
    const allowed = await this.canSubscribe(user, channel);
    if (!allowed) {
      throw new ForbiddenException('No puedes suscribirte a este canal.');
    }
    return this.realtime.authorizeChannel(dto.socket_id, channel);
  }

  private async canSubscribe(user: AuthenticatedUser, channel: string): Promise<boolean> {
    const isSuperadmin = user.roles.includes('superadmin');

    const playerMatch = PLAYER_CHANNEL.exec(channel);
    if (playerMatch) {
      const [, tournamentId, userId] = playerMatch.map(Number);
      if (userId !== user.id) return false;
      const registration = await this.prisma.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId, userId: user.id } },
      });
      return registration?.status === 'active' || registration?.status === 'dropped';
    }

    const judgesMatch = JUDGES_CHANNEL.exec(channel);
    if (judgesMatch) {
      return this.isJudgeOrAdmin(user, Number(judgesMatch[1]), isSuperadmin);
    }

    const adminMatch = ADMIN_CHANNEL.exec(channel);
    if (adminMatch) {
      if (isSuperadmin) return true;
      const tournament = await this.prisma.tournament.findUnique({
        where: { id: Number(adminMatch[1]) },
      });
      return tournament?.adminId === user.id;
    }

    const matchMatch = MATCH_CHANNEL.exec(channel);
    if (matchMatch) {
      const match = await this.prisma.match.findUnique({
        where: { id: Number(matchMatch[1]) },
        include: { round: true },
      });
      if (!match) return false;
      if (match.playerAId === user.id || match.playerBId === user.id) return true;
      return this.isJudgeOrAdmin(user, match.round.tournamentId, isSuperadmin);
    }

    const callMatch = JUDGE_CALL_CHANNEL.exec(channel);
    if (callMatch) {
      const call = await this.prisma.judgeCall.findUnique({
        where: { id: Number(callMatch[1]) },
      });
      if (!call) return false;
      if (call.createdById === user.id || call.assignedJudgeId === user.id) return true;
      return this.isJudgeOrAdmin(user, call.tournamentId, isSuperadmin);
    }

    return false;
  }

  private async isJudgeOrAdmin(
    user: AuthenticatedUser,
    tournamentId: number,
    isSuperadmin: boolean
  ): Promise<boolean> {
    if (isSuperadmin) return true;
    const tournament = await this.prisma.tournament.findUnique({ where: { id: tournamentId } });
    if (tournament?.adminId === user.id) return true;
    const application = await this.prisma.judgeApplication.findUnique({
      where: { tournamentId_userId: { tournamentId, userId: user.id } },
    });
    return application?.status === 'approved';
  }
}
