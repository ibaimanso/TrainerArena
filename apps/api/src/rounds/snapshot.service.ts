import { Injectable } from '@nestjs/common';
import type { Tournament } from '@prisma/client';
import type { TournamentSnapshot } from '@apptorneos/engine';
import { pairKey, type PairingHistory } from '@apptorneos/engine';
import { PrismaService } from '../prisma/prisma.service';

/** Builds the immutable engine snapshot (SPEC §5) from the database. */
@Injectable()
export class SnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async build(tournament: Tournament): Promise<TournamentSnapshot> {
    const [registrations, rounds] = await Promise.all([
      this.prisma.tournamentRegistration.findMany({
        where: { tournamentId: tournament.id, status: { in: ['active', 'dropped'] } },
        select: { userId: true, status: true, droppedAfterRoundId: true },
      }),
      this.prisma.round.findMany({
        where: { tournamentId: tournament.id },
        include: {
          matches: { include: { result: true } },
        },
        orderBy: { roundNumber: 'asc' },
      }),
    ]);

    const roundNumberById = new Map(rounds.map((r) => [r.id, r.roundNumber]));
    const currentRoundNumber = tournament.currentRoundId
      ? roundNumberById.get(tournament.currentRoundId) ?? 0
      : 0;

    return {
      pairingSeed: tournament.pairingSeed,
      currentRoundNumber,
      players: registrations.map((r) => ({
        id: r.userId,
        dropped: r.status === 'dropped',
        droppedAfterRoundNumber:
          r.droppedAfterRoundId !== null
            ? roundNumberById.get(r.droppedAfterRoundId) ?? null
            : null,
      })),
      matches: rounds.flatMap((round) =>
        round.matches
          .filter((m) => m.result !== null)
          .map((m) => ({
            roundNumber: round.roundNumber,
            tableNumber: m.tableNumber,
            playerAId: m.playerAId,
            playerBId: m.playerBId,
            outcome: (m.result as NonNullable<typeof m.result>).result,
            finishedAt: m.finishedAt?.toISOString() ?? null,
          }))
      ),
    };
  }

  /** Normalized rematch keys from pairing_history (SPEC §3). */
  async history(tournamentId: number): Promise<PairingHistory> {
    const rows = await this.prisma.pairingHistory.findMany({
      where: { tournamentId },
      select: { playerLowId: true, playerHighId: true },
    });
    return new Set(rows.map((r) => pairKey(r.playerLowId, r.playerHighId)));
  }
}
