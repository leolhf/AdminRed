// firebase-init.js
// Integración con Firebase para recordatorios push reales (app cerrada).
//
// IMPORTANTE — modelo de privacidad:
// AdminRed guarda TODO localmente en este dispositivo. Este módulo es la
// ÚNICA parte de la app que envía datos fuera del dispositivo, y solo envía
// lo mínimo indispensable para calcular el recordatorio: nombre, día de pago,
// monto, si ya pagó y meses de mora acumulada. NO se sube historial, notas,
// teléfono, ni nada del resto de la app.
//
// Este archivo se carga como <script type="module"> en index.html.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, isSupported }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";
import { getDatabase, ref, set, get, remove }
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

// TODO: reemplaza esto con tu clave VAPID real. Se genera en:
// Firebase Console → ⚙️ Configuración del proyecto → pestaña "Cloud Messaging"
// → sección "Certificados push web" → "Generar par de claves"
const VAPID_KEY = "BFpHrKJjbqzOEXWdVLPBsVHmUZPDh6oYVb_hHvSrIPB91Z6-WyfNS0aNdP8VbN-WcdRiE0BM4gjE5_11rNmi-VI";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const rtdb = getDatabase(app);

let messaging = null;
isSupported().then(soportado => { if (soportado) messaging = getMessaging(app); });

// Identificador único de ESTE negocio/instalación de AdminRed. Se genera una
// sola vez y se guarda en localStorage, para que todos tus clientes queden
// agrupados bajo el mismo "negocio" en Firestore (por si algún día usas
// AdminRed para más de un negocio, no se mezclan datos entre ellos).
function getNegocioId() {
  let id = localStorage.getItem('firebase_negocio_id');
  if (!id) {
    id = 'negocio-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('firebase_negocio_id', id);
  }
  return id;
}

// Sube/actualiza SOLO los campos mínimos de un cliente.
async function syncCliente(cliente, encolarSiFalla=true) {
  try {
    const negocioId = getNegocioId();
    await setDoc(doc(db, 'negocios', negocioId, 'clientes', String(cliente.id)), {
      nombre:  cliente.nombre,
      diaPago: cliente.diaPago || null,
      monto:   (cliente.megas || 0) * (cliente.precio || 0),
      pagado:  !!cliente.pagado,
      mora:    cliente.mora || 0,
      actualizado: serverTimestamp()
    });
  } catch (e) {
    console.warn('No se pudo sincronizar el cliente con Firebase:', e);
    if(encolarSiFalla) encolarReintento('cliente', cliente);
  }
}

// Borra el cliente del lado remoto cuando se elimina localmente.
async function eliminarClienteRemoto(clienteId, encolarSiFalla=true) {
  try {
    const negocioId = getNegocioId();
    await deleteDoc(doc(db, 'negocios', negocioId, 'clientes', String(clienteId)));
  } catch (e) {
    console.warn('No se pudo eliminar el cliente en Firebase:', e);
    if(encolarSiFalla) encolarReintento('eliminar', clienteId);
  }
}

// Pide el token de notificaciones push de este dispositivo y lo guarda en
// Firestore, para que la Cloud Function programada sepa a qué dispositivos
// enviarle avisos.
async function solicitarTokenPush() {
  if (!messaging) { console.warn('Este navegador no soporta notificaciones push (FCM).'); return null; }
  if (VAPID_KEY === "PEGA_AQUI_TU_VAPID_KEY") {
    console.warn('Falta configurar la VAPID_KEY en firebase-init.js');
    return null;
  }
  try {
    // BUG FIX: por defecto, getToken() intenta auto-registrar un Service
    // Worker en './firebase-messaging-sw.js' (archivo que esta app no tiene,
    // porque toda la lógica de mensajería en segundo plano ya vive dentro de
    // nuestro propio sw.js). Eso causaba un 404 y hacía fallar la obtención
    // del token. Pasándole explícitamente el registro de NUESTRO sw.js (que
    // ya tiene messaging.onBackgroundMessage configurado), el SDK deja de
    // buscar el archivo por defecto y usa el que ya está activo.
    if (!('serviceWorker' in navigator)) {
      console.warn('Este navegador no soporta Service Workers.');
      return null;
    }
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
    if (!token) return null;
    const negocioId = getNegocioId();
    // BUG FIX: cuando el Service Worker se actualiza (nueva versión de la
    // app), FCM a veces genera un token NUEVO para este mismo dispositivo,
    // pero el token viejo seguía quedando registrado en Firestore (nunca se
    // borraba). El cron le mandaba push a ambos, y el resultado eran
    // notificaciones duplicadas en el mismo dispositivo. Ahora guardamos el
    // último token localmente, y si cambia, borramos el anterior en
    // Firestore antes de guardar el nuevo.
    const tokenAnterior = localStorage.getItem('firebase_push_token');
    if (tokenAnterior && tokenAnterior !== token) {
      try {
        await deleteDoc(doc(db, 'negocios', negocioId, 'dispositivos', tokenAnterior));
      } catch (e) {
        console.warn('No se pudo borrar el token push anterior:', e);
      }
    }
    localStorage.setItem('firebase_push_token', token);
    await setDoc(doc(db, 'negocios', negocioId, 'dispositivos', token), {
      token,
      actualizado: serverTimestamp()
    });
    return token;
  } catch (e) {
    console.warn('No se pudo obtener el token de notificaciones push:', e);
    return null;
  }
}

