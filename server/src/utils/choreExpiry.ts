import { prisma } from '../prisma.js';
import { Prisma } from '@prisma/client';
import { sendNotificationPush } from './notifications.js';

export async function expireUnstartedApprovals() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  // A completion deadline replaces the generic 48-hour start window. Those
  // assignments stay with their worker until the deadline, when the late-fee
  // processor handles them. Only assignments without a completion deadline
  // use the 48-hour start rule, including direct assignments.
  const expired = await prisma.choreAssignment.findMany({ where: { status: 'APPROVED', approvedAt: { lte: cutoff }, chore: { deadline: null } }, select: { id: true, choreId: true } });
  for (const assignment of expired) {
    await prisma.$transaction(async (tx) => {
      if (await tx.choreSession.findFirst({ where: { assignmentId: assignment.id, status: 'ACTIVE' }, select: { id: true } })) return;
      const changed = await tx.choreAssignment.updateMany({ where: { id: assignment.id, status: 'APPROVED', approvedAt: { lte: cutoff }, chore: { deadline: null } }, data: { status: 'CANCELLED' } });
      if (!changed.count) return;
      const remaining = await tx.choreAssignment.count({ where: { choreId: assignment.choreId, status: { in: ['APPROVED', 'ACTIVE'] } } });
      if (!remaining) await tx.chore.updateMany({ where: { id: assignment.choreId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, data: { status: 'OPEN' } });
    });
  }
}

export async function processOverdueChoreDeadlines() {
  const now = new Date();
  const assignments = await prisma.choreAssignment.findMany({
    where: { status: { in: ['APPROVED', 'ACTIVE'] }, deadlinePenaltyAppliedAt: null, chore: { deadline: { lte: now } } },
    include: { chore: { select: { id: true, title: true, teamId: true, deadline: true } }, sessions: { select: { status: true, clockOutAt: true } } },
  });
  for (const assignment of assignments) {
    const deadline = assignment.chore.deadline!;
    const submittedByDeadline = assignment.sessions.some((session) => ['SUBMITTED', 'APPROVED'].includes(session.status) && !!session.clockOutAt && session.clockOutAt <= deadline);
    if (submittedByDeadline) continue;
    const result = await prisma.$transaction(async (tx) => {
      const claimed = await tx.choreAssignment.updateMany({
        where: { id: assignment.id, status: { in: ['APPROVED', 'ACTIVE'] }, deadlinePenaltyAppliedAt: null },
        data: { deadlinePenaltyAppliedAt: now },
      });
      if (!claimed.count) return null;
      const transaction = await tx.piggyBankTransaction.create({
        data: { workerId: assignment.workerId, teamId: assignment.chore.teamId, amount: new Prisma.Decimal('-0.50'), type: 'ADJUSTMENT', description: `Late chore fee: ${assignment.chore.title}` },
      });
      const notification = await tx.notification.create({
        data: { userId: assignment.workerId, teamId: assignment.chore.teamId, type: 'DEADLINE_PENALTY', title: 'Chore deadline passed', message: `“${assignment.chore.title}” was not finished by its deadline. €0.50 was deducted from your piggy bank.`, linkUrl: '/worker/piggy-bank', referenceType: 'transaction', referenceId: transaction.id },
      });
      return notification;
    });
    if (result) await sendNotificationPush(result.id);
  }
}
