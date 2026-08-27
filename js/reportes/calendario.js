/**
 * reportes/calendario.js — Calendario visual mensual de cobros con código de colores.
 *
 * v5.12.9 — Calendario INTERACTIVO:
 *   - Los días de corte (5, 15, 25) se resaltan con un marcador especial.
 *   - Al tocar un día con clientes se abre una ventana superpuesta (modal) que
 *     muestra cada cliente con su monto a pagar (neto + cuota de equipo), su
 *     estado, y un resumen con el TOTAL a cobrar de todos los clientes de ese
 *     día. Cada cliente trae botones Cobrar / WhatsApp.
 *   - Solo son clickeables los días que tienen clientes asignados.
 */
RN.calendario = RN.calendario || {};

RN.calendario._mes = null;

/** Días de corte oficiales del negocio (definidos en el modelo de ciclos). */
RN.calendario.CORTES = [5, 15, 25];

RN.calendario._mesActual = function () {
  return RN.calendario._mes || RN.calc.mesActualStr();
};

RN.calendario.mesAnterior = function () {
  RN.calendario._mes = RN.calc.mesAnterior(RN.calendario._mesActual());
  RN.calendario.render();
};

RN.calendario.mesSiguiente = function () {
  RN.calendario._mes = RN.calc.mesSiguiente(RN.calendario._mesActual());
  RN.calendario.render();
};

/**
 * Devuelve los clientes cuyo diaPago coincide con el día dado (mes en vista).
 * Filtra por activos. Si el mes en vista NO es el actual, se muestran igual
 * (para planificación), pero el cálculo de estado usa el mes actual.
 */
RN.calendario._clientesDelDia = function (dia) {
  return RN.calc.clientesActivos().filter(function (c) {
    return (c.diaPago || 1) === dia;
  });
};

RN.calendario.render = function () {
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-mes-label');
  if (!grid) return;
  const ym = RN.calendario._mesActual();
  const [y, m] = ym.split('-').map(Number);
  if (label) label.textContent = RN.calc.mesTexto(ym);

  const primerDia = new Date(y, m - 1, 1).getDay(); // 0=domingo
  const diasMes = new Date(y, m, 0).getDate();
  const hoy = new Date();
  const esMesActual = hoy.getFullYear() === y && (hoy.getMonth() + 1) === m;
  const esCorte = {};
  RN.calendario.CORTES.forEach(function (d) { esCorte[d] = true; });

  // Mapa día -> clientes
  const porDia = {};
  RN.calc.clientesActivos().forEach(c => {
    const dia = c.diaPago || 1;
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push(c);
  });

  const heads = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  let html = heads.map(h => `<div class="cal-head">${h}</div>`).join('');
  for (let i = 0; i < primerDia; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= diasMes; d++) {
    const cls = [];
    if (esMesActual && d === hoy.getDate()) cls.push('today');
    const esCorteDia = !!esCorte[d];
    if (esCorteDia) cls.push('corte');
    const clientes = porDia[d] || [];
    const hayClientes = clientes.length > 0;
    // color dominante
    let estadoDom = null;
    clientes.forEach(c => {
      const e = RN.calc.getStatus(c);
      if (e === 'due') estadoDom = 'due';
      else if (e === 'warn' && estadoDom !== 'due') estadoDom = 'warn';
      else if (e === 'paid' && !estadoDom) estadoDom = 'paid';
      else if (e === 'ok' && !estadoDom) estadoDom = 'ok';
      else if (e === 'parcial' && !estadoDom) estadoDom = 'parcial';
      else if (e === 'por-iniciar' && !estadoDom) estadoDom = 'ok';
    });
    if (estadoDom) cls.push(estadoDom);
    if (hayClientes) cls.push('clickable');

    const attrClick = hayClientes
      ? ' onclick="RN.calendario.abrirDia(' + d + ')" role="button" tabindex="0"'
      : '';
    const attrAria = hayClientes ? ' aria-label="Día ' + d + ': ' + clientes.length + ' cliente(s) para cobro"' : '';

    const corteTag = esCorteDia ? '<span class="cal-corte-tag">✂ Corte</span>' : '';
    const dots = clientes.length;
    html += `<div class="cal-day ${cls.join(' ')}" ${attrClick}${attrAria}>` +
      `<span class="num">${d}</span>` +
      corteTag +
      (dots ? `<span class="dot"></span><span class="cal-count">${dots} pago(s)</span>` : '') +
    `</div>`;
  }
  grid.innerHTML = html;
};

