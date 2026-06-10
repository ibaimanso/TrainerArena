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
import { PaymentsService } from '../payments/payments.service';
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
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService
  ) {}

  /** Registration: free → active directly; paid → pending_payment + PayPal approval URL. */
  @Post('tournaments/:slug/register')
  async register(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: RegisterForTournamentDto
  ): Promise<{ status: string; approvalUrl?: string }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    if (tournament.feeAmount > 0) {
      const { approvalUrl } = await this.payments.registerPaid(tournament, user.id, dto);
      return { status: 'pending_payment', approvalUrl };
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
