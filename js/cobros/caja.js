/**
 * cobros/caja.js — Gestión de retiros/extracciones del fondo de caja.
 * v5.10.2: Permite al administrador retirar dinero del fondo de caja
 * (ganancia acumulada) para uso personal o del negocio.
 *
 * Los retiros se guardan como gastos con categoria "Retiro de caja"
 * para que se resten automaticamente del fondo de caja calculado
 * (fondoInicial + ingresosTotales - gastosTotales).
 *
 * Funciones publicas:
 *   RN.caja.extraer()      — abre el modal para registrar un retiro
 *   RN.caja.guardar()      — guarda el retiro
 *   RN.caja.listar()       — muestra el historial de retiros
 *   RN.caja.totalRetiros() — suma total de retiros historicos
 */
RN.caja = RN.caja || {};

/** Categoría especial para distinguir retiros de caja de gastos normales. */
RN.caja.CATEGORIA_RETIRO = 'Retiro de caja';

/**
 * Abre el modal para registrar una extraccion/retiro del fondo de caja.
 * Muestra el fondo disponible y permite ingresar el monto a retirar.
 */
RN.caja.extraer = function () {
  var fondoDisponible = RN.calc.fondoCaja();
  var fondoFormateado = RN.calc.formatCUP(fondoDisponible);
  var puedeRetirar = fondoDisponible > 0;

  var html = `
    <div class="modal-header">
      <h3>💵 Extraer del fondo de caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi ${puedeRetirar ? 'green' : 'red'}" style="margin-bottom:16px">
        <div class="label">Fondo de caja disponible</div>
        <div class="value">${fondoFormateado}</div>
        <div class="sub">${puedeRetirar ? 'Saldo disponible para retirar' : 'No hay saldo disponible'}</div>
      </div>
      <div class="form-row">
        <div>
          <label>Monto a retirar (CUP) *</label>
          <input id="retiro-monto" type="number" step="0.01" min="0.01" placeholder="0.00"
                 oninput="RN.caja._validarMonto(this, ${fondoDisponible})">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Concepto / Motivo</label>
          <input id="retiro-concepto" placeholder="Ej: Retiro personal, compra de equipos, pago de servicios...">
        </div>
      </div>
      <div class="form-row">
        <div>
          <label>Fecha</label>
          <input id="retiro-fecha" type="date" value="${new Date().toISOString().slice(0, 10)}">
        </div>
      </div>
      <div id="retiro-aviso" style="margin-top:8px"></div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.caja.guardar()" id="retiro-btn-guardar"
              ${puedeRetirar ? '' : 'disabled style="opacity:0.5;cursor:not-allowed"'}>
        💵 Retirar
      </button>
    </div>`;
  RN.uiComponents.modal(html);
};

/**
 * Validacion en tiempo real del monto introducido.
 * Muestra advertencia si el monto excede el fondo disponible.
 */
RN.caja._validarMonto = function (input, fondoDisponible) {
  var monto = parseFloat(input.value) || 0;
  var aviso = document.getElementById('retiro-aviso');
  var btn = document.getElementById('retiro-btn-guardar');
  if (!aviso) return;

  if (monto <= 0) {
    aviso.innerHTML = '<span class="badge warn">Ingresa un monto válido mayor que 0</span>';
    if (btn) btn.disabled = true;
  } else if (monto > fondoDisponible) {
    aviso.innerHTML = '<span class="badge due">⚠️ El monto excede el fondo disponible (' +
      RN.calc.formatCUP(fondoDisponible) + '). El fondo quedará negativo.</span>';
    if (btn) btn.disabled = false; // permitimos pero advertimos
  } else {
    var restante = +(fondoDisponible - monto).toFixed(2);
    aviso.innerHTML = '<span class="badge ok">✓ Fondo restante después del retiro: ' +
      RN.calc.formatCUP(restante) + '</span>';
    if (btn) btn.disabled = false;
  }
};

/**
 * Guarda el retiro como un gasto con categoria "Retiro de caja".
 * Asi se resta automaticamente del fondo de caja calculado.
 */
RN.caja.guardar = function () {
  var monto = parseFloat(document.getElementById('retiro-monto').value) || 0;
  if (monto <= 0) {
    RN.notifyUI.toast('El monto debe ser mayor que 0', 'error');
    return;
  }

  var concepto = document.getElementById('retiro-concepto').value.trim() || 'Retiro de caja';
  var fecha = document.getElementById('retiro-fecha').value || new Date().toISOString().slice(0, 10);
  var fechaISO = new Date(fecha).toISOString();
  var mes = fecha.slice(0, 7);

  // Registrar como gasto con categoria especial
  RN.state.gastos.push({
    id: RN.calc.uid('retiro'),
    concepto: concepto,
    monto: monto,
    categoria: RN.caja.CATEGORIA_RETIRO,
    esRetiroCaja: true,
    fecha: fechaISO,
    mes: mes
  });

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.dashboard();
  RN.render.gastos();
  RN.notifyUI.toast('Retiro de caja registrado: ' + RN.calc.formatCUP(monto), 'success');
};

