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

  console.log('Demo data seeded (in-progress tournament arrives with the rounds phase).');
}
