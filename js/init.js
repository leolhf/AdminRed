// init.js
// Arranque de la aplicación: carga datos, aplica tema, registra Service Worker y ejecuta init().
// Depende de TODOS los módulos anteriores. DEBE cargarse último.

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════
//  SERVICE WORKER
//  BUG FIX: antes se registraba al final de init(), después de varios
//  `await` (tryRestoreFileHandle, etc.). Eso retrasaba el registro lo
//  suficiente como para que herramientas de análisis (ej. PWABuilder)
//  terminaran su escaneo antes de detectarlo, y como que el navegador
//  tardara más en cachear la app para uso offline.
//  Ahora se registra de inmediato, en paralelo, sin bloquear ni ser
//  bloqueado por el resto del arranque de la app.
if('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => console.log('SW registrado:', reg.scope))
    .catch(e => console.warn('SW no pudo registrarse:', e));
}

async function init() {
  document.getElementById('app-version').textContent = 'v'+APP_VERSION;
  applyTheme();
  // Solo se siembran clientes de ejemplo la primerísima vez que se abre la app
  // (nunca se ha guardado nada en localStorage). Así, si el usuario borra todo
  // con "Reiniciar app", al recargar la página no vuelven a aparecer los datos demo.
  const esPrimeraVez = localStorage.getItem(STORAGE_KEYS.DATA) === null;
  loadLocalStorage();
  if (esPrimeraVez) seedIfEmpty();
  
  // Migrar al nuevo modelo de inversiones si es necesario
  verificarYMigrar();
  
  if(!config.mesActual){
    const n=new Date();
    config.mesActual=`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  }
  render();
  updateClock();
  setInterval(updateClock,30000);
  updateFileBar();
  checkMesNuevo();
  checkBackupReminder();
  if(getPIN()) showPinScreen('unlock');
  await tryRestoreFileHandle();
}

init();
