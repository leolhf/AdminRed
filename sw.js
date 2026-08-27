/**
 * sw.js — Service Worker para AdminRed.
 * Cachea los recursos de la app por versión (APP_VERSION) para funcionar offline.
 * Cuando APP_VERSION cambia, se crea una nueva caché y se borra la anterior.
 */
const CACHE_NAME = `adminred-${APP_VERSION}`;
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './styles.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-192-maskable.png',
  './icons/icon-512-maskable.png',
  './js/version.js',
  './js/core/state.js',
  './js/core/keys.js',
  './js/core/config.js',
  './js/core/crypto.js',
  './js/core/calculations.js',
  './js/core/ciclos.js',
  './js/core/moneda.js',
  './js/reset-app.js',
  './js/core/models/investment.js',
  './js/core/migration.js',
  './js/core/checkpoint.js',
  './js/core/undo.js',
  './js/core/validacion.js',
  './js/storage/storage-local.js',
  './js/storage/storage-file.js',
  './js/storage/export.js',
  './js/ui/theme.js',
  './js/ui/notify-ui.js',
  './js/ui/reloj.js',
  './js/ui/tabs.js',
  './js/ui/render.js',
  './js/ui/inline-edit.js',
  './js/ui/ui-components.js',
  './js/ui/tasa-aviso.js',
  './js/clientes/modal-cliente.js',
  './js/clientes/confirm-delete.js',
  './js/clientes/client-history.js',
  './js/cobros/modal-cobro.js',
  './js/cobros/cobranza.js',
  './js/cobros/mora.js',
  './js/cobros/inversion.js',
  './js/cobros/inventario.js',
  './js/cobros/descuentos.js',
  './js/cobros/month-reset.js',
  './js/cobros/caja.js',
  './js/reportes/historial.js',
  './js/reportes/historial-mensual.js',
  './js/reportes/tendencia.js',
  './js/reportes/prediccion.js',
  './js/reportes/estadisticas.js',
  './js/reportes/reporte-mensual.js',
  './js/reportes/recibo.js',
  './js/reportes/calendario.js',
  './js/reportes/salud.js',
  './js/reportes/descuentos-view.js',
  './js/notificaciones/notifications.js',
  './js/notificaciones/whatsapp.js',
  './js/notificaciones/wa-templates.js',
  './js/red/equipos-red.js',
  './js/paquete/modal-paquete.js',
  './js/paquete/modal-paquete-proveedor.js',
  './js/gastos.js',
  './js/pin.js',
  './js/pwa.js',
  './js/init.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// v5.12.7: Permitir que la p\u00e1gina active el SW inmediatamente (skipWaiting)
// cuando se detecta una nueva versi\u00f3n, sin esperar al pr\u00f3ximo navigation.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  // Estrategia: cache-first con fallback a red (offline-first).
  event.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached)
    )
  );
});
