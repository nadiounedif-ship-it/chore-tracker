import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Prisma } from '@prisma/client';
import { getNextPaymentDate, getPeriodStart } from '../utils/paymentSchedule.js';
import { sendNotificationEmail } from '../utils/notifications.js';

export const piggybankRouter = Router();

const PayWorkerSchema = z.object({
  workerId: z.string().min(1),
  amount: z.number().positive(), // in Euros
  notes: z.string().optional(),
});

const AdjustmentSchema = z.object({
  workerId: z.string().min(1),
  amount: z.number(), // positive or negative
  reason: z.string().min(3),
});

/**
 * GET /api/piggybank/overview (Worker: all teams or filtered by team)
 */
piggybankRouter.get('/overview', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const { teamId } = req.query;

    // Get all transactions for this worker
    const transactions = await prisma.piggyBankTransaction.findMany({
      where: {
        workerId: req.user!.id,
        ...(teamId && { teamId: String(teamId) }),
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            boss: { select: { fullName: true, username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Calculate totals
    let totalEarned = new Prisma.Decimal('0.00');
    let totalPaid = new Prisma.Decimal('0.00');
    let totalUnpaid = new Prisma.Decimal('0.00');

    // Grouping by team
    const teamMap: Record<string, {
      teamId: string;
      teamName: string;
      bossName: string;
      earned: Prisma.Decimal;
      paid: Prisma.Decimal;
      unpaid: Prisma.Decimal;
    }> = {};

    for (const tx of transactions) {
      const tId = tx.teamId;
      if (!teamMap[tId]) {
        teamMap[tId] = {
          teamId: tId,
          teamName: tx.team.name,
          bossName: tx.team.boss.fullName,
          earned: new Prisma.Decimal('0.00'),
          paid: new Prisma.Decimal('0.00'),
          unpaid: new Prisma.Decimal('0.00'),
        };
      }

      if (tx.type === 'EARNING' || (tx.type === 'ADJUSTMENT' && tx.amount.gt(0))) {
        totalEarned = totalEarned.plus(tx.amount);
        teamMap[tId].earned = teamMap[tId].earned.plus(tx.amount);
      } else if (tx.type === 'PAYOUT') {
        const absVal = tx.amount.abs();
        totalPaid = totalPaid.plus(absVal);
        teamMap[tId].paid = teamMap[tId].paid.plus(absVal);
      }

      // Net unpaid balance is sum of all amounts (earnings positive, payouts negative)
      totalUnpaid = totalUnpaid.plus(tx.amount);
      teamMap[tId].unpaid = teamMap[tId].unpaid.plus(tx.amount);
    }

    return res.json({
      totalEarned: totalEarned.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalUnpaid: totalUnpaid.toFixed(2),
      byTeam: Object.values(teamMap).map((t) => ({
        teamId: t.teamId,
        teamName: t.teamName,
        bossName: t.bossName,
        earned: t.earned.toFixed(2),
        paid: t.paid.toFixed(2),
        unpaid: t.unpaid.toFixed(2),
      })),
      recentTransactions: transactions.slice(0, 50).map((t) => ({
        id: t.id,
        teamId: t.teamId,
        teamName: t.team.name,
        amount: t.amount.toFixed(2),
        type: t.type,
        description: t.description,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    console.error('Piggybank Overview Error:', error);
    return res.status(500).json({ error: 'Failed to retrieve piggy bank data.' });
  }
});

/**
 * GET /api/piggybank/team (Boss: View finances for their own team ONLY)
 */
piggybankRouter.get('/team', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
      include: {
        members: {
          where: { status: 'ACTIVE' },
          include: {
            worker: {
              select: { id: true, fullName: true, username: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found for this Boss.' });
    }

    const transactions = await prisma.piggyBankTransaction.findMany({
      where: { teamId: team.id },
      include: {
        worker: {
          select: { id: true, fullName: true, username: true, avatarUrl: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    let totalEarned = new Prisma.Decimal('0.00');
    let totalPaid = new Prisma.Decimal('0.00');
    let totalUnpaid = new Prisma.Decimal('0.00');

    const workerStats: Record<string, {
      workerId: string;
      workerName: string;
      username: string;
      avatarUrl?: string | null;
      earned: Prisma.Decimal;
      paid: Prisma.Decimal;
      unpaid: Prisma.Decimal;
    }> = {};

    // Initialize with active members
    for (const m of team.members) {
      workerStats[m.workerId] = {
        workerId: m.workerId,
        workerName: m.worker.fullName,
        username: m.worker.username,
        avatarUrl: m.worker.avatarUrl,
        earned: new Prisma.Decimal('0.00'),
        paid: new Prisma.Decimal('0.00'),
        unpaid: new Prisma.Decimal('0.00'),
      };
    }

    for (const tx of transactions) {
      if (!workerStats[tx.workerId]) {
        workerStats[tx.workerId] = {
          workerId: tx.workerId,
          workerName: tx.worker.fullName,
          username: tx.worker.username,
          avatarUrl: tx.worker.avatarUrl,
          earned: new Prisma.Decimal('0.00'),
          paid: new Prisma.Decimal('0.00'),
          unpaid: new Prisma.Decimal('0.00'),
        };
      }

      if (tx.type === 'EARNING' || (tx.type === 'ADJUSTMENT' && tx.amount.gt(0))) {
        totalEarned = totalEarned.plus(tx.amount);
        workerStats[tx.workerId].earned = workerStats[tx.workerId].earned.plus(tx.amount);
      } else if (tx.type === 'PAYOUT') {
        const absVal = tx.amount.abs();
        totalPaid = totalPaid.plus(absVal);
        workerStats[tx.workerId].paid = workerStats[tx.workerId].paid.plus(absVal);
      }

      totalUnpaid = totalUnpaid.plus(tx.amount);
      workerStats[tx.workerId].unpaid = workerStats[tx.workerId].unpaid.plus(tx.amount);
    }

    return res.json({
      teamName: team.name,
      totalEarned: totalEarned.toFixed(2),
      totalPaid: totalPaid.toFixed(2),
      totalUnpaid: totalUnpaid.toFixed(2),
      workers: Object.values(workerStats).map((w) => ({
        workerId: w.workerId,
        workerName: w.workerName,
        username: w.username,
        avatarUrl: w.avatarUrl,
        earned: w.earned.toFixed(2),
        paid: w.paid.toFixed(2),
        unpaid: w.unpaid.toFixed(2),
      })),
      recentTransactions: transactions.slice(0, 50).map((t) => ({
        id: t.id,
        workerName: t.worker.fullName,
        amount: t.amount.toFixed(2),
        type: t.type,
        description: t.description,
        createdAt: t.createdAt,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to retrieve team finances.' });
  }
});

/**
 * POST /api/piggybank/pay (Boss records payout to worker)
 */
piggybankRouter.post('/pay', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const data = PayWorkerSchema.parse(req.body);

    const team = await prisma.team.findUnique({
      where: { bossId: req.user!.id },
    });

    if (!team) {
      return res.status(404).json({ error: 'Team not found.' });
    }

    const worker = await prisma.user.findUnique({
      where: { id: data.workerId },
    });
    const payAmount = new Prisma.Decimal(data.amount.toFixed(2));

    if (!worker) {
      return res.status(404).json({ error: 'Worker not found.' });
    }

    if (worker.role !== 'WORKER') return res.status(400).json({ error: 'Payments can only be made to worker accounts.' });
    const membership = await prisma.teamMember.findUnique({ where: { teamId_workerId: { teamId: team.id, workerId: worker.id } } });
    if (!membership) return res.status(403).json({ error: 'This worker has no history with your team.' });
    const balance = await prisma.piggyBankTransaction.aggregate({ where: { workerId: worker.id, teamId: team.id }, _sum: { amount: true } });
    const unpaid = balance._sum.amount || new Prisma.Decimal(0);
    if (payAmount.gt(unpaid)) return res.status(400).json({ error: `Payment exceeds the team balance of ${unpaid.toFixed(2)} €.` });

    const negativePayout = payAmount.negated();

    // Ensure payment period exists
    let period = await prisma.paymentPeriod.findFirst({
      where: { teamId: team.id, status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
    });

    const now = new Date();
    if (period && period.endDate <= now) {
      await prisma.paymentPeriod.update({ where: { id: period.id }, data: { status: 'CLOSED', closedAt: now } });
      period = null;
    }

    if (!period) {
      const scheduledEnd = getNextPaymentDate(team.paymentSchedule, team.customPaymentIntervalDays, team.customPaymentDay, now);
      period = await prisma.paymentPeriod.create({
        data: {
          teamId: team.id,
          startDate: getPeriodStart(team.paymentSchedule, team.customPaymentIntervalDays, team.customPaymentDay, scheduledEnd),
          endDate: scheduledEnd,
          status: 'OPEN',
          schedule: team.paymentSchedule,
          customPaymentIntervalDays: team.customPaymentIntervalDays,
          customPaymentDay: team.customPaymentDay,
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Create Payment record
      const payment = await tx.payment.create({
        data: {
          teamId: team.id,
          workerId: worker.id,
          paymentPeriodId: period.id,
          totalAmount: payAmount,
          paidById: req.user!.id,
          notes: data.notes || `Payout by ${req.user!.username}`,
        },
      });

      // 2. Insert compensating negative PiggyBank transaction
      const transaction = await tx.piggyBankTransaction.create({
        data: {
          workerId: worker.id,
          teamId: team.id,
          paymentId: payment.id,
          amount: negativePayout,
          type: 'PAYOUT',
          description: `Payment recorded by Boss ${req.user!.username}${data.notes ? ` (${data.notes})` : ''}`,
        },
      });

      // 3. Notify worker
      const notification = await tx.notification.create({
        data: {
          userId: worker.id,
          teamId: team.id,
          type: 'PAYMENT_RECORDED',
          title: 'Payment Received!',
          message: `Boss ${req.user!.username} paid you ${payAmount.toString().replace('.', ',')} € for team "${team.name}".`,
          linkUrl: '/worker/piggy-bank',
          referenceType: 'payment', referenceId: transaction.id,
        },
      });

      return { payment, transaction, notification };
    });
    await sendNotificationEmail(result.notification.id);

    return res.status(201).json({
      message: `Recorded payment of ${payAmount.toString().replace('.', ',')} € to ${worker.fullName}.`,
      payment: result.payment,
      transaction: result.transaction,
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    console.error('Payment Error:', error);
    return res.status(500).json({ error: 'Failed to record payment.' });
  }
});
