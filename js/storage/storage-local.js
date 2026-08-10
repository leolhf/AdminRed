// storage-local.js
// Persistencia en localStorage (serializar/aplicar/cargar/sembrar datos).
// Depende de: state.js (clients, history, gastos, config)

// ═══════════════════════════════════════════════════════════
//  PERSISTENCIA — localStorage
// ═══════════════════════════════════════════════════════════
function dataToJson() { return JSON.stringify({clients,history,gastos,inventario,asignacionesInventario,investments,equiposRed,planes,snapshots,reciboCounter,descuentos,config},null,2); }

function applyJson(text) {
  const d=JSON.parse(text);
  clients=d.clients||[];
  history=d.history||[];
  gastos =d.gastos||[];
  inventario=d.inventario||[];
  asignacionesInventario=d.asignacionesInventario||[];
  investments=d.investments||[];
  equiposRed=d.equiposRed||[];
  planes=d.planes||[];
  snapshots=d.snapshots||[];
  reciboCounter=d.reciboCounter||0;
  // v5.8.0: descuentos puntuales (afectacion/bonificacion/ajuste). Los archivos
  // guardados antes de esta version no tienen esta clave; se inicializa vacia.
  descuentos=d.descuentos||[];
  config={...config,...(d.config||{})};
}

function saveLocalStorage() {
  // BUG FIX: localStorage.setItem lanza QuotaExceededError cuando el
  // almacenamiento está lleno. Sin capturarlo, todos los callers de save()
  // (config, cobros, gastos, etc.) habrían recibido una excepción no manejada
  // que dejaba la UI en un estado incorrecto sin feedback para el usuario.
  try {
    localStorage.setItem(STORAGE_KEYS.DATA, dataToJson());
    
    // Intentar sincronizar con Firebase si está disponible
    if (window.FirebaseSync && navigator.onLine) {
      syncWithFirebase();
    }
  } catch(e) {
    if(e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
      console.error('Almacenamiento local lleno — no se pudieron guardar los datos:', e);
      // Notificar si notify está disponible (se carga antes que storage-local)
      if(typeof notify === 'function') {
        notify('⚠ Sin espacio: no se pudo guardar. Exporta un backup y libera espacio.', true);
      }
    } else {
      throw e; // relanzar errores inesperados para no ocultarlos
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  SINCRONIZACIÓN CON FIREBASE
// ═══════════════════════════════════════════════════════════
async function syncWithFirebase() {
  if (!window.FirebaseSync) return;
  
  try {
    const localData = {
      clientes: addTimestamp(clients),
      gastos: addTimestamp(gastos),
      history: addTimestamp(history),
      inventario: addTimestamp(inventario),
      asignacionesInventario: addTimestamp(asignacionesInventario),
      investments: addTimestamp(investments),
      equiposRed: addTimestamp(equiposRed),
      planes: addTimestamp(planes),
      snapshots: addTimestamp(snapshots),
      config: { ...config, _localUpdatedAt: new Date().toISOString() }
    };
    
    const resultado = await window.FirebaseSync.syncTodo(localData);
    
    if (resultado.success) {
      if (resultado.conflictos && resultado.conflictos.length > 0) {
        console.log('⚠ Conflictos de sincronización:', resultado.conflictos);
        if (typeof notify === 'function') {
          notify(`🔄 Sincronizado con ${resultado.conflictos.length} conflicto${resultado.conflictos.length > 1 ? 's' : ''} resuelto${resultado.conflictos.length > 1 ? 's' : ''}`);
        }
      }
    }
  } catch (error) {
    console.warn('Error al sincronizar con Firebase:', error);
    // No fallar el guardado local si falla la sincronización
  }
}

function loadLocalStorage() {
  // BUG FIX: el catch silencioso ocultaba errores de JSON inválido o
  // localStorage corrompido — el usuario veía datos en blanco sin ninguna
  // advertencia. Ahora se registra en consola para facilitar diagnóstico.
  try{ const r=localStorage.getItem(STORAGE_KEYS.DATA); if(r) applyJson(r); }
  catch(e){ console.error('Error al cargar datos locales:', e); }
}

function seedIfEmpty() {
  if(clients.length===0) {
    clients=[
      {id:1,nombre:'Roxana',megas:5,precio:2500,diaPago:10,pagado:false,ip:''},
      {id:2,nombre:'Marlon',megas:5,precio:1500,diaPago:10,pagado:false,ip:''},
      {id:3,nombre:'Ronnie',megas:3,precio:2000,diaPago:12,pagado:false,ip:''},
      {id:4,nombre:'Liset', megas:3,precio:2500,diaPago:10,pagado:false,ip:''},
      {id:5,nombre:'Dayron',megas:2,precio:2500,diaPago:13,pagado:false,ip:''},
      {id:6,nombre:'Martín',megas:4,precio:3000,diaPago:11,pagado:false,ip:''},
    ];
  }
}
