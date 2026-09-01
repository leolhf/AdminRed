/**
 * calculations.js — Cálculos de negocio puros (sin UI).
 * Funciones: estado de cliente, precios, mora, descuentos, snapshots, recibos.
 * Debe cargar antes de render.js (render usa estas funciones).
 */

RN.calc = RN.calc || {};

/** Devuelve el día de hoy (1-31). */
RN.calc.hoy = function () { return new Date(); };

/**
 * Devuelve el mes actual en formato YYYY-MM.
 * v5.13.20: El mes operativo SIEMPRE es el mes real del reloj del sistema.
 * Antes (v5.13.1) priorizaba RN.state.mesActual, lo que permitía adelantar
 * el mes operativo al cerrar mes. Pero esto causaba problemas: el usuario
 * podía quedarse estancado en un mes anterior (si no cerraba mes) o cerrar
 * dos veces el mismo mes (si lo adelantaba). Ahora mesActualStr() siempre
 * devuelve el mes del reloj, igual que mesRealStr(). El cierre de mes solo
 * genera el snapshot; el mes avanza automáticamente cuando cambia el calendario.
 */
RN.calc.mesActualStr = function () {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

/**
 * Establece RN.state.mesActual al mes del reloj del sistema.
 * v5.13.20: Ahora esto es redundante con mesActualStr() (que siempre usa el reloj),
 * pero se mantiene para compatibilidad y para sincronizar el campo guardado.
 */
RN.calc.sincronizarMesReal = function () {
  var d = new Date();
  RN.state.mesActual = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  return RN.state.mesActual;
};

/** Devuelve el mes REAL del reloj del sistema. v5.13.20: ahora idéntico a mesActualStr(). */
RN.calc.mesRealStr = function () {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
};

/** Mes actual en texto legible (ej: "agosto 2025"). */
RN.calc.mesTexto = function (ym) {
  const [y, m] = (ym || RN.calc.mesActualStr()).split('-').map(Number);
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${meses[m - 1]} ${y}`;
};

/** Días transcurridos desde el último pago del mes actual (o desde el día de pago). */
RN.calc.diasDesdePago = function (cliente) {
  const hoy = RN.calc.hoy();
  const diaPago = cliente.diaPago || 1;
  // Fecha del día de pago del mes actual
  const fechaPagoMes = new Date(hoy.getFullYear(), hoy.getMonth(), diaPago);
  if (hoy.getDate() < diaPago) {
    // aún no llegó el día de pago este mes: contar desde el mes anterior
    fechaPagoMes.setMonth(fechaPagoMes.getMonth() - 1);
  }
  return Math.floor((hoy - fechaPagoMes) / 86400000);
};

/**
 * Mes de inicio de cobro de un cliente: a partir de qué mes se le empieza a
 * esperar pago. v5.10.5. Orden de prioridad:
 *   1. cliente.mesInicio (campo explícito, "YYYY-MM")
 *   2. mes derivado de cliente.createdAt (mes de alta)
 *   3. mes actual (fallback seguro)
 */
RN.calc.mesInicioCliente = function (cliente) {
  if (!cliente) return RN.calc.mesActualStr();
  if (cliente.mesInicio && /^\d{4}-\d{2}$/.test(cliente.mesInicio)) return cliente.mesInicio;
  if (cliente.createdAt) {
    var d = new Date(cliente.createdAt);
    if (!isNaN(d.getTime())) return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  }
  return RN.calc.mesActualStr();
};

/**
 * Estado del cliente: por-iniciar / ok / warn / due / paid / parcial.
 * v5.10.5: añade "por-iniciar" (mes actual anterior al mes de inicio de cobro)
 * y redefine "due" como mora REAL (meses de atraso > 0).
 *  - por-iniciar: aún no le toca pagar (mes actual < mesInicio)
 *  - paid: tiene un cobro de servicio completo registrado en el mes actual
 *  - parcial: tiene un cobro de servicio pero el monto pagado es menor al neto a pagar
 *  - ok: al día (aún no llegó su día de pago este mes)
 *  - warn: pasó el día de pago pero dentro de gracia (≤ config.graciaDias, default 5)
 *  - due: atrasado / mora real (getMora > 0) o se pasó del día de pago + gracia este mes
 */
RN.calc.getStatus = function (cliente) {
  // v5.13.6 (BUG-6): clientes inactivos (activo === false) devuelven 'inactivo'
  // en vez de 'ok'. Antes devolvia 'ok' (al d\u00eda) para clientes dados de baja,
  // lo que mostraba badge verde en clientes inactivos.
  if (!cliente) return 'ok';
  if (cliente.activo === false) return 'inactivo';
  const mes = RN.calc.mesActualStr();

  // v5.10.5: si el mes actual es anterior al mes de inicio de cobro, no debe todavía.
  var mesInicio = RN.calc.mesInicioCliente(cliente);
  if (RN.calc.mesesEntre(mesInicio, mes) < 0) return 'por-iniciar';

  const cobrosMes = RN.state.history.filter(h =>
    h.clienteId === cliente.id && h.tipo === 'servicio' && h.mes === mes
  );
  if (cobrosMes.length > 0) {
    // v5.13.1: Bug #15 — coherencia confirmada con Bug #2.
    // h.monto es SIEMPRE solo servicio, netoEsperado también es solo servicio.
    const netoEsperado = RN.calc.getPrecioNeto(cliente, mes);
    const totalServicio = cobrosMes.reduce((s, h) => s + (h.monto || 0), 0);
    if (totalServicio >= netoEsperado - 0.01) return 'paid';
    return 'parcial';
  }

  // v5.10.5: si tiene mora real de meses anteriores, es 'due' aunque el día
  // de pago de este mes aún no haya llegado.
  if (RN.calc.getMora(cliente) > 0) return 'due';

  const gracia = RN.state.config.graciaDias || 5;
  const diaPago = cliente.diaPago || 1;
  const hoy = RN.calc.hoy();
  const diaHoy = hoy.getDate();
  const diff = diaHoy - diaPago;
  if (diff <= 0) return 'ok';
  if (diff <= gracia) return 'warn';
  return 'due';
};

/**
 * Meses de mora (atraso) real de un cliente. v5.10.5: corregido.
 * Mora = meses completos que el cliente DEBE sin pagar (excluyendo el mes
 * actual, que está en curso y se gestiona vía getStatus/diaPago/gracia):
 *   - Si ha pagado algún mes: meses posteriores al último pagado, menos 1
 *     (excluye el mes actual). Ej: pagó hasta junio, en septiembre → jul+ago = 2.
 *     Si el último pagado >= mes actual, mora = 0.
 *   - Si nunca ha pagado: meses desde su mesInicio (incluido como primer mes
 *     esperado) hasta el mes actual (excluido). Convención aprobada:
 *     mesInicio=2026-09 → sep:0, oct:1 (debe sep), nov:2 (debe sep+oct).
 *     Mínimo 0. Así un cliente dado de alta este mes o con mesInicio futuro
 *     no aparece como moroso.
 */
RN.calc.getMora = function (cliente) {
  const mes = RN.calc.mesActualStr();
  const pagados = RN.state.history
    .filter(h => h.clienteId === cliente.id && h.tipo === 'servicio')
    .map(h => h.mes);
  if (pagados.length > 0) {
    const ultimoPagado = pagados.sort().pop();
    if (ultimoPagado >= mes) return 0;
    // Meses debidos = meses posteriores al último pagado, excluyendo el mes
    // actual (en curso). Ej: pagó hasta junio, en septiembre debe jul+ago = 2.
    var d = RN.calc.mesesEntre(ultimoPagado, mes) - 1;
    return d > 0 ? d : 0;
  }
  // Nunca ha pagado: contar desde el mes de inicio de cobro (incluido como
  // primer mes esperado), excluyendo el mes actual (en curso).
  // Convención aprobada: mesInicio=2026-09 → sep:0, oct:1 (debe sep), nov:2 (debe sep+oct).
  var mesInicio = RN.calc.mesInicioCliente(cliente);
  var diff = RN.calc.mesesEntre(mesInicio, mes);
  return diff > 0 ? diff : 0;
};

/** Diferencia en meses entre dos YYYY-MM (b - a). */
RN.calc.mesesEntre = function (a, b) {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
};

/**
 * Deuda total de un cliente = servicio pendiente (mes actual + meses en mora)
 * + deuda de equipo. v5.13.1: Bug #4 — nueva función centralizada para que
 * todas las vistas (mora, cobranza, render, calendario) usen el mismo cálculo
 * en lugar de getPrecioNeto(c) sin mes + getCuotaEquipo dispersos.
 */
RN.calc.deudaTotalCliente = function (cliente, mes) {
  mes = mes || RN.calc.mesActualStr();
  var mora = RN.calc.getMora(cliente);
  var netoMes = RN.calc.getPrecioNeto(cliente, mes);
  var servicioPendiente = netoMes * (mora + 1);
  var deudaEquipo = RN.investment.getDeudaEquipoCliente(cliente);
  return +(servicioPendiente + deudaEquipo).toFixed(2);
};

/**
 * v5.13.7 (DUP-2): Resumen consolidado de un cliente para todas las vistas.
 * Centraliza estado, neto, cuota, deuda, mora y totales en un solo objeto
 * para evitar que cada vista recalcule por separado.
 */
RN.calc.resumenCliente = function (cliente, mes) {
  mes = mes || RN.calc.mesActualStr();
  var estado = RN.calc.getStatus(cliente);
  var neto = RN.calc.getPrecioNeto(cliente, mes);
  var cuotaEq = RN.investment.getCuotaEquipoCliente(cliente);
  var deuda = RN.investment.getDeudaEquipoCliente(cliente);
  var mora = RN.calc.getMora(cliente);
  var totalMes = neto + cuotaEq;
  var totalDeuda = RN.calc.deudaTotalCliente(cliente, mes);
  return { estado: estado, neto: neto, cuotaEq: cuotaEq, deuda: deuda, mora: mora, totalMes: totalMes, totalDeuda: totalDeuda, mes: mes };
};

/** Mes anterior a un YYYY-MM. */
RN.calc.mesAnterior = function (ym) {
  let [y, m] = ym.split('-').map(Number);
  m--; if (m < 1) { m = 12; y--; }
  return y + '-' + String(m).padStart(2, '0');
};

/** Mes siguiente a un YYYY-MM. */
RN.calc.mesSiguiente = function (ym) {
  let [y, m] = ym.split('-').map(Number);
  m++; if (m > 12) { m = 1; y++; }
  return y + '-' + String(m).padStart(2, '0');
};

/** Precio mensual del plan de un cliente (busca por planId o usa precio directo). */
RN.calc.getPrecioBase = function (cliente) {
  if (cliente.planId) {
    const plan = RN.state.planes.find(p => p.id === cliente.planId);
    if (plan) return plan.precio;
  }
  return cliente.precio || 0;
};

/** Descuento recurrente (permanente por cliente) en CUP. */
RN.calc.getDescuentoRecurrente = function (cliente) {
  return cliente.descuentoRecurrente || 0;
};

/**
 * Descuentos puntuales del mes para un cliente (suma de valores en CUP).
 * Solo los que están "aplicado" o "pendiente" (no anulados).
 */
RN.calc.getDescuentosPuntualesMes = function (clienteId, mes) {
  mes = mes || RN.calc.mesActualStr();
  let total = 0;
  RN.state.descuentos.forEach(d => {
    // v5.12.5: los descuentos soloPago pendientes se aplican a cualquier mes (próximo cobro)
    if (d.clienteId === clienteId && d.estado !== 'anulado' && (d.mes === mes || (d.soloPago && d.estado === 'pendiente'))) {
      total += RN.calc.valorDescuento(d, clienteId);
    }
  });
  return total;
};

/** Calcula el valor en CUP de un descuento puntual según su modo. */
RN.calc.valorDescuento = function (d, clienteId) {
  const cliente = RN.state.clients.find(c => c.id === clienteId);
  const base = cliente ? RN.calc.getPrecioBase(cliente) : 0;
  switch (d.modo) {
    case 'fijo': return d.valor || 0;
    case 'porcentaje': return +(base * (d.valor || 0) / 100).toFixed(2);
    case 'dias': {
      // proporcional a días sin servicio sobre los días base del mes
      const dias = RN.state.config.diasBaseMes || 30;
      return +((base / dias) * (d.valor || 0)).toFixed(2);
    }
    default: return 0;
  }
};

/**
 * Precio neto a cobrar = precioBase - descuentoRecurrente - descuentosPuntuales.
 * Nunca negativo.
 */
RN.calc.getPrecioNeto = function (cliente, mes) {
  const base = RN.calc.getPrecioBase(cliente);
  const rec = RN.calc.getDescuentoRecurrente(cliente);
  const punt = RN.calc.getDescuentosPuntualesMes(cliente.id, mes);
  return Math.max(0, +(base - rec - punt).toFixed(2));
};

/** Próximo número de recibo (R-YYYY-0000). */
RN.calc.proxReciboNum = function () {
  const y = new Date().getFullYear();
  let counter = RN.state.reciboCounter || 0;
  counter++;
  return 'R-' + y + '-' + String(counter).padStart(4, '0');
};

/** Genera un ID único. */
RN.calc.uid = function (prefix) {
  return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
};

/** Formatea un número como moneda CUP. */
RN.calc.formatCUP = function (n) {
  return (+n || 0).toLocaleString('es-CU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' CUP';
};

/** Formatea como USD informativo (requiere tasa configurada). */
RN.calc.formatUSD = function (cup) {
  const tasa = RN.state.config.tasaUsd || 0;
  if (!tasa) return '';
  return '$' + (cup / tasa).toFixed(2) + ' USD';
};

/** Total ingresos del mes (cobros de servicio + equipo). */
RN.calc.ingresosMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.state.history
    .filter(h => h.mes === mes)
    .reduce((s, h) => s + (h.monto || 0) + (h.montoEquipo || 0), 0);
};

/**
 * v5.13.6 (BUG-5): Ingresos SOLO de servicio del mes (sin equipo ni mora de
 * otros meses). Se usa para calcular la tasa de cobro real del mes, comparando
 * lo cobrado en servicio contra lo esperado. Antes se usaba ingresosMes() que
 * incluye h.montoEquipo y cobros de meses anteriores, lo que podía hacer que
 * la tasa de cobro superara el 100% de forma engañosa.
 */
RN.calc.ingresosServicioMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.state.history
    .filter(h => h.mes === mes && h.tipo === 'servicio')
    .reduce((s, h) => s + (h.monto || 0), 0);
};

/** Total ingresos históricos. */
RN.calc.ingresosTotales = function () {
  return RN.state.history.reduce((s, h) => s + (h.monto || 0) + (h.montoEquipo || 0), 0);
};

/** Total gastos históricos. */
RN.calc.gastosTotales = function () {
  return RN.state.gastos.reduce((s, g) => s + (g.monto || 0), 0);
};

/** Excedentes (vueltos) totales entregados a clientes. */
RN.calc.excedentesTotales = function () {
  return RN.state.history.reduce(function (s, h) { return s + (h.excedente || 0); }, 0);
};

/**
 * Fondo de caja automatico = saldo inicial + ingresos reales - gastos.
 * v5.10.1: Los ingresos (h.monto) ya registran solo el neto cobrado (no el total
 * pagado por el cliente). El excedente (vuelto) es dinero que entra y sale
 * inmediatamente, por lo que NO se resta del fondo. Antes se restaba, lo que
 * hacía que el fondo bajara cada vez que un cliente pagaba con vuelto.
 */
RN.calc.fondoCaja = function () {
  var saldoInicial = RN.state.config.fondoInicial || 0;
  var ingresos = RN.calc.ingresosTotales();
  var gastos = RN.calc.gastosTotales();
  return +((saldoInicial + ingresos - gastos).toFixed(2));
};

/** Gastos del mes. */
RN.calc.gastosMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  // v5.13.1: Bug #9 — simplificada la lógica de filtrado.
  var mesNorm = mes.slice(0, 7);
  return RN.state.gastos.filter(function (g) { return (g.mes || '').slice(0, 7) === mesNorm; })
    .reduce(function (s, g) { return s + (g.monto || 0); }, 0);
};

/** Pago al proveedor de internet del mes indicado (o null si no hay). v5.8.6 */
RN.calc.pagoProveedorMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.state.gastos.find(g => g.esPagoProveedor && (g.mes || '').slice(0, 7) === mes.slice(0, 7)) || null;
};

/** Monto del paquete del proveedor según la config (megas × precio por mega). v5.8.6 */
RN.calc.montoPaqueteProveedor = function () {
  const cfg = RN.state.config;
  const megas = +cfg.proveedorMegas || 0;
  const precio = +cfg.proveedorPrecioMega || 0;
  return +(megas * precio).toFixed(2);
};

/** Megas del plan de un cliente (busca por planId o usa campo megas directo). v5.8.7 */
RN.calc.getMegasCliente = function (cliente) {
  if (cliente && cliente.planId) {
    const plan = RN.state.planes.find(p => p.id === cliente.planId);
    if (plan) return +plan.megas || 0;
  }
  return +cliente.megas || 0;
};

/** Suma de megas vendidos a clientes activos. v5.8.7 */
RN.calc.megasVendidos = function () {
  return RN.calc.clientesActivos().reduce((s, c) => s + RN.calc.getMegasCliente(c), 0);
};

/** Tope vendible = megas del paquete del proveedor + sobreventa. v5.8.7 */
RN.calc.topeMegas = function () {
  const cfg = RN.state.config;
  return (+cfg.proveedorMegas || 0) + (+cfg.sobreventaMegas || 0);
};

/**
 * Estado de capacidad de la red respecto al paquete del proveedor. v5.8.7
 * Devuelve { paquete, sobreventa, tope, vendidos, excedido, pct }.
 * pct = porcentaje de uso del tope (0 si no hay tope).
 */
RN.calc.estadoCapacidad = function () {
  const cfg = RN.state.config;
  const paquete = +cfg.proveedorMegas || 0;
  const sobreventa = +cfg.sobreventaMegas || 0;
  const tope = paquete + sobreventa;
  const vendidos = RN.calc.megasVendidos();
  const excedido = tope > 0 && vendidos > tope;
  const pct = tope > 0 ? Math.min(100, Math.round(vendidos / tope * 100)) : 0;
  return { paquete, sobreventa, tope, vendidos, excedido, pct };
};

/** Utilidad neta del mes = ingresos - gastos. */
RN.calc.utilidadMes = function (mes) {
  return RN.calc.ingresosMes(mes) - RN.calc.gastosMes(mes);
};

/** Clientes activos. */
RN.calc.clientesActivos = function () {
  return RN.state.clients.filter(c => c.activo !== false);
};

/** Cobranza del mes: cuántos clientes ya pagaron. */
RN.calc.cobranzaMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  const activos = RN.calc.clientesActivos();
  const pagaron = activos.filter(c =>
    RN.state.history.some(h => h.clienteId === c.id && h.tipo === 'servicio' && h.mes === mes)
  );
  const parciales = activos.filter(c => RN.calc.getStatus(c) === 'parcial');
  return { total: activos.length, pagaron: pagaron.length, faltan: activos.length - pagaron.length, parciales: parciales.length };
};

/** Snapshot de KPIs del mes (inmutable, para cierre de mes). */
RN.calc.generarSnapshot = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  const cob = RN.calc.cobranzaMes(mes);
  return {
    mes,
    fecha: new Date().toISOString(),
    ingresos: RN.calc.ingresosMes(mes),
    gastos: RN.calc.gastosMes(mes),
    utilidad: RN.calc.utilidadMes(mes),
    clientesTotal: cob.total,
    clientesPagaron: cob.pagaron,
    clientesFaltan: cob.faltan,
    tasaCobranza: cob.total ? +(cob.pagaron / cob.total * 100).toFixed(1) : 0
  };
};

/** Ingreso mensual esperado (suma de precios netos de todos los activos). */
RN.calc.ingresoEsperadoMes = function (mes) {
  mes = mes || RN.calc.mesActualStr();
  return RN.calc.clientesActivos().reduce((s, c) => s + RN.calc.getPrecioNeto(c, mes), 0);
};

/** Datos para tendencia: ingresos por mes de los últimos N meses. */
RN.calc.tendenciaMensual = function (n) {
  n = n || 6;
  let mes = RN.calc.mesActualStr();
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = RN.calc.restarMeses(mes, i);
    out.push({ mes: m, ingresos: RN.calc.ingresosMes(m), gastos: RN.calc.gastosMes(m) });
  }
  return out;
};

/** Resta N meses a un YYYY-MM. */
RN.calc.restarMeses = function (ym, n) {
  let [y, m] = ym.split('-').map(Number);
  for (let i = 0; i < n; i++) { m--; if (m < 1) { m = 12; y--; } }
  return y + '-' + String(m).padStart(2, '0');
};

/**
 * Predicción de ingresos del próximo mes.
 * v5.13.1: Bug #10 — mejorada con regresión lineal sobre los últimos 6 meses.
 */
RN.calc.prediccionIngresos = function () {
  var t = RN.calc.tendenciaMensual(6);
  if (!t.length) return 0;
  if (t.length < 2) return +t[0].ingresos.toFixed(2);
  var n = t.length;
  var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (var i = 0; i < n; i++) {
    var x = i;
    var y = t[i].ingresos;
    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
  }
  var denom = n * sumX2 - sumX * sumX;
  var b, a;
  if (denom === 0) { b = 0; a = sumY / n; }
  else { b = (n * sumXY - sumX * sumY) / denom; a = (sumY - b * sumX) / n; }
  var prediccion = a + b * n;
  if (prediccion < 0) prediccion = 0;
  return +prediccion.toFixed(2);
};


// v5.13.9 (DUP-1): Helper para obtener el total de un cobro del historial.
// Centraliza el patron repetido ~8 veces: h.totalCUP || (h.monto + h.montoEquipo)
RN.calc.totalCobro = function (h) {
  return h.totalCUP || ((h.monto || 0) + (h.montoEquipo || 0));
};

// v5.13.9 (DUP-3): Helper para buscar un cliente por ID.
// Centraliza el patron RN.state.clients.find(c => c.id === id) repetido decenas de veces.
RN.calc.clientePorId = function (id) {
  if (!id) return null;
  for (var i = 0; i < RN.state.clients.length; i++) {
    if (RN.state.clients[i].id === id) return RN.state.clients[i];
  }
  return null;
};
