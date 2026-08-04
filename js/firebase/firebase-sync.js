// firebase-sync.js
// Sincronización bidireccional con Firebase Realtime Database
// Soporta offline, merge inteligente y resolución de conflictos

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, serverTimestamp, push, remove }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCFodLJNBNrZpL2qIEhSB36wiSE9ymbew",
  authDomain: "rednet-adminred.firebaseapp.com",
  projectId: "rednet-adminred",
  storageBucket: "rednet-adminred.firebasestorage.app",
  messagingSenderId: "144844223621",
  appId: "1:144844223621:web:5391574c73fc4851ef65ec",
  databaseURL: "https://rednet-adminred-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ═══════════════════════════════════════════════════════════
//  CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════

// Identificador único del negocio (compartido entre dispositivos)
function getNegocioId() {
  let id = localStorage.getItem('sync_negocio_id');
  if (!id) {
    id = 'negocio-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('sync_negocio_id', id);
  }
  return id;
}

// Identificador único de este dispositivo
function getDispositivoId() {
  let id = localStorage.getItem('sync_dispositivo_id');
  if (!id) {
    id = 'disp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('sync_dispositivo_id', id);
  }
  return id;
}

// Detectar tipo de dispositivo
function getTipoDispositivo() {
  return /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

// ═══════════════════════════════════════════════════════════
//  MERGE INTELIGENTE
// ═══════════════════════════════════════════════════════════

/**
 * Merge inteligente por campos con prioridad móvil > PC
 * @param {Object} localData - Datos locales
 * @param {Object} remoteData - Datos remotos
 * @returns {Object} Datos mergeados
 */
function mergeData(localData, remoteData) {
  if (!remoteData) return localData;
  if (!localData) return remoteData;

  const tipoLocal = localData._deviceType || 'unknown';
  const tipoRemote = remoteData._deviceType || 'unknown';
  
  // Prioridad: mobile > desktop > unknown
  const prioridad = { mobile: 3, desktop: 2, unknown: 1 };
  const localWin = prioridad[tipoLocal] >= prioridad[tipoRemote];

  const merged = { ...remoteData };
  const conflictos = [];

  // Campos que no se deben mergear (meta campos)
  const metaFields = ['_localUpdatedAt', '_serverUpdatedAt', '_deviceType', '_deviceId'];

  for (const field in localData) {
    if (metaFields.includes(field)) continue;

    const localVal = localData[field];
    const remoteVal = remoteData[field];

    // Si el campo solo existe localmente
    if (remoteVal === undefined) {
      merged[field] = localVal;
      continue;
    }

    // Si ambos tienen el campo y son diferentes → conflicto
    if (localVal !== remoteVal) {
      // Comparar timestamps si existen
      const localTime = new Date(localData._localUpdatedAt || 0).getTime();
      const remoteTime = new Date(remoteData._serverUpdatedAt || 0).getTime();

      if (localTime > remoteTime) {
        merged[field] = localVal;
      } else if (localTime < remoteTime) {
        // Mantener valor remoto
      } else {
        // Mismo timestamp → usar prioridad de dispositivo
        if (localWin) {
          merged[field] = localVal;
        }
        // Si no, mantener valor remoto
      }
    }
  }

  // Actualizar meta campos
  merged._serverUpdatedAt = serverTimestamp();
  merged._deviceType = getTipoDispositivo();
  merged._deviceId = getDispositivoId();

  return { merged, conflictos };
}

// ═══════════════════════════════════════════════════════════
//  SINCRONIZACIÓN DE DATOS
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar un registro específico
 * @param {string} coleccion - Nombre de la colección (clientes, gastos, etc.)
 * @param {string} id - ID del registro
 * @param {Object} data - Datos a sincronizar
 */
async function syncRegistro(coleccion, id, data) {
  try {
    const negocioId = getNegocioId();
    const dispositivoId = getDispositivoId();
    
    // Agregar meta campos
    const dataWithMeta = {
      ...data,
      _localUpdatedAt: new Date().toISOString(),
      _deviceType: getTipoDispositivo(),
      _deviceId: dispositivoId
    };

    // Primero obtener datos remotos
    const remoteRef = ref(db, `negocios/${negocioId}/${coleccion}/${id}`);
    const snapshot = await get(remoteRef);
    const remoteData = snapshot.exists() ? snapshot.val() : null;

    // Merge inteligente
    const { merged } = mergeData(dataWithMeta, remoteData);

    // Guardar en Firebase
    await set(remoteRef, merged);

    return { success: true, merged };
  } catch (error) {
    console.error(`Error sincronizando ${coleccion}/${id}:`, error);
    return { success: false, error };
  }
}

/**
 * Sincronizar toda una colección
 * @param {string} coleccion - Nombre de la colección
 * @param {Array} localData - Datos locales (array de objetos)
 */
async function syncColeccion(coleccion, localData) {
  try {
    const negocioId = getNegocioId();
    const remoteRef = ref(db, `negocios/${negocioId}/${coleccion}`);
    const snapshot = await get(remoteRef);
    const remoteData = snapshot.exists() ? snapshot.val() : {};

    const resultados = [];
    const conflictos = [];

    // Procesar cada registro local
    for (const item of localData) {
      const id = item.id;
      const remoteItem = remoteData[id];

      const dataWithMeta = {
        ...item,
        _localUpdatedAt: new Date().toISOString(),
        _deviceType: getTipoDispositivo(),
        _deviceId: getDispositivoId()
      };

      const { merged, conflictos: itemConflictos } = mergeData(dataWithMeta, remoteItem);
      
      if (itemConflictos.length > 0) {
        conflictos.push({ id, conflictos: itemConflictos });
      }

      await set(ref(db, `negocios/${negocioId}/${coleccion}/${id}`), merged);
      resultados.push({ id, success: true });
    }

    // Detectar registros remotos que no existen localmente
    for (const id in remoteData) {
      if (!localData.find(item => item.id === id)) {
        resultados.push({ id, success: true, remoteOnly: true });
      }
    }

    return { success: true, resultados, conflictos };
  } catch (error) {
    console.error(`Error sincronizando colección ${coleccion}:`, error);
    return { success: false, error };
  }
}

/**
 * Descargar datos remotos
 * @param {string} coleccion - Nombre de la colección
 */
async function descargarRemoto(coleccion) {
  try {
    const negocioId = getNegocioId();
    const remoteRef = ref(db, `negocios/${negocioId}/${coleccion}`);
    const snapshot = await get(remoteRef);
    
    if (!snapshot.exists()) return { success: true, data: [] };

    const data = snapshot.val();
    const array = Object.entries(data).map(([id, item]) => ({
      id,
      ...item
    }));

    return { success: true, data: array };
  } catch (error) {
    console.error(`Error descargando ${coleccion}:`, error);
    return { success: false, error };
  }
}

/**
 * Escuchar cambios en tiempo real
 * @param {string} coleccion - Nombre de la colección
 * @param {Function} callback - Función a llamar cuando hay cambios
 */
function escucharCambios(coleccion, callback) {
  const negocioId = getNegocioId();
  const remoteRef = ref(db, `negocios/${negocioId}/${coleccion}`);
  
  return onValue(remoteRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const array = Object.entries(data).map(([id, item]) => ({
        id,
        ...item
      }));
      callback(array);
    } else {
      callback([]);
    }
  });
}

