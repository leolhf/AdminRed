// calculations.js
// Cómputos financieros y de estado del cliente (totales, mora, formato).

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
// Precio neto mensual de un cliente (precio base menos descuento).
// Centraliza el calculo para que todas las funciones usen el mismo valor.
function precioNetoCliente(c) {
  const precioMes = (c.megas||0) * getPrecioCliente(c);
  return Math.max(0, precioMes - calcularDescuento(c, precioMes));
}
// Ingresos del mes usando getPrecioCliente (respeta planes) y aplicando descuentos
const ingresosMes     = ()=>clients.filter(c=>c.megas&&getPrecioCliente(c)).reduce((s,c)=>s+precioNetoCliente(c),0);
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
const gastosDelMesSinPaquete = ()=>gastosDelMes().filter(g=>g.categoria!=='paquete');
// gastosOperativosMes(): gastos del mes que SÍ son operativos (descuentan de la
// ganancia proyectada): 'operativo', 'crecimiento' y cualquier categoría nueva
// que no sea 'paquete' (costo del servicio, contado aparte vía costoMes()),
// 'inversion' (compra de equipo/lote — es capital, se recupera por cuotas/ventas)
// ni 'rebaja' (baja de inventario — salida de capital, no operativo).
// Esto evita que una compra de equipo reste de la ganancia del mes en curso.
const gastosOperativosMes = ()=>gastosDelMes()
  .filter(g=>g.categoria!=='paquete' && g.categoria!=='inversion' && g.categoria!=='rebaja')
  .reduce((s,g)=>s+g.monto,0);

// totalGastos() ahora devuelve SOLO los operativos del mes (sin paquete ni
// inversión/rebaja), para que ganancia() no reste dos veces el capital ni el
// costo del servicio contratado. Se mantiene el nombre por compatibilidad con
// los consumidores (render.js, salud.js, reporte-mensual.js, gastos.js).
const totalGastos     = ()=>gastosOperativosMes();
// totalGastosIncluyendoInversion(): conserva el comportamiento anterior para
// los sitios que genuinamente quieren ver la salida total de caja del mes
// (incluyendo capital invertido). No se usa en ganancia()/gananciaReal().
const totalGastosIncluyendoInversion = ()=>gastosDelMesSinPaquete().reduce((s,g)=>s+g.monto,0);

// Monto del gasto de paquete registrado este mes (lo que se pago al proveedor en
// caja). Se usa en el "libro de caja" real, no en la proyeccion de ganancia.
const pagoPaqueteMes  = ()=>gastosDelMes().filter(g=>g.categoria==='paquete').reduce((s,g)=>s+g.monto,0);
// El paquete ya se marco como pagado este mes? (config.paquetePagadoMes === mes actual)
const paquetePagadoEsteMes = ()=>config.paquetePagadoMes===mesActualHoy();

const ganancia        = ()=>ingresosMes()-costoMes()-totalGastos();
const gananciaMensual  = ()=>ingresosMes()-costoMes();
const cobrado         = ()=>clients.filter(c=>c.pagado).reduce((s,c)=>s+precioNetoCliente(c),0);

// ===========================================================================
//  LIBRO DE CAJA REAL DEL MES (v5.7)
// ===========================================================================
// Lo que REALMENTE entro y salio de caja este mes, registrado a medida que se
// cobra y se paga. A diferencia de la proyeccion (ganancia/ingresosMes) que usa
// el ingreso esperado de todos los clientes, estas funciones reflejan la caja.

// Servicios realmente cobrados este mes: solo la parte de servicio (sin cuota
// de equipo) de los cobros de 'servicio' con fecha dentro del mes en curso.
const cobradoServiciosMes = ()=>history
  .filter(h=>(!h.tipo || h.tipo==='servicio') && (!config.mesActual || (h.fecha||'').startsWith(config.mesActual)))
  .reduce((s,h)=>s+Math.max(0,(h.monto||0)-(h.montoEquipo||0)),0);

// Cuotas de equipo realmente cobradas este mes (history[].montoEquipo del mes),
// incluidas liquidaciones de deuda de equipo.
const cobradoEquipoMes = ()=>history
  .filter(h=>(!config.mesActual || (h.fecha||'').startsWith(config.mesActual)))
  .reduce((s,h)=>s+(h.montoEquipo||0),0);

// Total realmente cobrado este mes (servicios + equipo).
const cobradoTotalMes = ()=>cobradoServiciosMes()+cobradoEquipoMes();

// Costo del paquete realmente pagado este mes (lo que salio al proveedor).
// Si aun no se marco pagado, es 0 (no ha salido de caja).
const costoPaqueteContadoMes = ()=>pagoPaqueteMes();

