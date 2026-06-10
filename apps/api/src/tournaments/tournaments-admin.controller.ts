import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Ip,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { Tournament } from '@prisma/client';
import { canManageTournament, type TournamentStatus } from '@apptorneos/shared';
import { AuthGuard, RequireRoles } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { RateLimitService } from '../common/rate-limit.service';
import { CreateTournamentDto } from './tournaments.dto';
import { TournamentsService } from './tournaments.service';

interface AdminTournamentView {
  slug: string;
  name: string;
  status: TournamentStatus;
  startAt: string;
  maxPlayers: number;
  activeCount: number;
  feeAmount: number;
  feeCurrency: string;
  swissRounds: number;
  swissBo: number;
  topCutBo: number;
  topCutSize: number;
  roundTimeMinutes: number;
  checkinMinutes: number;
  description: string | null;
}

function toAdminView(t: Tournament & { activeCount?: number }): AdminTournamentView {
  return {
    slug: t.slug,
    name: t.name,
    status: t.status as TournamentStatus,
    startAt: t.startAt.toISOString(),
    maxPlayers: t.maxPlayers,
    activeCount: t.activeCount ?? 0,
    feeAmount: t.feeAmount,
    feeCurrency: t.feeCurrency,
    swissRounds: t.swissRounds,
    swissBo: t.swissBo,
    topCutBo: t.topCutBo,
    topCutSize: t.topCutSize,
    roundTimeMinutes: t.roundTimeMinutes,
    checkinMinutes: t.checkinMinutes,
    description: t.description,
  };
}

@Controller('admin/tournaments')
@UseGuards(AuthGuard)
@RequireRoles('admin', 'superadmin')
export class TournamentsAdminController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly rateLimit: RateLimitService
  ) {}

  private policyUser(user: AuthenticatedUser) {
    return { id: user.id, roles: user.roles, emailVerified: true };
  }

  private assertManages(user: AuthenticatedUser, tournament: Tournament): void {
    const policyTournament = {
      id: tournament.id,
      adminId: tournament.adminId,
      status: tournament.status as TournamentStatus,
    };
    if (!canManageTournament(this.policyUser(user), policyTournament)) {
      throw new ForbiddenException('No eres el administrador de este torneo.');
    }
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ tournaments: AdminTournamentView[] }> {
    const list = await this.tournaments.listByAdmin(user.id, user.roles.includes('superadmin'));
    return { tournaments: list.map(toAdminView) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTournamentDto,
    @Ip() ip: string
  ): Promise<{ tournament: AdminTournamentView }> {
    // 10/h per user (SPEC §14)
    await this.rateLimit.consume(`create-tournament:${user.id}:${ip}`, 10, 60 * 60);
    const tournament = await this.tournaments.create(user.id, dto);
    return { tournament: toAdminView(tournament) };
  }

  @Get(':slug')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string
  ): Promise<{ tournament: AdminTournamentView }> {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    this.assertManages(user, tournament);
    const activeCount = await this.tournaments.activeSeats(tournament.id);
    return { tournament: toAdminView({ ...tournament, activeCount }) };
  }

  @Post(':slug/open-registration')
  @HttpCode(200)
  async openRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string
  ): Promise<{ tournament: AdminTournamentView }> {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    this.assertManages(user, tournament);
    const updated = await this.tournaments.openRegistration(tournament);
    return { tournament: toAdminView(updated) };
  }

  @Post(':slug/close-registration')
  @HttpCode(200)
  async closeRegistration(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string
  ): Promise<{ tournament: AdminTournamentView }> {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    this.assertManages(user, tournament);
    const updated = await this.tournaments.closeRegistration(tournament);
    return { tournament: toAdminView(updated) };
  }
}
