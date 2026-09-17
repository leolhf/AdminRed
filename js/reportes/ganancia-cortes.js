/**
 * reportes/ganancia-cortes.js — Modales de resumen de los KPIs del Panel.
 * v5.15.1 — Hace clicables las tarjetas del Panel del negocio:
 *   - Ingresos del mes        -> RN.ingresosMes.abrir()
 *   - Costo del paquete       -> RN.paqueteProveedor.abrir()  (📡 Gestionar servicio)
 *   - Ganancia proyectada     -> RN.gananciaCortes.abrirProyectada()
 *   - Ganancia del mes        -> RN.gananciaCortes.abrirReal()
 *
 * Todos los resúmenes se agrupan por CORTE (día de pago del cliente), igual
 * que la cobranza y el calendario, reutilizando RN.ciclos y RN.calc. No se
 * duplica ningún cálculo de negocio: se apoyan en las funciones existentes
 * (ingresosMes, ingresoEsperadoMes, montoPaqueteProveedor, costoMegaClienteMes,
 * getPrecioNeto, getMora, resumenCliente...).
 *
 * Depende de: calculations.js, ciclos.js, models/investment.js, ui/render.js,
 *             ui/ui-components.js, ui/notify-ui.js (todos cargan antes).
 */
RN.gananciaCortes = RN.gananciaCortes || {};
RN.ingresosMes = RN.ingresosMes || {};

/* ============================================================
 * Helpers de cálculo por corte
 * ============================================================ */

/**
 * Agrupa los clientes activos que YA deben pagar este mes (mesInicio <= mes)
 * por su día de pago (corte). Devuelve [{ diaPago, clientes: [...] }] asc.
 * Es la base de la ganancia PROYECTADA (lo que deberían pagar).
 */
RN.gananciaCortes._cortesProyectados = function (mes) {
  var map = {};
  RN.calc.clientesActivos().forEach(function (c) {
    if (RN.calc.mesInicioCliente(c) > mes) return; // aún no le toca pagar
    var dp = c.diaPago || 1;
    if (!map[dp]) map[dp] = [];
    map[dp].push(c);
  });
  return Object.keys(map).map(function (dp) {
    return { diaPago: parseInt(dp, 10), clientes: map[dp] };
  }).sort(function (a, b) { return a.diaPago - b.diaPago; });
};

/**
 * Costo del mega asignado a un cliente en un mes (proveedorPrecioMega × megas).
 * Delega en RN.investment.costoMegaClienteMes (0 si no hay precio configurado).
 */
RN.gananciaCortes._costoMega = function (cliente, mes) {
  return RN.investment.costoMegaClienteMes(cliente, mes);
};

/**
 * Resumen de la ganancia PROYECTADA por corte.
 * Por cada corte: ingreso esperado (suma de netos), costo del mega asignado y
 * ganancia del corte (ingreso − costo). Devuelve además los totales.
 */
RN.gananciaCortes._resumenProyectado = function (mes) {
  var cortes = RN.gananciaCortes._cortesProyectados(mes);
  var totalIngreso = 0, totalCosto = 0, totalClientes = 0;
  var filas = cortes.map(function (g) {
    var ingreso = 0, costo = 0;
    g.clientes.forEach(function (c) {
      ingreso += RN.calc.getPrecioNeto(c, mes);
      costo += RN.gananciaCortes._costoMega(c, mes);
    });
    ingreso = +ingreso.toFixed(2);
    costo = +costo.toFixed(2);
    totalIngreso += ingreso;
    totalCosto += costo;
    totalClientes += g.clientes.length;
    return {
      diaPago: g.diaPago,
      clientes: g.clientes.length,
      ingreso: ingreso,
      costo: costo,
      ganancia: +(ingreso - costo).toFixed(2)
    };
  });
  return {
    filas: filas,
    totalIngreso: +totalIngreso.toFixed(2),
    totalCosto: +totalCosto.toFixed(2),
    totalGanancia: +(totalIngreso - totalCosto).toFixed(2),
    totalClientes: totalClientes
  };
};

