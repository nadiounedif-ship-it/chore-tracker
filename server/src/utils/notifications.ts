import { Prisma } from '@prisma/client';
import { prisma } from '../prisma.js';
import { config } from '../config.js';
import { sendEmail, escapeHtml } from './email.js';
import webpush from 'web-push';

if (config.vapidPublicKey && config.vapidPrivateKey) webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);

async function sendPush(notificationId: string) {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return;
  try {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) return;
    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId: notification.userId } });
    await Promise.allSettled(subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify({ title: notification.title, body: notification.message, url: notification.linkUrl || '/', notificationId: notification.id }));
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        throw err;
      }
    }));
  } catch (error) { console.error('[Notification] Push delivery failed; in-app notification was saved.', error instanceof Error ? error.message : 'unknown error'); }
}

const categoryFor: Record<string, string> = {
  INVITATION: 'INVITATION', CHORE_REQUEST: 'CHORE', CHORE_APPROVAL: 'CHORE', CHORE_REJECTION: 'CHORE',
  CLOCK_EVENT: 'CHORE', PAYMENT_RECORDED: 'PAYMENT', SHOPPING_REQUEST: 'SHOPPING', DISPUTE_EVENT: 'ACCOUNT', REMINDER: 'DEADLINE',
};

export async function sendNotificationEmail(notificationId: string) {
  try {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification) return;
    void sendPush(notificationId);
    const user = await prisma.user.findUnique({ where: { id: notification.userId }, select: { email: true, fullName: true, emailVerified: true, emailNotificationPreferences: true } });
    const prefs = user?.emailNotificationPreferences as { enabled?: boolean; categories?: string[] } | null;
    const category = categoryFor[notification.type];
    if (user?.emailVerified && prefs?.enabled && category && prefs.categories?.includes(category)) {
      const destination = notification.linkUrl?.startsWith('/') ? `${config.frontendUrl}${notification.linkUrl}` : config.frontendUrl;
      await sendEmail(user.email, `Chore Manager: ${notification.title}`, `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#334155"><h2 style="color:#047857">Chore Manager</h2><p>Hi ${escapeHtml(user.fullName)},</p><h3>${escapeHtml(notification.title)}</h3><p>${escapeHtml(notification.message)}</p><p><a style="display:inline-block;background:#059669;color:white;padding:12px 18px;border-radius:10px;text-decoration:none" href="${destination}">Open Chore Manager</a></p><p style="font-size:12px;color:#64748b">You can manage these emails in your profile settings.</p></div>`, `notification-${notification.id}`);
    }
  } catch (error) {
    console.error('[Notification] Email preparation failed; in-app notification was saved.', error instanceof Error ? error.message : 'unknown error');
  }
}

export async function createNotification(args: Prisma.NotificationCreateArgs) {
  const notification = await prisma.notification.create(args);
  await sendNotificationEmail(notification.id);
  return notification;
}
