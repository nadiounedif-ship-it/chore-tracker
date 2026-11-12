import { PrismaClient, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Chore Manager development database...');

  // Clean existing data
  await prisma.notification.deleteMany();
  await prisma.piggyBankTransaction.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.paymentPeriod.deleteMany();
  await prisma.choreSession.deleteMany();
  await prisma.choreAssignment.deleteMany();
  await prisma.shoppingRequest.deleteMany();
  await prisma.savingsGoal.deleteMany();
  await prisma.chore.deleteMany();
  await prisma.salaryBracket.deleteMany();
  await prisma.teamInvitation.deleteMany();
  await prisma.teamMember.deleteMany();
  await prisma.team.deleteMany();
  await prisma.nfcBadge.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 1. Create Boss: Dad
  const dad = await prisma.user.create({
    data: {
      email: 'dad@family.test',
      username: 'dad',
      fullName: 'David Miller (Dad)',
      passwordHash,
      role: 'BOSS',
    },
  });

  const dadTeam = await prisma.team.create({
    data: {
      name: "Dad's Crew",
      description: 'Outdoor, gardening, vehicle maintenance and heavy lifting.',
      bossId: dad.id,
      paymentSchedule: 'WEEKLY_SUNDAY',
      salaryBrackets: {
        create: [
          { minAge: 12, maxAge: 13, hourlyRate: new Prisma.Decimal('3.50') },
          { minAge: 14, maxAge: 15, hourlyRate: new Prisma.Decimal('4.50') },
          { minAge: 16, maxAge: 17, hourlyRate: new Prisma.Decimal('5.50') },
          { minAge: 18, maxAge: 99, hourlyRate: new Prisma.Decimal('7.00') },
        ],
      },
    },
  });

  // 2. Create Boss: Mum
  const mum = await prisma.user.create({
    data: {
      email: 'mum@family.test',
      username: 'mum',
      fullName: 'Sarah Miller (Mum)',
      passwordHash,
      role: 'BOSS',
    },
  });

  const mumTeam = await prisma.team.create({
    data: {
      name: "Mum's Home Hub",
      description: 'Indoor cleaning, laundry, organization and meal preparation.',
      bossId: mum.id,
      paymentSchedule: 'WEEKLY_SUNDAY',
      salaryBrackets: {
        create: [
          { minAge: 12, maxAge: 13, hourlyRate: new Prisma.Decimal('3.00') },
          { minAge: 14, maxAge: 15, hourlyRate: new Prisma.Decimal('4.00') },
          { minAge: 16, maxAge: 17, hourlyRate: new Prisma.Decimal('5.00') },
          { minAge: 18, maxAge: 99, hourlyRate: new Prisma.Decimal('6.50') },
        ],
      },
    },
  });

  // 3. Create Workers
  // Lucas - 16 years old
  const lucas = await prisma.user.create({
    data: {
      email: 'lucas@family.test',
      username: 'lucas',
      fullName: 'Lucas Miller',
      passwordHash,
      dateOfBirth: new Date(Date.now() - 16 * 365.25 * 24 * 3600 * 1000),
      role: 'WORKER',
      nfcBadge: {
        create: {
          badgeUid: 'NFC-LUCAS-001',
          label: 'Lucas Blue Keychain Tag',
        },
      },
      savingsGoals: {
        create: [
          {
            name: 'PlayStation 5 Pro',
            targetAmount: new Prisma.Decimal('799.00'),
          },
        ],
      },
    },
  });

  // Emma - 14 years old
  const emma = await prisma.user.create({
    data: {
      email: 'emma@family.test',
      username: 'emma',
      fullName: 'Emma Miller',
      passwordHash,
      dateOfBirth: new Date(Date.now() - 14 * 365.25 * 24 * 3600 * 1000),
      role: 'WORKER',
      nfcBadge: {
        create: {
          badgeUid: 'NFC-EMMA-002',
          label: 'Emma Purple Card',
        },
      },
      savingsGoals: {
        create: [
          {
            name: 'Electric Scooter',
            targetAmount: new Prisma.Decimal('350.00'),
          },
        ],
      },
    },
  });

  // Noah - 12 years old
  const noah = await prisma.user.create({
    data: {
      email: 'noah@family.test',
      username: 'noah',
      fullName: 'Noah Miller',
      passwordHash,
      dateOfBirth: new Date(Date.now() - 12 * 365.25 * 24 * 3600 * 1000),
      role: 'WORKER',
      nfcBadge: {
        create: {
          badgeUid: 'NFC-NOAH-003',
          label: 'Noah Green Wristband',
        },
      },
    },
  });

  // 4. Team Memberships (Multi-team distribution)
  // Lucas belongs to both Dad's Crew and Mum's Home Hub
  await prisma.teamMember.createMany({
    data: [
      { teamId: dadTeam.id, workerId: lucas.id, status: 'ACTIVE' },
      { teamId: mumTeam.id, workerId: lucas.id, status: 'ACTIVE' },
      // Emma belongs to both Dad's Crew and Mum's Home Hub
      { teamId: dadTeam.id, workerId: emma.id, status: 'ACTIVE' },
      { teamId: mumTeam.id, workerId: emma.id, status: 'ACTIVE' },
      // Noah belongs only to Mum's Home Hub
      { teamId: mumTeam.id, workerId: noah.id, status: 'ACTIVE' },
    ],
  });

  // 5. Create Chores for Dad's Crew
  const now = new Date();
  const currentWeek = 46;
  const currentYear = 2026;

  const choreLawn = await prisma.chore.create({
    data: {
      teamId: dadTeam.id,
      title: 'Mow the front and backyard lawn',
      description: 'Mow grass evenly, edge along driveway, and sweep clippings into compost bin.',
      category: 'GARDENING',
      priority: 'HIGH',
      paymentType: 'FIXED',
      fixedAmount: new Prisma.Decimal('15.00'),
      weekNumber: currentWeek,
      year: currentYear,
      deadline: new Date(now.getTime() + 3 * 24 * 3600 * 1000),
      requiresBeforeAfterPictures: true,
      requiresNfc: true,
      status: 'ASSIGNED',
      assignments: {
        create: {
          workerId: lucas.id,
          status: 'APPROVED',
          approvedAt: now,
        },
      },
    },
  });

  const choreCar = await prisma.chore.create({
    data: {
      teamId: dadTeam.id,
      title: 'Wash and vacuum the family SUV',
      description: 'Exterior soap wash, wheel rims cleaned, inside vacuumed.',
      category: 'MAINTENANCE',
      priority: 'MEDIUM',
      paymentType: 'FIXED',
      fixedAmount: new Prisma.Decimal('12.00'),
      weekNumber: currentWeek,
      year: currentYear,
      status: 'OPEN',
    },
  });

  // 6. Create Chores for Mum's Home Hub
  const choreKitchen = await prisma.chore.create({
    data: {
      teamId: mumTeam.id,
      title: 'Deep clean the kitchen and wash dishes',
      description: 'Wipe countertops, empty dishwasher, clean stovetop and sink.',
      category: 'CLEANING',
      priority: 'HIGH',
      paymentType: 'FIXED',
      fixedAmount: new Prisma.Decimal('6.00'),
      weekNumber: currentWeek,
      year: currentYear,
      status: 'ASSIGNED',
      assignments: {
        create: {
          workerId: emma.id,
          status: 'APPROVED',
          approvedAt: now,
        },
      },
    },
  });

  const chorePantry = await prisma.chore.create({
    data: {
      teamId: mumTeam.id,
      title: 'Organize kitchen pantry and check expiry dates',
      description: 'Group canned foods, check best-before dates, wipe shelves.',
      category: 'ORGANISATION',
      priority: 'MEDIUM',
      paymentType: 'HOURLY',
      weekNumber: currentWeek,
      year: currentYear,
      status: 'OPEN',
    },
  });

  // 7. Seed Past Completed Chore & Ledger Transactions
  // Lucas completed lawn mowing last week (+€15.00 in Dad's team)
  const pastSession = await prisma.choreSession.create({
    data: {
      assignmentId: (await prisma.choreAssignment.findFirst({ where: { choreId: choreLawn.id } }))!.id,
      workerId: lucas.id,
      teamId: dadTeam.id,
      clockInAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      clockOutAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000 + 5400 * 1000), // 1.5h
      durationSeconds: 5400,
      clockInMethod: 'NFC',
      clockOutMethod: 'NFC',
      workerAgeAtWork: 16,
      finalAmount: new Prisma.Decimal('15.00'),
      status: 'APPROVED',
      approvedAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000),
      approvedById: dad.id,
    },
  });

  await prisma.piggyBankTransaction.create({
    data: {
      workerId: lucas.id,
      teamId: dadTeam.id,
      choreSessionId: pastSession.id,
      amount: new Prisma.Decimal('15.00'),
      type: 'EARNING',
      description: 'Chore completed: Mow the front and backyard lawn',
      createdAt: new Date(now.getTime() - 4 * 24 * 3600 * 1000),
    },
  });

  // Emma earned €6.00 in Mum's team
  await prisma.piggyBankTransaction.create({
    data: {
      workerId: emma.id,
      teamId: mumTeam.id,
      amount: new Prisma.Decimal('6.00'),
      type: 'EARNING',
      description: 'Chore completed: Clean the kitchen',
      createdAt: new Date(now.getTime() - 2 * 24 * 3600 * 1000),
    },
  });

  console.log('Seed completed successfully!');
  console.log('Demo Credentials:');
  console.log('  Boss 1 (Dad): dad@family.test / Password123! (Team: Dad\'s Crew)');
  console.log('  Boss 2 (Mum): mum@family.test / Password123! (Team: Mum\'s Home Hub)');
  console.log('  Worker 1 (Lucas, age 16): lucas@family.test / Password123!');
  console.log('  Worker 2 (Emma, age 14): emma@family.test / Password123!');
  console.log('  Worker 3 (Noah, age 12): noah@family.test / Password123!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
