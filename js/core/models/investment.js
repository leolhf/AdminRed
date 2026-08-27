/**
 * models/investment.js — Modelo de deuda de equipo / recuperación de inversión.
 * Debe cargar antes de render.js, inversion.js y migration.js.
 * Nota de diseño: deudaEquipo se modela como número simple (saldo pendiente).
 *
 * v5.11.3 — Recuperación basada en GANANCIA REAL (margen neto):
 *   - El aporte de cada cliente a la recuperación descuenta el costo del mega
 *     que a mí me cuesta proveer el servicio (proveedorPrecioMega × megas).
 *   - Se aplica un % de ganancia personal (config.pctPersonalInversion) que se
 *     retiene y NO computa como recuperación de capital.
 *   - El campo "recuperado" pasa a ser AUTOMÁTICO (suma de aportes netos
 *     reales desde la fecha de compra), no manual.
 */

RN.investment = RN.investment || {};

/**
 * v5.12.2 — Normaliza una fecha a medianoche LOCAL en milisegundos.
 * Evita el bug de zona horaria donde new Date("2025-06-15") se interpreta como
 * UTC medianoche, pero los cobros tienen horas locales. Al normalizar ambos
 * lados a medianoche local, la comparación t >= desde incluye correctamente
 * los cobros del mismo día de la compra.
 * @param {string|Date} f — fecha (YYYY-MM-DD o ISO)
 * @returns {number} timestamp en ms a medianoche local, o 0 si inválida
 */
