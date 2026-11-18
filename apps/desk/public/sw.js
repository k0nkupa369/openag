// Shell-only service worker. Only same-origin GET requests for /assets/* and the navigation to / are handled;
// everything else (API, stream, authorized requests, non-GET) is left to the network untouched.
const CACHE = "openag-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.headers.has("authorization")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (req.mode === "navigate" && url.pathname === "/") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put("/", res.clone());
          return res;
        } catch {
          const cached = await cache.match("/");
          if (cached) return cached;
          throw new Error("offline and no cached shell");
        }
      })(),
    );
  }
});

// Web Push (the daemon encrypts each message for this browser). The payload is {title, body, url}; the url is only
// ever a desk route on this origin, so a click can never send the user anywhere else.
const deskUrl = (raw) => {
  try {
    const url = new URL(typeof raw === "string" ? raw : "/", self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + "/";
  } catch {
    return self.location.origin + "/";
  }
};

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" && data.title ? data.title.slice(0, 60) : "OpenAg";
  const body = typeof data.body === "string" ? data.body.slice(0, 200) : "Open OpenAg.";
  event.waitUntil(self.registration.showNotification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", data: { url: deskUrl(data.url) } }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = deskUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        if ("navigate" in existing) await existing.navigate(target).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
