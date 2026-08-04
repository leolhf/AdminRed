// calculations.js
// Cómputos financieros y de estado del cliente (totales, mora, formato).

const totalVendido    = ()=>clients.reduce((s,c)=>s+(c.megas||0),0);
// Mb realmente disponibles para vender, reservando el margen personal (config.margenMegas)
// y sumando la sobreventa permitida (config.sobreventaMegas), es decir, el total
// vendible = paquete contratado + sobreventa - margen personal.
const megasDisponiblesParaVenta = (excluirId=null)=>{
  const vendidoOtros = clients.filter(c=>c.id!==excluirId).reduce((s,c)=>s+(c.megas||0),0);
  return config.megas + (config.sobreventaMegas||0) - (config.margenMegas||0) - vendidoOtros;
};
// Feature #5: precio por mega de un cliente. Si el cliente tiene un plan asignado
// (planId), usa el precio del plan. Si no, usa c.precio (campo manual, comportamiento historico).
// Esto permite que el admin defina planes con precios fijos y los clientes hereden el precio
// sin tener que setearlo manualmente en cada uno.
function getPlanCliente(c) {
  if(!c.planId) return null;
  return planes.find(p=>p.id===c.planId) || null;
}
function getPrecioCliente(c) {
  const plan = getPlanCliente(c);
  if(plan && plan.precio) return plan.precio;
  return c.precio||0;
}
function getMegasCliente(c) {
  const plan = getPlanCliente(c);
  if(plan && plan.megas && !c.megas) return plan.megas;
  return c.megas||0;
}
// Feature #10: calcular el descuento aplicable a un cobro.
// c.descuentoTipo puede ser 'monto' (CUP fijos) o 'pct' (porcentaje).
// Devuelve el monto a descontar del precio del mes.
function calcularDescuento(c, precioMes) {
  if(!c.descuento || c.descuento<=0) return 0;
  if(c.descuentoTipo==='pct') return Math.round(precioMes * c.descuento / 100);
  return Math.min(c.descuento, precioMes); // monto fijo, nunca mas que el precio
}
// Ingresos del mes usando getPrecioCliente (respeta planes) y aplicando descuentos
const ingresosMes     = ()=>clients.filter(c=>c.megas&&getPrecioCliente(c)).reduce((s,c)=>{
  const precioMes=c.megas*getPrecioCliente(c);
  return s + Math.max(0, precioMes - calcularDescuento(c,precioMes));
},0);
const costoMes        = ()=>config.megas*config.costoPorMega;
// BUG FIX: antes sumaba TODOS los gastos guardados en `gastos`, incluyendo los
// de categoría "inversion", que iniciarNuevoMes() (month-reset.js) deliberadamente
// nunca borra (se acumulan mes tras mes para la barra de "Recuperación de inversión").
// Como resultado, cada compra de equipo/lote hecha alguna vez se seguía restando
// de la "Ganancia neta" en TODOS los meses futuros, indefinidamente.
// Ahora solo se cuentan los gastos cuya fecha (YYYY-MM-DD) cae dentro del mes en
// curso (config.mesActual, formato YYYY-MM), que es lo que realmente representa
// el gasto "de este mes".
const gastosDelMes    = ()=>gastos.filter(g=>!config.mesActual || (g.fecha||'').startsWith(config.mesActual));
const totalGastos     = ()=>gastosDelMes().reduce((s,g)=>s+g.monto,0);
const ganancia        = ()=>ingresosMes()-costoMes()-totalGastos();
const gananciaMensual  = ()=>ingresosMes()-costoMes();
const cobrado         = ()=>clients.filter(c=>c.pagado).reduce((s,c)=>s+c.megas*getPrecioCliente(c),0);
// BUG FIX: pendienteTotal() (y el conteo de "clientes" de la tarjeta Pendiente
// en render.js) contaban a TODOS los no pagados, incluyendo clientes agregados
// para el próximo mes (fechaInicio futura) que aún no deben nada del ciclo
// actual — inflando el monto y el conteo de "Pendiente" en el dashboard con
// clientes que ni siquiera han empezado a facturar.
// facturacionIniciada() reutiliza el mismo criterio que ya usan getStatus()
// y month-reset.js (debiaCobrar) para saber si el ciclo de este mes ya
// arrancó para el cliente.
function facturacionIniciada(c) {
  if(c.fechaInicio){
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    const inicio=new Date(c.fechaInicio+'T00:00:00');
    if(hoy<inicio) return false;
  }
  return true;
}
const pendienteTotal  = ()=>clients.filter(c=>!c.pagado && facturacionIniciada(c)).reduce((s,c)=>s+c.megas*getPrecioCliente(c),0);