RN.investment._medianocheLocal = function (f) {
  if (!f) return 0;
  var d = new Date(f);
  if (isNaN(d.getTime())) {
    // Intentar parsear como YYYY-MM-DD
    var parts = String(f).slice(0, 10).split('-');
    if (parts.length === 3) d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
  }
  if (isNaN(d.getTime())) return 0;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Saldo pendiente de deuda de equipo de un cliente. Exige deudaEquipo > 0 explícitamente. */
RN.investment.getDeudaEquipoCliente = function (cliente) {
  if (!cliente) return 0;
  if (typeof cliente.deudaEquipo !== 'number') return 0;
  return cliente.deudaEquipo > 0 ? cliente.deudaEquipo : 0;
};

/** Cuota mensual de equipo de un cliente (si tiene deuda y cuota definida). */
RN.investment.getCuotaEquipoCliente = function (cliente) {
  if (RN.investment.getDeudaEquipoCliente(cliente) <= 0) return 0;
  return cliente.cuotaEquipo || 0;
};

/** Progreso de pago de equipo de un cliente (0-100). */
RN.investment.getProgresoEquipoCliente = function (cliente) {
  const deuda = RN.investment.getDeudaEquipoCliente(cliente);
  if (deuda <= 0) return 100;
  const original = cliente.deudaEquipoOriginal || deuda;
  if (original <= 0) return 100;
  const pagado = original - deuda;
  return Math.max(0, Math.min(100, Math.round(pagado / original * 100)));
};

/** Inversión personal: total invertido. */
RN.investment.totalInvertido = function () {
  return RN.state.investments.reduce((s, i) => s + (i.monto || 0), 0);
};

/**
 * Inversión personal: total recuperado (AUTOMÁTICO, v5.11.3).
 * = suma del recuperado real de cada inversión (aporte neto de los clientes
 * vinculados desde la fecha de compra, descontando costo del mega y retención
 * personal). Para inversiones sin clientes vinculados, conserva el valor
 * manual histórico inv.recuperado.
 */
RN.investment.totalRecuperado = function () {
  const self = this;
  return RN.state.investments.reduce((s, i) => s + self.recuperadoRealInv(i), 0);
};

/** Porcentaje global de recuperación (basado en el recuperado automático). */
RN.investment.porcentajeRecuperacion = function () {
  const total = RN.investment.totalInvertido();
  if (!total) return 0;
  return +(RN.investment.totalRecuperado() / total * 100).toFixed(1);
};

/**
 * Proyecta la fecha de recuperación total de una inversión según el aporte
 * neto mensual de los clientes vinculados (v5.11.3: usa ganancia real, no bruta).
 */
RN.investment.proyectarRecuperacion = function (inv) {
  const restante = (inv.monto || 0) - RN.investment.recuperadoRealInv(inv);
  const aporteMensual = RN.investment.aporteMensualNeto(inv);
  if (restante <= 0) return 'Recuperada';
  if (aporteMensual <= 0) return '—';
  const meses = Math.ceil(restante / aporteMensual);
  const dias = Math.ceil(restante / (aporteMensual / 30));
  const fecha = new Date();
  fecha.setMonth(fecha.getMonth() + meses);
  const fechaTxt = fecha.toLocaleDateString('es-CU', { month: 'long', year: 'numeric' });
  return 'Faltan ' + meses + ' mes' + (meses === 1 ? '' : 'es') + ' (≈' + dias + ' días) · ' + fechaTxt;
};

/**
 * v5.12.1 — Meses restantes para recuperar la inversión (número entero).
 * Devuelve null si no se puede calcular (sin aporte mensual o ya recuperada).
 */
RN.investment.mesesParaRecuperar = function (inv) {
  const restante = (inv.monto || 0) - RN.investment.recuperadoRealInv(inv);
  if (restante <= 0) return 0;
  const aporteMensual = RN.investment.aporteMensualNeto(inv);
  if (aporteMensual <= 0) return null;
  return Math.ceil(restante / aporteMensual);
};

/**
 * v5.11.0 — Fecha de compra de la inversión (YYYY-MM-DD o ISO).
 * Si no existe, se deduce del campo fecha de creación.
 */
RN.investment.fechaCompra = function (inv) {
  if (!inv) return '';
  return inv.fechaCompra || inv.fecha || '';
};

/** v5.11.0 — Días transcurridos desde la fecha de compra hasta hoy. */
RN.investment.diasDesdeCompra = function (inv) {
  const f = RN.investment.fechaCompra(inv);
  if (!f) return 0;
  const desdeMs = RN.investment._medianocheLocal(f);
  if (!desdeMs) return 0;
  const hoyMs = RN.investment._medianocheLocal(new Date());
  return Math.max(0, Math.floor((hoyMs - desdeMs) / 86400000));
};

/**
 * v5.11.0 — Aporte BRUTO de un cliente vinculado (ingreso cobrado) desde la
 * fecha de compra. Se mantiene por compatibilidad. Para la ganancia real
 * (aporte neto) usar aporteRecuperacionCliente().
 */
RN.investment.aporteCliente = function (inv, clienteId) {
  if (!inv || !clienteId) return 0;
  const f = RN.investment.fechaCompra(inv);
  const desde = f ? RN.investment._medianocheLocal(f) : 0;
  return (RN.state.history || [])
    .filter(function (h) {
      if (h.clienteId !== clienteId) return false;
      if (h.tipo && h.tipo !== 'servicio') return false;
      if (!desde) return true;
      const t = RN.investment._medianocheLocal(h.fecha);
      return t >= desde;
    })
    .reduce(function (s, h) { return s + (h.monto || 0); }, 0);
};

/**
 * v5.11.3 — Costo del mega que a mí me cuesta proveer el servicio a un cliente
 * en un mes dado = proveedorPrecioMega × megas del cliente.
 * Si no hay precio de proveedor configurado, el costo es 0 (no se puede
 * determinar el margen real; se asume costo 0).
 */
RN.investment.costoMegaClienteMes = function (cliente, mes) {
  if (!cliente) return 0;
  const precioMegaProv = +(RN.state.config.proveedorPrecioMega || 0);
  if (precioMegaProv <= 0) return 0;
  const megas = RN.calc.getMegasCliente(cliente);
  return +(megas * precioMegaProv).toFixed(2);
};

/** v5.11.3 — % de ganancia personal retenida (no recupera inversión). Global, 0-100. */
RN.investment.pctPersonal = function () {
  const p = +(RN.state.config.pctPersonalInversion || 0);
  return Math.max(0, Math.min(100, p));
};

/**
 * v5.11.3 — APORTE NETO a la recuperación de un cliente vinculado, desde la
 * fecha de compra. Por cada mes en que el cliente pagó (decisión 2=a):
 *   margenMes    = montoCobrado - costoMega(mes)
 *   recuperacion = margenMes * (1 - pctPersonal/100)   [lo que recupera el capital]
 * Si el margen es negativo ese mes, el aporte a recuperación es 0 (la pérdida
 * es del negocio, no se carga contra el capital invertido).
 */
RN.investment.aporteRecuperacionCliente = function (inv, clienteId) {
  if (!inv || !clienteId) return 0;
  const cli = (RN.state.clients || []).find(function (c) { return c.id === clienteId; });
  const f = RN.investment.fechaCompra(inv);
  const desde = f ? RN.investment._medianocheLocal(f) : 0;
  const pct = RN.investment.pctPersonal();
  const factorRec = 1 - pct / 100;
  const cobros = (RN.state.history || []).filter(function (h) {
    if (h.clienteId !== clienteId) return false;
    if (h.tipo && h.tipo !== 'servicio') return false;
    if (!desde) return true;
    const t = RN.investment._medianocheLocal(h.fecha);
    return t >= desde;
  });
  // Agrupar cobros por mes: restar el costo del mes una sola vez por mes.
  const porMes = {};
  cobros.forEach(function (h) {
    const mes = h.mes || '__sinmes__';
    if (!porMes[mes]) porMes[mes] = { cobrado: 0, costo: 0 };
    porMes[mes].cobrado += (h.monto || 0);
  });
  let total = 0;
  Object.keys(porMes).forEach(function (mes) {
    const costoMes = (mes !== '__sinmes__') ? RN.investment.costoMegaClienteMes(cli, mes) : 0;
    const margen = porMes[mes].cobrado - costoMes;
    if (margen > 0) total += margen * factorRec;
  });
  return +total.toFixed(2);
};

/**
 * v5.11.3 — Margen neto total de un cliente vinculado desde la compra (sin
 * aplicar retención personal). Útil para mostrar el desglose.
 */
RN.investment.margenNetoCliente = function (inv, clienteId) {
  if (!inv || !clienteId) return 0;
  const cli = (RN.state.clients || []).find(function (c) { return c.id === clienteId; });
  const f = RN.investment.fechaCompra(inv);
  const desde = f ? RN.investment._medianocheLocal(f) : 0;
  const cobros = (RN.state.history || []).filter(function (h) {
    if (h.clienteId !== clienteId) return false;
    if (h.tipo && h.tipo !== 'servicio') return false;
    if (!desde) return true;
    const t = RN.investment._medianocheLocal(h.fecha);
    return t >= desde;
  });
  const porMes = {};
  cobros.forEach(function (h) {
    const mes = h.mes || '__sinmes__';
    if (!porMes[mes]) porMes[mes] = 0;
    porMes[mes] += (h.monto || 0);
  });
  let total = 0;
  Object.keys(porMes).forEach(function (mes) {
    const costoMes = (mes !== '__sinmes__') ? RN.investment.costoMegaClienteMes(cli, mes) : 0;
    total += porMes[mes] - costoMes;
  });
  return +total.toFixed(2);
};

/**
 * v5.11.3 — Aporte mensual neto estimado de los clientes vinculados (para la
 * proyección). Basado en el ingreso neto esperado mensual de cada cliente
 * activo vinculado (precio neto - costo mega), aplicando retención personal.
 */
RN.investment.aporteMensualNeto = function (inv) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return 0;
  const pct = RN.investment.pctPersonal();
  const factorRec = 1 - pct / 100;
  const mes = RN.calc.mesActualStr();
  let total = 0;
  inv.clienteIds.forEach(function (cid) {
    const cli = (RN.state.clients || []).find(function (c) { return c.id === cid; });
    if (!cli || cli.activo === false) return;
    const precioNeto = RN.calc.getPrecioNeto(cli, mes);
    const costo = RN.investment.costoMegaClienteMes(cli, mes);
    const margen = precioNeto - costo;
    if (margen > 0) total += margen * factorRec;
  });
  return +total.toFixed(2);
};

