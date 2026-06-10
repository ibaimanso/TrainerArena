import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { JudgeCall } from '@prisma/client';
import {
  canChatInJudgeCall,
  canResolveJudgeCall,
  canTakeJudgeCall,
  canViewJudgeCall,
  channels,
  events,
  type JudgeCallStatus,
  type TournamentStatus,
} from '@apptorneos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';
import type { AuthenticatedUser } from '../auth/current-user';
import type { MatchWithContext } from '../rounds/matches.service';

@Injectable()
export class JudgeCallsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService
  ) {}

  private policyUser(user: AuthenticatedUser) {
    return { id: user.id, roles: user.roles, emailVerified: true };
  }

  async isApprovedJudge(tournamentId: number, userId: number): Promise<boolean> {
    const application = await this.prisma.judgeApplication.findUnique({
      where: { tournamentId_userId: { tournamentId, userId } },
    });
    return application?.status === 'approved';
  }

  async callContext(user: AuthenticatedUser, call: JudgeCall) {
    const tournament = await this.prisma.tournament.findUniqueOrThrow({
      where: { id: call.tournamentId },
    });
    return {
      tournament: {
        id: tournament.id,
        adminId: tournament.adminId,
        status: tournament.status as TournamentStatus,
      },
      call: {
        createdById: call.createdById,
        assignedJudgeId: call.assignedJudgeId,
        status: call.status as JudgeCallStatus,
      },
      isApprovedJudge: await this.isApprovedJudge(call.tournamentId, user.id),
    };
  }

  /** Create (SPEC §10.2): idempotent — an open/in_progress call on the match is reused. */
  async createForMatch(match: MatchWithContext, user: AuthenticatedUser): Promise<JudgeCall> {
    if (match.playerAId !== user.id && match.playerBId !== user.id) {
      throw new ForbiddenException('Solo los jugadores de la partida pueden llamar al juez.');
    }
    const existing = await this.prisma.judgeCall.findFirst({
      where: {
        matchId: match.id,
        createdById: user.id,
        status: { in: ['open', 'in_progress'] },
      },
    });
    if (existing) return existing;

    const call = await this.prisma.judgeCall.create({
      data: {
        tournamentId: match.round.tournamentId,
        matchId: match.id,
        createdById: user.id,
        status: 'open',
      },
    });
    await this.realtime.trigger(
      channels.tournamentJudges(match.round.tournamentId),
      events.judgeCallCreated,
      {
        call_id: call.id,
        tournament_id: match.round.tournamentId,
        match_id: match.id,
        table_number: match.tableNumber,
      }
    );
    return call;
  }

  async callById(id: number): Promise<JudgeCall> {
    const call = await this.prisma.judgeCall.findUnique({ where: { id } });
    if (!call) throw new NotFoundException('Llamada no encontrada.');
    return call;
  }

  async assertCanView(user: AuthenticatedUser, call: JudgeCall): Promise<void> {
    const ctx = await this.callContext(user, call);
    if (!canViewJudgeCall(this.policyUser(user), ctx)) {
      throw new ForbiddenException('No tienes acceso a esta llamada.');
    }
  }

  /** Take under lock: two concurrent judges → only one wins (SPEC §10.2). */
  async take(user: AuthenticatedUser, call: JudgeCall): Promise<JudgeCall> {
    const ctx = await this.callContext(user, call);
    if (!canTakeJudgeCall(this.policyUser(user), ctx)) {
      throw new ForbiddenException('No puedes atender esta llamada.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT status FROM judge_calls WHERE id = ${call.id} FOR UPDATE`;
      if (rows.length === 0 || rows[0].status !== 'open') {
        throw new UnprocessableEntityException('Otro juez ya está atendiendo esta llamada.');
      }
      return tx.judgeCall.update({
        where: { id: call.id },
        data: { status: 'in_progress', assignedJudgeId: user.id },
      });
    });
    const judge = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { id: true, name: true },
    });
    const payload = { call_id: call.id, assigned_judge: judge };
    await this.realtime.trigger(channels.judgeCall(call.id), events.judgeCallTaken, payload);
    await this.realtime.trigger(
      channels.tournamentJudges(call.tournamentId),
      events.judgeCallTaken,
      payload
    );
    return updated;
  }

  /** Chat: ≤2000 chars, only while not resolved; full message payload broadcast. */
  async sendMessage(user: AuthenticatedUser, call: JudgeCall, message: string) {
    const ctx = await this.callContext(user, call);
    if (!canChatInJudgeCall(this.policyUser(user), ctx)) {
      throw new ForbiddenException('No puedes escribir en esta llamada.');
    }
    const created = await this.prisma.judgeMessage.create({
      data: { judgeCallId: call.id, senderId: user.id, message },
      include: { sender: { select: { id: true, name: true } } },
    });
    await this.realtime.trigger(channels.judgeCall(call.id), events.judgeCallMessage, {
      message_id: created.id,
      call_id: call.id,
      sender: created.sender,
      message: created.message,
      sent_at: created.sentAt.toISOString(),
    });
    return created;
  }

  /** Resolve: chat becomes read-only and is kept as audit (SPEC §10.2). */
  async resolve(user: AuthenticatedUser, call: JudgeCall): Promise<JudgeCall> {
    const ctx = await this.callContext(user, call);
    if (!canResolveJudgeCall(this.policyUser(user), ctx)) {
      throw new ForbiddenException('No puedes resolver esta llamada.');
    }
    const updated = await this.prisma.judgeCall.update({
      where: { id: call.id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        // If nobody took it, it ends up assigned to the resolver.
        ...(call.assignedJudgeId === null ? { assignedJudgeId: user.id } : {}),
      },
    });
    const payload = {
      call_id: call.id,
      match_id: call.matchId,
      resolved_at: updated.resolvedAt?.toISOString() ?? null,
    };
    await this.realtime.trigger(channels.judgeCall(call.id), events.judgeCallResolved, payload);
    await this.realtime.trigger(channels.match(call.matchId), events.judgeCallResolved, payload);
    await this.realtime.trigger(
      channels.tournamentJudges(call.tournamentId),
      events.judgeCallResolved,
      payload
    );
    return updated;
  }

  /**
   * Judge queue (SPEC §10.2): open + in_progress calls and disputed matches of
   * every tournament where the user is approved judge or admin (superadmin: all).
   */
  async queue(user: AuthenticatedUser) {
    const isSuperadmin = user.roles.includes('superadmin');
    let tournamentIds: number[] | null = null;
    if (!isSuperadmin) {
      const [approved, administered] = await Promise.all([
        this.prisma.judgeApplication.findMany({
          where: { userId: user.id, status: 'approved' },
          select: { tournamentId: true },
        }),
        this.prisma.tournament.findMany({
          where: { adminId: user.id, deletedAt: null },
          select: { id: true },
        }),
      ]);
      tournamentIds = [
        ...new Set([...approved.map((a) => a.tournamentId), ...administered.map((t) => t.id)]),
      ];
      if (tournamentIds.length === 0) return { calls: [], disputes: [] };
    }

    const [calls, disputes] = await Promise.all([
      this.prisma.judgeCall.findMany({
        where: {
          status: { in: ['open', 'in_progress'] },
          ...(tournamentIds ? { tournamentId: { in: tournamentIds } } : {}),
        },
        orderBy: { createdAt: 'asc' },
        include: {
          tournament: { select: { slug: true, name: true } },
          match: { select: { tableNumber: true } },
          createdBy: { select: { id: true, name: true } },
          assignedJudge: { select: { id: true, name: true } },
        },
      }),
      this.prisma.match.findMany({
        where: {
          status: 'disputed',
          ...(tournamentIds
            ? { round: { tournamentId: { in: tournamentIds } } }
            : {}),
        },
        orderBy: { updatedAt: 'asc' },
        include: {
          round: { include: { tournament: { select: { slug: true, name: true } } } },
          playerA: { select: { id: true, name: true } },
          playerB: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      calls: calls.map((c) => ({
        id: c.id,
        status: c.status,
        tournamentSlug: c.tournament.slug,
        tournamentName: c.tournament.name,
        tableNumber: c.match.tableNumber,
        createdBy: c.createdBy,
        assignedJudge: c.assignedJudge,
        createdAt: c.createdAt.toISOString(),
      })),
      disputes: disputes.map((m) => ({
        matchId: m.id,
        tournamentSlug: m.round.tournament.slug,
        tournamentName: m.round.tournament.name,
        roundNumber: m.round.roundNumber,
        tableNumber: m.tableNumber,
        playerA: m.playerA,
        playerB: m.playerB,
      })),
    };
  }
}
