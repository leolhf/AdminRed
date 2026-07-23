// calculations.js
// Cómputos financieros y de estado del cliente (totales, mora, formato).

const totalVendido    = ()=>clients.reduce((s,c)=>s+(c.megas||0),0);
// Mb realmente disponibles para vender, reservando el margen personal (config.margenMegas)
const megasDisponiblesParaVenta = (excluirId=null)=>{
  const vendidoOtros = clients.filter(c=>c.id!==excluirId).reduce((s,c)=>s+(c.megas||0),0);
  return config.megas - (config.margenMegas||0) - vendidoOtros;
};
const ingresosMes     = ()=>clients.filter(c=>c.megas&&c.precio).reduce((s,c)=>s+c.megas*c.precio,0);
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
const cobrado         = ()=>clients.filter(c=>c.pagado).reduce((s,c)=>s+c.megas*c.precio,0);
const pendienteTotal  = ()=>clients.filter(c=>!c.pagado).reduce((s,c)=>s+c.megas*c.precio,0);

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
  const precioPorMes = c.megas * c.precio;
  const servicioTotal = precioPorMes * (mora + 1);
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

function getStatus(c) {
  if(c.pagado) return 'paid';
  if(c.fechaInicio){
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    const inicio=new Date(c.fechaInicio+'T00:00:00');
    if(hoy<inicio) return 'ok';
  }
  const hoy=new Date();
  const diaHoy=hoy.getDate();
  const inicio=c.diaPago||config.diaInicio;
  
  // Calcular fecha límite considerando cambio de mes
  const fechaLimite=new Date(hoy.getFullYear(), hoy.getMonth(), inicio+5);
  const fechaHoy=new Date(hoy.getFullYear(), hoy.getMonth(), diaHoy);
  
  if(fechaHoy>fechaLimite) return 'due';
  if(diaHoy>=inicio) return 'warn';
  return 'ok';
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