/**
 * v5.11.3 — Clientes vinculados con su aporte bruto, margen neto y aporte a
 * recuperación, ordenados de mayor a menor aporte de recuperación.
 */
RN.investment.aportesPorCliente = function (inv) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return [];
  const self = this;
  return inv.clienteIds.map(function (cid) {
    const cli = (RN.state.clients || []).find(function (c) { return c.id === cid; });
    return {
      cliente: cli,
      aporte: self.aporteCliente(inv, cid),               // bruto (compat)
      margenNeto: self.margenNetoCliente(inv, cid),       // ganancia real antes de retención
      recuperacion: self.aporteRecuperacionCliente(inv, cid) // lo que recupera el capital
    };
  }).sort(function (a, b) { return b.recuperacion - a.recuperacion; });
};

/** v5.11.0 — Total aportado (BRUTO) por los clientes vinculados desde la compra. */
RN.investment.totalAporteClientes = function (inv) {
  return this.aportesPorCliente(inv).reduce(function (s, x) { return s + x.aporte; }, 0);
};

/** v5.11.3 — Total que los clientes vinculados han recuperado del capital (NETO, con retención). */
RN.investment.totalRecuperacionClientes = function (inv) {
  return this.aportesPorCliente(inv).reduce(function (s, x) { return s + x.recuperacion; }, 0);
};

