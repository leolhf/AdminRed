// enviar-recordatorios.js
// Recordatorios push de RedNet. Se ejecuta desde GitHub Actions.

const admin = require('firebase-admin');

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('❌ Falta el secreto FIREBASE_SERVICE_ACCOUNT');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} catch (error) {
  console.error('❌ FIREBASE_SERVICE_ACCOUNT no contiene JSON válido:', error.message);
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const db = admin.firestore();

// ── Hora de Cuba ──────────────────────────────────────────────
function ahoraEnHavana() {
  const ahora = new Date();
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Havana',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false
  }).formatToParts(ahora);

  const v = {};
  for (const p of partes) if (p.type !== 'literal') v[p.type] = p.value;

  return {
    fecha: new Date(+v.year, +v.month - 1, +v.day, +v.hour, +v.minute, +v.second),
    texto: `${v.year}-${v.month}-${v.day} ${v.hour}:${v.minute}:${v.second}`
  };
}

// FIX #2: getStatus ahora recibe la tolerancia (margenDias) desde Firestore
// en lugar de usar siempre +5 fijo. Si no está configurada, usa 5 como default.
function getStatus(diaPago, pagado, hoy, margenDias = 5) {
  if (pagado) return 'paid';
  if (diaPago == null || diaPago === '') return 'desconocido';

  const dia = Number(diaPago);
  if (!Number.isFinite(dia)) return 'desconocido';

  const diaHoy    = hoy.getDate();
  const limiteMax = dia + margenDias;

  if (diaHoy > limiteMax) return 'due';
  if (diaHoy >= dia)      return 'warn';
  return 'ok';
}

