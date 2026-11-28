/**
 * Strategic Souls X 3.0 — Minimal Safe PWA Service Worker.
 * Security contract:
 *  - NEVER caches /api/* responses, authenticated HTML pages, or non-GET mutations.
 *  - ONLY caches static public shell assets (icons, manifest, fonts, static avatars).
 *  - Clears all caches immediately on CLEAR_USER_CACHES message (sent at logout).
 */
const STATIC_CACHE = "ss-x3-static-v2";
const STATIC_URLS = [
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/favicon-32x32.png",
  "/gvv-approved.jpg",
];

function isCacheableStaticPath(pathname) {
  if (pathname.startsWith("/api/")) return false;
  return (
    pathname === "/manifest.webmanifest" ||
    pathname === "/gvv-approved.jpg" ||
    pathname === "/apple-touch-icon.png" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icon-") ||
    pathname.startsWith("/favicon-") ||
    pathname.startsWith("/fonts/") ||
    pathname.startsWith("/avatars/")
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_URLS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "CLEAR_USER_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
    );
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!isCacheableStaticPath(url.pathname)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.ok && resp.type === "basic") {
          const copy = resp.clone();
          void caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      });
    }),
  );
});