// Gastos realmente pagados este mes EXCLUYENDO el paquete (que se cuenta aparte
// como costoPaqueteContadoMes) y EXCLUYENDO la inversión de capital (categoría
// 'inversion' y 'rebaja' de inventario). La inversión de equipo/lote es salida
// de capital, NO gasto operativo: si se restara de la "ganancia neta real
// (caja)", cada compra de equipo rebajaría la caja del mes sin distinguirla del
// consumo operativo, mezclando conceptos. La inversión del mes se expone por
// separado vía inversionCapitalMes() para que el admin la vea, pero no contamina
// el flujo de caja operativo (gananciaReal).
const gastosOperativosRealesMes = ()=>gastosDelMes()
  .filter(g=>g.categoria!=='paquete' && g.categoria!=='inversion' && g.categoria!=='rebaja')
  .reduce((s,g)=>s+g.monto,0);

// Salida de CAPITAL este mes: gastos de categoría 'inversion' (compra de equipo
// o lote de inventario) y 'rebaja' (baja de inventario por deterioro/pérdida/robo).
// Es dinero que salió de caja pero NO es gasto operativo: se recupera después vía
// cuotas de equipo o ventas de inventario. Se muestra aparte en el libro de caja.
const inversionCapitalMes = ()=>gastosDelMes()
  .filter(g=>g.categoria==='inversion' || g.categoria==='rebaja')
  .reduce((s,g)=>s+g.monto,0);

// Compatibilidad: gastosRealesMes() seguía sumando TODO (incluida inversión).
// Se mantiene el nombre para no romper llamadas externas, pero ahora devuelve
// SOLO los gastos operativos reales (sin paquete ni inversión), coherente con
// gananciaReal(). La inversión del mes se consulta con inversionCapitalMes().
const gastosRealesMes = ()=>gastosOperativosRealesMes();

// GANANCIA NETA REAL (caja operativa): dinero que entró − dinero que salió
// POR OPERACIÓN este mes. Entradas: cobrado servicios + cobrado equipo
// (recuperación de inversión). Salidas: pago del paquete al proveedor + gastos
// operativos del mes. NO resta la inversión de capital del mes (compra de
// equipo/lote/rebaja): esa es salida de capital que se recupera después por
// cuotas/ventas, no gasto operativo. La inversión del mes se ve aparte con
// inversionCapitalMes() para no mezclar capital con flujo operativo.
// Refleja la caja real, no la proyección. Crece a medida que cobras/pagas.
const gananciaReal    = ()=>cobradoTotalMes()-costoPaqueteContadoMes()-gastosRealesMes();
// Ganancia real ajustada ya incluye la recuperacion de equipo (esta dentro de
// cobradoEquipoMes), por lo que NO se le suma recuperadoInversionMes de nuevo.
const gananciaRealAjustada = ()=>gananciaReal();
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
const pendienteTotal  = ()=>clients.filter(c=>!c.pagado && facturacionIniciada(c)).reduce((s,c)=>s+precioNetoCliente(c),0);

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

