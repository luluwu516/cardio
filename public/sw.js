// cardIO offline shell.
//
// Goal (scoped): let the user browse their already-visited pages — chiefly
// /collection — with no network. The collection page ships every owned row in
// its payload and does all filter/sort/search client-side, so once the page is
// cached the whole read-only browsing experience works offline "for free".
// Writes (quantity edits, deck edits, backup) and live search need the network;
// the UI disables those buttons when offline (see lib/useOnlineStatus.ts), and
// this worker never caches their requests.
//
// Strategy:
//   - static build assets (/_next/static/*, immutable + hashed) → cache-first
//   - page documents + RSC payloads                             → network-first
//   - everything else same-origin                               → cache-first
//   - /api/* and /auth/* (dynamic / security-sensitive)         → passthrough
//   - non-GET (server actions, mutations) and cross-origin      → passthrough
//
// The cache holds authenticated HTML, so it's wiped on logout — see
// components/ClearOfflineCache.tsx, mounted on the login page.

// Bump the suffix to force old caches out on the next activate.
const CACHE = "cardio-offline-v1";

const OFFLINE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Offline · cardIO</title>
<style>
  html,body{height:100%;margin:0}
  body{display:flex;align-items:center;justify-content:center;
    font-family:system-ui,-apple-system,sans-serif;background:#18181b;color:#e4e4e7;
    text-align:center;padding:24px}
  h1{font-size:1.25rem;margin:0 0 .5rem}
  p{font-size:.875rem;color:#a1a1aa;margin:0}
</style></head>
<body><div>
  <h1>You're offline</h1>
  <p>This page hasn't been saved for offline use yet.<br>
  Reconnect, or open a page you've visited before.</p>
</div></body></html>`;

function offlineResponse() {
  return new Response(OFFLINE_HTML, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // card-art CDNs, etc.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return; // never cache API results or the OAuth callback
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(req));
    return;
  }

  const isRsc =
    req.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (req.mode === "navigate" || isRsc) {
    event.respondWith(networkFirst(req));
    return;
  }

  event.respondWith(cacheFirst(req));
});

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(CACHE);
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    // `ignoreSearch` so a cached page still matches when Next appends a
    // per-build `?_rsc=` hash to the client-navigation request.
    const cached = await cache.match(req, { ignoreSearch: true });
    if (cached) return cached;
    if (req.mode === "navigate") return offlineResponse();
    return Response.error();
  }
}