// Se expone en window para que el resto de la app (scripts clásicos, sin
// módulos) pueda llamarlo, ej: window.FirebaseSync.syncCliente(cliente)
// Sincroniza la configuración de cobro (diaInicio/diaLimite) para que el
// script de GitHub Actions use la misma tolerancia que la app.
async function syncConfig(cfg, encolarSiFalla=true) {
  try {
    const negocioId = getNegocioId();
    await setDoc(doc(db, 'negocios', negocioId, 'config', 'cobros'), {
      diaInicio:        cfg.diaInicio        || 10,
      diaLimite:        cfg.diaLimite        || 15,
      costoPorMega:     cfg.costoPorMega     || 0,
      sobreventaMegas:  cfg.sobreventaMegas  || 0,
      actualizado:      serverTimestamp()
    });
  } catch(e) {
    console.warn('No se pudo sincronizar config con Firebase:', e);
    if(encolarSiFalla) encolarReintento('config', cfg);
  }
}

// Sube TODOS los clientes de una vez (y la config). Se usa para la
// sincronización inicial al arrancar la app: syncCliente() solo se llama
// hasta ahora cuando se crea/edita/cobra/reinicia mes un cliente, así que
// cualquier cliente que ya existiera en localStorage antes de tener Firebase
// (o restaurado de un backup) nunca había llegado a Firestore.
async function sincronizarTodo(listaClientes, cfg) {
  try {
    if (Array.isArray(listaClientes)) {
      for (const c of listaClientes) await syncCliente(c);
    }
    if (cfg) await syncConfig(cfg);
  } catch (e) {
    console.warn('No se pudo completar la sincronización inicial con Firebase:', e);
  }
}

window.FirebaseSync = { syncCliente, eliminarClienteRemoto, solicitarTokenPush, getNegocioId, syncConfig, sincronizarTodo, procesarColaReintento };

// ═══════════════════════════════════════════════════════════
//  SINCRONIZACIÓN CON REALTIME DATABASE (para sincronización multi-dispositivo)
// ═══════════════════════════════════════════════════════════

function getSyncNegocioId() {
  let id = localStorage.getItem('sync_negocio_id');
  if (!id) {
    id = 'negocio-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    localStorage.setItem('sync_negocio_id', id);
  }
  return id;
}

function getTipoDispositivo() {
  return /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

async function syncTodo(localData) {
  try {
    const negocioId = getSyncNegocioId();
    // 'config' se maneja aparte porque es un objeto único, no una colección de items
    const colecciones = ['clientes', 'gastos', 'history', 'inventario'];
    const resultados = {};
    
    for (const coleccion of colecciones) {
      if (Array.isArray(localData[coleccion])) {
        for (const item of localData[coleccion]) {
          const dataWithMeta = {
            ...item,
            _localUpdatedAt: new Date().toISOString(),
            _deviceType: getTipoDispositivo()
          };
          await set(ref(rtdb, `negocios/${negocioId}/${coleccion}/${item.id}`), dataWithMeta);
        }
        resultados[coleccion] = { success: true };
      }
    }

    if (localData.config && typeof localData.config === 'object') {
      await set(ref(rtdb, `negocios/${negocioId}/config`), localData.config);
      resultados.config = { success: true };
    }
    
    return { success: true, resultados, conflictos: [] };
  } catch (error) {
    console.error('Error en syncTodo:', error);
    return { success: false, error };
  }
}

// Exponer función de sincronización completa
window.FirebaseSync.syncTodo = syncTodo;

// ═══════════════════════════════════════════════════════════
//  COLA DE REINTENTO — para cuando falla la sincronización
//  (sin internet, error temporal, etc.). Se guarda en localStorage
//  para que sobreviva a cerrar la app, y se reintenta al recuperar
//  conexión o al volver a abrir la app.
// ═══════════════════════════════════════════════════════════
const RETRY_QUEUE_KEY = 'rn_firebase_retry_queue';
const RETRY_MAX_INTENTOS = 10;

function leerColaReintento() {
  try { return JSON.parse(localStorage.getItem(RETRY_QUEUE_KEY) || '[]'); } catch(e) { return []; }
}
function guardarColaReintento(cola) {
  try { localStorage.setItem(RETRY_QUEUE_KEY, JSON.stringify(cola)); } catch(e) {}
}
function encolarReintento(tipo, payload) {
  const cola = leerColaReintento();
  // Evita duplicados: si ya hay un pendiente del mismo cliente/tipo, lo reemplaza por el más reciente
  const idPayload = tipo==='eliminar' ? payload : payload.id;
  const filtrada = cola.filter(item => !(item.tipo===tipo && (item.tipo==='eliminar' ? item.payload===idPayload : item.payload.id===idPayload)));
  filtrada.push({ tipo, payload, intentos: 0 });
  guardarColaReintento(filtrada);
}

async function procesarColaReintento() {
  const cola = leerColaReintento();
  if(!cola.length) return;
  const pendientes = [];
  for(const item of cola) {
    try {
      if(item.tipo === 'cliente')        await syncCliente(item.payload, false);
      else if(item.tipo === 'config')    await syncConfig(item.payload, false);
      else if(item.tipo === 'eliminar')  await eliminarClienteRemoto(item.payload, false);
    } catch(e) {
      item.intentos = (item.intentos||0) + 1;
      if(item.intentos < RETRY_MAX_INTENTOS) pendientes.push(item); // si falla demasiadas veces, se descarta
    }
  }
  guardarColaReintento(pendientes);
  const resueltos = cola.length - pendientes.length;
  if(resueltos > 0 && typeof notify === 'function') {
    notify(`🔄 Firebase: ${resueltos} cambio${resueltos>1?'s':''} pendiente${resueltos>1?'s':''} ya sincronizado${resueltos>1?'s':''}`);
  }
}

window.addEventListener('online', procesarColaReintento);
