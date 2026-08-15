// calculations-utils.js
// Funciones de utilidad (formato, fechas, snapshots, números de recibo)
// Depende de: state.js (snapshots, config)

const fmt = n=>(typeof n==='number'?n:0).toLocaleString('es-CU')+' CUP';

function fechaLocalISO(d) {
  if(!d) d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - offset);
  return local.toISOString().slice(0,10);
}

// ───────────────────────────────────────────────────────────────────────────
//  SNAPSHOTS DE ESTADO FINANCIERO (v5.6)
// ───────────────────────────────────────────────────────────────────────────
// Los snapshots permiten "congelar" el estado financiero de un mes para poder
// consultarlo después sin que cambie. Se usan en los reportes mensuales para
// mostrar los datos exactos del mes en que se generó el reporte, no los datos
// actuales (que pueden haber cambiado).

function generarSnapshot(mes) {
  return {
    mes: mes,
    fecha: fechaLocalISO(),
    ingresos: ingresosMes(),
    costo: costoMes(),
    gastos: totalGastos(),
    ganancia: ganancia(),
    cobrado: cobrado(),
    pendiente: pendienteTotal(),
    clientesActivos: clients.filter(c=>c.megas>0).length,
    clientesPagados: clients.filter(c=>c.pagado).length,
    clientesSuspendidos: clients.filter(c=>c.suspendido).length
  };
}

function guardarSnapshot(mes) {
  if(!snapshots) snapshots = {};
  snapshots[mes] = generarSnapshot(mes);
  save();
}

function getSnapshotMes(mes) {
  if(!snapshots || !snapshots[mes]) return null;
  return snapshots[mes];
}

function getSnapshotAnterior(mesActualKey) {
  if(!snapshots) return null;
  const meses = Object.keys(snapshots).sort().reverse();
  const idx = meses.indexOf(mesActualKey);
  if(idx === -1 || idx >= meses.length - 1) return null;
  return snapshots[meses[idx + 1]];
}

// ───────────────────────────────────────────────────────────────────────────
//  NÚMEROS DE RECIBO
// ───────────────────────────────────────────────────────────────────────────
// Genera números de recibo secuenciales por mes. El formato es:
// YYYYMM-NNNN donde YYYYMM es el mes y NNNN es el número secuencial.
// Se reinicia cada mes (ej. 202501-0001, 202501-0002, ..., 202502-0001).

function siguienteRecibo() {
  const mes = mesActualHoy();
  if(!config.reciboCounter) config.reciboCounter = {};
  if(!config.reciboCounter[mes]) config.reciboCounter[mes] = 0;
  config.reciboCounter[mes]++;
  save();
  return formatoRecibo(config.reciboCounter[mes]);
}

function formatoRecibo(n) {
  const mes = mesActualHoy();
  const num = String(n).padStart(4, '0');
  return `${mes}-${num}`;
}

function mesActualHoy() {
  return fechaLocalISO().slice(0,7);
}

function labelMes(mesKey) {
  if(!mesKey || mesKey.length !== 7) return mesKey;
  const [anio, mes] = mesKey.split('-');
  const fecha = new Date(parseInt(anio), parseInt(mes) - 1, 1);
  return fecha.toLocaleDateString('es-CU', { month: 'long', year: 'numeric' });
}