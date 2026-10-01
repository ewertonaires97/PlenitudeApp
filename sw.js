// Sobe a cada mudança no app shell. Sem isso, um PWA já instalado continua
// servindo o app.js antigo: o fetch é network-first, mas o HTTP cache do
// navegador pode responder com uma cópia velha antes da rede, e o service
// worker aceita essa resposta como válida. O nome novo força a instalação de
// um service worker novo, que repopula o cache e apaga o antigo.
const CACHE_NAME = 'plenitude-static-v5';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './permissions.js',
  './app.js',
  './events.js',
  './ceremonial.js',
  './realtime.js',
  './supabase-config.js',
  './manifest.webmanifest',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match('./index.html')))
  );
});