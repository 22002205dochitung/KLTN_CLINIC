/* THCT Clinic service worker - makes the web app installable and quick to reopen.
 *
 * Rules (deliberately conservative for a medical app):
 *  - API calls and other origins are never cached (always live data).
 *  - Hashed build files (/static/js/main.3f2a1b9c.js) are cache-first: their name changes with content.
 *  - Pages and everything else are network-first, falling back to the cached copy when offline.
 */
const CACHE = 'thct-clinic-v1';
const HASHED = /\.[0-9a-f]{8,}\.(?:js|css|png|jpg|jpeg|svg|woff2?)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(['/', '/manifest.json', '/icons/icon-192.png']))
      .catch(() => undefined)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // backend API, VietQR images, CDNs
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/sockjs-node') || url.pathname.includes('hot-update')) return;

  if (HASHED.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return res;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok && (request.mode === 'navigate' || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/img/'))) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(request.mode === 'navigate' ? '/' : request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request.mode === 'navigate' ? '/' : request)
        .then((hit) => hit || new Response('Bạn đang offline. Vui lòng kết nối mạng rồi thử lại.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        })))
  );
});
