import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config.js';

export const notificationRouter = Router();

notificationRouter.get('/push-key', authenticate, (_req, res) => res.json({ publicKey: config.vapidPublicKey }));

notificationRouter.post('/push-subscriptions', authenticate, async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (typeof endpoint !== 'string' || typeof keys?.p256dh !== 'string' || typeof keys?.auth !== 'string') return res.status(400).json({ error: 'Invalid push subscription.' });
  const existing = await prisma.pushSubscription.findUnique({ where: { endpoint }, select: { userId: true } });
  if (existing && existing.userId !== req.user!.id) return res.status(409).json({ error: 'This device subscription is already linked to another account. Disable notifications there first.' });
  await prisma.pushSubscription.upsert({ where: { endpoint }, create: { userId: req.user!.id, endpoint, p256dh: keys.p256dh, auth: keys.auth }, update: { p256dh: keys.p256dh, auth: keys.auth } });
  res.json({ message: 'Phone notifications enabled.' });
});

notificationRouter.delete('/push-subscriptions', authenticate, async (req, res) => {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== 'string') return res.status(400).json({ error: 'Invalid push endpoint.' });
  await prisma.pushSubscription.deleteMany({ where: { endpoint, userId: req.user!.id } });
  res.json({ message: 'Phone notifications disabled.' });
});

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
