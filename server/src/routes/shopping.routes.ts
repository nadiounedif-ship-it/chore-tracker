import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma.js';
import { authenticate, requireRole } from '../middleware/auth.js';

export const shoppingRouter = Router();

const CreateShoppingRequestSchema = z.object({
  teamId: z.string().min(1),
  choreId: z.string().optional().nullable(),
  productName: z.string().min(2).max(100),
  description: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  pictureUrl: z.string().optional().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
});

const UpdateShoppingStatusSchema = z.object({
  status: z.enum(['APPROVED', 'PURCHASED', 'REJECTED']),
});

/**
 * POST /api/shopping (Worker requests a missing product)
 */
shoppingRouter.post('/', authenticate, requireRole('WORKER'), async (req: Request, res: Response) => {
  try {
    const data = CreateShoppingRequestSchema.parse(req.body);

    const membership = await prisma.teamMember.findUnique({
      where: {
        teamId_workerId: {
          teamId: data.teamId,
          workerId: req.user!.id,
        },
      },
      include: { team: true },
    });

    if (!membership || membership.status !== 'ACTIVE') {
      return res.status(403).json({ error: 'You are not an active member of this team.' });
    }

    const item = await prisma.shoppingRequest.create({
      data: {
        teamId: data.teamId,
        workerId: req.user!.id,
        choreId: data.choreId || null,
        productName: data.productName,
        description: data.description || null,
        notes: data.notes || null,
        pictureUrl: data.pictureUrl || null,
        priority: data.priority,
        status: 'PENDING',
      },
    });

    // Notify Boss
    await prisma.notification.create({
      data: {
        userId: membership.team.bossId,
        teamId: data.teamId,
        type: 'SHOPPING_REQUEST',
        title: 'New Shopping Request',
        message: `${req.user!.username} requested: "${data.productName}" for chores.`,
        linkUrl: '/boss/shopping',
      },
    });

    return res.status(201).json({ message: 'Product request added to To-Buy list.', item });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to create shopping request.' });
  }
});

/**
 * GET /api/shopping (Boss: list for their team; Worker: list their requests)
 */
shoppingRouter.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    if (req.user!.role === 'BOSS') {
      const team = await prisma.team.findUnique({
        where: { bossId: req.user!.id },
      });
      if (!team) return res.json([]);

      const items = await prisma.shoppingRequest.findMany({
        where: { teamId: team.id },
        include: {
          worker: {
            select: { id: true, fullName: true, username: true, avatarUrl: true },
          },
          chore: {
            select: { id: true, title: true },
          },
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      });
      return res.json(items);
    } else {
      const { teamId } = req.query;
      const items = await prisma.shoppingRequest.findMany({
        where: {
          workerId: req.user!.id,
          ...(teamId && { teamId: String(teamId) }),
        },
        include: {
          team: { select: { id: true, name: true } },
          chore: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
      });
      return res.json(items);
    }
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load shopping list.' });
  }
});

/**
 * PUT /api/shopping/:id/status (Boss marks as PURCHASED or REJECTED)
 */
shoppingRouter.put('/:id/status', authenticate, requireRole('BOSS'), async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const { status } = UpdateShoppingStatusSchema.parse(req.body);

    const item = await prisma.shoppingRequest.findUnique({
      where: { id },
      include: { team: true },
    });

    if (!item || item.team.bossId !== req.user!.id) {
      return res.status(404).json({ error: 'Shopping request not found.' });
    }

    const updated = await prisma.shoppingRequest.update({
      where: { id },
      data: { status },
    });

    // Notify worker
    await prisma.notification.create({
      data: {
        userId: item.workerId,
        teamId: item.teamId,
        type: 'SHOPPING_REQUEST',
        title: `Product ${status === 'PURCHASED' ? 'Purchased!' : 'Updated'}`,
        message: `Boss marked "${item.productName}" as ${status.toLowerCase()}.`,
        linkUrl: '/worker/shopping',
      },
    });

    return res.json({ message: `Item marked as ${status}.`, item: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors[0]?.message });
    }
    return res.status(500).json({ error: 'Failed to update shopping status.' });
  }
});
