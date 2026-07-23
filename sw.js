// sw.js
importScripts('./js/version.js'); // trae APP_VERSION
const CACHE_NAME = 'rednet-' + APP_VERSION;

// Solo el "esqueleto" mínimo que necesitas garantizar de entrada
const PRECACHE = [
  './', 
  './index.html', 
  './style.css', 
  './manifest.json',
  // Core
  './js/version.js',
  './js/core/state.js',
  './js/core/keys.js',
  './js/core/config.js',
  './js/core/crypto.js',
  './js/core/calculations.js',
  // Storage
  './js/storage/storage-local.js',
  './js/storage/storage-file.js',
  './js/storage/export.js',
  // UI
  './js/ui/theme.js',
  './js/ui/notify-ui.js',
  './js/ui/reloj.js',
  './js/ui/tabs.js',
  './js/ui/render.js',
  './js/ui/inline-edit.js',
  // Clientes
  './js/clientes/modal-cliente.js',
  './js/clientes/confirm-delete.js',
  './js/clientes/client-history.js',
  // Cobros
  './js/cobros/modal-cobro.js',
  './js/cobros/mora.js',
  './js/cobros/inversion.js',
  './js/cobros/inventario.js',
  './js/cobros/month-reset.js',
  // Reportes
  './js/reportes/historial.js',
  './js/reportes/historial-mensual.js',
  './js/reportes/tendencia.js',
  './js/reportes/prediccion.js',
  './js/reportes/estadisticas.js',
  // Notificaciones
  './js/notificaciones/notifications.js',
  './js/notificaciones/whatsapp.js',
  // Otros
  './js/gastos.js',
  './js/pin.js',
  './js/pwa.js',
  './js/init.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Solo interceptar peticiones GET propias del sitio (no APIs externas)
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      const networkFetch = fetch(event.request)
        .then(response => {
          // Si la respuesta es válida, la guardamos en caché para la próxima vez
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // sin internet: usa lo cacheado si existe

      // Estrategia "stale-while-revalidate": muestra caché al instante
      // y de fondo actualiza con lo último del servidor
      return cached || networkFetch;
    })
  );
});