const inversionTotalHistorica   = ()=>investments.reduce((s,i)=>s+(i.costoTotal||0),0);
// BUG FIX: antes sumaba investments[].recuperado, un campo que ningún código llega
// a escribir (actualizarRecuperadoInversion es un no-op desde que se pasó al modelo
// de proyección automática). Por eso la barra de "Recuperación de inversión" se
// quedaba siempre en 0% aunque el cliente pagara su cuota de equipo.
// Ahora se suma directamente lo ya cobrado real: history[].montoEquipo, que SÍ se
// registra en cada cobro (modal-cobro.js), liquidación (liquidarDeuda) y venta de
// inventario (inventario.js). Esto refleja el dinero realmente recuperado.
const recuperadoInversion       = ()=>history.reduce((s,h)=>s+(h.montoEquipo||0),0);
// BUG FIX: gananciaAjustada() sumaba ganancia() (un número del mes en curso) con
// recuperadoInversion() (un acumulado histórico de TODA la vida de la app, sin
// filtrar por fecha). Con cada mes que pasaba, "Ganancia ajustada" iba sumando
// cada vez más lo cobrado en meses anteriores — un número que crecía sin parar
// y no representaba nada real de "este mes".
// Para gananciaAjustada() se usa ahora solo lo recuperado DENTRO del mes en curso.
// recuperadoInversion() se deja intacta (histórica) para la sección "Recuperación
// de inversión" de Estadísticas, que sí está pensada como acumulado de toda la vida.
const recuperadoInversionMes    = ()=>history.reduce((s,h)=>s+((config.mesActual && (h.fecha||'').startsWith(config.mesActual))?(h.montoEquipo||0):0),0);
const deudaEquipoPendienteTotal = ()=>clients.reduce((s,c)=>s+getDeudaEquipoCliente(c),0);
const gananciaAjustada          = ()=>ganancia()+recuperadoInversionMes();

function getMora(c) {
  return (!c.mora || c.mora<=0) ? 0 : c.mora;
}

// Días entre hoy y el día de pago del cliente.
// Negativo = ya pasó (mientras más negativo, más atrasado).
// Positivo/cero = aún no llega (mientras más chico, más próximo).
function diasParaPago(c) {
  const hoy = new Date().getDate();
  return (c.diaPago||0) - hoy;
}

// Orden dinámico de "Estado de clientes": no pagados primero (los más
// atrasados/próximos arriba), pagados al final. Empates se resuelven
// por mayor total a cobrar (megas × precio).
function ordenarPorUrgenciaCobro(lista) {
  return [...lista].sort((a,b) => {
    if(a.pagado !== b.pagado) return a.pagado ? 1 : -1;
    if(!a.pagado){
      const diff = diasParaPago(a) - diasParaPago(b);
      if(diff !== 0) return diff;
    }
    const montoA = (a.megas||0)*(a.precio||0);
    const montoB = (b.megas||0)*(b.precio||0);
    return montoB - montoA;
  });
}

function getCuotaEquipo(c) {
  return getCuotaEquipoCliente(c);
}

// BUG FIX #6: montoTotalACobrar ahora calcula correctamente:
// servicio acumulado (mora meses + mes actual) + cuota equipo (solo 1 mes) - abono previo.
// Antes restaba c.abono (solo servicio) de un total que incluía equipo → número incorrecto.
function montoTotalACobrar(c) {
  const mora         = getMora(c);
  const cuotaEq      = getCuotaEquipo(c);
  const precioPorMes = c.megas * getPrecioCliente(c);
  const descuento    = calcularDescuento(c, precioPorMes);
  const precioNeto   = Math.max(0, precioPorMes - descuento);
  const servicioTotal = precioNeto * (mora + 1);
  const total         = servicioTotal + cuotaEq;
  return Math.max(0, total - (c.abono||0));
}

function mesesRestantesDeuda(c) {
  const deuda = getDeudaEquipoCliente(c);
  if(deuda <= 0) return 0;
  const cuota = getCuotaEquipoCliente(c);
  if(cuota <= 0) return Infinity;
  return Math.ceil(deuda/cuota);
}