/**
 * Muestra el historial de retiros de caja en un modal.
 */
RN.caja.listar = function () {
  var retiros = RN.state.gastos
    .filter(function (g) { return g.esRetiroCaja; })
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });

  var total = RN.caja.totalRetiros();

  var filas = retiros.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay retiros registrados</p>'
    : retiros.map(function (r) {
        var fecha = new Date(r.fecha).toLocaleDateString('es-CU');
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(r.concepto) + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:var(--red,#dc2626)">-' + RN.calc.formatCUP(r.monto) + '</td>' +
          '<td style="text-align:center"><button class="btn sm ghost danger" onclick="RN.caja.eliminar(\'' + r.id + '\')">✕</button></td>' +
        '</tr>';
      }).join('');

  var html = `
    <div class="modal-header">
      <h3>💵 Historial de retiros de caja</h3>
      <button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>
    </div>
    <div class="modal-body">
      <div class="kpi red" style="margin-bottom:16px">
        <div class="label">Total retirado</div>
        <div class="value">${RN.calc.formatCUP(total)}</div>
        <div class="sub">${retiros.length} retiro(s) en total</div>
      </div>
      <table class="table" style="width:100%">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Concepto</th>
            <th style="text-align:right">Monto</th>
            <th style="text-align:center">Acción</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
      <button class="btn primary" onclick="RN.uiComponents.cerrarModal(); RN.caja.extraer()">💵 Nuevo retiro</button>
    </div>`;
  RN.uiComponents.modal(html);
};

/**
 * Elimina un retiro de caja del historial.
 */
RN.caja.eliminar = function (id) {
  RN.uiComponents.confirm('Eliminar retiro', '¿Eliminar este retiro de caja? El dinero volverá al fondo de caja.', function () {
    RN.state.gastos = RN.state.gastos.filter(function (g) { return g.id !== id; });
    RN.storageLocal.guardar();
    RN.caja.listar();
    RN.render.dashboard();
    RN.render.gastos();
    RN.notifyUI.toast('Retiro eliminado. Fondo de caja actualizado.', 'success');
  }, { danger: true });
};

/**
 * Suma total de todos los retiros de caja historicos.
 */
RN.caja.totalRetiros = function () {
  return RN.state.gastos
    .filter(function (g) { return g.esRetiroCaja; })
    .reduce(function (s, g) { return s + (g.monto || 0); }, 0);
};


/* ============================================================
 * v5.12.9 — DEVOLUCIÓN DE PRÉSTAMO (capital externo) vía caja.
 * ------------------------------------------------------------
 * Cuando una inversión tiene origen "prestado_externo", el dueño puede
 * registrar DEVOLUCIONES: dinero que saca de la caja y entrega al
 * prestamista. Se guardan como gastos con esDevolucionInversion para que:
 *   - salgan del fondo de caja (se restan),
 *   - se contabilicen como "devuelto" de esa inversión,
 *   - reduzcan el "saldo a devolver".
 * ============================================================ */

/**
 * Abre el modal para registrar una devolución de préstamo de una inversión.
 * @param {string} inversionId — ID de la inversión (préstamo externo).
 */
