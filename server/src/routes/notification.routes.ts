import { Router, Request, Response } from 'express';
import { prisma } from '../prisma.js';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config.js';
import { isPushConfigured, sendNotificationPush } from '../utils/notifications.js';

export const notificationRouter = Router();

notificationRouter.get('/push-key', authenticate, (_req, res) => res.json({ publicKey: config.vapidPublicKey }));

notificationRouter.get('/push-status', authenticate, async (req, res) => {
  const subscriptions = await prisma.pushSubscription.count({ where: { userId: req.user!.id } });
  res.json({ configured: isPushConfigured(), subscriptionCount: subscriptions });
});

notificationRouter.post('/test-push', authenticate, async (req, res) => {
  if (!isPushConfigured()) return res.status(503).json({ error: 'Phone notifications are not configured on the app server yet.' });
  const subscriptionCount = await prisma.pushSubscription.count({ where: { userId: req.user!.id } });
  if (!subscriptionCount) return res.status(400).json({ error: 'This account has no saved phone notification subscription. Enable notifications on this device first.' });
  const notification = await prisma.notification.create({ data: { userId: req.user!.id, type: 'REMINDER', title: 'Chore Manager test notification', message: 'Phone notifications are connected on this device.', linkUrl: '/profile' } });
  const result = await sendNotificationPush(notification.id);
  if (!result.delivered) return res.status(502).json({ error: 'The server could not deliver the test notification. Check that this device allows notifications and try enabling them again.' });
  return res.json({ message: 'Test notification sent. Check your phone notification center.' });
});

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

/** Delete only the signed-in user's in-app notification history. */
notificationRouter.delete('/', authenticate, async (req: Request, res: Response) => {
  try {
    const result = await prisma.notification.deleteMany({ where: { userId: req.user!.id } });
    return res.json({ message: 'Notifications cleared.', deletedCount: result.count });
  } catch {
    return res.status(500).json({ error: 'Could not clear notifications.' });
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
