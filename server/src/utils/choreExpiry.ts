import { prisma } from '../prisma.js';
import { Prisma } from '@prisma/client';
import { createNotification, sendNotificationPush } from './notifications.js';

export async function expireUnstartedApprovals() {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  // Team-requested chores get a 48-hour start window when there is no deadline.
  // Direct assignments stay with the chosen worker indefinitely without one.
  const expired = await prisma.choreAssignment.findMany({ where: { status: 'APPROVED', directAssigned: false, approvedAt: { lte: cutoff }, chore: { deadline: null } }, select: { id: true, choreId: true } });
  for (const assignment of expired) {
    await prisma.$transaction(async (tx) => {
      if (await tx.choreSession.findFirst({ where: { assignmentId: assignment.id, status: 'ACTIVE' }, select: { id: true } })) return;
      const changed = await tx.choreAssignment.updateMany({ where: { id: assignment.id, status: 'APPROVED', directAssigned: false, approvedAt: { lte: cutoff }, chore: { deadline: null } }, data: { status: 'CANCELLED' } });
      if (!changed.count) return;
      const remaining = await tx.choreAssignment.count({ where: { choreId: assignment.choreId, status: { in: ['APPROVED', 'ACTIVE'] } } });
      if (!remaining) await tx.chore.updateMany({ where: { id: assignment.choreId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } }, data: { status: 'OPEN' } });
    });
  }
}

/** Notify workers and their boss once as the open request cutoff approaches. */
export async function processRequestCutoffReminders() {
  const now = new Date();
  const reminders = [
    { key: 'request-cutoff-24h', duration: 24 * 60 * 60 * 1000, after: 60 * 60 * 1000, label: '24 hours' },
    { key: 'request-cutoff-1h', duration: 60 * 60 * 1000, label: '1 hour' },
  ];
  for (const reminder of reminders) {
    const chores = await prisma.chore.findMany({
      where: { status: 'OPEN', requestDeadline: { gt: new Date(now.getTime() + (reminder.after || 0)), lte: new Date(now.getTime() + reminder.duration) }, assignments: { none: { status: { in: ['REQUESTED', 'APPROVED', 'ACTIVE', 'COMPLETED'] } } } },
      include: { team: { select: { id: true, name: true, bossId: true } } },
    });
    for (const chore of chores) {
      const members = await prisma.teamMember.findMany({ where: { teamId: chore.teamId, status: 'ACTIVE' }, select: { workerId: true } });
      const recipients = [chore.team.bossId, ...members.map((member) => member.workerId)];
      for (const userId of recipients) {
        const referenceType = reminder.key;
        const existing = await prisma.notification.findFirst({ where: { userId, referenceType, referenceId: chore.id }, select: { id: true } });
        if (existing) continue;
        await createNotification({ data: {
          userId, teamId: chore.teamId, type: 'REMINDER', title: 'Chore request window is closing',
          message: `“${chore.title}” in ${chore.team.name} closes in about ${reminder.label}. Request it before ${chore.requestDeadline!.toLocaleString()}.`,
          linkUrl: userId === chore.team.bossId ? '/boss/chores' : '/worker/available-chores',
          referenceType, referenceId: chore.id,
        } });
      }
    }
  }
}

/** Remind assigned workers before a chore's completion deadline. */
export async function processCompletionDeadlineReminders() {
  const now = new Date();
  const reminders = [
    { key: 'completion-deadline-24h', duration: 24 * 60 * 60 * 1000, after: 60 * 60 * 1000, label: '24 hours' },
    { key: 'completion-deadline-1h', duration: 60 * 60 * 1000, label: '1 hour' },
  ];
  for (const reminder of reminders) {
    const assignments = await prisma.choreAssignment.findMany({
      where: { status: { in: ['APPROVED', 'ACTIVE'] }, sessions: { none: { status: { in: ['SUBMITTED', 'APPROVED'] } } }, chore: { deadline: { gt: new Date(now.getTime() + (reminder.after || 0)), lte: new Date(now.getTime() + reminder.duration) } } },
      include: { chore: { select: { id: true, title: true, teamId: true, deadline: true } } },
    });
    for (const assignment of assignments) {
      const referenceType = reminder.key;
      const existing = await prisma.notification.findFirst({ where: { userId: assignment.workerId, referenceType, referenceId: assignment.id }, select: { id: true } });
      if (existing) continue;
      await createNotification({ data: {
        userId: assignment.workerId, teamId: assignment.chore.teamId, type: 'REMINDER', title: 'Chore deadline is approaching',
        message: `“${assignment.chore.title}” is due in about ${reminder.label} (${assignment.chore.deadline!.toLocaleString()}). Finish it by then to avoid the €0.50 late fee.`,
        linkUrl: '/worker/my-chores', referenceType, referenceId: assignment.id,
      } });
    }
  }
}

/** Remind a worker about the 48-hour start window on team-requested chores. */
export async function processApprovalStartReminders() {
  const now = Date.now();
  const reminders = [
    { key: 'approval-start-24h', minElapsed: 23 * 60 * 60 * 1000, maxElapsed: 24 * 60 * 60 * 1000, label: 'about 24 hours' },
    { key: 'approval-start-1h', minElapsed: 47 * 60 * 60 * 1000, maxElapsed: 48 * 60 * 60 * 1000, label: 'about 1 hour' },
  ];
  for (const reminder of reminders) {
    const assignments = await prisma.choreAssignment.findMany({
      where: { status: 'APPROVED', directAssigned: false, approvedAt: { gt: new Date(now - reminder.maxElapsed), lte: new Date(now - reminder.minElapsed) }, chore: { deadline: null } },
      include: { chore: { select: { id: true, title: true, teamId: true } } },
    });
    for (const assignment of assignments) {
      const existing = await prisma.notification.findFirst({ where: { userId: assignment.workerId, referenceType: reminder.key, referenceId: assignment.id }, select: { id: true } });
      if (existing) continue;
      await createNotification({ data: {
        userId: assignment.workerId, teamId: assignment.chore.teamId, type: 'REMINDER', title: 'Start your approved chore soon',
        message: `“${assignment.chore.title}” must be started within 48 hours of approval. Your start window closes in ${reminder.label}.`,
        linkUrl: '/worker/my-chores', referenceType: reminder.key, referenceId: assignment.id,
      } });
    }
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