/**
 * Resumen de la ganancia REAL por corte (lo efectivamente cobrado este mes).
 * Agrupa los cobros del mes por el corte del cliente. Por cada corte:
 * cobrado (servicio + equipo), costo del mega asignado y ganancia del corte.
 */
RN.gananciaCortes._resumenReal = function (mes) {
  var map = {}; // diaPago -> { cobrado, costo, clientes:Set }
  RN.state.history.filter(function (h) { return h.mes === mes; }).forEach(function (h) {
    var cli = RN.calc.clientePorId(h.clienteId);
    var dp = (cli && cli.diaPago) ? cli.diaPago : 0;
    if (!map[dp]) map[dp] = { cobrado: 0, costo: 0, clientes: {} };
    map[dp].cobrado += (h.monto || 0) + (h.montoEquipo || 0);
    if (cli) map[dp].clientes[cli.id] = true;
  });
  // Costo del mega: se calcula una sola vez por cliente (no por cobro).
  var totalCobrado = 0, totalCosto = 0, totalClientes = 0;
  var filas = Object.keys(map).map(function (dp) {
    var g = map[dp];
    var costo = 0;
    Object.keys(g.clientes).forEach(function (cid) {
      var cli = RN.calc.clientePorId(cid);
      if (cli) costo += RN.gananciaCortes._costoMega(cli, mes);
    });
    var cobrado = +g.cobrado.toFixed(2);
    costo = +costo.toFixed(2);
    totalCobrado += cobrado;
    totalCosto += costo;
    totalClientes += Object.keys(g.clientes).length;
    return {
      diaPago: parseInt(dp, 10),
      clientes: Object.keys(g.clientes).length,
      cobrado: cobrado,
      costo: costo,
      ganancia: +(cobrado - costo).toFixed(2)
    };
  }).sort(function (a, b) { return a.diaPago - b.diaPago; });
  return {
    filas: filas,
    totalCobrado: +totalCobrado.toFixed(2),
    totalCosto: +totalCosto.toFixed(2),
    totalGanancia: +(totalCobrado - totalCosto).toFixed(2),
    totalClientes: totalClientes
  };
};

/**
 * Desglose de los ingresos REALES del mes por concepto y por corte.
 * - servicio: h.monto (solo servicio, incluye mora cobrada)
 * - equipo:   h.montoEquipo (pagos de deuda de equipo)
 * - inventario: ventas de inventario (h.tipo === 'venta-inventario')
 * - mora:     subconjunto de servicio (h.montoMora), informativo
 */
RN.ingresosMes._desglose = function (mes) {
  var servicio = 0, equipo = 0, inventario = 0, mora = 0, total = 0;
  var porCorte = {}; // diaPago -> { servicio, equipo, inventario, total, clientes:Set }
  RN.state.history.filter(function (h) { return h.mes === mes; }).forEach(function (h) {
    var monto = h.monto || 0;
    var montoEq = h.montoEquipo || 0;
    var esInv = h.tipo === 'venta-inventario' || h.ventaInventario;
    var t = monto + montoEq;
    total += t;
    if (esInv) { inventario += monto; }
    else { servicio += monto; equipo += montoEq; mora += (h.montoMora || 0); }

    var cli = RN.calc.clientePorId(h.clienteId);
    var dp = (cli && cli.diaPago) ? cli.diaPago : 0;
    if (!porCorte[dp]) porCorte[dp] = { servicio: 0, equipo: 0, inventario: 0, total: 0, clientes: {} };
    porCorte[dp].total += t;
    if (esInv) { porCorte[dp].inventario += monto; }
    else { porCorte[dp].servicio += monto; porCorte[dp].equipo += montoEq; }
    if (cli) porCorte[dp].clientes[cli.id] = true;
  });
  return {
    servicio: +servicio.toFixed(2),
    equipo: +equipo.toFixed(2),
    inventario: +inventario.toFixed(2),
    mora: +mora.toFixed(2),
    total: +total.toFixed(2),
    porCorte: porCorte
  };
};

