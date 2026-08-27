import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { JudgeApplicationStatus, RegistrationStatus, RoleName } from '@apptorneos/shared';
import { AuthGuard, Public } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import {
  toPublicDetail,
  toPublicSummary,
  type PublicTournamentDetail,
  type PublicTournamentSummary,
} from './tournaments.serializer';
import { TournamentsService } from './tournaments.service';

interface ViewerContext {
  isAuthenticated: boolean;
  isVerified: boolean;
  isTournamentAdmin: boolean;
  registrationStatus: RegistrationStatus | null;
  isFull: boolean;
  canRegister: boolean;
  hasJudgeRole: boolean;
  judgeApplicationStatus: JudgeApplicationStatus | null;
  isApprovedJudge: boolean;
  /** Post-registration two-step state (only meaningful with an active registration). */
  decklistSubmitted: boolean;
  participationConfirmed: boolean;
}

@Controller('tournaments')
@UseGuards(AuthGuard)
export class TournamentsPublicController {
  constructor(
    private readonly tournaments: TournamentsService,
    private readonly prisma: PrismaService
  ) {}

  @Public()
  @Get()
  async landing(): Promise<{
    open: PublicTournamentSummary[];
    ongoing: PublicTournamentSummary[];
    finished: PublicTournamentSummary[];
  }> {
    const data = await this.tournaments.landing();
    return {
      open: data.open.map(toPublicSummary),
      ongoing: data.ongoing.map(toPublicSummary),
      finished: data.finished.map(toPublicSummary),
    };
  }

  @Public()
  @Get(':slug')
  async detail(
    @Param('slug') slug: string,
    @Req() req: Request
  ): Promise<{ tournament: PublicTournamentDetail; viewer: ViewerContext }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const [activeCount, occupied, matchdays] = await Promise.all([
      this.tournaments.activeSeats(tournament.id),
      this.tournaments.occupiedSeats(tournament.id),
      this.tournaments.matchdays(tournament.id),
    ]);

    const viewer: ViewerContext = {
      isAuthenticated: false,
      isVerified: false,
      isTournamentAdmin: false,
      registrationStatus: null,
      isFull: occupied >= tournament.maxPlayers,
      canRegister: false,
      hasJudgeRole: false,
      judgeApplicationStatus: null,
      isApprovedJudge: false,
      decklistSubmitted: false,
      participationConfirmed: false,
    };

    const userId = req.session?.userId;
    if (userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { roles: { include: { role: true } } },
      });
      if (user) {
        const roles = user.roles.map((r) => r.role.name as RoleName);
        const [registration, application, decklist] = await Promise.all([
          this.prisma.tournamentRegistration.findUnique({
            where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
          }),
          this.prisma.judgeApplication.findUnique({
            where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
          }),
          this.prisma.decklist.findUnique({
            where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
            select: { id: true },
          }),
        ]);
        viewer.isAuthenticated = true;
        viewer.isVerified = user.emailVerifiedAt !== null;
        viewer.isTournamentAdmin =
          roles.includes('superadmin') || tournament.adminId === user.id;
        viewer.registrationStatus = (registration?.status as RegistrationStatus) ?? null;
        viewer.hasJudgeRole = roles.includes('judge');
        viewer.judgeApplicationStatus =
          (application?.status as JudgeApplicationStatus) ?? null;
        viewer.isApprovedJudge = application?.status === 'approved';
        viewer.decklistSubmitted = decklist !== null;
        viewer.participationConfirmed = registration?.participationConfirmedAt != null;
        viewer.canRegister =
          viewer.isVerified &&
          tournament.status === 'registration_open' &&
          !viewer.isFull &&
          registration === null;
      }
    }

    return { tournament: toPublicDetail(tournament, activeCount, matchdays), viewer };
  }
}
