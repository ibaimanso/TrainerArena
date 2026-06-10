/**
 * Optional demo data (SPEC §15): two tournaments — one with open registration
 * and one in progress (R1 played, R2 active with timer); players
 * jugador1..6@demo.test / password. Expanded in later phases as features land.
 */
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { ulid } from 'ulid';

export async function seedDemo(prisma: PrismaClient): Promise<void> {
  const playerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'player' } });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'admin' } });
  const hash = await bcrypt.hash('password', 12);

  const players = [];
  for (let i = 1; i <= 6; i++) {
    const user = await prisma.user.upsert({
      where: { email: `jugador${i}@demo.test` },
      create: {
        name: `Jugador ${i}`,
        email: `jugador${i}@demo.test`,
        password: hash,
        emailVerifiedAt: new Date(),
      },
      update: {},
    });
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: playerRole.id } },
      create: { userId: user.id, roleId: playerRole.id },
      update: {},
    });
    players.push(user);
  }

  const organizer = await prisma.user.upsert({
    where: { email: 'organizador@demo.test' },
    create: {
      name: 'Organizador Demo',
      email: 'organizador@demo.test',
      password: hash,
      emailVerifiedAt: new Date(),
    },
    update: {},
  });
  for (const role of [playerRole, adminRole]) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: organizer.id, roleId: role.id } },
      create: { userId: organizer.id, roleId: role.id },
      update: {},
    });
  }

  await prisma.tournament.upsert({
    where: { slug: 'liga-semanal-demo' },
    create: {
      publicId: ulid(),
      slug: 'liga-semanal-demo',
      adminId: organizer.id,
      name: 'Liga Semanal Demo',
      description: 'Torneo de demostración con inscripciones abiertas.',
      startAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'registration_open',
      maxPlayers: 16,
      swissRounds: 4,
      roundTimeMinutes: 30,
      checkinMinutes: 5,
      swissBo: 1,
      topCutBo: 3,
      topCutSize: 4,
      feeAmount: 0,
      pairingSeed: randomBytes(16).toString('hex'),
    },
    update: {},
  });

  // Second demo tournament: in progress, R1 played, R2 active with timer.
  const existing = await prisma.tournament.findUnique({ where: { slug: 'copa-demo-en-curso' } });
  if (!existing) {
    const tournament = await prisma.tournament.create({
      data: {
        publicId: ulid(),
        slug: 'copa-demo-en-curso',
        adminId: organizer.id,
        name: 'Copa Demo (en curso)',
        description: 'Torneo de demostración en curso: R1 jugada, R2 activa.',
        startAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        status: 'in_progress',
        maxPlayers: 8,
        swissRounds: 3,
        roundTimeMinutes: 30,
        checkinMinutes: 5,
        swissBo: 1,
        topCutBo: 3,
        topCutSize: 4,
        feeAmount: 0,
        pairingSeed: randomBytes(16).toString('hex'),
      },
    });
    for (const [i, player] of players.entries()) {
      await prisma.tournamentRegistration.create({
        data: {
          tournamentId: tournament.id,
          userId: player.id,
          status: 'active',
          fullName: player.name,
          tcgLiveUsername: `Jugador${i + 1}TCG`,
          email: player.email,
        },
      });
    }
    const [p1, p2, p3, p4, p5, p6] = players.map((p) => p.id);
    const r1FinishedAt = new Date(Date.now() - 60 * 60 * 1000);
    const round1 = await prisma.round.create({
      data: {
        tournamentId: tournament.id,
        roundNumber: 1,
        phase: 'swiss',
        status: 'finished',
        startedAt: new Date(Date.now() - 95 * 60 * 1000),
        endsAt: new Date(Date.now() - 65 * 60 * 1000),
        closedAt: r1FinishedAt,
      },
    });
    const r1Pairs: Array<[number, number, number]> = [
      [1, p1, p2],
      [2, p3, p4],
      [3, p5, p6],
    ];
    for (const [table, a, b] of r1Pairs) {
      await prisma.match.create({
        data: {
          roundId: round1.id,
          tableNumber: table,
          playerAId: a,
          playerBId: b,
          status: 'finished',
          checkInAAt: round1.startedAt,
          checkInBAt: round1.startedAt,
          finishedAt: r1FinishedAt,
          result: { create: { result: 'a_wins', winnerId: a } },
        },
      });
      const [low, high] = a < b ? [a, b] : [b, a];
      await prisma.pairingHistory.create({
        data: {
          tournamentId: tournament.id,
          playerLowId: low,
          playerHighId: high,
          roundId: round1.id,
        },
      });
    }
    const round2 = await prisma.round.create({
      data: {
        tournamentId: tournament.id,
        roundNumber: 2,
        phase: 'swiss',
        status: 'active',
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    // Winners (p1, p3, p5) and losers (p2, p4, p6) paired within groups.
    const r2Pairs: Array<[number, number, number]> = [
      [1, p1, p3],
      [2, p5, p2],
      [3, p4, p6],
    ];
    for (const [table, a, b] of r2Pairs) {
      await prisma.match.create({
        data: {
          roundId: round2.id,
          tableNumber: table,
          playerAId: a,
          playerBId: b,
          status: 'active',
        },
      });
      const [low, high] = a < b ? [a, b] : [b, a];
      await prisma.pairingHistory.create({
        data: {
          tournamentId: tournament.id,
          playerLowId: low,
          playerHighId: high,
          roundId: round2.id,
        },
      });
    }
    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { currentRoundId: round2.id },
    });
  }

  console.log('Demo data seeded: liga-semanal-demo (open) and copa-demo-en-curso (R2 active).');
}
