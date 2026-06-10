import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';
import type { Tournament } from '@prisma/client';
import { canManageTournament, type TournamentStatus } from '@apptorneos/shared';
import { AuthGuard, RequireRoles } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { TournamentsService } from '../tournaments/tournaments.service';
import { RoundsService } from './rounds.service';

class ManualPairDto {
  @IsInt({ message: 'El jugador A es obligatorio.' })
  playerAId!: number;

  @IsOptional()
  @IsInt({ message: 'El jugador B no es válido.' })
  playerBId?: number | null; // null/absent = bye

  @IsOptional()
  @IsBoolean({ message: 'allowRematch debe ser booleano.' })
  allowRematch?: boolean;
}

@Controller('admin')
@UseGuards(AuthGuard)
@RequireRoles('admin', 'superadmin')
export class RoundsAdminController {
  constructor(
    private readonly rounds: RoundsService,
    private readonly tournaments: TournamentsService
  ) {}

  private assertManages(user: AuthenticatedUser, tournament: Tournament): void {
    const allowed = canManageTournament(
      { id: user.id, roles: user.roles, emailVerified: true },
      { id: tournament.id, adminId: tournament.adminId, status: tournament.status as TournamentStatus }
    );
    if (!allowed) throw new ForbiddenException('No eres el administrador de este torneo.');
  }

  @Get('tournaments/:slug/rounds')
  async list(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    this.assertManages(user, tournament);
    return {
      rounds: await this.rounds.listRounds(tournament),
      swissRounds: tournament.swissRounds,
      topCutSize: tournament.topCutSize,
      tournamentStatus: tournament.status,
    };
  }

  @Post('tournaments/:slug/rounds/generate')
  @HttpCode(200)
  async generate(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    this.assertManages(user, tournament);
    const result = await this.rounds.generatePairings(tournament);
    return {
      roundId: result.round.id,
      roundNumber: result.round.roundNumber,
      manualRequired: result.manualRequired,
      manualMessage: result.manualMessage ?? null,
    };
  }

  @Post('rounds/:id/start')
  @HttpCode(200)
  async start(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    const round = await this.rounds.roundById(id);
    this.assertManages(user, round.tournament);
    const updated = await this.rounds.startRound(round.tournament, round);
    return {
      round: {
        id: updated.id,
        status: updated.status,
        startedAt: updated.startedAt?.toISOString() ?? null,
        endsAt: updated.endsAt?.toISOString() ?? null,
      },
    };
  }

  @Post('rounds/:id/close')
  @HttpCode(200)
  async close(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    const round = await this.rounds.roundById(id);
    this.assertManages(user, round.tournament);
    await this.rounds.closeRound(round.tournament, round, user.id);
    return { ok: true };
  }

  @Get('rounds/:id/manual-pairing')
  async manualState(@CurrentUser() user: AuthenticatedUser, @Param('id', ParseIntPipe) id: number) {
    const round = await this.rounds.roundById(id);
    this.assertManages(user, round.tournament);
    return this.rounds.manualState(round.tournament, round);
  }

  @Post('rounds/:id/manual-pairing')
  @HttpCode(200)
  async manualPair(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ManualPairDto
  ) {
    const round = await this.rounds.roundById(id);
    this.assertManages(user, round.tournament);
    await this.rounds.manualPair(
      round.tournament,
      round,
      dto.playerAId,
      dto.playerBId ?? null,
      dto.allowRematch ?? false,
      user.id
    );
    return this.rounds.manualState(round.tournament, round);
  }
}
