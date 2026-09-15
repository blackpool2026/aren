/* =========================================================
   AREN — Service Worker
   Versión: v2
   Estrategia: red primero, caché como respaldo
========================================================= */

const CACHE = 'aren-v2';
const ARCHIVOS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ARCHIVOS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE)
            .map(k => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (!res || res.status !== 200 || res.type === 'opaqueredirect') {
          return res;
        }
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copia));
        return res;
      })
      .catch(() => {
        return caches.match(e.request).then(cached => {
          if (cached) return cached;
          if (e.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

self.addEventListener('message', e => {
  if (e.data && e.data.tipo === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});