async function main() {
  const { fecha: hoy, texto } = ahoraEnHavana();

  console.log('============================================');
  console.log('       REDNET - RECORDATORIOS PUSH');
  console.log('============================================');
  console.log(`Hora de Cuba: ${texto}`);
  console.log('');

  // FIX #2: leer config de cada negocio para obtener la tolerancia real
  console.log('⚙️  Leyendo configuraciones de negocios...');
  const configsSnap = await db.collectionGroup('config').get();
  const configPorNegocio = {};
  configsSnap.forEach(doc => {
    const negocioId = doc.ref.parent.parent.id;
    configPorNegocio[negocioId] = doc.data();
  });
  console.log(`   ${configsSnap.size} configuraciones encontradas`);
  console.log('');

  console.log('🔎 Buscando clientes en Firestore...');
  const clientesSnap = await db.collectionGroup('clientes').get();
  console.log(`👥 Clientes encontrados: ${clientesSnap.size}`);
  console.log('');

  console.log('📱 Buscando dispositivos registrados...');
  const dispositivosSnap = await db.collectionGroup('dispositivos').get();
  console.log(`📱 Dispositivos encontrados: ${dispositivosSnap.size}`);
  console.log('');

  const negocios = {};

  function obtenerNegocio(id) {
    if (!negocios[id]) {
      negocios[id] = { clientes: 0, vencidos: [], porCobrar: [], morosos: [], tokens: [] };
    }
    return negocios[id];
  }

  clientesSnap.forEach(doc => {
    const negocioId = doc.ref.parent.parent.id;
    const cliente   = doc.data();
    const negocio   = obtenerNegocio(negocioId);
    negocio.clientes++;

    // FIX #2: usar la tolerancia del negocio si está disponible
    const cfg       = configPorNegocio[negocioId] || {};
    const margen    = (cfg.diaLimite != null && cfg.diaInicio != null)
                    ? (Number(cfg.diaLimite) - Number(cfg.diaInicio))
                    : 5;

    const estado    = getStatus(cliente.diaPago, cliente.pagado, hoy, margen);
    const mora      = Number(cliente.mora || 0);

    console.log(
      `Cliente: ${cliente.nombre || '(sin nombre)'}` +
      ` | negocio: ${negocioId}` +
      ` | día: ${cliente.diaPago}` +
      ` | pagado: ${cliente.pagado}` +
      ` | estado: ${estado}` +
      ` | mora: ${mora}` +
      ` | margen: ${margen} días`
    );

    if (estado === 'due')       negocio.vencidos.push(cliente.nombre || 'Cliente sin nombre');
    else if (estado === 'warn') negocio.porCobrar.push(cliente.nombre || 'Cliente sin nombre');
    else if (mora > 0)          negocio.morosos.push(cliente.nombre || 'Cliente sin nombre');
  });

  console.log('');

  dispositivosSnap.forEach(doc => {
    const negocioId = doc.ref.parent.parent.id;
    const negocio   = obtenerNegocio(negocioId);
    const token     = doc.data().token || doc.id;
    if (token) negocio.tokens.push(token);
  });

  // ── Resumen ───────────────────────────────────────────────
  console.log('============================================');
  console.log('              RESUMEN');
  console.log('============================================');

  let totalClientes = 0, totalTokens = 0, totalAlertas = 0;

  for (const [negocioId, datos] of Object.entries(negocios)) {
    const alertas = datos.vencidos.length + datos.porCobrar.length + datos.morosos.length;
    totalClientes += datos.clientes;
    totalTokens   += datos.tokens.length;
    totalAlertas  += alertas;

    console.log('');
    console.log(`🏢 Negocio: ${negocioId}`);
    console.log(`   Clientes: ${datos.clientes}`);
    console.log(`   Dispositivos: ${datos.tokens.length}`);
    console.log(`   🔴 Vencidos: ${datos.vencidos.length}`);
    console.log(`   🟡 Por cobrar: ${datos.porCobrar.length}`);
    console.log(`   🟣 Con mora: ${datos.morosos.length}`);
    if (!datos.tokens.length) console.log('   ⚠️ NO SE ENCONTRARON TOKENS FCM');
    if (!alertas)             console.log('   ℹ️ No hay alertas que enviar');
  }

  console.log('');
  console.log('============================================');
  console.log(`👥 Total clientes: ${totalClientes}`);
  console.log(`📱 Total dispositivos: ${totalTokens}`);
  console.log(`🔔 Total alertas: ${totalAlertas}`);
  console.log('============================================');
  console.log('');

  // ── Envío ─────────────────────────────────────────────────
  let enviados = 0, fallidos = 0;

  for (const [negocioId, datos] of Object.entries(negocios)) {
    const alertas = datos.vencidos.length + datos.porCobrar.length + datos.morosos.length;

    if (!datos.tokens.length) { console.log(`⏭️ ${negocioId}: omitido, sin dispositivos`); continue; }
    if (!alertas)              { console.log(`⏭️ ${negocioId}: omitido, sin alertas`);      continue; }

    const partes = [];
    if (datos.vencidos.length)  partes.push(`🔴 Vencidos: ${datos.vencidos.join(', ')}`);
    if (datos.porCobrar.length) partes.push(`🟡 Por cobrar: ${datos.porCobrar.join(', ')}`);
    if (datos.morosos.length)   partes.push(`🟣 Con mora: ${datos.morosos.join(', ')}`);

    const mensaje = {
      notification: { title: 'RedNet — Recordatorio de cobros', body: partes.join(' · ') },
      tokens: [...new Set(datos.tokens)]
    };

    console.log('');
    console.log(`📤 Enviando a ${negocioId}... (${mensaje.tokens.length} token${mensaje.tokens.length !== 1 ? 's' : ''})`);

    try {
      const respuesta = await admin.messaging().sendEachForMulticast(mensaje);
      enviados += respuesta.successCount;
      fallidos += respuesta.failureCount;
      console.log(`   ✅ Enviados: ${respuesta.successCount}`);
      console.log(`   ❌ Fallidos: ${respuesta.failureCount}`);

      // FIX: eliminar tokens inválidos de Firestore para no acumular tokens expirados
      const tokensInvalidos = [];
      respuesta.responses.forEach((r, i) => {
        if (!r.success) {
          const code = r.error?.code || r.error?.message || 'unknown';
          console.error(`   ⚠️ Token ${i} falló: ${code}`);
          // Tokens inválidos/expirados — se deben borrar para no enviar siempre
          if (code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-registration-token') {
            tokensInvalidos.push(mensaje.tokens[i]);
          }
        }
      });

      // Limpiar tokens inválidos de Firestore
      if (tokensInvalidos.length > 0) {
        console.log(`   🧹 Eliminando ${tokensInvalidos.length} token(s) inválido(s) de Firestore...`);
        const batch = db.batch();
        for (const token of tokensInvalidos) {
          const ref = db.collection('negocios').doc(negocioId).collection('dispositivos').doc(token);
          batch.delete(ref);
        }
        await batch.commit();
        console.log('   ✅ Tokens inválidos eliminados');
      }

    } catch (error) {
      console.error(`❌ Error enviando a ${negocioId}:`, error.message);
    }
  }

  console.log('');
  console.log('============================================');
  console.log('             RESULTADO FINAL');
  console.log('============================================');
  console.log(`✅ Notificaciones enviadas: ${enviados}`);
  console.log(`❌ Notificaciones fallidas: ${fallidos}`);

  if (enviados === 0) {
    console.log('');
    console.log('⚠️ NO SE ENVIÓ NINGUNA NOTIFICACIÓN.');
    if (totalClientes === 0)      console.log('Motivo probable: Firestore no contiene clientes.');
    else if (totalTokens === 0)   console.log('Motivo probable: ningún dispositivo tiene token FCM.');
    else if (totalAlertas === 0)  console.log('Motivo probable: ningún cliente cumple condiciones de alerta.');
    else                          console.log('Hay clientes y alertas, pero el envío FCM falló.');
  }

  console.log('============================================');
}

main().catch(error => {
  console.error('❌ ERROR FATAL:', error);
  process.exit(1);
});