RN.caja.devolucionPrestamo = function (inversionId) {
  var inv = (RN.state.investments || []).find(function (i) { return i.id === inversionId; });
  if (!inv) {
    RN.notifyUI.toast('Inversión no encontrada', 'error');
    return;
  }
  if (RN.investment.origenCapital(inv) !== 'prestado_externo') {
    RN.notifyUI.toast('Esta inversión es capital propio, no requiere devolución', 'info');
    return;
  }
  var saldoDevolver = RN.investment.saldoADevolver(inv);
  var recuperadoNeto = RN.investment.recuperadoNetoInv(inv);
  var fondoDisponible = RN.calc.fondoCaja();
  // Lo máximo que se puede devolver es el menor entre: saldo a devolver,
  // lo recuperado neto (no devuelves lo que aún no generó el negocio) y
  // el fondo de caja disponible. Pero permitimos pasar del recuperado neto
  // (advertimos) porque el dueño puede usar otros fondos.
  var sugerido = Math.min(saldoDevolver, Math.max(0, recuperadoNeto));

  var html =
    '<div class="modal-header">' +
      '<h3>💸 Devolver préstamo — ' + RN.render.esc(inv.concepto) + '</h3>' +
      '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>' +
    '</div>' +
    '<div class="modal-body">' +
      '<div class="kpi blue" style="margin-bottom:12px">' +
        '<div class="label">Saldo a devolver al prestamista</div>' +
        '<div class="value">' + RN.calc.formatCUP(saldoDevolver) + '</div>' +
        '<div class="sub">De un préstamo de ' + RN.calc.formatCUP(inv.monto) + ' · ya devuelto ' + RN.calc.formatCUP(RN.investment.totalDevuelto(inv)) + '</div>' +
      '</div>' +
      '<div class="acc-row" style="margin-bottom:12px">' +
        '<span class="acc-label">Recuperado neto (generado por el negocio, aún sin devolver)</span>' +
        '<span class="acc-value"><strong style="color:var(--green)">' + RN.calc.formatCUP(Math.max(0, recuperadoNeto)) + '</strong></span>' +
      '</div>' +
      '<div class="acc-row" style="margin-bottom:16px">' +
        '<span class="acc-label">Fondo de caja disponible ahora</span>' +
        '<span class="acc-value">' + RN.calc.formatCUP(fondoDisponible) + '</span>' +
      '</div>' +
      '<div class="form-row"><div>' +
        '<label>Monto a devolver (CUP) *</label>' +
        '<input id="dev-monto" type="number" step="0.01" min="0.01" placeholder="0.00" value="' + (sugerido > 0 ? sugerido.toFixed(2) : '') + '"' +
          ' oninput="RN.caja._validarDevolucion(this, ' + saldoDevolver + ', ' + fondoDisponible + ', ' + recuperadoNeto + ')">' +
        '<small class="muted" style="display:block;margin-top:4px">Sugerido: lo recuperado del negocio que aún no has devuelto (' + RN.calc.formatCUP(Math.max(0, recuperadoNeto)) + ').</small>' +
      '</div></div>' +
      '<div class="form-row"><div>' +
        '<label>Concepto (opcional)</label>' +
        '<input id="dev-concepto" placeholder="Ej: Pago de cuota del préstamo a Juan">' +
      '</div></div>' +
      '<div class="form-row"><div>' +
        '<label>Fecha</label>' +
        '<input id="dev-fecha" type="date" value="' + new Date().toISOString().slice(0, 10) + '">' +
      '</div></div>' +
      '<div id="dev-aviso" style="margin-top:8px"></div>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>' +
      '<button class="btn primary" onclick="RN.caja.guardarDevolucion(\'' + inv.id + '\')" id="dev-btn-guardar">💸 Registrar devolución</button>' +
    '</div>';
  RN.uiComponents.modal(html);
  // Validación inicial
  RN.caja._validarDevolucion(document.getElementById('dev-monto'), saldoDevolver, fondoDisponible, recuperadoNeto);
};

/**
 * Validación en tiempo real del monto a devolver.
 */
RN.caja._validarDevolucion = function (input, saldoDevolver, fondoDisponible, recuperadoNeto) {
  var monto = parseFloat(input.value) || 0;
  var aviso = document.getElementById('dev-aviso');
  var btn = document.getElementById('dev-btn-guardar');
  if (!aviso) return;

  if (monto <= 0) {
    aviso.innerHTML = '<span class="badge warn">Ingresa un monto válido mayor que 0</span>';
    if (btn) btn.disabled = true;
  } else if (monto > saldoDevolver) {
    aviso.innerHTML = '<span class="badge due">⚠️ El monto excede el saldo a devolver (' + RN.calc.formatCUP(saldoDevolver) + ').</span>';
    if (btn) btn.disabled = false;
  } else if (monto > fondoDisponible) {
    aviso.innerHTML = '<span class="badge due">⚠️ El monto excede el fondo de caja disponible (' + RN.calc.formatCUP(fondoDisponible) + '). El fondo quedará negativo.</span>';
    if (btn) btn.disabled = false;
  } else if (monto > recuperadoNeto) {
    aviso.innerHTML = '<span class="badge warn">ℹ️ Devuelves más de lo recuperado del negocio (' + RN.calc.formatCUP(recuperadoNeto) + '). Estás usando otros fondos para adelantar el pago.</span>';
    if (btn) btn.disabled = false;
  } else {
    aviso.innerHTML = '<span class="badge ok">✓ Saldo a devolver restante: ' + RN.calc.formatCUP(+(saldoDevolver - monto).toFixed(2)) + '</span>';
    if (btn) btn.disabled = false;
  }
};

/**
 * Guarda la devolución de préstamo como un gasto marcado
 * (esDevolucionInversion + inversionId). Sale de la caja.
 */