/** v5.11.3 — Total de margen neto generado por los clientes vinculados (antes de retención). */
RN.investment.totalMargenNetoClientes = function (inv) {
  return this.aportesPorCliente(inv).reduce(function (s, x) { return s + x.margenNeto; }, 0);
};

/**
 * v5.11.3 — Recuperado REAL de una inversión = aporte neto automático de los
 * clientes vinculados desde la fecha de compra. Reemplaza el campo manual.
 * Para inversiones sin clientes vinculados, conserva el valor manual histórico.
 */
RN.investment.recuperadoRealInv = function (inv) {
  if (!inv) return 0;
  if (!inv.clienteIds || !inv.clienteIds.length) return +(inv.recuperado || 0);
  return this.totalRecuperacionClientes(inv);
};


/**
 * v5.12.1 — Acumulado retenido como ganancia personal de una inversión
 * (desde la fecha de compra). = margen neto total × pctPersonal/100.
 * Representa el dinero que el inversor se "saca" del margen y que NO recupera
 * el capital invertido.
 */
RN.investment.acumuladoRetenido = function (inv) {
  if (!inv) return 0;
  const pct = RN.investment.pctPersonal();
  if (pct <= 0) return 0;
  const margenNeto = RN.investment.totalMargenNetoClientes(inv);
  return +(Math.max(0, margenNeto) * pct / 100).toFixed(2);
};

/**
 * v5.12.1 \u2014 Retiro mensual estimado como ganancia personal.
 * = aporte mensual neto BRUTO (sin retención) \u00d7 pctPersonal/100.
 * Es lo que el inversor puede "retirar" cada mes del margen que generan los
 * clientes vinculados, mientras el resto recupera el capital.
 */
RN.investment.retiroMensualEstimado = function (inv) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return 0;
  const pct = RN.investment.pctPersonal();
  if (pct <= 0) return 0;
  const mes = RN.calc.mesActualStr();
  let totalMargenMensual = 0;
  inv.clienteIds.forEach(function (cid) {
    const cli = (RN.state.clients || []).find(function (c) { return c.id === cid; });
    if (!cli || cli.activo === false) return;
    const precioNeto = RN.calc.getPrecioNeto(cli, mes);
    const costo = RN.investment.costoMegaClienteMes(cli, mes);
    const margen = precioNeto - costo;
    if (margen > 0) totalMargenMensual += margen;
  });
  return +(totalMargenMensual * pct / 100).toFixed(2);
};

/**
 * v5.12.1 \u2014 Margen neto mensual BRUTO (sin aplicar retención personal).
 * = suma de (precioNeto - costoMega) de cada cliente activo vinculado.
 * Útil para mostrar cuánto genera la inversión por mes antes de separar
 * la ganancia personal del capital.
 */
RN.investment.margenMensualBruto = function (inv) {
  if (!inv || !inv.clienteIds || !inv.clienteIds.length) return 0;
  const mes = RN.calc.mesActualStr();
  let total = 0;
  inv.clienteIds.forEach(function (cid) {
    const cli = (RN.state.clients || []).find(function (c) { return c.id === cid; });
    if (!cli || cli.activo === false) return;
    const precioNeto = RN.calc.getPrecioNeto(cli, mes);
    const costo = RN.investment.costoMegaClienteMes(cli, mes);
    const margen = precioNeto - costo;
    if (margen > 0) total += margen;
  });
  return +total.toFixed(2);
};

