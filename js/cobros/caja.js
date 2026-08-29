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
 *
 * v5.13.2: RESPONSABILIDAD ÚNICA — Las funciones de DEVOLUCIÓN DE PRÉSTAMO
 * (devolucionPrestamo, guardarDevolucion, historialDevoluciones,
 * eliminarDevolucion, _validarDevolucion) se movieron a inversion.js porque
 * son responsabilidad del módulo de inversión, no de la caja. caja.js ahora
 * solo gestiona retiros de caja personales. Esto elimina la mezcla de dos
 * conceptos distintos (retiros de ganancia vs. repagos de capital prestado)
 * que antes coexistían en este archivo.
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
