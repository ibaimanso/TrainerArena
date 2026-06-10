import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { canManageTournament, type TournamentStatus } from '@apptorneos/shared';
import { AuthGuard, RequireRoles } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
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

  /** Free registration; paid tournaments are handled by the payments module (phase 5). */
  @Post('tournaments/:slug/register')
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: RegisterForTournamentDto
  ): Promise<{ status: string }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    if (tournament.feeAmount > 0) {
      // Implemented in phase 5 (PayPal): the same route will return an approval URL.
      throw new ForbiddenException('Este torneo es de pago; el pago estará disponible en breve.');
    }
    const registration = await this.registrations.registerFree(tournament, user.id, dto);
    return { status: registration.status };
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
    private readonly prisma: PrismaService
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    const policyTournament = {
      id: tournament.id,
      adminId: tournament.adminId,
      status: tournament.status as TournamentStatus,
    };
    if (!canManageTournament({ id: user.id, roles: user.roles, emailVerified: true }, policyTournament)) {
      throw new ForbiddenException('No eres el administrador de este torneo.');
    }
    const registrations = await this.prisma.tournamentRegistration.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { registeredAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
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
      })),
    };
  }
}