/* ============================================================
 * v5.12.9 — Modelo de ORIGEN DEL CAPITAL + DEVOLUCIONES
 * ------------------------------------------------------------
 * Nueva forma de entender la recuperación de la inversión.
 *
 * PROBLEMA que resuelve:
 *   Antes, todo el margen neto de los clientes "recuperaba" el capital
 *   invertido. Pero cuando el capital es un PRÉSTAMO EXTERNO (dinero que el
 *   dueño debe devolver), tratarlo como "recuperación propia" mezcla dos
 *   cosas distintas: (a) el capital que es tuyo y ya recuperaste, y (b) el
 *   capital prestado que tienes que DEVOLVER. Eso genera duda contable.
 *
 * NUEVO MODELO:
 *   Cada inversión tiene un "origen del capital":
 *     - 'propio'         → dinero del dueño, NO hay que devolverlo.
 *                          La "recuperación" es ganancia retenida del capital.
 *     - 'prestado_externo'→ dinero prestado (banco, familiar, etc.) que HAY
 *                          QUE DEVOLVER. La app lleva un saldo a devolver.
 *
 *   Cuando el origen es 'prestado_externo':
 *     - recuperado     = margen neto acumulado de los clientes vinculados
 *                        (lo que el negocio ha generado para cubrir el capital).
 *     - devuelto       = suma de las DEVOLUCIONES registradas (extracciones
 *                        de caja marcadas como "Devolución de préstamo").
 *     - saldoADevolver = monto invertido − devuelto (lo que aún debes al
 *                        prestamista).
 *     - recuperadoNeto = recuperado − devuelto (lo que has generado pero aún
 *                        NO has devuelto; es dinero "acumulado" en caja listo
 *                        para devolver).
 *
 *   DEVOLUCIONES: se registran como retiros de caja (RN.caja) con la marca
 *   esDevolucionInversion + inversionId, para que salgan del fondo de caja
 *   y queden trazables. Así se usa la CAJA de la app como vehículo real del
 *   dinero que sale.
 *
 *   % DE GANANCIA DEL MES REAL: además del margen de los clientes vinculados,
 *   el dueño puede destinar un porcentaje (config.pctRecuperacionGananciaMes)
 *   de la GANANCIA NETA REAL DEL MES (ingresos − gastos del mes) a acelerar la
 *   recuperación/devolución del capital. Esto se calcula automáticamente y se
 *   muestra como "aporte extra del mes" sugerido.
 * ============================================================ */

/** Origen del capital de una inversión: 'propio' o 'prestado_externo'. Default 'propio'. */
RN.investment.origenCapital = function (inv) {
  if (!inv) return 'propio';
  return inv.origenCapital === 'prestado_externo' ? 'prestado_externo' : 'propio';
};

/** Nombre legible del origen del capital. */
RN.investment.origenCapitalTxt = function (inv) {
  return RN.investment.origenCapital(inv) === 'prestado_externo'
    ? 'Préstamo externo (a devolver)'
    : 'Capital propio';
};

/**
 * Devoluciones registradas para una inversión (retiros de caja marcados como
 * devolución de préstamo de esta inversión). Devuelve el array de gastos.
 */
RN.investment.devolucionesInv = function (inv) {
  if (!inv || !inv.id) return [];
  return (RN.state.gastos || []).filter(function (g) {
    return g.esDevolucionInversion && g.inversionId === inv.id;
  });
};

/** Total devuelto de una inversión (suma de las devoluciones registradas). */
RN.investment.totalDevuelto = function (inv) {
  return RN.investment.devolucionesInv(inv).reduce(function (s, g) {
    return s + (g.monto || 0);
  }, 0);
};

/**
 * Saldo a devolver de una inversión de préstamo externo.
 * = monto invertido − total devuelto. Mínimo 0.
 * Para capital propio devuelve 0 (no hay nada que devolver).
 */
RN.investment.saldoADevolver = function (inv) {
  if (RN.investment.origenCapital(inv) !== 'prestado_externo') return 0;
  var restante = (inv.monto || 0) - RN.investment.totalDevuelto(inv);
  return Math.max(0, +restante.toFixed(2));
};

/**
 * Recuperado NETO de una inversión = lo que el negocio ha generado (margen de
 * clientes) MENOS lo que ya se ha devuelto al prestamista.
 * Para capital propio es simplemente el recuperado (no hay devoluciones).
 */
RN.investment.recuperadoNetoInv = function (inv) {
  var recuperado = RN.investment.recuperadoRealInv(inv);
  var devuelto = RN.investment.totalDevuelto(inv);
  return +(recuperado - devuelto).toFixed(2);
};

/**
 * v5.12.9 — % de ganancia del mes real destinado a recuperación/devolución.
 * Configurable en Ajustes (0-100). Default 0 (no se aplica aporte extra).
 */
RN.investment.pctGananciaMes = function () {
  var p = +(RN.state.config.pctRecuperacionGananciaMes || 0);
  return Math.max(0, Math.min(100, p));
};

/**
 * v5.12.9 — Aporte extra sugerido del mes para esta inversión, basado en la
 * GANANCIA NETA REAL del mes (ingresos del mes − gastos del mes, excluyendo
 * las propias devoluciones/retiros de caja).
 * = gananciaNetaMes × pctGananciaMes/100.
 * Esto es lo que el dueño puede "sacar" de la ganancia real del mes y
 * destinar a devolver el capital prestado (o a recuperar el propio).
 */
