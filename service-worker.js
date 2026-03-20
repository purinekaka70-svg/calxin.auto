const CACHE_NAME = 'calxin-auto-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './product-view.html',
  './cart.html',
  './chat.html',
  './admin.html',
  './login.html',
  './catalog-api.js',
  './customer-session.js',
  './project12.js',
  './product-view.js',
  './admin.js',
  './cart.js',
  './chat.js',
  './login.js',
  './manifest.json',
  './project.css',
  './product-view.css',
  './admin.css',
  './cart.css',
  './chat.css',
  './login.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Network first for API calls, Cache first for static assets
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: 'Offline' })))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((fetchResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          if(event.request.method === 'GET') cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        });
      });
    })
  );
});