function fechaFinDeuda(c) {
  const m = mesesRestantesDeuda(c);
  if(!m || m===Infinity) return null;
  const d = new Date();
  d.setMonth(d.getMonth()+m);
  return d.toLocaleDateString('es-CU',{month:'long',year:'numeric'});
}

// Suma `cantidad` días hábiles (lunes a viernes) a partir de `inicio`, contando
// el propio `inicio` como día 1 si cae en día hábil. Los sábados/domingos que
// caigan dentro del rango se saltan y no cuentan para el total.
function sumarDiasHabiles(inicio, cantidad) {
  const d = new Date(inicio);
  let contados = 0;
  while(contados < cantidad) {
    const esFinDeSemana = d.getDay()===0 || d.getDay()===6; // domingo=0, sábado=6
    if(!esFinDeSemana) contados++;
    if(contados < cantidad) d.setDate(d.getDate()+1);
  }
  return d;
}

// Fecha (Date) en la que vence el plazo de pago de este ciclo para el
// cliente: el día de pago cuenta como día 1 y el plazo es de 4 días
// calendario más, o sea que vence el día 5 (ej. día de pago=1 → vence
// el día 5). Se usa tanto en getStatus() como en el mensaje de WhatsApp
// de "por vencer", para que ambos muestren la misma fecha límite en vez
// del día de pago crudo.
function fechaLimitePago(c) {
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const diaPago=c.diaPago||config.diaInicio;
  const inicio=new Date(hoy.getFullYear(), hoy.getMonth(), diaPago); inicio.setHours(0,0,0,0);
  const limite=new Date(inicio); limite.setDate(limite.getDate()+4);
  return limite;
}

function getStatus(c) {
  if(c.pagado) return 'paid';
  if(c.fechaInicio){
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    const inicio=new Date(c.fechaInicio+'T00:00:00');
    if(hoy<inicio) return 'ok';
  }
  const hoy=new Date(); hoy.setHours(0,0,0,0);
  const diaPago=c.diaPago||config.diaInicio;
  const inicio=new Date(hoy.getFullYear(), hoy.getMonth(), diaPago); inicio.setHours(0,0,0,0);

  if(hoy<inicio) return 'ok'; // el día de pago de este ciclo aún no llega

  // El día de pago cuenta como día 1 de un plazo de 5 días hábiles (L-V).
  // Desde el día de pago y mientras dure ese plazo: "por vencer" (warn).
  // Pasado el 5to día hábil: "vencido" (due).
  const fechaLimite = fechaLimitePago(c);

  if(hoy>fechaLimite) return 'due';
  return 'warn';
}

// Filtro para el panel "Estado de clientes" del dashboard: solo deben
// aparecer los clientes que representan algo pendiente de cobro — con mora,
// con deuda de equipo, a los que ya les toca pagar este ciclo (warn), o
// rezagados/vencidos (due). Los que están al día (pagados sin deuda, o cuyo
// día de pago todavía no llega) se ocultan de esta lista.
function requiereAtencion(c) {
  if(getMora(c)>0) return true;
  if(getDeudaEquipoCliente(c)>0) return true;
  if(c.pagado) return false;
  const s=getStatus(c);
  return s==='warn' || s==='due';
}

const statusLabel = s=>({ok:'Al día',warn:'Cobrar pronto',due:'Vencido',paid:'Pagado'}[s]);
const statusClass = s=>({ok:'badge-ok',warn:'badge-warn',due:'badge-due',paid:'badge-paid'}[s]);

function clientLabel(c) {
  if(!c.pagado && c.fechaInicio){
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    const inicio=new Date(c.fechaInicio+'T00:00:00');
    if(hoy<inicio){
      const mes=inicio.toLocaleDateString('es-CU',{month:'short',day:'numeric'});
      return `<span class="status-badge badge-ok" title="Cobro inicia ${mes}">Desde ${mes}</span>`;
    }
  }
  const s=getStatus(c);
  return `<span class="status-badge ${statusClass(s)}">${statusLabel(s)}</span>`;
}

const fmt = n=>n.toLocaleString('es-CU')+' CUP';

