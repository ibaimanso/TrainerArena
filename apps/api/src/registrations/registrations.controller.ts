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
import type { Tournament } from '@prisma/client';
import { canManageTournament, type TournamentStatus } from '@apptorneos/shared';
import { AuthGuard, RequireRoles } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { Recaptcha } from '../common/recaptcha.guard';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { RegisterForTournamentDto } from './registrations.dto';
import { RegistrationsService } from './registrations.service';

@Controller()
@UseGuards(AuthGuard)
export class RegistrationsController {
  constructor(
    private readonly registrations: RegistrationsService,
    private readonly tournaments: TournamentsService,
    private readonly prisma: PrismaService
  ) {}

  /**
   * Registration: free → active directly; paid → seat reserved as
   * pending_payment until the organizer confirms the personal payment.
   */
  @Recaptcha('inscripcion_torneo')
  @Post('tournaments/:slug/register')
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: RegisterForTournamentDto
  ): Promise<{ status: string }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const registration = await this.registrations.register(tournament, user.id, dto);
    return { status: registration.status };
  }

  /**
   * Second post-registration step: confirm participation (requires an active
   * registration with a submitted decklist, before round 1 is generated).
   */
  @Post('tournaments/:slug/confirm-participation')
  @HttpCode(200)
  async confirmParticipation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string
  ): Promise<{ status: string; participationConfirmedAt: string | null }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const registration = await this.registrations.confirmParticipation(tournament, user.id);
    return {
      status: registration.status,
      participationConfirmedAt: registration.participationConfirmedAt?.toISOString() ?? null,
    };
  }

  @Post('tournaments/:slug/drop')
  @HttpCode(200)
  async drop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string
  ): Promise<{ status: string }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const registration = await this.registrations.drop(tournament, user.id);
    return { status: registration.status };
  }

  @Get('my/registrations')
  async myRegistrations(@CurrentUser() user: AuthenticatedUser) {
    const list = await this.registrations.myRegistrations(user.id);
    return {
      registrations: list.map((r) => ({
        tournamentSlug: r.tournament.slug,
        tournamentName: r.tournament.name,
        tournamentStatus: r.tournament.status,
        startAt: r.tournament.startAt.toISOString(),
        status: r.status,
        registeredAt: r.registeredAt.toISOString(),
      })),
    };
  }
}

@Controller('admin/tournaments/:slug/registrations')
@UseGuards(AuthGuard)
@RequireRoles('admin', 'superadmin')
export class RegistrationsAdminController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly registrations: RegistrationsService,
    private readonly prisma: PrismaService
  ) {}

  private async managedTournamentOrFail(
    user: AuthenticatedUser,
    slug: string
  ): Promise<Tournament> {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    const policyTournament = {
      id: tournament.id,
      adminId: tournament.adminId,
      status: tournament.status as TournamentStatus,
    };
    if (!canManageTournament({ id: user.id, roles: user.roles, emailVerified: true }, policyTournament)) {
      throw new ForbiddenException('No eres el administrador de este torneo.');
    }
    return tournament;
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    const tournament = await this.managedTournamentOrFail(user, slug);
    const [registrations, decklists] = await Promise.all([
      this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { registeredAt: 'asc' },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
      this.prisma.decklist.findMany({
        where: { tournamentId: tournament.id },
        select: { userId: true },
      }),
    ]);
    const hasDecklist = new Set(decklists.map((d) => d.userId));
    return {
      registrations: registrations.map((r) => ({
        id: r.id,
        userId: r.userId,
        fullName: r.fullName,
        tcgLiveUsername: r.tcgLiveUsername,
        email: r.email,
        phone: r.phone,
        status: r.status,
        registeredAt: r.registeredAt.toISOString(),
        droppedAt: r.droppedAt?.toISOString() ?? null,
        decklistSubmitted: hasDecklist.has(r.userId),
        participationConfirmed: r.participationConfirmedAt !== null,
      })),
    };
  }

  /** Organizer confirms a personal payment: the pending request becomes active. */
  @Post(':id/confirm')
  @HttpCode(200)
  async confirm(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number
  ): Promise<{ status: string }> {
    const tournament = await this.managedTournamentOrFail(user, slug);
    const registration = await this.registrations.confirm(tournament, id);
    return { status: registration.status };
  }

  /** Organizer rejects a pending request: the seat is freed. */
  @Post(':id/reject')
  @HttpCode(200)
  async reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number
  ): Promise<{ ok: true }> {
    const tournament = await this.managedTournamentOrFail(user, slug);
    await this.registrations.reject(tournament, id);
    return { ok: true };
  }
}
