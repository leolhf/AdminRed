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
 * v5.13.12: NO fuerza la recarga automáticamente. En su lugar, marca el
 * botón de versión del header con un punto rojo pulsante (clase .has-update)
 * para que el usuario decida cuándo aplicar la actualización al tocarlo.
 * Si el botón no existe (p. ej. DOM aún no listo), cae al toast clásico.
 */
RN.pwa._notificarActualizacion = function (reg) {
  RN.pwa._updatePendiente = true;
  var btn = document.getElementById('btn-version');
  if (btn) {
    btn.classList.add('has-update');
    btn.title = 'Nueva versión disponible — tocar para actualizar ahora';
    btn.setAttribute('aria-label', 'Nueva versión disponible, tocar para actualizar');
  } else {
    // Fallback: toast si el botón aún no está en el DOM
    RN.notifyUI.toast('⬇️ Nueva versión disponible. Toca "v' + APP_VERSION + '" en el encabezado para actualizar.', 'info', 8000);
  }
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

/**
 * v5.13.12: Fuerza la comprobación de actualizaciones del Service Worker.
 * Se invoca al tocar el botón de versión del header.
 *
 * Flujo:
 *  1. Si ya hay un SW esperando (reg.waiting) → hay update pendiente:
 *     lo activa (SKIP_WAITING) y la página se recarga sola (controllerchange).
 *  2. Si no, llama reg.update() para pedir al navegador que re-descargue sw.js
 *     desde la red y compare. Si tras esto aparece un reg.waiting, lo activa.
 *  3. Si tras la comprobación no hay nada nuevo, avisa "última versión".
 *
 * Si el navegador no soporta SW (o no hay controller), recarga la página
 * sin más (útil en desarrollo o primer arranque).
 */
RN.pwa.forzarActualizacion = async function () {
  var btn = document.getElementById('btn-version');

  // Caso A: ya tenemos un SW esperando (update pendiente detectado antes).
  if (RN.pwa._updatePendiente && navigator.serviceWorker.controller) {
    try {
      var reg = await navigator.serviceWorker.getRegistration();
      if (reg && reg.waiting) {
        RN.notifyUI.toast('⬇️ Aplicando actualización…', 'info', 4000);
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        // controllerchange disparará la recarga automática (ver init de pwa).
        return;
      }
    } catch (e) { /* continuar abajo */ }
  }

  // Caso B: no hay update pendiente conocido → forzar comprobación.
  if (btn) { btn.classList.add('checking'); btn.disabled = true; }
  try {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      // Sin SW activo (primer arranque o no soportado): recargar la página.
      RN.notifyUI.toast('Recargando…', 'info', 2000);
      setTimeout(function () { window.location.reload(); }, 600);
      return;
    }
    var registration = await navigator.serviceWorker.getRegistration();
    if (!registration) {
      RN.notifyUI.toast('Recargando…', 'info', 2000);
      setTimeout(function () { window.location.reload(); }, 600);
      return;
    }
    // Pide al navegador que compruebe sw.js en la red ahora mismo.
    await registration.update();

    // Tras update(), puede que ya haya un SW esperando.
    if (registration.waiting) {
      RN.pwa._updatePendiente = true;
      RN.notifyUI.toast('⬇️ Nueva versión encontrada. Aplicando…', 'success', 4000);
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      // La recarga ocurre en controllerchange.
    } else {
      // No hay nada nuevo.
      RN.pwa._updatePendiente = false;
      if (btn) btn.classList.remove('has-update');
      RN.notifyUI.toast('✅ Tienes la última versión (v' + APP_VERSION + ')', 'success', 3500);
    }
  } catch (e) {
    console.warn('[forzarActualizacion]', e);
    RN.notifyUI.toast('⚠️ No se pudo comprobar la actualización. Revisa tu conexión.', 'warn', 4000);
  } finally {
    if (btn) { btn.classList.remove('checking'); btn.disabled = false; }
  }
};
