import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import webpush from 'web-push';

let pushReady = false;
if (config.vapidPublicKey && config.vapidPrivateKey) {
  const configuredSubject = config.vapidSubject.trim();
  const subject = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredSubject) ? `mailto:${configuredSubject}` : configuredSubject;
  try {
    const parsed = new URL(subject);
    if (!['mailto:', 'https:'].includes(parsed.protocol)) throw new Error('VAPID_SUBJECT must use mailto: or https:.');
    webpush.setVapidDetails(subject, config.vapidPublicKey, config.vapidPrivateKey);
    pushReady = true;
  } catch (error) {
    console.error('[Push] VAPID settings are invalid; push delivery is disabled, but the API will remain available.', error instanceof Error ? error.message : 'unknown error');
  }
}

export async function sendNotificationPush(notificationId: string) {
  if (!pushReady) return;
  try {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) return;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: notification.userId } });
    const results = await Promise.allSettled(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: notification.title, body: notification.message, url: notification.linkUrl || '/', notificationId: notification.id }));
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        throw err;
      }
    }));
    for (const result of results) if (result.status === 'rejected') console.error('[Push] Delivery failed:', result.reason instanceof Error ? result.reason.message : 'unknown error');
  } catch (error) { console.error('[Push] Delivery could not be prepared; in-app notification was saved.', error instanceof Error ? error.message : 'unknown error'); }
}

export async function createNotification(args: Prisma.NotificationCreateArgs) {
  const notification = await prisma.notification.create(args);
  await sendNotificationPush(notification.id);
  return notification;
}
