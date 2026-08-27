/**
 * deudas.js — v5.13.0
 * Sección "Deudas personales": muestra los préstamos externos (capital a devolver)
 * separados en dos grupos:
 *   1. Deudas activas — saldoADevolver > 0
 *   2. Historial de deudas concluidas — totalmente liquidadas (saldoADevolver = 0)
 *
 * Cada deuda puede editarse y eliminarse (igual que en Inversión) porque al
 * crearla se pueden cometer errores.
 *
 * Sin dependencias externas — usa RN.investment, RN.inversion, RN.caja, RN.render.
 */

RN.deudas = RN.deudas || {};

/**
 * Render principal de la vista "Deudas personales".
 * Pinta los KPIs, la lista de deudas activas y el historial de concluidas.
 */
RN.deudas.render = function () {
  var activas = RN.investment.deudasActivas();
  var concluidas = RN.investment.deudasConcluidas();

  RN.deudas._renderKPIs(activas, concluidas);
  RN.deudas._renderActivas(activas);
  RN.deudas._renderConcluidas(concluidas);
};

/**
 * Pinta los KPIs de la sección deudas.
 */
RN.deudas._renderKPIs = function (activas, concluidas) {
  var kpi = document.getElementById('kpi-deudas');
  if (!kpi) return;

  var totalPrestadoActivas = activas.reduce(function (s, i) { return s + (i.monto || 0); }, 0);
  var totalDevueltoActivas = activas.reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);
  var saldoTotal = activas.reduce(function (s, i) { return s + RN.investment.saldoADevolver(i); }, 0);
  var totalDevueltoConcluidas = concluidas.reduce(function (s, i) { return s + RN.investment.totalDevuelto(i); }, 0);

  kpi.innerHTML = [
    { label: 'Deudas activas', value: String(activas.length), cls: 'blue' },
    { label: 'Saldo por devolver', value: RN.calc.formatCUP(saldoTotal), cls: 'red' },
    { label: 'Ya devuelto (activas)', value: RN.calc.formatCUP(totalDevueltoActivas), cls: 'amber' },
    { label: 'Concluidas', value: String(concluidas.length) + ' · ' + RN.calc.formatCUP(totalDevueltoConcluidas), cls: 'green' }
  ].map(function (k) {
    return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>';
  }).join('');
};

/**
 * Pinta la lista de deudas activas (préstamos con saldo pendiente).
 */
RN.deudas._renderActivas = function (activas) {
  var cont = document.getElementById('lista-deudas-activas');
  if (!cont) return;

  if (!activas.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💸</div>No hay deudas personales activas. Toda deuda pendiente aparecerá aquí.</div>';
    return;
  }

  cont.innerHTML = activas.map(function (inv) {
    return RN.deudas._cardDeuda(inv, false);
  }).join('');
};

/**
 * Pinta el historial de deudas concluidas.
 */
RN.deudas._renderConcluidas = function (concluidas) {
  var cont = document.getElementById('lista-deudas-concluidas');
  var card = document.getElementById('card-deudas-concluidas');
  if (!cont || !card) return;

  if (!concluidas.length) {
    card.style.display = 'none';
    cont.innerHTML = '';
    return;
  }

  card.style.display = '';
  // Ordenar por fecha de conclusión (más reciente primero)
  var ordenadas = concluidas.slice().sort(function (a, b) {
    var fa = a.fechaConclusion || a.fechaCompra || '';
    var fb = b.fechaConclusion || b.fechaCompra || '';
    return new Date(fb) - new Date(fa);
  });

  cont.innerHTML = ordenadas.map(function (inv) {
    return RN.deudas._cardDeuda(inv, true);
  }).join('');
};

/**
 * Genera el HTML de una tarjeta de deuda (activa o concluida).
 * @param {object} inv — la inversión (préstamo externo)
 * @param {boolean} esConcluida — true si la deuda ya está liquidada
 */
