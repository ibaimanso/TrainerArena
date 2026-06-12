import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Prisma, Round, Tournament } from '@prisma/client';
import {
  activePlayersForRound,
  advanceTopCut,
  computeStandings,
  ManualPairingRequired,
  pairKey,
  pairRound1,
  pairSwissRound,
  seedTopCut,
  type CutPairing,
  type PairingPlan,
} from '@apptorneos/engine';
import { channels, events, TERMINAL_MATCH_STATUSES } from '@apptorneos/shared';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ROUND_JOBS_QUEUE } from '../queues/queues.module';
import { RealtimeService } from '../realtime/realtime.service';
import { REDIS } from '../redis/redis.module';
import type Redis from 'ioredis';
import { SnapshotService } from './snapshot.service';

export const CHECK_IN_WINDOW_EXPIRED = 'check-in-window-expired';
export const ROUND_TIME_EXPIRED = 'round-time-expired';

type Tx = Prisma.TransactionClient;

@Injectable()
export class RoundsService {
  private readonly logger = new Logger(RoundsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: SnapshotService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    @Inject(ROUND_JOBS_QUEUE) private readonly roundJobs: Queue,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  async roundById(id: number): Promise<Round & { tournament: Tournament }> {
    const round = await this.prisma.round.findUnique({
      where: { id },
      include: { tournament: true },
    });
    if (!round || round.tournament.deletedAt) {
      throw new NotFoundException('Ronda no encontrada.');
    }
    return round;
  }

  async listRounds(tournament: Tournament) {
    const rounds = await this.prisma.round.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { roundNumber: 'asc' },
      include: { matches: { select: { status: true } } },
    });
    return rounds.map((round) => {
      const counts: Record<string, number> = {};
      for (const match of round.matches) {
        counts[match.status] = (counts[match.status] ?? 0) + 1;
      }
      return {
        id: round.id,
        roundNumber: round.roundNumber,
        phase: round.phase,
        status: round.status,
        startedAt: round.startedAt?.toISOString() ?? null,
        endsAt: round.endsAt?.toISOString() ?? null,
        closedAt: round.closedAt?.toISOString() ?? null,
        matchCounts: counts,
        totalMatches: round.matches.length,
      };
    });
  }

  /**
   * Generate pairings (SPEC §6.1): requires no pending/active round; creates
   * the next swiss round and applies the engine plan. On ManualPairingRequired
   * the partial pairings are persisted and the caller is told to open the
   * manual pairing screen.
   */
  async generatePairings(
    tournament: Tournament
  ): Promise<{ round: Round; manualRequired: boolean; manualMessage?: string }> {
    const open = await this.prisma.round.findFirst({
      where: { tournamentId: tournament.id, status: { in: ['pending', 'active'] } },
    });
    if (open) {
      throw new UnprocessableEntityException('Ya hay una ronda pendiente o en curso.');
    }
    const lastRound = await this.prisma.round.findFirst({
      where: { tournamentId: tournament.id },
      orderBy: { roundNumber: 'desc' },
    });
    const nextNumber = (lastRound?.roundNumber ?? 0) + 1;
    if (lastRound?.phase === 'top_cut' || nextNumber > tournament.swissRounds) {
      throw new UnprocessableEntityException(
        'Ya se jugaron todas las rondas suizas; el top cut se genera automáticamente.'
      );
    }

    const snapshot = await this.snapshots.build(tournament);
    const actives = activePlayersForRound(snapshot.players, nextNumber);
    if (actives.length < 2) {
      throw new UnprocessableEntityException('No hay suficientes jugadores activos para parear.');
    }

    let plan: PairingPlan;
    let manual: ManualPairingRequired | null = null;
    if (nextNumber === 1) {
      plan = pairRound1(snapshot);
    } else {
      try {
        plan = pairSwissRound({
          snapshot,
          roundNumber: nextNumber,
          history: await this.snapshots.history(tournament.id),
        });
      } catch (error) {
        if (!(error instanceof ManualPairingRequired)) throw error;
        manual = error;
        plan = { pairings: error.partialPairings, byePlayerId: error.byePlayerId };
      }
    }

    const round = await this.prisma.$transaction(async (tx) => {
      const created = await tx.round.create({
        data: {
          tournamentId: tournament.id,
          roundNumber: nextNumber,
          phase: 'swiss',
          status: 'pending',
        },
      });
      await this.applySwissPlan(tx, tournament, created, plan);
      return created;
    });

    if (!manual) {
      await this.realtime.trigger(
        channels.publicTournament(tournament.publicId),
        events.pairingsPublished,
        { round_id: round.id, round_number: round.roundNumber, phase: 'swiss' }
      );
    }
    return {
      round,
      manualRequired: manual !== null,
      manualMessage: manual?.message,
    };
  }

  /** Persists a swiss pairing plan: matches, immediate bye result, pairing history. */
  private async applySwissPlan(
    tx: Tx,
    tournament: Tournament,
    round: Round,
    plan: PairingPlan
  ): Promise<void> {
    for (const pairing of plan.pairings) {
      await tx.match.create({
        data: {
          roundId: round.id,
          tableNumber: pairing.tableNumber,
          playerAId: pairing.playerAId,
          playerBId: pairing.playerBId,
          status: 'pending',
        },
      });
      const [low, high] =
        pairing.playerAId < pairing.playerBId
          ? [pairing.playerAId, pairing.playerBId]
          : [pairing.playerBId, pairing.playerAId];
      await tx.pairingHistory.create({
        data: {
          tournamentId: tournament.id,
          playerLowId: low,
          playerHighId: high,
          roundId: round.id,
        },
      });
    }
    if (plan.byePlayerId !== null) {
      await this.createBye(tx, round.id, plan.pairings.length + 1, plan.byePlayerId, null);
    }
  }

  private async createBye(
    tx: Tx,
    roundId: number,
    tableNumber: number,
    playerId: number,
    bracketPosition: number | null
  ): Promise<void> {
    await tx.match.create({
      data: {
        roundId,
        tableNumber,
        playerAId: playerId,
        playerBId: null,
        status: 'bye',
        isBye: true,
        finishedAt: new Date(),
        bracketPosition,
        result: { create: { result: 'bye', winnerId: playerId } },
      },
    });
  }

  /** Manual pairing state (SPEC §6.2): existing tables + active players without one. */
  async manualState(tournament: Tournament, round: Round) {
    const matches = await this.prisma.match.findMany({
      where: { roundId: round.id },
      orderBy: { tableNumber: 'asc' },
      include: {
        playerA: { select: { id: true, name: true } },
        playerB: { select: { id: true, name: true } },
      },
    });
    const snapshot = await this.snapshots.build(tournament);
    const actives = activePlayersForRound(snapshot.players, round.roundNumber);
    const pairedIds = new Set(
      matches.flatMap((m) => [m.playerAId, ...(m.playerBId !== null ? [m.playerBId] : [])])
    );
    const unpaired = actives.filter((p) => !pairedIds.has(p.id));
    const users = await this.prisma.user.findMany({
      where: { id: { in: unpaired.map((p) => p.id) } },
      select: { id: true, name: true },
    });
    return {
      round: {
        id: round.id,
        roundNumber: round.roundNumber,
        phase: round.phase,
        status: round.status,
      },
      matches: matches.map((m) => ({
        tableNumber: m.tableNumber,
        playerA: m.playerA,
        playerB: m.playerB,
        isBye: m.isBye,
        status: m.status,
      })),
      unpaired: users,
    };
  }

  /** Manual pairing (SPEC §6.2 + fix 4.2): server re-validates rematches unless allowRematch. */
  async manualPair(
    tournament: Tournament,
    round: Round,
    playerAId: number,
    playerBId: number | null,
    allowRematch: boolean,
    actorId: number
  ): Promise<void> {
    if (round.status !== 'pending') {
      throw new UnprocessableEntityException('Solo se puede parear manualmente una ronda pendiente.');
    }
    const state = await this.manualState(tournament, round);
    const unpairedIds = new Set(state.unpaired.map((u) => u.id));
    if (!unpairedIds.has(playerAId) || (playerBId !== null && !unpairedIds.has(playerBId))) {
      throw new UnprocessableEntityException('Alguno de los jugadores ya está pareado o no es válido.');
    }
    if (playerBId === playerAId) {
      throw new UnprocessableEntityException('Un jugador no puede emparejarse consigo mismo.');
    }

    if (playerBId !== null && !allowRematch) {
      const history = await this.snapshots.history(tournament.id);
      if (history.has(pairKey(playerAId, playerBId))) {
        throw new UnprocessableEntityException(
          'Estos jugadores ya se enfrentaron. Confirma el rematch para forzar el cruce.'
        );
      }
    }

    const nextTable =
      (await this.prisma.match.count({ where: { roundId: round.id } })) + 1;

    await this.prisma.$transaction(async (tx) => {
      if (playerBId === null) {
        await this.createBye(tx, round.id, nextTable, playerAId, null);
        return;
      }
      await tx.match.create({
        data: {
          roundId: round.id,
          tableNumber: nextTable,
          playerAId,
          playerBId,
          status: 'pending',
        },
      });
      const [low, high] = playerAId < playerBId ? [playerAId, playerBId] : [playerBId, playerAId];
      await tx.pairingHistory.upsert({
        where: {
          tournamentId_playerLowId_playerHighId: {
            tournamentId: tournament.id,
            playerLowId: low,
            playerHighId: high,
          },
        },
        create: {
          tournamentId: tournament.id,
          playerLowId: low,
          playerHighId: high,
          roundId: round.id,
        },
        update: {},
      });
    });

    await this.audit.log({
      actorId,
      action: 'round.manual_pairing',
      targetType: 'round',
      targetId: round.id,
      payload: { player_a_id: playerAId, player_b_id: playerBId },
    });
  }

  /**
   * Start round (SPEC §6.3): pending only. Sets active/startedAt/endsAt (null
   * for top cut), activates matches, sets current_round_id; R1 locks decklists
   * and moves the tournament to in_progress (fix 4.1). Then broadcasts and
   * schedules the check-in and round-time jobs.
   */
  async startRound(tournament: Tournament, round: Round): Promise<Round> {
    if (round.status !== 'pending') {
      throw new UnprocessableEntityException('Solo se puede iniciar una ronda pendiente.');
    }
    const now = new Date();
    const endsAt =
      round.phase === 'swiss'
        ? new Date(now.getTime() + tournament.roundTimeMinutes * 60 * 1000)
        : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.round.update({
        where: { id: round.id },
        data: { status: 'active', startedAt: now, endsAt },
      });
      await tx.match.updateMany({
        where: { roundId: round.id, status: 'pending' },
        data: { status: 'active' },
      });
      await tx.tournament.update({
        where: { id: tournament.id },
        data: {
          currentRoundId: round.id,
          ...(round.roundNumber === 1 && round.phase === 'swiss'
            ? { status: 'in_progress' }
            : {}),
        },
      });
      if (round.roundNumber === 1 && round.phase === 'swiss') {
        await tx.decklist.updateMany({
          where: { tournamentId: tournament.id, lockedAt: null },
          data: { lockedAt: now },
        });
      }
      return r;
    });

    await this.realtime.trigger(
      channels.publicTournament(tournament.publicId),
      events.roundStarted,
      {
        round_id: round.id,
        round_number: round.roundNumber,
        phase: round.phase,
        ends_at: endsAt?.toISOString() ?? null,
        server_now: new Date().toISOString(),
      }
    );

    await this.roundJobs.add(
      CHECK_IN_WINDOW_EXPIRED,
      { roundId: round.id },
      { jobId: `checkin-${round.id}`, delay: tournament.checkinMinutes * 60 * 1000 }
    );
    if (endsAt) {
      await this.roundJobs.add(
        ROUND_TIME_EXPIRED,
        { roundId: round.id },
        { jobId: `time-${round.id}`, delay: Math.max(0, endsAt.getTime() - Date.now()) }
      );
    }
    await this.forfeitMissingDecklists(tournament, updated);
    return updated;
  }

  /**
   * Players who still have not submitted their decklist lose the round
   * automatically the moment it starts (game loss), round after round, until
   * they finally submit it (late first submission stays allowed).
   */
  private async forfeitMissingDecklists(tournament: Tournament, round: Round): Promise<void> {
    const matches = await this.prisma.match.findMany({
      where: { roundId: round.id, status: 'active', isBye: false },
    });
    if (matches.length === 0) return;
    const playerIds = matches.flatMap((m) =>
      [m.playerAId, m.playerBId].filter((id): id is number => id !== null)
    );
    const submitted = await this.prisma.decklist.findMany({
      where: { tournamentId: tournament.id, userId: { in: playerIds } },
      select: { userId: true },
    });
    const hasDecklist = new Set(submitted.map((d) => d.userId));
    for (const match of matches) {
      if (match.playerBId === null) continue;
      const aMissing = !hasDecklist.has(match.playerAId);
      const bMissing = !hasDecklist.has(match.playerBId);
      if (!aMissing && !bMissing) continue;

      const status = aMissing && bMissing ? 'forfeit_both' : aMissing ? 'forfeit_a' : 'forfeit_b';
      const winnerId =
        status === 'forfeit_a' ? match.playerBId : status === 'forfeit_b' ? match.playerAId : null;
      await this.prisma.match.update({
        where: { id: match.id },
        data: {
          status,
          finishedAt: new Date(),
          result: { create: { result: status, winnerId } },
        },
      });
      await this.broadcastForfeit(tournament, round, match.id, match.tableNumber, status, 'decklist');
    }
  }

  /** Job (SPEC §6.4): forfeit matches missing check-ins when the window expires. */
  async checkInWindowExpired(roundId: number): Promise<void> {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { tournament: true },
    });
    if (!round || round.status !== 'active') return;

    const matches = await this.prisma.match.findMany({
      where: { roundId, status: 'active' },
    });
    for (const match of matches) {
      if (match.playerBId === null) continue;
      const aIn = match.checkInAAt !== null;
      const bIn = match.checkInBAt !== null;
      if (aIn && bIn) continue;

      const status = aIn ? 'forfeit_b' : bIn ? 'forfeit_a' : 'forfeit_both';
      const winnerId = aIn ? match.playerAId : bIn ? match.playerBId : null;
      await this.prisma.match.update({
        where: { id: match.id },
        data: {
          status,
          finishedAt: new Date(),
          result: { create: { result: status, winnerId } },
        },
      });
      await this.broadcastForfeit(round.tournament, round, match.id, match.tableNumber, status, 'check_in');
    }
  }

  /** Job (SPEC §6.6, swiss only): matches with ZERO reports → forfeit_both when time runs out. */
  async roundTimeExpired(roundId: number): Promise<void> {
    const round = await this.prisma.round.findUnique({
      where: { id: roundId },
      include: { tournament: true },
    });
    if (!round || round.status !== 'active') return;

    const matches = await this.prisma.match.findMany({
      where: { roundId, status: 'active' },
      include: { reports: true },
    });
    for (const match of matches) {
      if (match.reports.length > 0) continue;
      await this.prisma.match.update({
        where: { id: match.id },
        data: {
          status: 'forfeit_both',
          finishedAt: new Date(),
          result: { create: { result: 'forfeit_both', winnerId: null } },
        },
      });
      await this.broadcastForfeit(
        round.tournament,
        round,
        match.id,
        match.tableNumber,
        'forfeit_both',
        'round_time'
      );
    }
  }

  private async broadcastForfeit(
    tournament: Tournament,
    round: Round,
    matchId: number,
    tableNumber: number,
    status: string,
    reason: 'check_in' | 'round_time' | 'decklist'
  ): Promise<void> {
    const payload = {
      match_id: matchId,
      round_id: round.id,
      table_number: tableNumber,
      status,
      reason,
    };
    await this.realtime.trigger(channels.match(matchId), events.matchForfeited, payload);
    await this.realtime.trigger(
      channels.publicTournament(tournament.publicId),
      events.matchForfeited,
      payload
    );
  }

  /**
   * Close round (SPEC §6.8): all matches terminal (cut also forbids draws).
   * Then: nothing (mid-swiss) · finish (last swiss without cut) · seed the cut
   * (last swiss with cut) · advance the bracket (cut round).
   */
  async closeRound(tournament: Tournament, round: Round, actorId: number): Promise<void> {
    if (round.status !== 'active') {
      throw new UnprocessableEntityException('Solo se puede cerrar una ronda activa.');
    }
    const matches = await this.prisma.match.findMany({
      where: { roundId: round.id },
      include: { result: true },
    });
    const nonTerminal = matches.filter(
      (m) => !TERMINAL_MATCH_STATUSES.includes(m.status as never)
    );
    if (nonTerminal.length > 0) {
      throw new UnprocessableEntityException(
        `No se puede cerrar la ronda: quedan ${nonTerminal.length} partidas sin resultado.`
      );
    }
    if (round.phase === 'top_cut' && matches.some((m) => m.result?.result === 'draw')) {
      throw new UnprocessableEntityException(
        'El top cut no admite empates: un juez debe resolver el resultado antes de cerrar.'
      );
    }

    await this.prisma.round.update({
      where: { id: round.id },
      data: { status: 'finished', closedAt: new Date() },
    });
    await this.cancelRoundJobs(round.id);

    const publicChannel = channels.publicTournament(tournament.publicId);
    await this.realtime.trigger(publicChannel, events.roundFinished, {
      round_id: round.id,
      round_number: round.roundNumber,
      phase: round.phase,
    });
    await this.realtime.trigger(publicChannel, events.standingsUpdated, {
      tournament_id: tournament.id,
    });
    await this.invalidateStandingsCache(tournament.id);
    await this.audit.log({
      actorId,
      action: 'round.closed',
      targetType: 'round',
      targetId: round.id,
      payload: { tournament_id: tournament.id, round_number: round.roundNumber },
    });

    if (round.phase === 'swiss') {
      if (round.roundNumber < tournament.swissRounds) return; // admin generates the next one
      if (tournament.topCutSize === 0) {
        await this.finishTournament(tournament);
        return;
      }
      await this.seedCut(tournament, round);
      return;
    }
    await this.advanceCut(tournament, round);
  }

  private async cancelRoundJobs(roundId: number): Promise<void> {
    for (const jobId of [`checkin-${roundId}`, `time-${roundId}`]) {
      await this.roundJobs
        .remove(jobId)
        .catch(() => undefined);
    }
  }

  async invalidateStandingsCache(tournamentId: number): Promise<void> {
    try {
      if (this.redis.status !== 'ready') await this.redis.connect().catch(() => undefined);
      await this.redis.del(`standings:${tournamentId}`);
    } catch {
      // cache invalidation must never break the close
    }
  }

  /** Final ranking (§5.5) excluding dropped players. */
  private async finalRankingActiveIds(tournament: Tournament): Promise<number[]> {
    const snapshot = await this.snapshots.build(tournament);
    const activePlayers = snapshot.players.filter((p) => !p.dropped);
    return computeStandings(snapshot, activePlayers).map((e) => e.playerId);
  }

  /** Seeds the top cut after the last swiss round (SPEC §7). */
  private async seedCut(tournament: Tournament, lastSwissRound: Round): Promise<void> {
    const ranking = await this.finalRankingActiveIds(tournament);
    const pairings = seedTopCut(ranking, tournament.topCutSize);
    if (pairings === null) {
      await this.finishTournament(tournament);
      return;
    }
    await this.createCutRound(tournament, lastSwissRound.roundNumber + 1, pairings);
  }

  /** Advances the bracket after closing a cut round (SPEC §7). */
  private async advanceCut(tournament: Tournament, closedRound: Round): Promise<void> {
    const matches = await this.prisma.match.findMany({
      where: { roundId: closedRound.id },
      include: { result: true },
    });
    const advance = advanceTopCut(
      matches
        .filter((m) => m.result !== null && m.bracketPosition !== null)
        .map((m) => ({
          bracketPosition: m.bracketPosition as number,
          playerAId: m.playerAId,
          playerBId: m.playerBId,
          outcome: (m.result as NonNullable<typeof m.result>).result,
        }))
    );
    if (advance.finished) {
      await this.finishTournament(tournament, advance.championId);
      return;
    }
    await this.createCutRound(tournament, closedRound.roundNumber + 1, advance.pairings);
  }

  private async createCutRound(
    tournament: Tournament,
    roundNumber: number,
    pairings: CutPairing[]
  ): Promise<void> {
    const round = await this.prisma.$transaction(async (tx) => {
      const created = await tx.round.create({
        data: {
          tournamentId: tournament.id,
          roundNumber,
          phase: 'top_cut',
          status: 'pending',
        },
      });
      for (const pairing of pairings) {
        if (pairing.isBye || pairing.playerBId === null) {
          await this.createBye(
            tx,
            created.id,
            pairing.bracketPosition,
            pairing.playerAId,
            pairing.bracketPosition
          );
        } else {
          await tx.match.create({
            data: {
              roundId: created.id,
              tableNumber: pairing.bracketPosition,
              bracketPosition: pairing.bracketPosition,
              playerAId: pairing.playerAId,
              playerBId: pairing.playerBId,
              status: 'pending',
            },
          });
        }
      }
      return created;
    });

    await this.realtime.trigger(
      channels.publicTournament(tournament.publicId),
      events.pairingsPublished,
      { round_id: round.id, round_number: round.roundNumber, phase: 'top_cut' }
    );
  }

  /** Champion is derived, never persisted (SPEC §7). For swiss-only it is the standings leader. */
  private async finishTournament(
    tournament: Tournament,
    championId: number | null = null
  ): Promise<void> {
    let resolvedChampionId = championId;
    if (resolvedChampionId === null && tournament.topCutSize === 0) {
      const ranking = await this.finalRankingActiveIds(tournament);
      resolvedChampionId = ranking[0] ?? null;
    }
    await this.prisma.tournament.update({
      where: { id: tournament.id },
      data: { status: 'finished' },
    });
    let champion: { id: number; name: string } | null = null;
    if (resolvedChampionId !== null) {
      const user = await this.prisma.user.findUnique({
        where: { id: resolvedChampionId },
        select: { id: true, name: true },
      });
      if (user) champion = user;
    }
    await this.realtime.trigger(
      channels.publicTournament(tournament.publicId),
      events.tournamentFinished,
      { tournament_id: tournament.id, champion }
    );
    await this.invalidateStandingsCache(tournament.id);
  }
}