// ───────────────────────────────────────────────────────────────────────────
//  RESUMEN UNIFICADO DE INVERSIÓN (v5.7.1)
// ───────────────────────────────────────────────────────────────────────────
//  El sistema maneja TRES modelos de inversión que NO deben mezclarse ni
//  contabilizarse dos veces:
//
//  1) INVERSIONES PERSONALES (investments[]): capital propio en infraestructura
//     (ej. una antena, un router core). Los clientes vinculados NO generan
//     deuda; solo aportan su ganancia neta de servicio para PROYECTAR en cuántos
//     meses se recupera el capital. Su recuperación NO se registra en
//     history.montoEquipo (es una proyección, no un cobro de deuda).
//
//  2) DEUDA DE EQUIPO (clients[].deudaEquipo): compra puntual de equipo para un
//     cliente, que la paga por cuotas mensuales junto al servicio. Sí genera un
//     cobro real (history.montoEquipo en cada abono/liquidación).
//
//  3) INVENTARIO COMPARTIDO (inventario[] + asignacionesInventario[]): compra de
//     un lote de material (cable, conectores) que se va vendiendo a clientes. Si
//     se vende "al momento" genera un cobro history.montoEquipo de inmediato; si
//     se vende "a plazo" crea deudaEquipo del cliente y se cobra después por
//     cuotas (también history.montoEquipo).
//
//  El problema anterior: la sección "Recuperación de inversión" de Estadísticas
//  sumaba investments[].costoTotal + inventario[].montoTotal como "total
//  invertido", pero calculaba "recuperado" a partir de history.montoEquipo — que
//  SOLO incluye cobros de los modelos 2 y 3, NO del modelo 1 (proyección). El % de
//  recuperación quedaba distorsionado: el capital de inversiones personales
//  (modelo 1) aparecía como "nunca recuperado" aunque su proyección dijera lo
//  contrario, y los cobros de inventario se podían contar dos veces (una en
//  recuperadoInversion() y otra en el filter por nota '📦').
//
//  resumenInversion() devuelve una estructura CONSISTENTE que separa cada modelo,
//  suma cada "recuperado" de su fuente correcta, y evita el doble conteo. Es la
//  única fuente de verdad para cualquier UI que muestre recuperación de capital.
function resumenInversion() {
  // --- Modelo 1: inversiones personales (proyección, sin cobros de deuda) ---
  const invPersonales = (investments || []).filter(i => i.activo !== false);
  const capitalPersonalTotal = invPersonales.reduce((s,i)=>s+(i.costoTotal||0),0);
  // Recuperación PROYECTADA de inversiones personales: suma el recuperadoEstimado
  // de cada una (ganancia neta de servicio realmente cobrada a los vinculados).
  // NO usa history.montoEquipo (esos cobros son de deuda de equipo/inventario).
  const recuperadoPersonal = invPersonales.reduce((s,i)=>{
    try { return s + (proyeccionInversion(i).recuperadoEstimado||0); }
    catch(e){ return s; }
  },0);

  // --- Modelos 2 y 3: deuda de equipo + inventario (cobros reales via montoEquipo) ---
  // Capital total efectivamente invertido en equipo/lotes (gastos 'inversion' de
  // toda la vida, que month-reset.js conserva). Se reconstruye desde gastos para
  // incluir tanto deuda de equipo puntual como lotes de inventario.
  const capitalEquipoTotal = gastos
    .filter(g=>g.categoria==='inversion')
    .reduce((s,g)=>s+(g.monto||0),0);
  // Recuperación REAL de equipo + inventario: todo history.montoEquipo de toda la
  // vida (abonos de cuota, liquidaciones, ventas de inventario al momento). Es la
  // única fuente coherente para los modelos que sí generan cobro de deuda.
  const recuperadoEquipo = history.reduce((s,h)=>s+Number(h.montoEquipo||0),0);

  // --- Pendiente por recuperar (solo modelos 2 y 3 generan deuda cobrable) ---
  // Deuda de equipo activa de clientes (modelo 2 + ventas de inventario a plazo
  // que se materializaron como deudaEquipo).
  const pendienteEquipo = deudaEquipoPendienteTotal();
  // Ventas de inventario a plazo pendientes (modelo 3 a plazo, reflejo en
  // asignacionesInventario). NOTA: estas YA están incluidas en deudaEquipo del
  // cliente (asignarConsumoInventario las suma a c.deudaEquipo), así que NO se
  // suman de nuevo para evitar doble conteo del pendiente.
  const pendienteTotal = pendienteEquipo;

  // --- Totales consolidados ---
  const capitalTotal = capitalPersonalTotal + capitalEquipoTotal;
  const recuperadoTotal = recuperadoPersonal + recuperadoEquipo;
  const pct = capitalTotal>0 ? Math.min(100, Math.round(recuperadoTotal/capitalTotal*100)) : 0;

  return {
    // Modelo 1 — personales (proyección)
    capitalPersonalTotal, recuperadoPersonal,
    pctPersonal: capitalPersonalTotal>0 ? Math.min(100, Math.round(recuperadoPersonal/capitalPersonalTotal*100)) : 0,
    nPersonales: invPersonales.length,
    // Modelos 2+3 — equipo + inventario (cobros reales)
    capitalEquipoTotal, recuperadoEquipo, pendienteEquipo,
    pctEquipo: capitalEquipoTotal>0 ? Math.min(100, Math.round(recuperadoEquipo/capitalEquipoTotal*100)) : 0,
    // Consolidado
    capitalTotal, recuperadoTotal, pendienteTotal, pct
  };
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

// ─────────────────────────────────────────────────────────────────────
// COBRANZA POR CORTES (v5.5.1)
// ─────────────────────────────────────────────────────────────────────
// Muchos ISP no cobran a todos sus clientes el mismo día, sino en "cortes"
// o tandas (ej. días 1-5, 10-15, 20-25). La métrica de cobranza del
// dashboard de salud marcaba "Crítico" a mitad de mes porque dividía los
// clientes pagados entre TODOS los clientes — incluyendo los de cortes
// cuyo día de pago aún no llegó. No es justo evaluar la cobranza contra
// clientes que todavía no tenían que pagar.
//
// Estas funciones identifican qué clientes ya deberían haber pagado a la
// fecha de hoy (su día de pago ya llegó o pasó este ciclo), para que la
// tasa de cobro se calcule solo sobre los clientes "esperados" y no sobre
// el total mensual.

// ¿El día de pago de este cliente ya llegó (o ya pasó) en el ciclo actual?
// Un cliente pagado SIEMPRE cuenta como "ya le tocaba pagar" (porque pagó).
// Un cliente no pagado cuenta si su día de pago ya llegó (getStatus !== 'ok').
// Los clientes no pagados cuyo día de pago es futuro (getStatus === 'ok')
// NO cuentan — todavía no era su turno.
function cobroVencidoHoy(c) {
  if(!c.megas) return false; // sin megas, no se le cobra servicio
  if(!facturacionIniciada(c)) return false; // cliente futuro (fechaInicio > hoy)
  if(c.pagado) return true; // ya pagó → su corte ya pasó
  return getStatus(c) !== 'ok'; // día de pago ya llegó/pasó
}

// Clientes que ya deberían haber pagado a la fecha de hoy (numerador y
// denominador de la tasa de cobro realista).
const clientesEsperadosCobro = ()=>clients.filter(cobroVencidoHoy);

// Cuánto dinero se ESPERA haber cobrado a la fecha de hoy: la suma de
// precioNetoCliente(c) solo de los clientes cuyo corte ya llegó.
const ingresosEsperadosHoy = ()=>clientesEsperadosCobro().reduce((s,c)=>s+precioNetoCliente(c),0);

// Cuánto se ha cobrado de los clientes cuyo corte ya llegó (pagados al corte).
const cobradoAlCorte = ()=>clientesEsperadosCobro().filter(c=>c.pagado).reduce((s,c)=>s+precioNetoCliente(c),0);

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
  // v5.7.1: separar el gasto del snapshot en tres bloques coherentes con el
  // modelo de caja:
  //  - pagoPaqueteMesSnap: gasto 'paquete' (costo del servicio al proveedor).
  //  - gastosOperativosMesSnap: 'operativo'/'crecimiento' (consumo del mes).
  //  - inversionCapitalMesSnap: 'inversion'/'rebaja' (salida de capital, se
  //    recupera después, NO descuenta de la ganancia operativa del mes).
  // Antes totalGastosMes incluía inversión/rebaja, lo que hacía que la
  // "ganancia" del snapshot restara el capital invertido ese mes igual que un
  // gasto operativo, mezclando conceptos. Ahora ganancia y gananciaReal del
  // snapshot solo restan operativos; el capital se guarda aparte.
  const pagoPaqueteMesSnap = gastosMes.filter(g=>g.categoria==='paquete').reduce((s,g)=>s+(g.monto||0),0);
  const totalGastosMes = gastosMes.filter(g=>g.categoria!=='paquete' && g.categoria!=='inversion' && g.categoria!=='rebaja').reduce((s,g)=>s+(g.monto||0),0);
  const inversionCapitalMesSnap = gastosMes.filter(g=>g.categoria==='inversion' || g.categoria==='rebaja').reduce((s,g)=>s+(g.monto||0),0);
  const nClientes = clients.length;
  const nPagados = clients.filter(c=>c.pagado).length;
  const nConMora = clients.filter(c=>getMora(c)>0).length;
  const ing = ingresosMes();
  const costo = costoMes();
  const gan = ing - costo - totalGastosMes;          // proyeccion operativa (sin doble descuento ni capital)
  const cobradoReal = cobrado();
  const tasaCobro = ing>0 ? Math.round(cobradoReal/ing*100) : 0;
  // v5.7.1: caja real operativa del mes del snapshot (sin restar capital invertido)
  const cobradoServSnap = cobrosMes.filter(h=>!h.tipo||h.tipo==='servicio').reduce((s,h)=>s+Math.max(0,(h.monto||0)-(h.montoEquipo||0)),0);
  const gananciaRealSnap = (cobradoServSnap + totalCobradoEquipo) - pagoPaqueteMesSnap - totalGastosMes;

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
    cobrado: cobradoReal,
    cobradoEquipo: totalCobradoEquipo,
    pendiente: pendienteTotal(),
    // v5.7: campos de caja real del mes
    pagoPaquete: pagoPaqueteMesSnap,
    gananciaReal: gananciaRealSnap,
    // v5.7.1: capital invertido este mes (compra de equipo/lote/rebaja). Salida
    // de caja que NO es gasto operativo y se recupera después. Se guarda aparte
    // para no contaminar la ganancia operativa y poder mostrarlo en reportes.
    inversionCapitalMes: inversionCapitalMesSnap,
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