RN.deudas._cardDeuda = function (inv, esConcluida) {
  var totalDevuelto = RN.investment.totalDevuelto(inv);
  var saldoDevolver = RN.investment.saldoADevolver(inv);
  var fechaC = RN.investment.fechaCompra(inv);
  var fechaTxt = fechaC ? new Date(fechaC).toLocaleDateString('es-CU') : '—';
  var dias = RN.investment.diasDesdeCompra(inv);
  var pctDevuelto = inv.monto ? Math.round(totalDevuelto / inv.monto * 100) : 0;
  var dotCls = esConcluida ? 'ok' : 'warn';
  var estadoTxt = esConcluida ? '✅ Concluida' : '💨 Activa';
  var fechaConclusionTxt = '';
  if (esConcluida && inv.fechaConclusion) {
    fechaConclusionTxt = new Date(inv.fechaConclusion).toLocaleDateString('es-CU');
  }

  // Barra de progreso de devolución
  var barraPct = Math.min(100, Math.max(0, pctDevuelto));
  var barraHtml = '<div class="progress-bar" style="margin:6px 0">'
    + '<div class="progress-fill" style="width:' + barraPct + '%;background:' + (esConcluida ? 'var(--green)' : 'var(--warn)') + '"></div>'
    + '</div>';

  // Historial de devoluciones (resumen compacto)
  var devs = RN.investment.devolucionesInv(inv)
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  var devsHtml = '';
  if (devs.length) {
    devsHtml = '<div class="divider" style="margin:8px 0"></div>'
      + '<div class="acc-row" style="font-weight:600"><span class="acc-label">Devoluciones registradas (' + devs.length + ')</span><span class="acc-value">' + RN.calc.formatCUP(totalDevuelto) + '</span></div>';
    devs.forEach(function (d) {
      var dFecha = new Date(d.fecha).toLocaleDateString('es-CU');
      devsHtml += '<div class="acc-row"><span class="acc-label" style="padding-left:12px">' + dFecha + ' · ' + RN.render.esc(d.concepto || 'Devolución') + '</span><span class="acc-value">' + RN.calc.formatCUP(d.monto) + '</span></div>';
    });
  }

  return '<div class="acc-card" id="acc-deuda-' + inv.id + '">'
    + '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-deuda-' + inv.id + '\')">'
    +   '<span class="acc-dot ' + dotCls + '"></span>'
    +   '<div class="acc-summary-main">'
    +     '<div class="acc-summary-name">' + RN.render.esc(inv.concepto) + '</div>'
    +     '<div class="acc-summary-sub">' + estadoTxt + ' · debe ' + RN.calc.formatCUP(saldoDevolver) + ' · ' + pctDevuelto + '% devuelto' + (fechaC ? ' · ' + dias + ' días' : '') + '</div>'
    +   '</div>'
    +   '<div class="acc-summary-total">'
    +     '<div class="amt">' + RN.calc.formatCUP(inv.monto) + '</div>'
    +     '<div class="lbl">Prestado</div>'
    +   '</div>'
    +   '<span class="acc-chevron">▼</span>'
    + '</div>'
    + '<div class="acc-details">'
    +   '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value"><span class="badge ' + (esConcluida ? 'ok' : 'warn') + '">' + estadoTxt + '</span></span></div>'
    +   '<div class="acc-row"><span class="acc-label">Fecha de creación</span><span class="acc-value">' + fechaTxt + '</span></div>'
    +   (esConcluida && fechaConclusionTxt ? '<div class="acc-row"><span class="acc-label">Fecha de conclusión</span><span class="acc-value"><strong style="color:var(--green)">' + fechaConclusionTxt + '</strong></span></div>' : '')
    +   '<div class="acc-row"><span class="acc-label">Días transcurridos</span><span class="acc-value">' + (fechaC ? dias + ' días' : '—') + '</span></div>'
    +   '<div class="acc-row"><span class="acc-label">Monto del préstamo</span><span class="acc-value">' + RN.calc.formatCUP(inv.monto) + '</span></div>'
    +   '<div class="acc-row"><span class="acc-label">Total devuelto</span><span class="acc-value"><strong style="color:var(--green)">' + RN.calc.formatCUP(totalDevuelto) + '</strong></span></div>'
    +   (esConcluida
        ? '<div class="acc-row" style="font-weight:600"><span class="acc-label">Saldo final</span><span class="acc-value"><span class="badge ok">0 · Liquidado</span></span></div>'
        : '<div class="acc-row" style="font-weight:600"><span class="acc-label">Saldo por devolver</span><span class="acc-value"><strong style="color:var(--warn)">' + RN.calc.formatCUP(saldoDevolver) + '</strong></span></div>')
    +   '<div class="acc-row"><span class="acc-label">% devuelto</span><span class="acc-value">' + pctDevuelto + '%</span></div>'
    +   barraHtml
    +   (inv.monedaPago ? '<div class="acc-row"><span class="acc-label">Pago (' + inv.monedaPago + ')</span><span class="acc-value">' + RN.moneda.desglosePagoHTML({ moneda: inv.monedaPago, montoUSD: inv.montoPagoUSD, montoCUP: inv.montoPagoCUP, montoCUPDesdeUSD: inv.montoPagoCUPDesdeUSD, totalRecibidoCUP: inv.totalPagoCUP, tasaUsd: inv.tasaUsdCompra }) + '</span></div>' : '')
    +   devsHtml
    +   '<div class="divider" style="margin:8px 0"></div>'
    +   '<div class="acc-actions">'
    +     (esConcluida
        ? '<button class="btn sm" onclick="RN.caja.historialDevoluciones(\'' + inv.id + '\')">📋 Ver devoluciones</button>'
        : '<button class="btn sm primary" onclick="RN.caja.devolucionPrestamo(\'' + inv.id + '\')">💸 Devolver préstamo</button>'
          + '<button class="btn sm" onclick="RN.caja.historialDevoluciones(\'' + inv.id + '\')">📋 Devoluciones</button>')
    +     '<button class="btn sm" onclick="RN.inversion.abrirEditar(\'' + inv.id + '\')">Editar</button>'
    +     '<button class="btn sm danger" onclick="RN.deudas.eliminar(\'' + inv.id + '\')">🗑</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
};

