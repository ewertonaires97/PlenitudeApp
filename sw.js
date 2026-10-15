// Sobe a cada mudança no app shell. Sem isso, um PWA já instalado continua
// servindo o app.js antigo: o fetch é network-first, mas o HTTP cache do
// navegador pode responder com uma cópia velha antes da rede, e o service
// worker aceita essa resposta como válida. O nome novo força a instalação de
// um service worker novo, que repopula o cache e apaga o antigo.
const CACHE_NAME = 'plenitude-static-v11';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './permissions.js',
  './app.js',
  './events.js',
  './ceremonial.js',
  './financial.js',
  './realtime.js',
  './navigation.js',
  './supabase-config.js',
  './duplicate.js',
  './manifest.webmanifest',
  './icons/icon-192.svg',
  './icons/icon-512.svg'
];

self.addEventListener('install', (event) => {
  // Pré-cacheia o shell inteiro na primeira instalação. O addAll é tudo ou
  // nada: se um arquivo faltar, a instalação falha e o service worker antigo
  // (se houver) continua no comando, em vez de ativar um cache pela metade.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  // Não espera as abas antigas fecharem para assumir: o objetivo é justamente
  // substituir a versão anterior o quanto antes.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Apaga todos os caches de versões anteriores. É esta limpeza que faz o nome
  // novo do CACHE_NAME cumprir o papel de forçar a troca do app shell antigo.
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  // Assume o controle das abas já abertas, sem exigir recarregar a página.
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Só GET é cacheável; POST/PUT/DELETE do Supabase passam direto para a rede.
  if (event.request.method !== 'GET') return;

  // Estratégia network-first: tenta a rede primeiro para o usuário sempre ver
  // a versão mais nova. Só quando a rede falha (offline) é que responde do
  // cache; em último caso, devolve o index.html para o shell ainda abrir.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Só guarda respostas válidas e do próprio domínio; não faz sentido
        // cachear a API do Supabase nem respostas de erro.
        if (response.ok && new URL(event.request.url).origin === self.location.origin) {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cachedResponse) => cachedResponse || caches.match('./index.html')))
  );
});