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

// ═══════════════════════════════════════════════════════════
//  SINCRONIZACIÓN INICIAL CON FIREBASE
//  BUG FIX: hasta ahora syncCliente() solo se disparaba al crear, editar,
//  cobrar o reiniciar mes de un cliente. Los clientes que YA existían en
//  localStorage (de antes de tener Firebase, o restaurados de un backup)
//  nunca llegaban a Firestore, así que la Cloud Function de recordatorios
//  los veía como "0 clientes" aunque la app funcionara perfecto en el
//  celular.
//  firebase-init.js se carga como <script type="module">, que se ejecuta
//  DESPUÉS de los scripts clásicos como este (init.js), así que
//  window.FirebaseSync puede no existir todavía en el instante en que
//  arranca init(). Por eso se reintenta unas cuantas veces antes de
//  rendirse, en vez de asumir que ya está disponible.
// ═══════════════════════════════════════════════════════════
function sincronizarConFirebaseAlArrancar(intentos = 20) {
  if (window.FirebaseSync) {
    window.FirebaseSync.procesarColaReintento(); // primero, lo pendiente de la sesión anterior
    window.FirebaseSync.sincronizarTodo(clients, config);
    // Si el permiso de notificaciones ya estaba concedido de una sesión
    // anterior, este dispositivo debe quedar (re)registrado en Firestore
    // sin esperar a que el usuario vuelva a tocar 🔔.
    if ('Notification' in window && Notification.permission === 'granted') {
      window.FirebaseSync.solicitarTokenPush();
    }
    return;
  }
  if (intentos <= 0) {
    console.warn('Firebase no cargó a tiempo — no se pudo hacer la sincronización inicial.');
    return;
  }
  setTimeout(() => sincronizarConFirebaseAlArrancar(intentos - 1), 300);
}

async function init() {
  document.getElementById('app-version').textContent = 'v'+APP_VERSION;
  applyTheme();
  // BUG FIX: EventDelegation nunca se inicializaba, así que los botones
  // convertidos de onclick="..." a data-action="..." no respondían a clics
  // (tema, settings, exportar/importar, tabs, etc.).
  if (typeof EventDelegation !== 'undefined') {
    EventDelegation.init();
  }
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
  sincronizarConFirebaseAlArrancar();
  updateClock();
  setInterval(updateClock,30000);
  updateFileBar();
  checkMesNuevo();
  checkBackupReminder();
  await tryRestoreFileHandle();
  if(typeof tryRestoreMacrodroidHandle === 'function') await tryRestoreMacrodroidHandle();
  if(typeof verificarCheckpointDiario === 'function') verificarCheckpointDiario();
}

init();
