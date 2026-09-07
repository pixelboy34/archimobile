/* FORMA offline shell — custom SW (no Workbox). Do not cache live APIs. */
const CACHE = "forma-shell-v1";
const PRECACHE = [
  "/",
  "/favicon.svg",
  "/__grok/icon-180.png",
  "/__grok/icon-192.png",
  "/__grok/icon-512.png",
];

function isLiveApi(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/auth/")
  );
}

function isStaticAsset(pathname) {
  return (
    pathname.startsWith("/assets/") ||
    pathname.startsWith("/__grok/") ||
    pathname === "/favicon.svg" ||
    pathname === "/sw.js" ||
    /\.(?:js|css|png|jpe?g|svg|webp|woff2?|map)$/i.test(pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (isLiveApi(url.pathname)) return; // network-only — fail soft offline

  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  const acceptsHtml = (req.headers.get("accept") || "").includes("text/html");
  if (req.mode === "navigate" || acceptsHtml) {
    event.respondWith(networkFirstNavigation(req));
  }
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone());
    }
    return res;
  } catch {
    return hit || Response.error();
  }
}

async function networkFirstNavigation(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      cache.put(req, res.clone());
      // Also keep a fresh shell at "/"
      if (req.mode === "navigate") {
        cache.put("/", res.clone());
      }
    }
    return res;
  } catch {
    const fallback =
      (await cache.match(req)) ||
      (await cache.match("/")) ||
      new Response(
        "<!doctype html><html lang=fr><meta charset=utf-8><title>FORMA</title><body style=\"background:#0c0c0b;color:#e8e4d9;font-family:system-ui;padding:2rem\"><h1>FORMA</h1><p>Mode hors ligne — rouvrez une maquette enregistrée.</p></body></html>",
        { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
      );
    return fallback;
  }
}