/* ============================================================
 * Modal: Ingresos del mes
 * ============================================================ */

RN.ingresosMes.abrir = function () {
  var mes = RN.calc.mesActualStr();
  var d = RN.ingresosMes._desglose(mes);
  var cob = RN.calc.cobranzaMes(mes);

  // Secciones por corte (solo los cortes con cobros registrados).
  var cortes = Object.keys(d.porCorte).map(function (k) { return parseInt(k, 10); })
    .sort(function (a, b) { return a - b; });
  var secciones = cortes.map(function (dp) {
    var g = d.porCorte[dp];
    var titulo = dp > 0 ? 'Corte del día ' + dp : 'Sin corte asignado';
    var nCli = Object.keys(g.clientes).length;
    var detalle = [];
    if (g.servicio > 0) detalle.push('servicio ' + RN.calc.formatCUP(g.servicio));
    if (g.equipo > 0) detalle.push('equipo ' + RN.calc.formatCUP(g.equipo));
    if (g.inventario > 0) detalle.push('inventario ' + RN.calc.formatCUP(g.inventario));
    return '<div class="acc-row" style="border-bottom:1px solid var(--border);padding:8px 0">' +
      '<span class="acc-label"><strong>' + titulo + '</strong>' +
        (nCli ? ' <span class="muted" style="font-size:12px">· ' + nCli + ' cliente' + (nCli > 1 ? 's' : '') + '</span>' : '') +
        '<br><span class="muted" style="font-size:12px">' + (detalle.join(' · ') || '—') + '</span>' +
      '</span>' +
      '<span class="acc-value"><strong>' + RN.calc.formatCUP(g.total) + '</strong></span>' +
    '</div>';
  }).join('');

  var html =
    '<div class="modal-header"><h3>💵 Ingresos del mes — ' + RN.calc.mesTexto(mes) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi green" style="margin-bottom:12px">' +
        '<div class="label">Ingresos del mes</div>' +
        '<div class="value">' + RN.calc.formatCUP(d.total) + '</div>' +
        '<div class="sub">' + RN.render.subUSD(d.total, 'Cobros de servicio + equipo + inventario') + '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi green"><div class="label">Servicio</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(d.servicio) + '</div><div class="sub">Cuotas de internet cobradas</div></div>' +
        '<div class="kpi blue"><div class="label">Equipo</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(d.equipo) + '</div><div class="sub">Pagos de deuda de equipo</div></div>' +
        '<div class="kpi amber"><div class="label">Inventario</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(d.inventario) + '</div><div class="sub">Ventas de inventario</div></div>' +
      '</div>' +
      (d.mora > 0
        ? '<p class="muted" style="font-size:12px;margin-bottom:12px">El servicio incluye <strong>' + RN.calc.formatCUP(d.mora) + '</strong> de mora de meses anteriores.</p>'
        : '') +
      '<h4 style="margin:4px 0 8px">Desglose por corte</h4>' +
      (secciones || '<div class="acc-empty"><div class="icon">💵</div>Sin ingresos registrados este mes todavía.</div>') +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'Cobranza: ' + cob.pagaron + '/' + cob.total + ' clientes pagaron este mes' +
        (cob.parciales ? ' · ' + cob.parciales + ' con pago parcial' : '') + '. ' +
        'Los ingresos agrupan los cobros por el corte (día de pago) del cliente.' +
      '</p>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn" onclick="RN.uiComponents.cerrarModal();RN.historial.verTodos()">Ver historial completo</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};

/* ============================================================
 * Modal: Ganancia proyectada del mes (por corte)
 * ============================================================ */

RN.gananciaCortes.abrirProyectada = function () {
  var mes = RN.calc.mesActualStr();
  var r = RN.gananciaCortes._resumenProyectado(mes);
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var esperado = RN.calc.ingresoEsperadoMes(mes);
  var gananciaProyectada = +(esperado - costoPaquete).toFixed(2);
  var sinCosto = !RN.investment.costoMegaConfigurado();

  var filas = r.filas.map(function (f) {
    return '<tr>' +
      '<td><strong>Corte del día ' + f.diaPago + '</strong></td>' +
      '<td style="text-align:center">' + f.clientes + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.ingreso) + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.costo) + '</td>' +
      '<td style="text-align:right"><strong style="color:' + (f.ganancia >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(f.ganancia) + '</strong></td>' +
    '</tr>';
  }).join('');

  var html =
    '<div class="modal-header"><h3>📈 Ganancia proyectada del mes — ' + RN.calc.mesTexto(mes) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi ' + (gananciaProyectada >= 0 ? 'green' : 'red') + '" style="margin-bottom:12px">' +
        '<div class="label">Ganancia proyectada del mes</div>' +
        '<div class="value">' + RN.calc.formatCUP(gananciaProyectada) + '</div>' +
        '<div class="sub">' + RN.render.subUSD(gananciaProyectada, 'Ingreso esperado − Costo del paquete') + '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi green"><div class="label">Ingreso esperado</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(esperado) + '</div><div class="sub">Lo que deberían pagar los activos</div></div>' +
        '<div class="kpi amber"><div class="label">Costo del paquete</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(costoPaquete) + '</div><div class="sub">' + (costoPaquete > 0 ? RN.render.descPaquete() : 'Sin paquete configurado') + '</div></div>' +
      '</div>' +
      '<h4 style="margin:4px 0 8px">Ganancia esperada por corte</h4>' +
      (r.filas.length
        ? '<div class="table-wrap"><table><thead><tr>' +
            '<th>Corte</th><th style="text-align:center">Clientes</th>' +
            '<th style="text-align:right">Ingreso esperado</th>' +
            '<th style="text-align:right">Costo del mega</th>' +
            '<th style="text-align:right">Ganancia</th>' +
          '</tr></thead><tbody>' + filas +
          '<tr style="border-top:2px solid var(--border)">' +
            '<td><strong>Total</strong></td>' +
            '<td style="text-align:center"><strong>' + r.totalClientes + '</strong></td>' +
            '<td style="text-align:right"><strong>' + RN.calc.formatCUP(r.totalIngreso) + '</strong></td>' +
            '<td style="text-align:right"><strong>' + RN.calc.formatCUP(r.totalCosto) + '</strong></td>' +
            '<td style="text-align:right"><strong style="color:' + (r.totalGanancia >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(r.totalGanancia) + '</strong></td>' +
          '</tr></tbody></table></div>'
        : '<div class="acc-empty"><div class="icon">📈</div>No hay clientes activos con cobro esperado este mes.</div>') +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'La ganancia por corte = ingreso esperado del corte − costo del mega de sus clientes (megas × precio por mega del proveedor). ' +
        'El total del panel usa el costo del paquete completo (' + RN.calc.formatCUP(costoPaquete) + ').' +
      '</p>' +
      (sinCosto
        ? '<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);font-size:12px;color:#e6a700">' +
            '⚠️ No hay precio de proveedor por mega configurado: el costo del mega se asume 0 y la ganancia por corte está <strong>inflada</strong>. Configúralo en 📡 Gestionar servicio.' +
          '</div>'
        : '') +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn primary" onclick="RN.uiComponents.cerrarModal();RN.paqueteProveedor.abrir()">📡 Gestionar servicio</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};

/* ============================================================
 * Modal: Ganancia del mes (real, por corte)
 * ============================================================ */

RN.gananciaCortes.abrirReal = function () {
  var mes = RN.calc.mesActualStr();
  var r = RN.gananciaCortes._resumenReal(mes);
  var ingresos = RN.calc.ingresosMes(mes);
  var costoPaquete = RN.calc.montoPaqueteProveedor();
  var gananciaBruta = +(ingresos - costoPaquete).toFixed(2);
  var sinCosto = !RN.investment.costoMegaConfigurado();

  var filas = r.filas.map(function (f) {
    var titulo = f.diaPago > 0 ? 'Corte del día ' + f.diaPago : 'Sin corte asignado';
    return '<tr>' +
      '<td><strong>' + titulo + '</strong></td>' +
      '<td style="text-align:center">' + f.clientes + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.cobrado) + '</td>' +
      '<td style="text-align:right">' + RN.calc.formatCUP(f.costo) + '</td>' +
      '<td style="text-align:right"><strong style="color:' + (f.ganancia >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(f.ganancia) + '</strong></td>' +
    '</tr>';
  }).join('');

  var html =
    '<div class="modal-header"><h3>💰 Ganancia del mes — ' + RN.calc.mesTexto(mes) + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div class="kpi ' + (gananciaBruta >= 0 ? 'blue' : 'red') + '" style="margin-bottom:12px">' +
        '<div class="label">Ganancia del mes</div>' +
        '<div class="value">' + RN.calc.formatCUP(gananciaBruta) + '</div>' +
        '<div class="sub">' + RN.render.subUSD(gananciaBruta, 'Cobrado − Costo del paquete') + '</div>' +
      '</div>' +
      '<div class="kpi-grid" style="margin-bottom:12px">' +
        '<div class="kpi green"><div class="label">Cobrado</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(ingresos) + '</div><div class="sub">Ingresos reales del mes</div></div>' +
        '<div class="kpi amber"><div class="label">Costo del paquete</div><div class="value" style="font-size:18px">' + RN.calc.formatCUP(costoPaquete) + '</div><div class="sub">' + (costoPaquete > 0 ? RN.render.descPaquete() : 'Sin paquete configurado') + '</div></div>' +
      '</div>' +
      '<h4 style="margin:4px 0 8px">Ganancia real por corte</h4>' +
      (r.filas.length
        ? '<div class="table-wrap"><table><thead><tr>' +
            '<th>Corte</th><th style="text-align:center">Clientes</th>' +
            '<th style="text-align:right">Cobrado</th>' +
            '<th style="text-align:right">Costo del mega</th>' +
            '<th style="text-align:right">Ganancia</th>' +
          '</tr></thead><tbody>' + filas +
          '<tr style="border-top:2px solid var(--border)">' +
            '<td><strong>Total</strong></td>' +
            '<td style="text-align:center"><strong>' + r.totalClientes + '</strong></td>' +
            '<td style="text-align:right"><strong>' + RN.calc.formatCUP(r.totalCobrado) + '</strong></td>' +
            '<td style="text-align:right"><strong>' + RN.calc.formatCUP(r.totalCosto) + '</strong></td>' +
            '<td style="text-align:right"><strong style="color:' + (r.totalGanancia >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + RN.calc.formatCUP(r.totalGanancia) + '</strong></td>' +
          '</tr></tbody></table></div>'
        : '<div class="acc-empty"><div class="icon">💰</div>Sin cobros registrados este mes todavía.</div>') +
      '<p class="muted" style="margin-top:12px;font-size:12px">' +
        'La ganancia por corte = cobrado del corte − costo del mega de sus clientes (megas × precio por mega del proveedor). ' +
        'El total del panel usa el costo del paquete completo (' + RN.calc.formatCUP(costoPaquete) + ').' +
      '</p>' +
      (sinCosto
        ? '<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.35);font-size:12px;color:#e6a700">' +
            '⚠️ No hay precio de proveedor por mega configurado: el costo del mega se asume 0 y la ganancia por corte está <strong>inflada</strong>. Configúralo en 📡 Gestionar servicio.' +
          '</div>'
        : '') +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn primary" onclick="RN.uiComponents.cerrarModal();RN.paqueteProveedor.abrir()">📡 Gestionar servicio</button>' +
    '</div>';

  RN.uiComponents.modal(html, { lg: true });
};
