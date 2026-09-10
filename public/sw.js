const CACHE_NAME = 'cbt-v3';
const SCOPE = self.registration ? self.registration.scope : self.location.href;
const BASE_PATH = new URL(SCOPE).pathname;
const OFFLINE_URL = new URL('index.html', SCOPE).toString();
const ASSETS = [
  BASE_PATH,
  OFFLINE_URL,
  new URL('logo.webp', SCOPE).toString(),
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => undefined)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.woff2') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.webp')) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetched = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE_NAME).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetched;
      })
    );
    return;
  }
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((c) => c || caches.match(OFFLINE_URL)))
  );
});