/**
 * Eliminar un registro
 * @param {string} coleccion - Nombre de la colección
 * @param {string} id - ID del registro
 */
async function eliminarRegistro(coleccion, id) {
  try {
    const negocioId = getNegocioId();
    await remove(ref(db, `negocios/${negocioId}/${coleccion}/${id}`));
    return { success: true };
  } catch (error) {
    console.error(`Error eliminando ${coleccion}/${id}:`, error);
    return { success: false, error };
  }
}

// ═══════════════════════════════════════════════════════════
//  SINCRONIZACIÓN COMPLETA
// ═══════════════════════════════════════════════════════════

/**
 * Sincronizar todos los datos de la app
 * @param {Object} localData - Objeto con todas las colecciones locales
 */
async function syncTodo(localData) {
  const colecciones = ['clientes', 'gastos', 'history', 'inventario', 'config'];
  const resultados = {};
  const todosConflictos = [];

  for (const coleccion of colecciones) {
    if (localData[coleccion]) {
      const resultado = await syncColeccion(coleccion, localData[coleccion]);
      resultados[coleccion] = resultado;
      if (resultado.conflictos && resultado.conflictos.length > 0) {
        todosConflictos.push(...resultado.conflictos);
      }
    }
  }

  return { success: true, resultados, conflictos: todosConflictos };
}

// ═══════════════════════════════════════════════════════════
//  EXPORTAR FUNCIONES
// ═══════════════════════════════════════════════════════════

window.FirebaseSync = {
  getNegocioId,
  getDispositivoId,
  getTipoDispositivo,
  syncRegistro,
  syncColeccion,
  descargarRemoto,
  escucharCambios,
  eliminarRegistro,
  syncTodo,
  mergeData
};

console.log('🔄 Firebase Sync cargado');
