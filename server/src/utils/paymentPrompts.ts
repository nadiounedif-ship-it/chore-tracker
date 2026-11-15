import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { createNotification } from './notifications.js';
import { getNextPaymentDate, getPeriodStart } from './paymentSchedule.js';

/** Close due periods, ask eligible workers what they want to do, and make the next period. */
export async function processPaymentPrompts() {
  const now = new Date();
  const teams = await prisma.team.findMany({ select: { id: true, name: true, paymentSchedule: true, customPaymentIntervalDays: true, customPaymentDay: true } });

  for (const team of teams) {
    const duePeriods = await prisma.paymentPeriod.findMany({ where: { teamId: team.id, status: 'OPEN', endDate: { lte: now } }, orderBy: { endDate: 'asc' } });
    for (const period of duePeriods) {
      const closed = await prisma.paymentPeriod.updateMany({ where: { id: period.id, status: 'OPEN' }, data: { status: 'CLOSED', closedAt: now } });
      if (!closed.count) continue;

      const members = await prisma.teamMember.findMany({ where: { teamId: team.id, status: 'ACTIVE' }, select: { workerId: true } });
      for (const member of members) {
        const unresolved = await prisma.paymentPrompt.findFirst({ where: { teamId: team.id, workerId: member.workerId, status: { in: ['PENDING', 'REQUESTED'] } }, select: { id: true } });
        if (unresolved) continue;

        const balance = await prisma.piggyBankTransaction.aggregate({ where: { teamId: team.id, workerId: member.workerId, createdAt: { lte: period.endDate } }, _sum: { amount: true } });
        const amount = balance._sum.amount || new Prisma.Decimal(0);
        if (!amount.gt(0)) continue;

        try {
          const prompt = await prisma.paymentPrompt.create({ data: { teamId: team.id, workerId: member.workerId, paymentPeriodId: period.id, amount } });
          await createNotification({ data: {
            userId: member.workerId,
            teamId: team.id,
            type: 'PAYMENT_PERIOD_DUE',
            title: 'Your payment choice is ready',
            message: `There is ${amount.toFixed(2).replace('.', ',')} € in your ${team.name} piggy bank. Choose to request payment or keep saving for the next period.`,
            linkUrl: '/worker/piggy-bank',
            referenceType: 'payment-prompt',
            referenceId: prompt.id,
          } });
        } catch (error: any) {
          // The unique period/worker constraint makes retries and overlapping
          // scheduled runs safe without sending a duplicate reminder.
          if (error?.code !== 'P2002') throw error;
        }
      }
    }

    const openPeriod = await prisma.paymentPeriod.findFirst({ where: { teamId: team.id, status: 'OPEN' }, orderBy: { endDate: 'asc' } });
    if (!openPeriod) {
      const nextEnd = getNextPaymentDate(team.paymentSchedule, team.customPaymentIntervalDays, team.customPaymentDay, now);
      await prisma.paymentPeriod.create({ data: {
        teamId: team.id,
        startDate: getPeriodStart(team.paymentSchedule, team.customPaymentIntervalDays, team.customPaymentDay, nextEnd),
        endDate: nextEnd,
        schedule: team.paymentSchedule,
        customPaymentIntervalDays: team.customPaymentIntervalDays,
        customPaymentDay: team.customPaymentDay,
      } });
    }
  }
}
