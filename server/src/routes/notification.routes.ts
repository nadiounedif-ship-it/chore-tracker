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
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : null;
  if (!endpoint) return res.status(400).json({ error: 'This device did not provide a notification subscription. Enable notifications on this device first.' });
  const subscription = await prisma.pushSubscription.findFirst({ where: { userId: req.user!.id, endpoint }, select: { id: true } });
  if (!subscription) return res.status(400).json({ error: 'This phone is not linked to your account. Enable notifications again on this device.' });
  const notification = await prisma.notification.create({ data: { userId: req.user!.id, type: 'REMINDER', title: 'Chore Manager test notification', message: 'Phone notifications are connected on this device.', linkUrl: '/profile' } });
  const result = await sendNotificationPush(notification.id, endpoint);
  if (!result.delivered) {
    const details = result.failures[0] || 'The push service did not accept the subscription.';
    const keyProblem = /HTTP 401|HTTP 403/.test(details);
    return res.status(502).json({ error: keyProblem ? `The push provider rejected the server credentials (${details}). Your phone subscription cannot fix this; the app server's VAPID keys need to be checked.` : `The push service rejected this phone's subscription (${details}). Disable and re-enable notifications on this device, then try again.` });
  }
  return res.json({ message: 'The push service accepted a test notification for this device. Check your iPhone notification settings and Notification Center.' });
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
