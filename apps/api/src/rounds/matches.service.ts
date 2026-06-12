import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Match, MatchMessage, MatchReport, Round, Tournament } from '@prisma/client';
import { channels, events, type MatchOutcome, type ReportResult } from '@apptorneos/shared';
import type { AuthenticatedUser } from '../auth/current-user';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { RealtimeService } from '../realtime/realtime.service';

export type MatchWithContext = Match & { round: Round & { tournament: Tournament } };

type MessageWithSender = MatchMessage & { sender: { id: number; name: string } };

@Injectable()
export class MatchesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService
  ) {}

  async matchById(id: number): Promise<MatchWithContext> {
    const match = await this.prisma.match.findUnique({
      where: { id },
      include: { round: { include: { tournament: true } } },
    });
    if (!match || match.round.tournament.deletedAt) {
      throw new NotFoundException('Partida no encontrada.');
    }
    return match;
  }

  private assertPlayer(match: Match, userId: number): void {
    if (match.playerAId !== userId && match.playerBId !== userId) {
      throw new ForbiddenException('No eres jugador de esta partida.');
    }
  }

  /** Player chat stays open until the match reaches a terminal state. */
  isChatOpen(match: Match): boolean {
    return (
      match.status === 'pending' ||
      match.status === 'active' ||
      match.status === 'awaiting_confirmation' ||
      match.status === 'disputed'
    );
  }

  private async canViewChat(match: MatchWithContext, user: AuthenticatedUser): Promise<boolean> {
    if (match.playerAId === user.id || match.playerBId === user.id) return true;
    if (user.roles.includes('superadmin')) return true;
    if (match.round.tournament.adminId === user.id) return true;
    const application = await this.prisma.judgeApplication.findUnique({
      where: {
        tournamentId_userId: { tournamentId: match.round.tournament.id, userId: user.id },
      },
    });
    return application?.status === 'approved';
  }

  /** Match chat history: the two players, plus tournament judges/admin (read). */
  async listMessages(
    match: MatchWithContext,
    user: AuthenticatedUser
  ): Promise<MessageWithSender[]> {
    if (!(await this.canViewChat(match, user))) {
      throw new ForbiddenException('No puedes ver el chat de esta partida.');
    }
    return this.prisma.matchMessage.findMany({
      where: { matchId: match.id },
      orderBy: { id: 'asc' },
      include: { sender: { select: { id: true, name: true } } },
    });
  }

  /** Player-to-player message; broadcast on the private match channel. */
  async sendMessage(
    match: MatchWithContext,
    userId: number,
    message: string
  ): Promise<MessageWithSender> {
    this.assertPlayer(match, userId);
    if (match.isBye) {
      throw new UnprocessableEntityException('Esta partida no tiene rival.');
    }
    if (!this.isChatOpen(match)) {
      throw new UnprocessableEntityException('La partida ha terminado: el chat es de solo lectura.');
    }
    const created = await this.prisma.matchMessage.create({
      data: { matchId: match.id, senderId: userId, message },
      include: { sender: { select: { id: true, name: true } } },
    });
    await this.realtime.trigger(channels.match(match.id), events.matchMessage, {
      message_id: created.id,
      match_id: match.id,
      sender: created.sender,
      message: created.message,
      sent_at: created.sentAt.toISOString(),
    });
    return created;
  }

  /** Check-in (SPEC §6.4): idempotent stamp of the player's slot. */
  async checkIn(match: MatchWithContext, userId: number): Promise<void> {
    this.assertPlayer(match, userId);
    if (match.status !== 'active') {
      throw new UnprocessableEntityException('La partida no está activa.');
    }
    const field = match.playerAId === userId ? 'checkInAAt' : 'checkInBAt';
    if (match[field] !== null) return; // idempotent
    await this.prisma.match.update({
      where: { id: match.id },
      data: { [field]: new Date() },
    });
  }

  /**
   * Result report (SPEC §6.5): win|loss|draw relative to the reporter, free
   * score. First report → awaiting_confirmation; same player repeating: no-op
   * if equal, 422 if different; the rival's report conciliates or disputes.
   * BO1 rejects draw (fix 4.3).
   */
  async report(
    match: MatchWithContext,
    userId: number,
    result: ReportResult,
    score: string | null
  ): Promise<void> {
    this.assertPlayer(match, userId);
    if (match.status !== 'active' && match.status !== 'awaiting_confirmation') {
      throw new UnprocessableEntityException('La partida no admite reportes en su estado actual.');
    }
    const bo = match.round.phase === 'swiss'
      ? match.round.tournament.swissBo
      : match.round.tournament.topCutBo;
    if (result === 'draw' && bo === 1) {
      throw new UnprocessableEntityException('Las partidas al mejor de 1 no admiten empate.');
    }

    const reports = await this.prisma.matchReport.findMany({ where: { matchId: match.id } });
    const mine = reports.find((r) => r.reporterId === userId);
    if (mine) {
      if (mine.result === result) return; // idempotent no-op
      throw new UnprocessableEntityException('Ya reportaste un resultado distinto.');
    }

    const report = await this.prisma.matchReport.create({
      data: { matchId: match.id, reporterId: userId, result, score },
    });

    const other = reports.find((r) => r.reporterId !== userId);
    if (!other) {
      await this.prisma.match.update({
        where: { id: match.id },
        data: { status: 'awaiting_confirmation' },
      });
      const opponentId = match.playerAId === userId ? match.playerBId : match.playerAId;
      await this.realtime.trigger(channels.match(match.id), events.matchAwaitingConfirmation, {
        match_id: match.id,
        opponent_user_id: opponentId,
      });
      return;
    }

    await this.conciliate(match, [other, report]);
  }

  /** Second report: win+loss ⇒ result; draw+draw ⇒ draw; anything else ⇒ disputed. */
  private async conciliate(match: MatchWithContext, reports: MatchReport[]): Promise<void> {
    const byPlayer = new Map(reports.map((r) => [r.reporterId, r]));
    const reportA = byPlayer.get(match.playerAId);
    const reportB = match.playerBId !== null ? byPlayer.get(match.playerBId) : undefined;
    if (!reportA || !reportB) return;

    let outcome: MatchOutcome | null = null;
    if (reportA.result === 'win' && reportB.result === 'loss') outcome = 'a_wins';
    else if (reportA.result === 'loss' && reportB.result === 'win') outcome = 'b_wins';
    else if (reportA.result === 'draw' && reportB.result === 'draw') outcome = 'draw';

    if (outcome === null) {
      await this.prisma.match.update({
        where: { id: match.id },
        data: { status: 'disputed' },
      });
      const payload = {
        match_id: match.id,
        round_id: match.roundId,
        table_number: match.tableNumber,
        tournament_slug: match.round.tournament.slug,
      };
      await this.realtime.trigger(channels.match(match.id), events.matchDisputed, payload);
      await this.realtime.trigger(
        channels.tournamentJudges(match.round.tournament.id),
        events.matchDisputed,
        payload
      );
      return;
    }

    const winnerId =
      outcome === 'a_wins' ? match.playerAId : outcome === 'b_wins' ? match.playerBId : null;
    const score = reportA.score ?? reportB.score ?? null;
    await this.prisma.match.update({
      where: { id: match.id },
      data: {
        status: 'finished',
        finishedAt: new Date(),
        result: { create: { result: outcome, winnerId, score, resolvedById: null } },
      },
    });
    await this.broadcastFinished(match);
  }

  private async broadcastFinished(match: MatchWithContext): Promise<void> {
    const payload = {
      match_id: match.id,
      round_id: match.roundId,
      table_number: match.tableNumber,
      status: 'finished',
    };
    await this.realtime.trigger(channels.match(match.id), events.matchFinished, payload);
    await this.realtime.trigger(
      channels.publicTournament(match.round.tournament.publicId),
      events.matchFinished,
      payload
    );
  }

  /**
   * Dispute resolution (SPEC §6.7): the resolver picks the outcome; winner_id
   * is derived from it (a_wins/forfeit_b ⇒ A; b_wins/forfeit_a ⇒ B; else null).
   */
  async resolveDispute(
    match: MatchWithContext,
    resolverId: number,
    outcome: MatchOutcome,
    score: string | null
  ): Promise<void> {
    if (match.status !== 'disputed') {
      throw new UnprocessableEntityException('La partida no está en disputa.');
    }
    await this.applyOutcome(match, resolverId, outcome, score, 'dispute.resolved');
  }

  /**
   * Judge/organizer override: force the result of any non-terminal match
   * (players never reported, table stalled, penalties…). Same outcomes as a
   * dispute, including forfeit_both as a double game loss.
   */
  async forceResult(
    match: MatchWithContext,
    resolverId: number,
    outcome: MatchOutcome,
    score: string | null
  ): Promise<void> {
    const overridable = ['pending', 'active', 'awaiting_confirmation', 'disputed'];
    if (!overridable.includes(match.status)) {
      throw new UnprocessableEntityException('La partida ya tiene un resultado definitivo.');
    }
    await this.applyOutcome(match, resolverId, outcome, score, 'result.forced');
  }

  private async applyOutcome(
    match: MatchWithContext,
    resolverId: number,
    outcome: MatchOutcome,
    score: string | null,
    auditAction: string
  ): Promise<void> {
    if (outcome === 'bye') {
      throw new UnprocessableEntityException('Resultado no válido.');
    }
    const bo = match.round.phase === 'swiss'
      ? match.round.tournament.swissBo
      : match.round.tournament.topCutBo;
    if (outcome === 'draw' && bo === 1) {
      throw new UnprocessableEntityException('Las partidas al mejor de 1 no admiten empate.');
    }
    const winnerId =
      outcome === 'a_wins' || outcome === 'forfeit_b'
        ? match.playerAId
        : outcome === 'b_wins' || outcome === 'forfeit_a'
          ? match.playerBId
          : null;

    const terminalStatus = outcome === 'a_wins' || outcome === 'b_wins' || outcome === 'draw'
      ? 'finished'
      : outcome;

    await this.prisma.match.update({
      where: { id: match.id },
      data: {
        status: terminalStatus,
        finishedAt: new Date(),
        result: {
          upsert: {
            create: { result: outcome, winnerId, score, resolvedById: resolverId },
            update: { result: outcome, winnerId, score, resolvedById: resolverId },
          },
        },
      },
    });
    await this.broadcastFinished(match);
    await this.audit.log({
      actorId: resolverId,
      action: auditAction,
      targetType: 'match',
      targetId: match.id,
      payload: { result: outcome, score },
    });
  }
}