// BUG FIX: `new Date().toISOString().split('T')[0]` (usado antes en varios
// módulos para guardar "la fecha de hoy") devuelve la fecha en UTC, no la
// fecha local del dispositivo. Cerca de medianoche, en zonas con offset
// negativo respecto a UTC (ej. Cuba, UTC-4/-5), esto guardaba el día
// SIGUIENTE al que realmente era en el teléfono del usuario (ej. si son las
// 9pm del día 10 en Cuba, toISOString() ya cae en el día 11 en UTC).
// fechaLocalISO() arma el string YYYY-MM-DD a partir de los componentes
// locales (getFullYear/getMonth/getDate), respetando la hora y zona horaria
// configuradas en el propio dispositivo.
function fechaLocalISO(d) {
  const fecha = d || new Date();
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth()+1).padStart(2,'0');
  const day = String(fecha.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FEATURE #14: SNAPSHOTS DE CIERRE DE MES
//  Guarda una fotografia inmutable del estado del negocio para un mes dado,
//  permitiendo comparar meses historicos de forma fiable (sin que los datos
//  cambien retroactivamente). Alimenta el dashboard de salud y los reportes.
// ═══════════════════════════════════════════════════════════════════════════════
function generarSnapshot(mes) {
  // mes: string 'YYYY-MM'. Si no se pasa, usa el mes actual.
  const mesKey = mes || mesActualHoy();
  const cobrosMes = history.filter(h => (h.fecha||'').startsWith(mesKey));
  const totalCobrado = cobrosMes.reduce((s,h)=>s+(h.monto||0),0);
  const totalCobradoEquipo = cobrosMes.reduce((s,h)=>s+(h.montoEquipo||0),0);
  const gastosMes = gastos.filter(g => (g.fecha||'').startsWith(mesKey));
  const totalGastosMes = gastosMes.reduce((s,g)=>s+(g.monto||0),0);
  const nClientes = clients.length;
  const nPagados = clients.filter(c=>c.pagado).length;
  const nConMora = clients.filter(c=>getMora(c)>0).length;
  const tasaCobro = nClientes>0 ? Math.round(nPagados/nClientes*100) : 0;
  const ing = ingresosMes();
  const costo = costoMes();
  const gan = ing - costo - totalGastosMes;

  // Gastos desglosados por categoria
  const gastosPorCat = {};
  gastosMes.forEach(g=>{
    const cat = g.categoria || 'operativo';
    gastosPorCat[cat] = (gastosPorCat[cat]||0) + (g.monto||0);
  });

  return {
    mes: mesKey,
    ingresos: ing,
    costoPaquete: costo,
    gastos: totalGastosMes,
    gastosPorCategoria: gastosPorCat,
    ganancia: gan,
    margen: ing>0 ? Math.round(gan/ing*100) : 0,
    cobrado: totalCobrado,
    cobradoEquipo: totalCobradoEquipo,
    pendiente: pendienteTotal(),
    nClientes,
    nPagados,
    nConMora,
    tasaCobro,
    megasVendidos: totalVendido(),
    timestamp: new Date().toISOString()
  };
}

function guardarSnapshot(mes) {
  const snap = generarSnapshot(mes);
  // Reemplazar si ya existe un snapshot para ese mes (actualizar)
  const idx = snapshots.findIndex(s=>s.mes===snap.mes);
  if(idx>=0) snapshots[idx]=snap;
  else snapshots.push(snap);
  // Ordenar por mes descendente
  snapshots.sort((a,b)=>b.mes.localeCompare(a.mes));
  return snap;
}

function getSnapshotMes(mes) {
  return snapshots.find(s=>s.mes===mes) || null;
}

function getSnapshotAnterior(mesActualKey) {
  // Devuelve el snapshot del mes inmediatamente anterior al dado
  const anteriores = snapshots.filter(s=>s.mes < mesActualKey).sort((a,b)=>b.mes.localeCompare(a.mes));
  return anteriores.length ? anteriores[0] : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FEATURE #4: CONTADOR DE RECIBOS
//  Genera un numero de recibo auto-incremental, persistido en el estado.
// ═══════════════════════════════════════════════════════════════════════════════
function siguienteRecibo() {
  reciboCounter++;
  return reciboCounter;
}

function formatoRecibo(n) {
  const anio = new Date().getFullYear();
  return `R-${anio}-${String(n).padStart(4,'0')}`;
}

// Helper: mes actual como 'YYYY-MM' (para snapshots y reportes)
function mesActualHoy() {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;
}

// Helper: label legible de un mes 'YYYY-MM' → "enero 2025"
function labelMes(mesKey) {
  if(!mesKey || mesKey==='sin-fecha') return 'Sin fecha';
  const [y,m] = mesKey.split('-');
  const d = new Date(parseInt(y), parseInt(m)-1, 15);
  return d.toLocaleDateString('es-CU', {month:'long', year:'numeric'});
}

