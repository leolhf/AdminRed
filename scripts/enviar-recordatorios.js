// enviar-recordatorios.js
//
// Revisa todos los clientes guardados en Firestore (sincronizados desde la
// app) y envía UNA notificación push diaria por negocio con el resumen de
// quién está "por cobrar" o "vencido".
//
// Pensado para correr por GitHub Actions (ver .github/workflows/recordatorios.yml),
// NO como Firebase Cloud Function — así no hace falta el plan Blaze (de pago),
// ni tarjeta de crédito, ni computadora propia: GitHub lo ejecuta gratis en
// sus propios servidores, todos los días, a la hora programada.
//
// Requiere una variable de entorno FIREBASE_SERVICE_ACCOUNT con el JSON
// completo de la cuenta de servicio (se configura como "Secret" en GitHub,
// nunca se sube al repo).

const admin = require('firebase-admin');

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// Misma lógica que getStatus() en js/core/calculations.js de la app,
// adaptada a los campos que sí sincronizamos (nombre, diaPago, pagado).
// NOTA: si un cliente no tiene diaPago guardado, se ignora (no se puede
// calcular su estado sin ese dato).
function getStatus(diaPago, pagado, hoy) {
  if (pagado) return 'paid';
  if (diaPago == null) return 'desconocido';
  const diaHoy = hoy.getDate();
  const fechaLimite = new Date(hoy.getFullYear(), hoy.getMonth(), diaPago + 5);
  const fechaHoy = new Date(hoy.getFullYear(), hoy.getMonth(), diaHoy);
  if (fechaHoy > fechaLimite) return 'due';
  if (diaHoy >= diaPago) return 'warn';
  return 'ok';
}

function hoyEnHavana() {
  // Cuba está en America/Havana. Convertimos la hora actual a esa zona para
  // que el "día del mes" usado en la comparación sea el correcto localmente,
  // sin depender de en qué zona horaria corran los servidores de GitHub.
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Havana' }));
}

async function main() {
  const hoy = hoyEnHavana();

  const [clientesSnap, dispositivosSnap] = await Promise.all([
    db.collectionGroup('clientes').get(),
    db.collectionGroup('dispositivos').get()
  ]);

  // Agrupar por negocio (cada negocio = una instalación de AdminRed / un usuario)
  const porNegocio = {}; // { negocioId: { vencidos:[nombre], porCobrar:[nombre], tokens:[token] } }

  function getNegocio(negocioId) {
    if (!porNegocio[negocioId]) porNegocio[negocioId] = { vencidos: [], porCobrar: [], tokens: [] };
    return porNegocio[negocioId];
  }

  clientesSnap.forEach(doc => {
    const negocioId = doc.ref.parent.parent.id;
    const c = doc.data();
    const status = getStatus(c.diaPago, c.pagado, hoy);
    const bucket = getNegocio(negocioId);
    if (status === 'due') bucket.vencidos.push(c.nombre);
    else if (status === 'warn') bucket.porCobrar.push(c.nombre);
  });

  dispositivosSnap.forEach(doc => {
    const negocioId = doc.ref.parent.parent.id;
    getNegocio(negocioId).tokens.push(doc.id); // el id del doc ES el token (ver firebase-init.js)
  });

  let enviados = 0;
  for (const [negocioId, datos] of Object.entries(porNegocio)) {
    if (datos.tokens.length === 0) continue;
    if (datos.vencidos.length === 0 && datos.porCobrar.length === 0) continue;

    const partes = [];
    if (datos.vencidos.length)  partes.push(`🔴 Vencidos: ${datos.vencidos.join(', ')}`);
    if (datos.porCobrar.length) partes.push(`🟡 Por cobrar: ${datos.porCobrar.join(', ')}`);

    const mensaje = {
      notification: {
        title: 'RedNet — recordatorio de cobros',
        body: partes.join(' · ')
      },
      tokens: datos.tokens
    };

    const resp = await admin.messaging().sendEachForMulticast(mensaje);
    enviados += resp.successCount;
    console.log(`Negocio ${negocioId}: ${resp.successCount} enviados, ${resp.failureCount} fallidos`);
  }

  console.log(`Listo. Total de notificaciones enviadas: ${enviados}`);
}

main().catch(err => {
  console.error('Error enviando recordatorios:', err);
  process.exit(1);
});