/**
 * v5.13.0 — Elimina una deuda personal y todas sus devoluciones asociadas.
 * A diferencia de RN.inversion.eliminar (que conserva las devoluciones), aquí
 * se eliminan también las devoluciones porque es una deuda personal y borrarla
 * significa borrar todo el rastro del préstamo.
 */
RN.deudas.eliminar = function (id) {
  var inv = (RN.state.investments || []).find(function (i) { return i.id === id; });
  if (!inv) return;

  var devs = RN.investment.devolucionesInv(inv);
  var msg = '¿Eliminar esta deuda personal?';
  if (devs.length) {
    msg += '\n\nSe eliminarán también ' + devs.length + ' devoluciones asociadas (' + RN.calc.formatCUP(RN.investment.totalDevuelto(inv)) + ').';
  }
  msg += '\n\nEsta acción no se puede deshacer.';

  RN.uiComponents.confirm('Eliminar deuda personal', msg, function () {
    // Eliminar la inversión
    RN.state.investments = RN.state.investments.filter(function (x) { return x.id !== id; });
    // Eliminar las devoluciones asociadas
    RN.state.gastos = (RN.state.gastos || []).filter(function (g) {
      return !(g.esDevolucionInversion && g.inversionId === id);
    });
    RN.storageLocal.guardar();
    RN.render.todo();
    RN.notifyUI.toast('Deuda personal eliminada con sus devoluciones', 'warn');
  }, { danger: true });
};
