const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './sw.js',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open('ledgerlite-app-shell').then((cache) => cache.addAll(APP_SHELL))
  );
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('ledgerlite-') && key !== 'ledgerlite-app-shell')
          .map((key) => caches.delete(key))
      )
    )
  );
});

function isNavRequest(request) {
  return request.mode === 'navigate' || (request.destination === 'document' && new URL(request.url).pathname.match(/\/?$/));
}

function isAppShell(url) {
  const path = new URL(url).pathname.replace(/\/$/, '') || '/';
  return APP_SHELL.some((entry) => {
    const p = entry === './' ? '/' : entry.replace(/^\./, '');
    return path === p || path === p + '/';
  });
}

// Network-first for HTML/navigation: try network, fallback to cache (offline).
async function networkFirst(request) {
  try {
    const res = await fetch(request);
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open('ledgerlite-app-shell').then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return res;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || caches.match('./index.html');
  }
}

// Stale-while-revalidate for static assets: serve cache, revalidate in background.
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const p = fetch(request).then((res) => {
    if (res && res.status === 200) {
      const copy = res.clone();
      caches.open('ledgerlite-app-shell').then((cache) => cache.put(request, copy)).catch(() => {});
    }
    return res;
  }).catch(() => null);
  return cached || p.then((res) => res || caches.match('./index.html'));
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = event.request.url;
  if (!url.startsWith(self.location.origin)) return;

  if (isNavRequest(event.request)) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  event.respondWith(staleWhileRevalidate(event.request));
});
