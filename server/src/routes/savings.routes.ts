import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { Prisma } from '@prisma/client';

export const savingsRouter = Router();

const CreateGoalSchema = z.object({
  name: z.string().min(2).max(100),
  targetAmount: z.number().positive(), // in Euros
  pictureUrl: z.string().optional().nullable(),
});

/**
 * GET /api/savings (Worker's personal savings goals)
 */
savingsRouter.get('/', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const goals = await prisma.savingsGoal.findMany({
      where: { workerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });

    // Also get worker's current total unpaid savings to compute progress
    const txs = await prisma.piggyBankTransaction.findMany({
      where: { workerId: req.user!.id },
      select: { amount: true },
    });

    const currentPiggyBalance = txs.reduce(
      (sum, tx) => sum.plus(tx.amount),
      new Prisma.Decimal('0.00')
    );

    const goalsWithProgress = goals.map((g) => {
      const progressPercent = Math.min(
        100,
        Math.round((currentPiggyBalance.toNumber() / g.targetAmount.toNumber()) * 100)
      );
      return {
        ...g,
        targetAmount: g.targetAmount.toFixed(2),
        currentPiggyBalance: currentPiggyBalance.toFixed(2),
        progressPercent: isNaN(progressPercent) ? 0 : progressPercent,
      };
    });

    return res.json(goalsWithProgress);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load savings goals.' });
  }
});

/**
 * POST /api/savings
 */
savingsRouter.post('/', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const data = CreateGoalSchema.parse(req.body);

    const goal = await prisma.savingsGoal.create({
      data: {
        workerId: req.user!.id,
        name: data.name,
        targetAmount: new Prisma.Decimal(data.targetAmount.toFixed(2)),
        pictureUrl: data.pictureUrl || null,
      },
    });

    return res.status(201).json({ message: 'Savings goal created!', goal });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to create savings goal.' });
  }
});

/** Update a worker's own savings goal. */
savingsRouter.put('/:id', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const data = CreateGoalSchema.parse(req.body);
    const id = req.params.id as string;
    const existing = await prisma.savingsGoal.findUnique({ where: { id } });
    if (!existing || existing.workerId !== req.user!.id) return res.status(404).json({ error: 'Goal not found.' });

    const goal = await prisma.savingsGoal.update({ where: { id }, data: {
      name: data.name,
      targetAmount: new Prisma.Decimal(data.targetAmount.toFixed(2)),
      pictureUrl: data.pictureUrl || null,
    } });
    return res.json({ message: 'Savings goal updated.', goal });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.errors[0]?.message });
    return res.status(500).json({ error: 'Failed to update savings goal.' });
  }
});

/**
 * DELETE /api/savings/:id
 */
savingsRouter.delete('/:id', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const goal = await prisma.savingsGoal.findUnique({
      where: { id },
    });

    if (!goal || goal.workerId !== req.user!.id) {
      return res.status(404).json({ error: 'Goal not found.' });
    }

    await prisma.savingsGoal.delete({ where: { id } });
    return res.json({ message: 'Savings goal deleted.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete goal.' });
  }
});
