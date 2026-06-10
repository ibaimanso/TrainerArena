import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { IsIn } from 'class-validator';
import {
  canApplyAsJudge,
  canDecideJudgeApplication,
  canManageTournament,
  type JudgeApplicationStatus,
  type TournamentStatus,
} from '@apptorneos/shared';
import { AuditService } from '../audit/audit.service';
import { AuthGuard, RequireRoles } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';
import { TournamentsService } from '../tournaments/tournaments.service';

class DecideDto {
  @IsIn(['approved', 'rejected'], { message: 'La decisión debe ser approved o rejected.' })
  decision!: 'approved' | 'rejected';
}

@Controller()
@UseGuards(AuthGuard)
export class JudgeApplicationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournaments: TournamentsService,
    private readonly audit: AuditService
  ) {}

  private policyUser(user: AuthenticatedUser) {
    return { id: user.id, roles: user.roles, emailVerified: true };
  }

  /** Apply as judge (SPEC §10.1): global judge role, live tournament, one per user. */
  @Post('tournaments/:slug/judge-application')
  async apply(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string
  ): Promise<{ status: JudgeApplicationStatus }> {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const existing = await this.prisma.judgeApplication.findUnique({
      where: { tournamentId_userId: { tournamentId: tournament.id, userId: user.id } },
    });
    const allowed = canApplyAsJudge(this.policyUser(user), {
      tournament: {
        id: tournament.id,
        adminId: tournament.adminId,
        status: tournament.status as TournamentStatus,
      },
      existingApplication: existing ? { status: existing.status as JudgeApplicationStatus } : null,
    });
    if (!allowed) {
      if (!user.roles.includes('judge')) {
        throw new ForbiddenException('Necesitas el rol de juez para solicitar arbitrar.');
      }
      if (existing) {
        throw new UnprocessableEntityException('Ya has solicitado ser juez de este torneo.');
      }
      throw new UnprocessableEntityException('Este torneo no admite solicitudes de juez.');
    }
    const application = await this.prisma.judgeApplication.create({
      data: { tournamentId: tournament.id, userId: user.id, status: 'pending' },
    });
    return { status: application.status as JudgeApplicationStatus };
  }
}

@Controller('admin/tournaments/:slug/judge-applications')
@UseGuards(AuthGuard)
@RequireRoles('admin', 'superadmin')
export class JudgeApplicationsAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournaments: TournamentsService,
    private readonly audit: AuditService
  ) {}

  private assertManages(user: AuthenticatedUser, tournament: { id: number; adminId: number; status: string }): void {
    const allowed = canManageTournament(
      { id: user.id, roles: user.roles, emailVerified: true },
      { id: tournament.id, adminId: tournament.adminId, status: tournament.status as TournamentStatus }
    );
    if (!allowed) throw new ForbiddenException('No eres el administrador de este torneo.');
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Param('slug') slug: string) {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    this.assertManages(user, tournament);
    const applications = await this.prisma.judgeApplication.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { appliedAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    return {
      applications: applications.map((a) => ({
        id: a.id,
        userId: a.userId,
        name: a.user.name,
        email: a.user.email,
        status: a.status,
        appliedAt: a.appliedAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() ?? null,
      })),
    };
  }

  @Post(':id/decide')
  @HttpCode(200)
  async decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideDto
  ): Promise<{ status: JudgeApplicationStatus }> {
    const tournament = await this.tournaments.bySlugOrFail(slug);
    this.assertManages(user, tournament);
    const application = await this.prisma.judgeApplication.findFirst({
      where: { id, tournamentId: tournament.id },
    });
    if (!application) throw new NotFoundException('Solicitud no encontrada.');
    const allowed = canDecideJudgeApplication(
      { id: user.id, roles: user.roles, emailVerified: true },
      { id: tournament.id, adminId: tournament.adminId, status: tournament.status as TournamentStatus },
      { status: application.status as JudgeApplicationStatus }
    );
    if (!allowed) {
      throw new UnprocessableEntityException('La solicitud ya fue decidida.');
    }
    const updated = await this.prisma.judgeApplication.update({
      where: { id: application.id },
      data: { status: dto.decision, decidedAt: new Date(), decidedBy: user.id },
    });
    await this.audit.log({
      actorId: user.id,
      action: `judge_application.${dto.decision}`,
      targetType: 'judge_application',
      targetId: application.id,
      payload: { tournament_id: tournament.id, user_id: application.userId },
    });
    return { status: updated.status as JudgeApplicationStatus };
  }
}
