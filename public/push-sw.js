/* ConectCon HUB — service worker só de notificações push (não faz cache de páginas). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { titulo: event.data && event.data.text() }; }
  const titulo = d.titulo || "ConectCon HUB";
  event.waitUntil(self.registration.showNotification(titulo, {
    body: d.corpo || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: !!d.urgente,
    vibrate: d.urgente ? [400, 200, 400, 200, 400] : [200],
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const alvo = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of abertas) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); if ("navigate" in c) await c.navigate(alvo).catch(() => {}); return; }
    }
    await self.clients.openWindow(alvo);
  })());
});
