import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Put,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { parseDecklist, validateDecklist, type ParsedDecklist } from '@apptorneos/engine';
import {
  canEditDecklist,
  canViewDecklist,
  type RegistrationStatus,
  type TournamentStatus,
} from '@apptorneos/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';

class SaveDecklistDto {
  @IsString({ message: 'La decklist es obligatoria.' })
  @IsNotEmpty({ message: 'La decklist es obligatoria.' })
  @MaxLength(20000, { message: 'La decklist es demasiado larga.' })
  rawText!: string;
}

interface DecklistView {
  rawText: string;
  parsed: ParsedDecklist;
  submittedAt: string;
  lockedAt: string | null;
}

@Controller()
@UseGuards(AuthGuard)
export class DecklistsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournaments: TournamentsService
  ) {}

  private policyUser(user: AuthenticatedUser) {
    return { id: user.id, roles: user.roles, emailVerified: true };
  }

  private async isApprovedJudge(tournamentId: number, userId: number): Promise<boolean> {
    const application = await this.prisma.judgeApplication.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    return application?.status === 'approved';
  }

  @Get('tournaments/:slug/my-decklist')
  async myDecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string
  ): Promise<{ decklist: DecklistView | null; canEdit: boolean }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const [registration, decklist] = await Promise.all([
      this.prisma.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      }),
      this.prisma.decklist.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      }),
    ]);
    const canEdit = canEditDecklist(this.policyUser(user), {
      tournament: {
        id: tournament.id,
        adminId: tournament.adminId,
        status: tournament.status as TournamentStatus,
      },
      registration: registration
        ? { userId: registration.userId, status: registration.status as RegistrationStatus }
        : null,
      decklist: decklist
        ? { userId: decklist.userId, lockedAt: decklist.lockedAt?.toISOString() ?? null }
        : null,
    });
    return {
      decklist: decklist
        ? {
            rawText: decklist.rawText,
            parsed: decklist.parsedCards as unknown as ParsedDecklist,
            submittedAt: decklist.submittedAt.toISOString(),
            lockedAt: decklist.lockedAt?.toISOString() ?? null,
          }
        : null,
      canEdit,
    };
  }

  @Put('tournaments/:slug/my-decklist')
  async save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: SaveDecklistDto
  ): Promise<{ decklist: DecklistView }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const [registration, existing] = await Promise.all([
      this.prisma.tournamentRegistration.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      }),
      this.prisma.decklist.findUnique({
        where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      }),
    ]);

    const allowed = canEditDecklist(this.policyUser(user), {
      tournament: {
        id: tournament.id,
        adminId: tournament.adminId,
        status: tournament.status as TournamentStatus,
      },
      registration: registration
        ? { userId: registration.userId, status: registration.status as RegistrationStatus }
        : null,
      decklist: existing
        ? { userId: existing.userId, lockedAt: existing.lockedAt?.toISOString() ?? null }
        : null,
    });
    if (!allowed) {
      throw new ForbiddenException('No puedes modificar la decklist en este momento.');
    }

    const parsed = parseDecklist(dto.rawText);
    const errors = validateDecklist(parsed);
    if (errors.length > 0) {
      throw new UnprocessableEntityException({ statusCode: 422, message: errors });
    }

    // A late submission (tournament already running) locks immediately.
    const lateLock = tournament.status === 'in_progress' ? new Date() : null;
    const decklist = await this.prisma.decklist.upsert({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
      create: {
        tournamentId: tournament.id,
        userId: user.id,
        rawText: dto.rawText,
        parsedCards: parsed as never,
        lockedAt: lateLock,
      },
      update: {
        rawText: dto.rawText,
        parsedCards: parsed as never,
        submittedAt: new Date(),
      },
    });

    return {
      decklist: {
        rawText: decklist.rawText,
        parsed,
        submittedAt: decklist.submittedAt.toISOString(),
        lockedAt: decklist.lockedAt?.toISOString() ?? null,
      },
    };
  }

  /**
   * Rival decklist from the standings table: any authenticated user, only when
   * the tournament enables showOpponentDecklists and the list is locked
   * (tournament in progress or finished).
   */
  @Get('tournaments/:slug/players/:userId/decklist')
  async opponentDecklist(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('userId', ParseIntPipe) userId: number
  ) {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const decklist = await this.prisma.decklist.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!decklist) throw new NotFoundException('Decklist no encontrada.');

    const approvedJudge = await this.isApprovedJudge(tournament.id, user.id);
    const allowed = canViewDecklist(this.policyUser(user), {
      tournament: {
        id: tournament.id,
        adminId: tournament.adminId,
        status: tournament.status as TournamentStatus,
      },
      decklist: { userId: decklist.userId, lockedAt: decklist.lockedAt?.toISOString() ?? null },
      isApprovedJudge: approvedJudge,
      rivalsMayView: tournament.showOpponentDecklists,
    });
    if (!allowed) {
      throw new ForbiddenException('Las decklists de este torneo no son públicas.');
    }
    return {
      decklist: {
        playerName: decklist.user.name,
        rawText: decklist.rawText,
        parsed: decklist.parsedCards,
        submittedAt: decklist.submittedAt.toISOString(),
        lockedAt: decklist.lockedAt?.toISOString() ?? null,
      },
    };
  }

  /** Judge/admin listing (SPEC §9 visibility). */
  @Get('judge/tournaments/:slug/decklists')
  async list(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    const isAdmin =
      user.roles.includes('superadmin') || tournament.adminId === user.id;
    const approvedJudge = await this.isApprovedJudge(tournament.id, user.id);
    if (!isAdmin && !approvedJudge) {
      throw new ForbiddenException('No tienes acceso a las decklists de este torneo.');
    }
    const [decklists, activeRegistrations] = await Promise.all([
      this.prisma.decklist.findMany({
        where: { tournamentId: tournament.id },
        orderBy: { submittedAt: 'asc' },
        include: { user: { select: { id: true, name: true } } },
      }),
      this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id, status: 'active' },
        select: { userId: true, fullName: true },
      }),
    ]);
    const submitted = new Set(decklists.map((d) => d.userId));
    return {
      decklists: decklists.map((d) => ({
        userId: d.userId,
        playerName: d.user.name,
        total: (d.parsedCards as { total?: number }).total ?? 0,
        submittedAt: d.submittedAt.toISOString(),
        lockedAt: d.lockedAt?.toISOString() ?? null,
      })),
      // Registered players without a decklist: they take a game loss every
      // round that starts until they submit it.
      missing: activeRegistrations
        .filter((r) => !submitted.has(r.userId))
        .map((r) => ({ userId: r.userId, playerName: r.fullName })),
    };
  }

  /** Decklist detail: owner, tournament admin, approved judge, superadmin. Never other players. */
  @Get('judge/tournaments/:slug/decklists/:userId')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('userId', ParseIntPipe) userId: number
  ) {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    const decklist = await this.prisma.decklist.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId } },
      include: { user: { select: { id: true, name: true } } },
    });
    if (!decklist) throw new NotFoundException('Decklist no encontrada.');

    const approvedJudge = await this.isApprovedJudge(tournament.id, user.id);
    const allowed = canViewDecklist(this.policyUser(user), {
      tournament: {
        id: tournament.id,
        adminId: tournament.adminId,
        status: tournament.status as TournamentStatus,
      },
      decklist: { userId: decklist.userId, lockedAt: decklist.lockedAt?.toISOString() ?? null },
      isApprovedJudge: approvedJudge,
    });
    if (!allowed) {
      throw new ForbiddenException('No tienes acceso a esta decklist.');
    }
    return {
      decklist: {
        playerName: decklist.user.name,
        rawText: decklist.rawText,
        parsed: decklist.parsedCards,
        submittedAt: decklist.submittedAt.toISOString(),
        lockedAt: decklist.lockedAt?.toISOString() ?? null,
      },
    };
  }
}
