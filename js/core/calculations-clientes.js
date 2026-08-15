// calculations-clientes.js
// Cómputos relacionados con clientes (planes, precios, descuentos, estado, mora)
// Depende de: state.js (clients, planes, descuentos, config)

const totalVendido    = ()=>clients.reduce((s,c)=>s+((c.suspendido?0:(c.megas||0))),0);
// Mb realmente disponibles para vender, reservando el margen personal (config.margenMegas)
// y sumando la sobreventa permitida (config.sobreventaMegas), es decir, el total
// vendible = paquete contratado + sobreventa - margen personal.
// F4: los clientes suspendidos no cuentan contra el ancho de banda vendido.
const megasDisponiblesParaVenta = (excluirId=null)=>{
  const vendidoOtros = clients.filter(c=>c.id!==excluirId).reduce((s,c)=>s+(c.suspendido?0:(c.megas||0)),0);
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

// v5.8.0: descuentos puntuales pendientes de un cliente para un mes dado.
// `mes` por defecto es el mes en curso (config.mesActual o el actual).
// Devuelve el array de items {id, tipo, motivo, modo, valor, monto} con el
// monto ya calculado en CUP (segun modo monto/pct/dias). Solo los NO aplicados.
function descuentosPendientesCliente(c, mes) {
  if(!c) return [];
  const m = mes || (config.mesActual || fechaLocalISO().slice(0,7));
  const precioMes = (c.megas||0) * getPrecioCliente(c);
  const diasBase = config.diasBaseMes || 30;
  return (descuentos||[])
    .filter(d => d.clienteId === c.id && d.mes === m && !d.aplicado)
    .map(d => {
      let monto = 0;
      if(d.modo === 'pct')      monto = Math.round(precioMes * (d.valor||0) / 100);
      else if(d.modo === 'dias') monto = Math.round((precioMes / diasBase) * (d.valor||0));
      else                       monto = (d.valor||0); // monto fijo CUP
      return { id:d.id, tipo:d.tipo, motivo:d.motivo||'', modo:d.modo, valor:d.valor||0, monto };
    });
}

// v5.8.0: descuento TOTAL aplicable a un cobro del mes = recurrente + puntuales.
// Devuelve { total, recurrente, puntuales: [...] } donde `puntuales` ya tiene
// los montos calculados. El total nunca supera el precio del mes (no se "paga"
// al cliente). Reemplaza a calcularDescuento() en todos los puntos de cobro,
// pero sin romperla (esta sigue existiendo para el recurrente aislado).
function calcularDescuentoTotal(c, precioMes) {
  const recurrente = calcularDescuento(c, precioMes);
  const puntuales = descuentosPendientesCliente(c);
  const puntualMonto = puntuales.reduce((s,d)=>s+(d.monto||0), 0);
  const total = Math.min(precioMes, recurrente + puntualMonto);
  return { total, recurrente, puntuales };
}

// Precio neto mensual de un cliente (precio base menos descuento).
// Centraliza el calculo para que todas las funciones usen el mismo valor.
// v5.8.0: ahora resta el descuento TOTAL (recurrente + puntuales del mes).
function precioNetoCliente(c) {
  const precioMes = (c.megas||0) * getPrecioCliente(c);
  return Math.max(0, precioMes - calcularDescuentoTotal(c, precioMes).total);
}

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

// BUG FIX #6: montoTotalACobrar() antes solo sumaba precioNetoCliente() + getMora(),
// ignorando completamente la cuota de equipo (deudaEquipo del cliente). Como resultado,
// el modal de cobro mostraba un total menor al real, el usuario confirmaba ese monto,
// y luego el cliente quedaba con deuda de equipo sin pagar parcialmente.
// Ahora montoTotalACobrar() incluye la cuota de equipo, reflejando el TOTAL a pagar.
function montoTotalACobrar(c) {
  return precioNetoCliente(c) + getMora(c) + getCuotaEquipo(c);
}

function mesesRestantesDeuda(c) {
  const cuota = getCuotaEquipo(c);
  if(cuota <= 0) return 0;
  return Math.ceil(c.deudaEquipo / cuota);
}

function fechaFinDeuda(c) {
  const meses = mesesRestantesDeuda(c);
  if(meses <= 0) return null;
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  return fechaLocalISO(fecha).slice(0,10);
}

function sumarDiasHabiles(inicio, cantidad) {
  const fecha = new Date(inicio);
  let dias = 0;
  while(dias < cantidad) {
    fecha.setDate(fecha.getDate() + 1);
    const dow = fecha.getDay();
    if(dow !== 0 && dow !== 6) dias++; // saltar domingos (0) y sábados (6)
  }
  return fechaLocalISO(fecha).slice(0,10);
}

function fechaLimitePago(c) {
  if(!c.diaPago) return null;
  const hoy = new Date();
  const diaPago = c.diaPago;
  let mes = hoy.getMonth();
  let anio = hoy.getFullYear();
  let dia = diaPago;
  
  // Si el día de pago ya pasó este mes, usar el próximo corte
  if(hoy.getDate() > diaPago) {
    mes++;
    if(mes > 11) { mes = 0; anio++; }
  }
  
  const fecha = new Date(anio, mes, dia);
  return sumarDiasHabiles(fecha, 0); // ajustar a días hábiles si es necesario
}

function getStatus(c) {
  if(c.pagado) return 'paid';
  if(!facturacionIniciada(c)) return 'ok'; // aún no debe nada
  const dias = diasParaPago(c);
  if(dias >= 0) return 'warn'; // próximo a vencer
  return 'due'; // vencido
}

function requiereAtencion(c) {
  if(c.pagado) return false;
  if(!facturacionIniciada(c)) return false;
  const dias = diasParaPago(c);
  return dias <= 2; // vencido o vence en 2 días o menos
}

function cobroVencidoHoy(c) {
  if(c.pagado) return false;
  if(!facturacionIniciada(c)) return false;
  const dias = diasParaPago(c);
  return dias === 0; // vence hoy
}

const clientesEsperadosCobro = ()=>clients.filter(cobroVencidoHoy);
const ingresosEsperadosHoy = ()=>clientesEsperadosCobro().reduce((s,c)=>s+precioNetoCliente(c),0);
const cobradoAlCorte = ()=>clientesEsperadosCobro().filter(c=>c.pagado).reduce((s,c)=>s+precioNetoCliente(c),0);

const statusLabel = s=>({ok:'Al día',warn:'Cobrar pronto',due:'Vencido',paid:'Pagado'}[s]);
const statusClass = s=>({ok:'badge-ok',warn:'badge-warn',due:'badge-due',paid:'badge-paid'}[s]);

function clientLabel(c) {
  const plan = getPlanCliente(c);
  let label = c.nombre;
  if(plan) label += ` (${plan.nombre})`;
  return label;
}