RN.caja.guardarDevolucion = function (inversionId) {
  var monto = parseFloat(document.getElementById('dev-monto').value) || 0;
  if (monto <= 0) {
    RN.notifyUI.toast('El monto debe ser mayor que 0', 'error');
    return;
  }
  var concepto = document.getElementById('dev-concepto').value.trim();
  var fecha = document.getElementById('dev-fecha').value || new Date().toISOString().slice(0, 10);
  var fechaISO = new Date(fecha).toISOString();
  var mes = fecha.slice(0, 7);
  var inv = (RN.state.investments || []).find(function (i) { return i.id === inversionId; });
  if (!inv) return;

  if (!concepto) {
    concepto = 'Devolución de préstamo: ' + inv.concepto;
  }

  RN.state.gastos.push({
    id: RN.calc.uid('devinv'),
    concepto: concepto,
    monto: monto,
    categoria: 'Devolución de préstamo',
    esDevolucionInversion: true,
    inversionId: inversionId,
    fecha: fechaISO,
    mes: mes
  });

  // v5.13.0: verificar si la deuda quedó totalmente liquidada
  var concluida = RN.investment.verificarConclusion(inv);
  if (concluida) {
    RN.storageLocal.guardar();
  }

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.dashboard();
  RN.render.inversion();
  RN.render.gastos();
  if (RN.deudas) RN.deudas.render();
  if (concluida) {
    RN.notifyUI.toast('¡Deuda liquidada! Trasladada al historial de deudas concluidas.', 'success');
  }
  RN.notifyUI.toast('Devolución registrada: ' + RN.calc.formatCUP(monto), 'success');
};

/**
 * Muestra el historial de devoluciones de una inversión.
 */
RN.caja.historialDevoluciones = function (inversionId) {
  var inv = (RN.state.investments || []).find(function (i) { return i.id === inversionId; });
  if (!inv) return;
  var devs = RN.investment.devolucionesInv(inv)
    .sort(function (a, b) { return new Date(b.fecha) - new Date(a.fecha); });
  var total = RN.investment.totalDevuelto(inv);

  var filas = devs.length === 0
    ? '<p class="muted" style="text-align:center;padding:24px">No hay devoluciones registradas</p>'
    : devs.map(function (d) {
        var fecha = new Date(d.fecha).toLocaleDateString('es-CU');
        return '<tr>' +
          '<td>' + fecha + '</td>' +
          '<td>' + RN.render.esc(d.concepto) + '</td>' +
          '<td style="text-align:right;font-weight:bold;color:var(--red,#dc2626)">-' + RN.calc.formatCUP(d.monto) + '</td>' +
          '<td style="text-align:center"><button class="btn sm ghost danger" onclick="RN.caja.eliminarDevolucion(\'' + d.id + '\',\'' + inv.id + '\')">✕</button></td>' +
        '</tr>';
      }).join('');

  var html =
    '<div class="modal-header">' +
      '<h3>💸 Devoluciones — ' + RN.render.esc(inv.concepto) + '</h3>' +
      '<button class="close" onclick="RN.uiComponents.cerrarModal()">×</button>' +
    '</div>' +
    '<div class="modal-body">' +
      '<div class="kpi blue" style="margin-bottom:16px">' +
        '<div class="label">Total devuelto</div>' +
        '<div class="value">' + RN.calc.formatCUP(total) + '</div>' +
        '<div class="sub">Saldo a devolver: ' + RN.calc.formatCUP(RN.investment.saldoADevolver(inv)) + ' · ' + devs.length + ' devolución(es)</div>' +
      '</div>' +
      '<table class="table" style="width:100%">' +
        '<thead><tr><th>Fecha</th><th>Concepto</th><th style="text-align:right">Monto</th><th style="text-align:center">Acción</th></tr></thead>' +
        '<tbody>' + filas + '</tbody>' +
      '</table>' +
    '</div>' +
    '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>' +
      '<button class="btn primary" onclick="RN.uiComponents.cerrarModal(); RN.caja.devolucionPrestamo(\'' + inv.id + '\')">💸 Nueva devolución</button>' +
    '</div>';
  RN.uiComponents.modal(html);
};

/**
 * Elimina una devolución (devuelve el dinero al saldo a devolver y a la caja).
 */
RN.caja.eliminarDevolucion = function (gastoId, inversionId) {
  RN.uiComponents.confirm('Eliminar devolución',
    '¿Eliminar esta devolución? El dinero volverá al saldo a devolver y al fondo de caja.',
    function () {
      RN.state.gastos = RN.state.gastos.filter(function (g) { return g.id !== gastoId; });
      RN.storageLocal.guardar();
      RN.caja.historialDevoluciones(inversionId);
      RN.render.dashboard();
      RN.render.inversion();
      RN.render.gastos();
      RN.notifyUI.toast('Devolución eliminada. Saldo actualizado.', 'success');
    }, { danger: true });
};