/**
 * Abre la ventana superpuesta con el detalle de los clientes de un día de corte.
 * Muestra cada cliente, su monto a pagar (neto + cuota de equipo), su estado,
 * y un resumen con el total a cobrar. Botones Cobrar / WhatsApp por cliente.
 */
RN.calendario.abrirDia = function (dia) {
  var clientes = RN.calendario._clientesDelDia(dia);
  if (!clientes.length) return;

  var ym = RN.calendario._mesActual();
  var esCorte = RN.calendario.CORTES.indexOf(dia) !== -1;
  var esMesActual = (ym === RN.calc.mesActualStr());
  var cv = RN.ciclos.corteVigente();
  var esCorteVigente = esMesActual && cv && cv.diaPago === dia;

  // Calcular totales y filas
  var totalACobrar = 0;
  var totalNeto = 0;
  var totalEquipo = 0;
  var pagados = 0;
  var pendientes = 0;

  var filas = clientes.map(function (c) {
    var estado = RN.calc.getStatus(c);
    var neto = RN.calc.getPrecioNeto(c);
    var cuotaEq = RN.investment.getCuotaEquipoCliente(c);
    var total = neto + cuotaEq;
    totalACobrar += total;
    totalNeto += neto;
    totalEquipo += cuotaEq;
    if (estado === 'paid') pagados++; else pendientes++;

    var tel = c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>';
    var planTxt = RN.render.esc(RN.render.nombrePlan(c));
    var estadoBadge = RN.render.badgeEstado(estado);
    var totalTxt = RN.calc.formatCUP(total) +
      (cuotaEq > 0 ? ' <span class="pill">+equipo ' + RN.calc.formatCUP(cuotaEq) + '</span>' : '');
    var mora = RN.calc.getMora(c);
    var moraBadge = mora > 0 ? ' <span class="badge due">' + mora + ' mes' + (mora !== 1 ? 'es' : '') + ' de atraso</span>' : '';

    return '<tr>' +
      '<td><strong>' + RN.render.esc(c.nombre) + '</strong>' +
        '<br><span class="muted" style="font-size:12px">' + planTxt + '</span>' +
        (c.ip ? '<br><span class="muted" style="font-size:11px">IP: ' + RN.render.esc(c.ip) + '</span>' : '') +
      '</td>' +
      '<td style="text-align:center">' + estadoBadge + moraBadge + '</td>' +
      '<td>' + tel + '</td>' +
      '<td style="text-align:right;white-space:nowrap">' + totalTxt + '</td>' +
      '<td style="text-align:center;white-space:nowrap">' +
        '<button class="btn sm primary" onclick="RN.calendario._cobrar(\'' + c.id + '\')">Cobrar</button> ' +
        '<button class="btn sm" onclick="RN.calendario._recordar(\'' + c.id + '\')">WhatsApp</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  // Encabezado del modal
  var tituloIcono = esCorte ? '✂️' : '📅';
  var titulo = tituloIcono + ' Día ' + dia + ' de ' + RN.calc.mesTexto(ym);
  var badgesHtml = '';
  if (esCorte) badgesHtml += ' <span class="badge paid">Corte</span>';
  if (esCorteVigente) {
    var diasFaltan = RN.ciclos.diasParaPago(dia);
    badgesHtml += ' <span class="badge ok">● Vigente</span>';
    if (diasFaltan > 0) badgesHtml += ' <span class="muted" style="font-size:12px">— faltan ' + diasFaltan + ' día' + (diasFaltan > 1 ? 's' : '') + ' para el pago</span>';
    else badgesHtml += ' <span class="muted" style="font-size:12px">— hoy es la fecha de pago</span>';
  } else if (esCorte && esMesActual) {
    var hoyNum = RN.ciclos.diaHoyNum();
    if (dia < hoyNum) badgesHtml += ' <span class="badge due">Vencido</span>';
  }

  // KPI de resumen
  var kpiCls = pendientes > 0 ? 'amber' : 'green';
  var kpiSub = clientes.length + ' cliente' + (clientes.length > 1 ? 's' : '') + ' en este corte · ' +
    pagados + ' pagado' + (pagados !== 1 ? 's' : '') + ' · ' + pendientes + ' pendiente' + (pendientes !== 1 ? 's' : '');

  var html =
    '<div class="modal-header"><h3>' + titulo + '</h3>' +
    '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>' +
    '<div class="modal-body">' +
      '<div style="margin-bottom:12px">' + badgesHtml + '</div>' +
      '<div class="kpi ' + kpiCls + '" style="margin-bottom:12px">' +
        '<div class="label">Total a cobrar este día</div>' +
        '<div class="value">' + RN.calc.formatCUP(totalACobrar) + '</div>' +
        '<div class="sub">' + kpiSub + '</div>' +
      '</div>' +
      (totalEquipo > 0
        ? '<div class="acc-row" style="font-size:12px;margin-bottom:12px">' +
            '<span class="acc-label muted">Desglose: servicio ' + RN.calc.formatCUP(totalNeto) + ' + cuotas de equipo ' + RN.calc.formatCUP(totalEquipo) + '</span>' +
          '</div>'
        : '') +
      '<div class="table-wrap"><table><thead><tr>' +
        '<th>Cliente</th><th>Estado</th><th>Teléfono</th>' +
        '<th style="text-align:right">A pagar</th><th style="text-align:center">Acciones</th>' +
      '</tr></thead><tbody>' + filas + '</tbody></table></div>' +
      (pendientes > 0
        ? '<div style="margin-top:14px;text-align:right">' +
            '<button class="btn primary" onclick="RN.calendario._recordarTodosDia(' + dia + ')">💬 Recordar a todos (WhatsApp)</button>' +
          '</div>'
        : '') +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
    '</div>';

  // Guardar el día actual para el recordatorio masivo
  RN.calendario._diaAbierto = dia;
  RN.uiComponents.modal(html, { lg: true });
};

/** Abre el modal de cobro para un cliente (cierra esta ventana primero). */
RN.calendario._cobrar = function (clienteId) {
  RN.uiComponents.cerrarModal();
  RN.modalCobro.abrir(clienteId);
};

/** Envía recordatorio de WhatsApp a un cliente. */
RN.calendario._recordar = function (clienteId) {
  RN.whatsapp.enviarRecordatorio(clienteId);
};

/** Recordatorio masivo a todos los clientes del día abierto (solo pendientes). */
RN.calendario._recordarTodosDia = function (dia) {
  var clientes = RN.calendario._clientesDelDia(dia).filter(function (c) {
    return RN.calc.getStatus(c) !== 'paid' && RN.calc.mesInicioCliente(c) <= RN.calc.mesActualStr();
  });
  if (!clientes.length) {
    RN.notifyUI.toast('No hay pendientes en este día para recordar', 'info');
    return;
  }
  // Reutilizar el envío masivo si existe; si no, iterar individualmente.
  if (RN.whatsapp && typeof RN.whatsapp.enviarMasivo === 'function') {
    RN.uiComponents.cerrarModal();
    RN.whatsapp.enviarMasivo();
  } else {
    clientes.forEach(function (c) { RN.whatsapp.enviarRecordatorio(c.id); });
  }
};
