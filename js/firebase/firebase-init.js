// firebase-init.js
// Integración con Firebase para recordatorios push reales (app cerrada).
//
// IMPORTANTE — modelo de privacidad:
// AdminRed guarda TODO localmente y cifrado con tu PIN. Este módulo es la
// ÚNICA parte de la app que envía datos fuera del dispositivo, y solo envía
// lo mínimo indispensable para calcular el recordatorio: nombre, día de pago,
// monto y si ya pagó. NO se sube historial, notas, teléfono, ni nada del
// resto de la app.
//
// Este archivo se carga como <script type="module"> en index.html.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, deleteDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getMessaging, getToken, isSupported }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js";

const firebaseConfig = {
  apiKey: "AIzaSyDCFodLJNBNrZpL2qIEhSB36wiSE9ymbew",
  authDomain: "rednet-adminred.firebaseapp.com",
  projectId: "rednet-adminred",
  storageBucket: "rednet-adminred.firebasestorage.app",
  messagingSenderId: "144844223621",
  appId: "1:144844223621:web:5391574c73fc4851ef65ec"
};

// TODO: reemplaza esto con tu clave VAPID real. Se genera en:
// Firebase Console → ⚙️ Configuración del proyecto → pestaña "Cloud Messaging"
// → sección "Certificados push web" → "Generar par de claves"
const VAPID_KEY = "BFpHrKJjbqzOEXWdVLPBsVHmUZPDh6oYVb_hHvSrIPB91Z6-WyfNS0aNdP8VbN-WcdRiE0BM4gjE5_11rNmi-VI";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

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
async function syncCliente(cliente) {
  try {
    const negocioId = getNegocioId();
    await setDoc(doc(db, 'negocios', negocioId, 'clientes', String(cliente.id)), {
      nombre:  cliente.nombre,
      diaPago: cliente.diaPago || null,
      monto:   (cliente.megas || 0) * (cliente.precio || 0),
      pagado:  !!cliente.pagado,
      actualizado: serverTimestamp()
    });
  } catch (e) {
    console.warn('No se pudo sincronizar el cliente con Firebase:', e);
  }
}

// Borra el cliente del lado remoto cuando se elimina localmente.
async function eliminarClienteRemoto(clienteId) {
  try {
    const negocioId = getNegocioId();
    await deleteDoc(doc(db, 'negocios', negocioId, 'clientes', String(clienteId)));
  } catch (e) {
    console.warn('No se pudo eliminar el cliente en Firebase:', e);
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
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (!token) return null;
    const negocioId = getNegocioId();
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
window.FirebaseSync = { syncCliente, eliminarClienteRemoto, solicitarTokenPush, getNegocioId };
