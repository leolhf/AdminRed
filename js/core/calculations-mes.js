// calculations-mes.js
// Cómputos financieros mensuales (ingresos, gastos, ganancia del mes)
// Depende de: state.js (clients, gastos, history, config),
//             calculations-clientes.js (getPrecioCliente, precioNetoCliente, facturacionIniciada)

// Ingresos del mes usando getPrecioCliente (respeta planes) y aplicando descuentos
// v5.8.0: usa precioNetoCliente, que ya incluye descuentos puntuales del mes.
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

// El paquete ya se marco como pagado este mes?
// v5.7.4: soporta pagos parciales. Ahora se considera "pagado" cuando la suma
// de todos los abonos de categoría 'paquete' del mes >= costo del mes.
// Se mantiene config.paquetePagadoMes como marca rápida (se setea al completar),
// pero la verificación principal es por acumulado, para que los abonos parciales
// múltiples funcionen correctamente incluso si la marca no se seteó.
const paquetePagadoEsteMes = ()=>{
  // Marca rápida: si config.paquetePagadoMes === mes, ya está pagado.
  if(config.paquetePagadoMes===mesActualHoy()) return true;
  // Verificación por acumulado: ¿la suma de abonos >= costo?
  return pagoPaqueteMes() >= costoMes();
};

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

const cobradoTotalMes = ()=>cobradoServiciosMes()+cobradoEquipoMes();

// Costo del paquete realmente pagado este mes (gastos de categoría 'paquete').
const costoPaqueteContadoMes = ()=>pagoPaqueteMes();

// Gastos operativos realmente pagados este mes (todas las categorías excepto
// 'paquete' que ya se cuenta aparte, 'inversion' que es capital, y 'rebaja'
// que es salida de capital no operativo).
const gastosOperativosRealesMes = ()=>gastosDelMes()
  .filter(g=>g.categoria!=='paquete' && g.categoria!=='inversion' && g.categoria!=='rebaja')
  .reduce((s,g)=>s+g.monto,0);

// Inversión de capital realmente pagada este mes (gastos de categoría 'inversion').
const inversionCapitalMes = ()=>gastosDelMes()
  .filter(g=>g.categoria==='inversion')
  .reduce((s,g)=>s+g.monto,0);

// Gastos reales del mes (operativos + inversión de capital + rebajas).
const gastosRealesMes = ()=>gastosOperativosRealesMes();

// Ganancia REAL del mes: lo que realmente entró en caja menos lo que realmente
// salió. A diferencia de ganancia() (proyección), esta refleja la caja real.
const gananciaReal    = ()=>cobradoTotalMes()-costoPaqueteContadoMes()-gastosRealesMes();

// gananciaRealAjustada(): versión ajustada que incluye la recuperación de
// inversión del mes (cuotas de equipo cobradas). Es coherente con gananciaAjustada().
const gananciaRealAjustada = ()=>gananciaReal();

// facturacionIniciada(): determina si el ciclo de facturación ya arrancó para
// un cliente. Un cliente NO debe nada del ciclo actual si:
// - Tiene fechaInicio futura (aún no ha empezado a facturar)
// - Está suspendido (no se le cobra mientras esté suspendido)
// Esto se usa para evitar que pendienteTotal() incluya clientes que aún no
// deben nada del ciclo actual, inflando el monto del "Pendiente" en el dashboard.
function facturacionIniciada(c) {
  if(c.fechaInicio){
    const hoy=new Date(); hoy.setHours(0,0,0,0);
    const inicio=new Date(c.fechaInicio+'T00:00:00');
    if(hoy<inicio) return false;
  }
  return true;
}

const pendienteTotal  = ()=>clients.filter(c=>!c.pagado && facturacionIniciada(c)).reduce((s,c)=>s+precioNetoCliente(c),0);