RN.investment.aporteExtraMes = function (inv) {
  var pct = RN.investment.pctGananciaMes();
  if (pct <= 0) return 0;
  var mes = RN.calc.mesActualStr();
  var ingresos = RN.calc.ingresosMes(mes);
  // Gastos del mes EXCLUYendo devoluciones de inversión y retiros de caja
  // (esos son movimientos de capital, no gastos operativos).
  var gastos = (RN.state.gastos || [])
    .filter(function (g) { return (g.mes || '').slice(0, 7) === mes; })
    .filter(function (g) { return !g.esDevolucionInversion && !g.esRetiroCaja; })
    .reduce(function (s, g) { return s + (g.monto || 0); }, 0);
  var gananciaNeta = ingresos - gastos;
  if (gananciaNeta <= 0) return 0;
  return +(gananciaNeta * pct / 100).toFixed(2);
};

/**
 * v5.12.9 — Total acumulado de aportes extra (de todos los meses cerrados)
 * basados en la ganancia neta real mensual × pctGananciaMes.
 * Se aproxima sumando la ganancia neta histórica de meses ya cerrados.
 * Útil para mostrar cuánto capital se ha cubierto gracias a este aporte.
 */
RN.investment.aporteExtraAcumulado = function (inv) {
  var pct = RN.investment.pctGananciaMes();
  if (pct <= 0) return 0;
  // Sumar ganancia neta de cada mes con ingresos, excluyendo devoluciones/retiros.
  var porMes = {};
  (RN.state.history || []).forEach(function (h) {
    var mes = (h.mes || '').slice(0, 7);
    if (!mes) return;
    if (!porMes[mes]) porMes[mes] = 0;
    porMes[mes] += (h.monto || 0) + (h.montoEquipo || 0);
  });
  (RN.state.gastos || []).forEach(function (g) {
    if (g.esDevolucionInversion || g.esRetiroCaja) return;
    var mes = (g.mes || '').slice(0, 7);
    if (!mes) return;
    if (!porMes[mes]) porMes[mes] = 0;
    porMes[mes] -= (g.monto || 0);
  });
  var total = 0;
  Object.keys(porMes).forEach(function (mes) {
    if (porMes[mes] > 0) total += porMes[mes] * pct / 100;
  });
  return +total.toFixed(2);
};

/**
 * v5.12.9 — Total "recuperado efectivo" de una inversión considerando TODO:
 *   margen neto de clientes + aporte extra acumulado de ganancia del mes.
 * Es la cifra más realista de cuánto capital se ha cubierto.
 */
RN.investment.recuperadoEfectivo = function (inv) {
  var base = RN.investment.recuperadoRealInv(inv);
  var extra = RN.investment.aporteExtraAcumulado(inv);
  return +(base + extra).toFixed(2);
};

/**
 * v5.12.9 — % de recuperación efectivo (sobre el monto invertido).
 * Usa recuperadoEfectivo (margen clientes + aporte extra).
 */
RN.investment.pctRecuperacionEfectiva = function (inv) {
  var monto = inv.monto || 0;
  if (monto <= 0) return 0;
  return +((RN.investment.recuperadoEfectivo(inv) / monto) * 100).toFixed(1);
};

/**
 * v5.12.9 — Total de devoluciones registradas en TODAS las inversiones.
 */
RN.investment.totalDevolucionesGlobal = function () {
  return (RN.state.gastos || [])
    .filter(function (g) { return g.esDevolucionInversion; })
    .reduce(function (s, g) { return s + (g.monto || 0); }, 0);
};

/**
 * v5.12.9 — Total invertido que es préstamo externo (a devolver).
 */
RN.investment.totalPrestadoExterno = function () {
  return (RN.state.investments || [])
    .filter(function (i) { return RN.investment.origenCapital(i) === 'prestado_externo'; })
    .reduce(function (s, i) { return s + (i.monto || 0); }, 0);
};

/**
 * v5.12.9 — Total que falta por devolver al prestamista (todas las inversiones).
 */
RN.investment.totalFaltaDevolver = function () {
  return (RN.state.investments || [])
    .filter(function (i) { return RN.investment.origenCapital(i) === 'prestado_externo'; })
    .reduce(function (s, i) { return s + RN.investment.saldoADevolver(i); }, 0);
};
