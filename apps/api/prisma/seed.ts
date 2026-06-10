/**
 * Seeders (SPEC §15): the 4 roles and the first superadmin from env vars.
 * Fails if SUPERADMIN_PASSWORD is missing. Demo data is opt-in via SEED_DEMO=true.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function seedRoles(): Promise<void> {
  for (const name of ['superadmin', 'admin', 'judge', 'player'] as const) {
    await prisma.role.upsert({ where: { name }, create: { name }, update: {} });
  }
  console.log('Roles seeded.');
}

async function seedSuperadmin(): Promise<void> {
  const email = process.env.SUPERADMIN_EMAIL;
  const password = process.env.SUPERADMIN_PASSWORD;
  const name = process.env.SUPERADMIN_NAME || 'Superadmin';
  if (!email || !password) {
    throw new Error('SUPERADMIN_EMAIL and SUPERADMIN_PASSWORD are required to seed the superadmin.');
  }
  const hash = await bcrypt.hash(password, 12);
  const superadminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'superadmin' } });
  const playerRole = await prisma.role.findUniqueOrThrow({ where: { name: 'player' } });
  const user = await prisma.user.upsert({
    where: { email },
    create: { name, email, password: hash, emailVerifiedAt: new Date() },
    update: {},
  });
  for (const role of [superadminRole, playerRole]) {
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      create: { userId: user.id, roleId: role.id },
      update: {},
    });
  }
  console.log(`Superadmin seeded: ${email}`);
}

async function main(): Promise<void> {
  await seedRoles();
  await seedSuperadmin();
  if (process.env.SEED_DEMO === 'true') {
    const { seedDemo } = await import('./seed-demo');
    await seedDemo(prisma);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
