import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';

export const notificationRouter = Router();

/**
 * GET /api/notifications
 */
notificationRouter.get('/', authenticate, async (req: Request, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const unreadCount = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });

    return res.json({ notifications, unreadCount });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load notifications.' });
  }
});

/**
 * PUT /api/notifications/:id/read
 */
notificationRouter.put('/:id/read', authenticate, async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { isRead: true },
    });

    return res.json({ message: 'Notification marked as read.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to update notification.' });
  }
});

/**
 * PUT /api/notifications/read-all
 */
notificationRouter.put('/read-all', authenticate, async (req: Request, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });

    return res.json({ message: 'All notifications marked as read.' });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark all as read.' });
  }
});
