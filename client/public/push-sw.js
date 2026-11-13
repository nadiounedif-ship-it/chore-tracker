self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title || 'Chore Manager', {
    body: data.body || 'You have a new update.',
    icon: '/chore-manager.svg',
    badge: '/chore-manager.svg',
    data: { url: data.url || '/', notificationId: data.notificationId },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    if (event.notification.data?.notificationId) await fetch(`/api/notifications/${event.notification.data.notificationId}/read`, { method: 'PUT', credentials: 'include' }).catch(() => {});
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const match = windows.find((client) => client.url.startsWith(self.location.origin));
    if (match) { match.navigate(url); return match.focus(); }
    return self.clients.openWindow(url);
  })());
});
