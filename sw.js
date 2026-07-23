// sw.js
importScripts('./js/version.js'); // trae APP_VERSION
const CACHE_NAME = 'rednet-' + APP_VERSION;

// ═══════════════════════════════════════════════════════════
//  NOTIFICACIONES PUSH (Firebase Cloud Messaging) — app cerrada
//  Usa el paquete "compat" porque los Service Workers clásicos
//  (registrados sin {type:'module'}) no soportan `import`, solo
//  `importScripts`.
// ═══════════════════════════════════════════════════════════
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDCFodLJNBNrZpL2qIEhSB36wiSE9ymbew",
  authDomain: "rednet-adminred.firebaseapp.com",
  projectId: "rednet-adminred",
  storageBucket: "rednet-adminred.firebasestorage.app",
  messagingSenderId: "144844223621",
  appId: "1:144844223621:web:5391574c73fc4851ef65ec"
});

const messaging = firebase.messaging();

// Se dispara cuando llega un push y la app/pestaña NO está en primer plano.
messaging.onBackgroundMessage((payload) => {
  const titulo = (payload.notification && payload.notification.title) || 'RedNet';
  const cuerpo = (payload.notification && payload.notification.body) || '';
  self.registration.showNotification(titulo, {
    body: cuerpo,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png'
  });
});

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
  './js/core/reset-app.js',
  './js/core/models/investment.js',
  './js/core/migration.js',
  // Íconos (necesarios para que el manifest funcione offline)
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
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
