import { Controller, Get, Inject, NotFoundException, Param, UseGuards } from '@nestjs/common';
import type Redis from 'ioredis';
import { computeStandings, matchWinner } from '@apptorneos/engine';
import { AuthGuard, Public } from '../auth/auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS } from '../redis/redis.module';
import { TournamentsService } from '../tournaments/tournaments.service';
import { SnapshotService } from './snapshot.service';

const STANDINGS_TTL_SECONDS = 6 * 60 * 60; // 6 h (SPEC §14)

@Controller('tournaments/:slug')
@UseGuards(AuthGuard)
export class PublicRoundsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tournaments: TournamentsService,
    private readonly snapshots: SnapshotService,
    @Inject(REDIS) private readonly redis: Redis
  ) {}

  /** Public standings (SPEC §12): cached per tournament, invalidated on round close. */
  @Public()
  @Get('standings')
  async standings(@Param('slug') slug: string) {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const cacheKey = `standings:${tournament.id}`;

    try {
      if (this.redis.status !== 'ready') await this.redis.connect().catch(() => undefined);
      const cached = await this.redis.get(cacheKey);
      if (cached) return JSON.parse(cached) as unknown;
    } catch {
      // cache failures degrade to recomputation
    }

    const [snapshot, registrations, cutRounds] = await Promise.all([
      this.snapshots.build(tournament),
      this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id, status: { in: ['active', 'dropped'] } },
      }),
      this.prisma.round.findMany({
        where: { tournamentId: tournament.id, phase: 'top_cut' },
        orderBy: { roundNumber: 'asc' },
        include: {
          matches: {
            orderBy: { tableNumber: 'asc' },
            include: {
              playerA: { select: { id: true, name: true } },
              playerB: { select: { id: true, name: true } },
              result: true,
            },
          },
        },
      }),
    ]);

    const registrationByUser = new Map(registrations.map((r) => [r.userId, r]));
    const entries = computeStandings(snapshot);
    const standings = entries.map((e, index) => {
      const registration = registrationByUser.get(e.playerId);
      return {
        position: index + 1,
        playerId: e.playerId,
        playerName: registration?.fullName ?? `Jugador ${e.playerId}`,
        tcgLiveUsername: registration?.tcgLiveUsername ?? '',
        dropped: registration?.status === 'dropped',
        points: e.matchPoints,
        wins: e.wins,
        losses: e.losses,
        draws: e.draws,
        owp: e.owp,
        oowp: e.oowp,
      };
    });

    const topCut = cutRounds.map((round) => ({
      roundNumber: round.roundNumber,
      status: round.status,
      matches: round.matches.map((m) => ({
        bracketPosition: m.bracketPosition ?? m.tableNumber,
        playerA: m.playerA,
        playerB: m.playerB,
        isBye: m.isBye,
        winnerId: m.result
          ? matchWinner({
              bracketPosition: m.bracketPosition ?? m.tableNumber,
              playerAId: m.playerAId,
              playerBId: m.playerBId,
              outcome: m.result.result,
            })
          : null,
      })),
    }));

    // Champion derived from the final (last cut round with a single match), SPEC §7.
    let champion: { id: number; name: string } | null = null;
    if (tournament.status === 'finished') {
      const lastCut = topCut[topCut.length - 1];
      if (lastCut && lastCut.matches.length === 1 && lastCut.matches[0].winnerId !== null) {
        const winnerId = lastCut.matches[0].winnerId;
        const winner =
          lastCut.matches[0].playerA?.id === winnerId
            ? lastCut.matches[0].playerA
            : lastCut.matches[0].playerB;
        champion = winner ?? null;
      } else if (tournament.topCutSize === 0 && standings.length > 0) {
        const leader = standings.find((s) => !s.dropped) ?? standings[0];
        champion = { id: leader.playerId, name: leader.playerName };
      }
    }

    const payload = {
      tournamentStatus: tournament.status,
      champion,
      standings,
      topCut,
    };

    try {
      await this.redis.set(cacheKey, JSON.stringify(payload), 'EX', STANDINGS_TTL_SECONDS);
    } catch {
      // ignore cache write failures
    }
    return payload;
  }

  /**
   * Per-matchday standings (league format): standings computed from the
   * matches of a single swiss round. Not cached (cheap, on demand).
   */
  @Public()
  @Get('rounds/:n/standings')
  async roundStandings(@Param('slug') slug: string, @Param('n') n: string) {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const roundNumber = Number(n);
    const round = await this.prisma.round.findFirst({
      where: { tournamentId: tournament.id, roundNumber, phase: 'swiss' },
    });
    if (!round) throw new NotFoundException('La jornada no existe.');

    const [snapshot, registrations] = await Promise.all([
      this.snapshots.build(tournament),
      this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id, status: { in: ['active', 'dropped'] } },
      }),
    ]);
    const roundOnly = {
      ...snapshot,
      matches: snapshot.matches.filter((m) => m.roundNumber === roundNumber),
    };
    const playedIds = new Set(
      roundOnly.matches.flatMap((m) =>
        [m.playerAId, m.playerBId].filter((id): id is number => id !== null)
      )
    );
    const registrationByUser = new Map(registrations.map((r) => [r.userId, r]));
    const entries = computeStandings(roundOnly).filter((e) => playedIds.has(e.playerId));
    return {
      round: { roundNumber: round.roundNumber, status: round.status },
      standings: entries.map((e, index) => {
        const registration = registrationByUser.get(e.playerId);
        return {
          position: index + 1,
          playerId: e.playerId,
          playerName: registration?.fullName ?? `Jugador ${e.playerId}`,
          tcgLiveUsername: registration?.tcgLiveUsername ?? '',
          dropped: registration?.status === 'dropped',
          points: e.matchPoints,
          wins: e.wins,
          losses: e.losses,
          draws: e.draws,
          owp: e.owp,
          oowp: e.oowp,
        };
      }),
    };
  }

  /** Round list for the public pairings selector. */
  @Public()
  @Get('rounds')
  async rounds(@Param('slug') slug: string) {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const rounds = await this.prisma.round.findMany({
      where: { tournamentId: tournament.id },
      orderBy: { roundNumber: 'asc' },
      select: { roundNumber: true, phase: true, status: true },
    });
    return { rounds };
  }

  /** Public pairings of round N (SPEC §12); 404 if the round does not exist. */
  @Public()
  @Get('rounds/:n/pairings')
  async pairings(@Param('slug') slug: string, @Param('n') n: string) {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const roundNumber = Number(n);
    const round = await this.prisma.round.findFirst({
      where: { tournamentId: tournament.id, roundNumber },
      include: {
        matches: {
          orderBy: { tableNumber: 'asc' },
          include: {
            playerA: { select: { id: true, name: true } },
            playerB: { select: { id: true, name: true } },
            result: true,
          },
        },
      },
    });
    if (!round) throw new NotFoundException('La ronda no existe.');
    return {
      round: { roundNumber: round.roundNumber, phase: round.phase, status: round.status },
      matches: round.matches.map((m) => ({
        tableNumber: m.tableNumber,
        playerA: m.playerA,
        playerB: m.playerB,
        isBye: m.isBye,
        status: m.status,
        result: m.result?.result ?? null,
      })),
    };
  }

  /** Public current round (SPEC §12): phase + number + state + authoritative timer data. */
  @Public()
  @Get('current-round')
  async currentRound(@Param('slug') slug: string) {
    const tournament = await this.tournaments.publicBySlugOrFail(slug);
    const round = tournament.currentRoundId
      ? await this.prisma.round.findUnique({ where: { id: tournament.currentRoundId } })
      : null;
    return {
      tournamentStatus: tournament.status,
      round: round
        ? {
            roundNumber: round.roundNumber,
            phase: round.phase,
            status: round.status,
            endsAt: round.endsAt?.toISOString() ?? null,
          }
        : null,
      serverNow: new Date().toISOString(),
    };
  }
}
