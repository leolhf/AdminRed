/**
 * pwa.js — Lógica de instalación como PWA.
 */
RN.pwa = RN.pwa || {};

RN.pwa._deferredPrompt = null;

RN.pwa.init = function () {
  // Registrar service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      // v5.12.7: Detectar actualizaciones del Service Worker.
      // Cuando el navegador detecta que sw.js cambió, instala el nuevo SW
      // en segundo plano. Aquí detectamos cuando está "esperando" (waiting)
      // y avisamos al usuario para que recargue y aplique la actualización.
      if (reg.waiting) {
        RN.pwa._notificarActualizacion(reg);
      }
      reg.addEventListener('updatefound', function () {
        var nuevoSW = reg.installing;
        if (!nuevoSW) return;
        nuevoSW.addEventListener('statechange', function () {
          if (nuevoSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay un SW nuevo instalado y esperando; el usuario tiene la versión antigua activa
            RN.pwa._notificarActualizacion(reg);
          }
        });
      });
      // Si el SW actual toma el control (tras skipWaiting), recargar automáticamente
      // para que la página cargue con los assets nuevos.
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (RN.pwa._recargaPendiente) return;
        RN.pwa._recargaPendiente = true;
        window.location.reload();
      });
    }).catch(function (e) { console.warn('SW registro fallido:', e); });

    // Verificar si hay actualizaciones cada vez que la página vuelve a estar activa
    // (cambio de pestaña, regreso de background). Esto detecta nuevas versiones
    // aunque la app haya estado abierta mucho tiempo.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && navigator.serviceWorker.controller) {
        navigator.serviceWorker.getRegistration().then(function (reg) {
          if (reg) reg.update().catch(function () {});
        });
      }
    });
  }

  // Capturar evento de instalación
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    RN.pwa._deferredPrompt = e;
    const btn = document.getElementById('btn-install');
    if (btn) btn.style.display = 'inline-flex';
  });

  window.addEventListener('appinstalled', () => {
    const btn = document.getElementById('btn-install');
    if (btn) btn.style.display = 'none';
    RN.notifyUI.toast('App instalada', 'success');
  });
};

/**
 * v5.12.7: Notifica al usuario que hay una nueva versión disponible.
 * Muestra un toast y activa el nuevo SW inmediatamente (skipWaiting) para
 * que la próxima recarga cargue los assets nuevos.
 */
RN.pwa._notificarActualizacion = function (reg) {
  // Enviar mensaje al SW esperando para que se active (skipWaiting)
  if (reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  // Avisar al usuario con un toast de larga duración
  RN.notifyUI.toast('⬇️ Nueva versión disponible. Recargando para actualizar…', 'info', 6000);
};

RN.pwa.instalar = async function () {
  if (!RN.pwa._deferredPrompt) { RN.notifyUI.toast('Usa el menú del navegador → Instalar app', 'info'); return; }
  RN.pwa._deferredPrompt.prompt();
  const choice = await RN.pwa._deferredPrompt.userChoice;
  if (choice.outcome === 'accepted') {
    RN.notifyUI.toast('Instalando...', 'success');
  }
  RN.pwa._deferredPrompt = null;
  const btn = document.getElementById('btn-install');
  if (btn) btn.style.display = 'none';
};
