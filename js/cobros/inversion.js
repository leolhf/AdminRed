/**
 * cobros/inversion.js — Inversión personal, recuperación y deudas personales.
 *
 * v5.13.2: FUSIÓN — Este módulo ahora integra también la vista de "Deudas
 * personales" que antes estaba en el archivo separado deudas.js. Ambas vistas
 * gestionan el mismo modelo (RN.state.investments) y solo se diferencian por
 * el filtro origenCapital. Al fusionarlas se elimina:
 *   - El archivo deudas.js (201 líneas redundantes)
 *   - La función RN.deudas.eliminar() divergente que SIEMPRE borraba las
 *     devoluciones (incluso para capital propio) — BUG corregido.
 *   - La confusión conceptual de tener dos módulos para el mismo dato.
 *
 * Pivote de diseño: los clientes vinculados a una inversión ya no cargan deuda
 * directamente, solo contribuyen su ingreso neto de servicio a la proyección.
 *
 * v5.11.0: Se añade la FECHA DE COMPRA de la inversión, lo que permite saber
 * qué clientes influyen en la recuperación (aporte desde esa fecha) y cuántos
 * días han transcurrido.
 *
 * v5.11.3: La recuperación se calcula AUTOMÁTICAMENTE a partir del margen neto
 * de los clientes vinculados (descuenta el costo del mega y la retención
 * personal). Se eliminan los campos manuales "Recuperado hasta ahora" y
 * "Aporte mensual estimado" del formulario.
 *
 * v5.12.0: Se añade el BLOQUE DE MONEDA (CUP/USD/MIXTO) para registrar cómo se
 * pagó la compra de la inversión. El monto invertido se guarda en CUP como
 * referencia principal, y los campos de pago (moneda, USD, CUP, tasa) quedan
 * como metadata del pago real.
 *
 * v5.12.1: CAMBIO DE PARADIGMA — El monto invertido ya NO es un campo editable.
 * Se CALCULA automáticamente a partir de lo que el usuario ingresa en el bloque
 * de moneda (USD×tasa + CUP). El bloque de pago pasa a ser la FUENTE de verdad
 * del monto, no meramente informativo. El campo "Monto invertido" es readonly.
 * Decisiones: 1a (USD deshabilitado sin tasa), 2a (precargar monto anterior en
 * CUP al editar), 3a (sin "a pagar", solo total desembolsado).
 *
 * v5.12.9: ORIGEN DEL CAPITAL — Cada inversión se marca como "Capital propio"
 * o "Préstamo externo" (dinero que debo devolver). Cuando es préstamo externo,
 * la app lleva un saldo a devolver y permite registrar devoluciones desde este
 * módulo (RN.inversion.devolucionPrestamo). Se integra el % de ganancia del mes
 * real.
 */
RN.inversion = RN.inversion || {};

RN.inversion._editId = null;

RN.inversion.abrirNueva = function () {
  RN.inversion._editId = null;
  RN.inversion._form();
};

RN.inversion.abrirEditar = function (id) {
  RN.inversion._editId = id;
  RN.inversion._form();
};

RN.inversion._form = function () {
  const id = RN.inversion._editId;
  const inv = id ? RN.state.investments.find(x => x.id === id) : null;
  const clientesOpts = RN.state.clients.map(c =>
    `<option value="${c.id}" ${inv && (inv.clienteIds || []).includes(c.id) ? 'selected' : ''}>${RN.render.esc(c.nombre)}</option>`
  ).join('');

  // Fecha de compra: prioriza fechaCompra, si no usa la fecha de creación
  // v5.12.2: normalizar a YYYY-MM-DD (el input type=date requiere este formato)
  // inv.fechaCompra puede estar guardado como ISO completo o como YYYY-MM-DD
  var fechaRaw = inv ? (inv.fechaCompra || (inv.fecha ? inv.fecha.slice(0, 10) : '')) : '';
  const fechaCompraVal = fechaRaw ? String(fechaRaw).slice(0, 10) : new Date().toISOString().slice(0, 10);

  // v5.11.3: mostrar el cálculo automático (solo informativo, no editable)
  const pctPersonal = RN.investment.pctPersonal();
  const recuAuto = inv ? RN.investment.recuperadoRealInv(inv) : 0;
  const aporteMes = inv ? RN.investment.aporteMensualNeto(inv) : 0;

  // v5.12.9: origen del capital (propio / préstamo externo)
  const origenVal = inv ? RN.investment.origenCapital(inv) : 'propio';
  const aporteExtraMes = inv ? RN.investment.aporteExtraMes(inv) : 0;
  const pctGananciaMes = RN.investment.pctGananciaMes();

  const html = `
    <div class="modal-header"><h3>${inv ? 'Editar inversión' : 'Nueva inversión personal'}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row"><div><label>Concepto *</label><input id="inv-concepto" value="${RN.render.esc(inv ? inv.concepto : '')}" placeholder="Ej: Compra de 5 routers"></div></div>
      <div class="form-row">
        <div><label>Fecha de compra *</label><input id="inv-fecha-compra" type="date" value="${fechaCompraVal}"><small class="muted" style="display:block;margin-top:4px">Desde esta fecha se miden los aportes de los clientes a la recuperación.</small></div>
      </div>
      <div class="form-row">
        <div><label>Origen del capital *</label>
          <select id="inv-origen" onchange="RN.inversion._toggleOrigen()">
            <option value="propio" ${origenVal === 'propio' ? 'selected' : ''}>Capital propio (no hay que devolverlo)</option>
            <option value="prestado_externo" ${origenVal === 'prestado_externo' ? 'selected' : ''}>Préstamo externo (dinero que debo devolver)</option>
          </select>
          <small class="muted" style="display:block;margin-top:4px" id="inv-origen-ayuda">Si el dinero lo prestó un banco, familiar u otra persona y debes devolverlo, elige "Préstamo externo". La app llevará un saldo a devolver y podrás registrar devoluciones desde la caja.</small>
        </div>
      </div>
      <div class="form-row"><div><label>Clientes vinculados (Ctrl/Cmd para varios)</label>
        <select id="inv-clientes" multiple style="height:120px">${clientesOpts}</select>
        <small class="muted" style="display:block;margin-top:4px">Solo el margen neto de estos clientes (ingreso − costo del mega) recupera la inversión. El ${pctPersonal}% de ganancia personal configurado NO computa como recuperación.</small>
      </div></div>
      <div class="divider"></div>
      <div class="muted" style="font-size:13px;margin-bottom:8px">¿Cómo se pagó esta compra? Ingresa cuánto pagaste en USD y/o CUP — el monto invertido se calcula automáticamente.</div>
      ${RN.moneda.bloquePagoHTML('inv-pago', { titulo: 'Pago de la compra' })}
      <div class="form-row">
        <div><label>Monto invertido (CUP) — calculado automáticamente</label><input id="inv-monto" type="text" readonly style="font-weight:700;font-size:16px;color:var(--blue);background:var(--bg)" value="${inv ? RN.calc.formatCUP(inv.monto) : ''}"><small class="muted" style="display:block;margin-top:4px">Este es el capital a recuperar. Se deriva del pago ingresado arriba.</small></div>
      </div>
      ${pctGananciaMes > 0 ? `
      <div class="form-row">
        <div><label>Aporte extra del mes (% ganancia real: ${pctGananciaMes}%)</label><input type="text" value="${RN.calc.formatCUP(aporteExtraMes)}" readonly style="font-weight:700"><small class="muted" style="display:block;margin-top:4px">Cada mes, el ${pctGananciaMes}% de la ganancia neta real del negocio se destina a acelerar la recuperación del capital.</small></div>
      </div>` : ''}
      ${inv ? `
      <div class="form-row cols-2">
        <div><label>Recuperado (automático)</label><input type="text" value="${RN.calc.formatCUP(recuAuto)}" readonly style="font-weight:700"></div>
        <div><label>Aporte neto mensual estimado</label><input type="text" value="${RN.calc.formatCUP(aporteMes)}" readonly style="font-weight:700"></div>
      </div>` : ''}
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.inversion.guardar()">Guardar</button>
    </div>`;
  RN.uiComponents.modal(html);
  // v5.12.1: Modo derivado — el monto se calcula desde los campos de pago
  RN.moneda.initBloquePago('inv-pago');
  RN.moneda.configModoDerivado('inv-pago', function (pagadoCUP) {
    var montoIn = document.getElementById('inv-monto');
    if (montoIn) montoIn.value = pagadoCUP > 0 ? RN.calc.formatCUP(pagadoCUP) : '';
  });
  // Si editando, precargar los campos de pago guardados (o el monto anterior en CUP)
  if (inv) {
    if (inv.monedaPago) {
      // Inversión creada con v5.12.0+: precargar campos de pago guardados
      RN.moneda.setMonedaBloque('inv-pago', inv.monedaPago);
      var usdIn = document.getElementById('inv-pago-monto-usd');
      var cupIn = document.getElementById('inv-pago-monto-cup');
      if (usdIn) usdIn.value = inv.montoPagoUSD || 0;
      if (cupIn) cupIn.value = inv.montoPagoCUP || 0;
    } else {
      // Inversión anterior (sin monedaPago): precargar el monto en CUP (decisión 2a)
      var cupIn2 = document.getElementById('inv-pago-monto-cup');
      if (cupIn2) cupIn2.value = inv.monto || 0;
    }
  }
  RN.moneda.recalcBloquePago('inv-pago');
  RN.inversion._toggleOrigen();
};

/** v5.12.9 — Actualiza la ayuda y el label del monto según el origen del capital. */
RN.inversion._toggleOrigen = function () {
  var sel = document.getElementById('inv-origen');
  if (!sel) return;
  var esPrestamo = sel.value === 'prestado_externo';
  var ayuda = document.getElementById('inv-origen-ayuda');
  var montoLabel = document.querySelector('#inv-monto').closest('.form-row').querySelector('label');
  var montoSmall = document.querySelector('#inv-monto + .muted');
  if (ayuda) {
    ayuda.textContent = esPrestamo
      ? 'Este dinero lo prestó un banco, familiar u otra persona y debes devolverlo. La app llevará un saldo a devolver y podrás registrar devoluciones desde la caja (extraer dinero y marcarlo como devolución de préstamo).'
      : 'Si el dinero lo prestó un banco, familiar u otra persona y debes devolverlo, elige "Préstamo externo". La app llevará un saldo a devolver y podrás registrar devoluciones desde la caja.';
  }
  if (montoLabel) {
    montoLabel.textContent = esPrestamo
      ? 'Monto a devolver (CUP) — calculado automáticamente'
      : 'Monto invertido (CUP) — calculado automáticamente';
  }
  if (montoSmall) {
    montoSmall.textContent = esPrestamo
      ? 'Este es el capital a devolver al prestamista. Se deriva del pago ingresado arriba.'
      : 'Este es el capital a recuperar. Se deriva del pago ingresado arriba.';
  }
};

RN.inversion.guardar = function () {
  const concepto = document.getElementById('inv-concepto').value.trim();
  if (!concepto) { RN.notifyUI.toast('El concepto es obligatorio', 'error'); return; }
  // v5.12.1: el monto se deriva del bloque de pago (modo derivado)
  const pago = RN.moneda.leerBloquePago('inv-pago', 0);
  const monto = pago.totalRecibidoCUP || 0;
  // v5.13.4 (Mejora #5): Validar montos no negativos
  if ((pago.montoUSD || 0) < 0 || (pago.montoCUP || 0) < 0) {
    RN.notifyUI.toast('Los montos de pago no pueden ser negativos', 'error');
    return;
  }
  // v5.13.4 (Mejora #5): Advertir si la tasa parece irreal y hay pago en USD
  if ((pago.montoUSD || 0) > 0 && pago.tasaUsd > 0 && (pago.tasaUsd < 1 || pago.tasaUsd > 100000)) {
    RN.notifyUI.toast('La tasa USD (' + pago.tasaUsd + ') parece irreal. Revísala en Ajustes.', 'warn');
  }
  if (monto <= 0) { RN.notifyUI.toast('Ingresa cuánto pagaste en USD y/o CUP para calcular el monto invertido', 'error'); return; }
  // v5.13.4 (Mejora #5): Validar monto de inversión razonable (no más de 100 millones CUP)
  if (monto > 100000000) {
    RN.notifyUI.toast('El monto invertido (' + RN.calc.formatCUP(monto) + ') parece excesivo. Verifica los datos.', 'warn');
  }
  const clientes = Array.from(document.getElementById('inv-clientes').selectedOptions).map(o => o.value);
  const fechaCompraRaw = document.getElementById('inv-fecha-compra').value;
  if (!fechaCompraRaw) { RN.notifyUI.toast('La fecha de compra es obligatoria', 'error'); return; }
  // v5.12.2: guardar como YYYY-MM-DD (sin hora) para evitar problemas de zona horaria
  const fechaCompra = fechaCompraRaw.slice(0, 10);
  // v5.12.9: origen del capital
  const origenCapital = document.getElementById('inv-origen').value || 'propio';

  const data = {
    concepto, monto, clienteIds: clientes, fechaCompra,
    origenCapital,
    monedaPago: pago.moneda,
    montoPagoUSD: pago.montoUSD,
    montoPagoCUP: pago.montoCUP,
    montoPagoCUPDesdeUSD: pago.montoCUPDesdeUSD,
    totalPagoCUP: pago.totalRecibidoCUP,
    tasaUsdCompra: pago.tasaUsd
  };
  const id = RN.inversion._editId;
  if (id) {
    Object.assign(RN.state.investments.find(x => x.id === id), data);
  } else {
    data.id = RN.calc.uid('inv');
    data.fecha = new Date().toISOString();
    RN.state.investments.push(data);
  }
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast(id ? 'Inversión actualizada' : 'Inversión creada', 'success');
};

/**
 * v5.13.2 — Eliminar unificado (FUNCIÓN ÚNICA, bug corregido).
 *
 * Antes (v5.13.0-v5.13.1) existían DOS funciones eliminar divergentes:
 *   - RN.inversion.eliminar (inversion.js): solo borraba devoluciones si era préstamo ✅
 *   - RN.deudas.eliminar (deudas.js): SIEMPRE borraba las devoluciones, incluso
 *     para capital propio ❌ BUG — podía eliminar gastos legítimos por error.
 *
 * Ahora hay una sola función que aplica la lógica correcta: las devoluciones
 * solo se eliminan cuando la inversión es un préstamo externo (origenCapital
 * === 'prestado_externo'), porque esas devoluciones son repagos del capital
 * prestado y no tienen sentido sin la deuda. Para capital propio, las
 * devoluciones se conservan en el historial de gastos.
 */
RN.inversion.eliminar = function (id) {
  var inv = (RN.state.investments || []).find(function (i) { return i.id === id; });
  if (!inv) return;
  var esPrestamo = RN.investment.origenCapital(inv) === 'prestado_externo';
  var devs = RN.investment.devolucionesInv(inv);
  var tipoTxt = esPrestamo ? 'deuda personal' : 'inversión';
  var msg = '¿Eliminar esta ' + tipoTxt + ' del registro?';
  if (esPrestamo && devs.length) {
    msg = '¿Eliminar esta deuda personal (préstamo externo)? Se eliminarán también ' + devs.length + ' devoluciones asociadas (' + RN.calc.formatCUP(RN.investment.totalDevuelto(inv)) + '). Esta acción no se puede deshacer.';
  } else {
    msg += ' Las devoluciones asociadas se conservarán en el historial de gastos.';
  }
  RN.uiComponents.confirm('Eliminar ' + tipoTxt, msg, () => {
    RN.state.investments = RN.state.investments.filter(x => x.id !== id);
    // Solo si es préstamo, eliminar también sus devoluciones
    if (esPrestamo) {
      RN.state.gastos = (RN.state.gastos || []).filter(g => !(g.esDevolucionInversion && g.inversionId === id));
    }
    RN.storageLocal.guardar();
    RN.render.todo();
    RN.notifyUI.toast(esPrestamo ? 'Deuda personal eliminada' : 'Inversión eliminada', 'warn');
  }, { danger: true });
};

/* ============================================================
 * v5.13.2 — DEVOLUCIÓN DE PRÉSTAMO (movida desde caja.js)
 * ------------------------------------------------------------
 * Antes las devoluciones de préstamo estaban en caja.js, mezcladas con los
 * retiros de caja (dos responsabilidades distintas en un solo archivo). Ahora
 * se mueven aquí, junto a la inversión que originan, respetando el principio
 * de responsabilidad única. RN.caja queda solo con los retiros de caja.
 * ============================================================ */

/**
 * Abre el modal para registrar una devolución de préstamo de una inversión.
 * @param {string} inversionId — ID de la inversión (préstamo externo).
 */
RN.inversion.devolucionPrestamo = function (inversionId) {
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
      '<h3>💨 Devolver préstamo — ' + RN.render.esc(inv.concepto) + '</h3>' +
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
          ' oninput="RN.inversion._validarDevolucion(this, ' + saldoDevolver + ', ' + fondoDisponible + ', ' + recuperadoNeto + ')">' +
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
      '<button class="btn primary" onclick="RN.inversion.guardarDevolucion(\'' + inv.id + '\')" id="dev-btn-guardar">💨 Registrar devolución</button>' +
    '</div>';
  RN.uiComponents.modal(html);
  // Validación inicial
  RN.inversion._validarDevolucion(document.getElementById('dev-monto'), saldoDevolver, fondoDisponible, recuperadoNeto);
};

/**
 * v5.13.2 — Validación en tiempo real del monto a devolver (movida desde caja.js).
 */
RN.inversion._validarDevolucion = function (input, saldoDevolver, fondoDisponible, recuperadoNeto) {
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
 * v5.13.2 — Guarda la devolución de préstamo como un gasto marcado
 * (esDevolucionInversion + inversionId). Sale de la caja.
 * (Movida desde caja.js, referencias RN.caja.* actualizadas a RN.inversion.*)
 */
RN.inversion.guardarDevolucion = function (inversionId) {
  var monto = parseFloat(document.getElementById('dev-monto').value) || 0;
  if (monto < 0) {
    RN.notifyUI.toast('El monto no puede ser negativo', 'error');
    return;
  }
  if (monto <= 0) {
    RN.notifyUI.toast('El monto debe ser mayor que 0', 'error');
    return;
  }
  // v5.13.4 (Mejora #5): Validar que la devolución no exceda el saldo pendiente
  var inv = (RN.state.investments || []).find(function (i) { return i.id === inversionId; });
  if (!inv) return;
  var totalDevuelto = RN.investment.totalDevuelto(inv);
  var saldoPendiente = inv.monto - totalDevuelto;
  if (monto > saldoPendiente + 0.01) {
    RN.notifyUI.toast('La devolución (' + RN.calc.formatCUP(monto) +
      ') excede el saldo pendiente (' + RN.calc.formatCUP(saldoPendiente) + ')', 'error');
    return;
  }
  var concepto = document.getElementById('dev-concepto').value.trim();
  var fecha = document.getElementById('dev-fecha').value || new Date().toISOString().slice(0, 10);
  // v5.13.5 (ISSUE #12): Construir fecha ISO sin conversión de timezone.
  var fechaISO = fecha + 'T00:00:00';
  var mes = fecha.slice(0, 7);

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

  // v5.13.1: Bug #6 — eliminado el guardado duplicado dentro de if(concluida).
  var concluida = RN.investment.verificarConclusion(inv);

  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.dashboard();
  RN.render.inversion();
  RN.render.gastos();
  RN.inversion.renderDeudas();
  // v5.13.5 (ISSUE #13): Consolidar los dos toasts consecutivos en uno solo.
  // Antes se mostraba "¡Deuda liquidada!" y luego "Devolución registrada: X",
  // lo que podía confundir o solaparse visualmente.
  var msg = 'Devolución registrada: ' + RN.calc.formatCUP(monto);
  if (concluida) {
    msg = '¡Deuda liquidada! (' + RN.calc.formatCUP(monto) + ') · Trasladada al historial de deudas concluidas.';
  }
  RN.notifyUI.toast(msg, 'success');
};

/**
 * v5.13.2 — Muestra el historial de devoluciones de una inversión.
 * (Movida desde caja.js, referencias actualizadas a RN.inversion.*)
 */
RN.inversion.historialDevoluciones = function (inversionId) {
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
          '<td style="text-align:center"><button class="btn sm ghost danger" onclick="RN.inversion.eliminarDevolucion(\'' + d.id + '\',\'' + inv.id + '\')">✕</button></td>' +
        '</tr>';
      }).join('');

  var html =
    '<div class="modal-header">' +
      '<h3>💨 Devoluciones — ' + RN.render.esc(inv.concepto) + '</h3>' +
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
      '<button class="btn primary" onclick="RN.uiComponents.cerrarModal(); RN.inversion.devolucionPrestamo(\'' + inv.id + '\')">💨 Nueva devolución</button>' +
    '</div>';
  RN.uiComponents.modal(html);
};

/**
 * v5.13.2 — Elimina una devolución (devuelve el dinero al saldo a devolver y a la caja).
 * (Movida desde caja.js, referencias actualizadas a RN.inversion.*)
 */
RN.inversion.eliminarDevolucion = function (gastoId, inversionId) {
  RN.uiComponents.confirm('Eliminar devolución',
    '¿Eliminar esta devolución? El dinero volverá al saldo a devolver y al fondo de caja.',
    function () {
      RN.state.gastos = RN.state.gastos.filter(function (g) { return g.id !== gastoId; });
      RN.storageLocal.guardar();
      RN.inversion.historialDevoluciones(inversionId);
      RN.render.dashboard();
      RN.render.inversion();
      RN.render.gastos();
      RN.inversion.renderDeudas();
      RN.notifyUI.toast('Devolución eliminada. Saldo actualizado.', 'success');
    }, { danger: true });
};

/* ============================================================
 * v5.13.2 — VISTA DE DEUDAS PERSONALES (fusionada desde deudas.js)
 * ------------------------------------------------------------
 * Antes existía un archivo separado deudas.js que duplicaba la lógica de
 * inversión con solo un filtro de diferencia (origenCapital === 'prestado_externo').
 * Ahora la vista de deudas se renderiza desde este mismo módulo, eliminando
 * el archivo deudas.js y su función eliminar() divergente con bug.
 * ============================================================ */

/**
 * Render principal de la vista "Deudas personales".
 * Pinta los KPIs, la lista de deudas activas y el historial de concluidas.
 */
// v5.13.2 (fusi\u00f3n visual): renderDeudas ahora delega en render.inversion()
// que pinta inversiones + deudas + KPIs combinados en la vista unificada.
// Se conserva por compatibilidad con llamadas existentes (guardar, eliminar, devoluciones).
RN.inversion.renderDeudas = function () {
  RN.render.inversion();
};

/**
 * Pinta los KPIs de la sección deudas.
 */
RN.inversion._renderKPIsDeudas = function (activas, concluidas) {
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
RN.inversion._renderDeudasActivas = function (activas) {
  var cont = document.getElementById('lista-deudas-activas');
  if (!cont) return;

  if (!activas.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💸</div>No hay deudas personales activas. Toda deuda pendiente aparecerá aquí.</div>';
    return;
  }

  cont.innerHTML = activas.map(function (inv) {
    return RN.inversion._cardDeuda(inv, false);
  }).join('');
};

/**
 * Pinta el historial de deudas concluidas.
 */
RN.inversion._renderDeudasConcluidas = function (concluidas) {
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
    return RN.inversion._cardDeuda(inv, true);
  }).join('');
};

/**
 * Genera el HTML de una tarjeta de deuda (activa o concluida).
 * @param {object} inv — la inversión (préstamo externo)
 * @param {boolean} esConcluida — true si la deuda ya está liquidada
 */
RN.inversion._cardDeuda = function (inv, esConcluida) {
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
    // v5.13.3: información de recuperación de la inversión (clientes vinculados)
    +   (function () {
        var _aportes = RN.investment.aportesPorCliente(inv);
        var _recuperado = RN.investment.recuperadoRealInv(inv);
        var _pctRec = inv.monto ? Math.round(_recuperado / inv.monto * 100) : 0;
        var _margenMes = RN.investment.margenMensualBruto(inv);
        var _aporteMes = RN.investment.aporteMensualNeto(inv);
        var _proyeccion = RN.investment.proyectarRecuperacion(inv);
        var _nClientes = (inv.clienteIds || []).length;
        var _html = '<div class="acc-row" style="font-weight:600"><span class="acc-label">Recuperación de la inversión</span><span class="acc-value">' + _pctRec + '%</span></div>'
          + '<div class="acc-row"><span class="acc-label">Clientes vinculados</span><span class="acc-value">' + _nClientes + '</span></div>'
          + '<div class="acc-row"><span class="acc-label">Recuperado (neto, automático)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(_recuperado) + '</strong></span></div>'
          + '<div class="acc-row"><span class="acc-label">Margen neto mensual (bruto)</span><span class="acc-value">' + RN.calc.formatCUP(_margenMes) + '</span></div>'
          + '<div class="acc-row"><span class="acc-label">Aporte neto mensual a recuperación</span><span class="acc-value">' + RN.calc.formatCUP(_aporteMes) + '</span></div>'
          + '<div class="acc-row"><span class="acc-label">Tiempo restante para recuperar</span><span class="acc-value"><strong>' + RN.render.esc(_proyeccion) + '</strong></span></div>';
        if (_aportes.length) {
          _html += '<div class="acc-row" style="font-weight:600"><span class="acc-label">Ganancia por cliente</span><span class="acc-value">' + RN.calc.formatCUP(RN.investment.totalRecuperacionClientes(inv)) + '</span></div>';
          _aportes.forEach(function (a) {
            var _nom = a.cliente ? RN.render.esc(a.cliente.nombre) : '<span class="muted">— eliminado —</span>';
            _html += '<div class="acc-row"><span class="acc-label">' + _nom + '</span><span class="acc-value"><strong>' + RN.calc.formatCUP(a.recuperacion) + '</strong></span></div>';
          });
        }
        return _html;
      })()
    +   '<div class="divider" style="margin:8px 0"></div>'
    +   '<div class="acc-actions">'
    +     (esConcluida
        ? '<button class="btn sm" onclick="RN.inversion.historialDevoluciones(\'' + inv.id + '\')">📋 Ver devoluciones</button>'
        : '<button class="btn sm primary" onclick="RN.inversion.devolucionPrestamo(\'' + inv.id + '\')">💨 Devolver préstamo</button>'
          + '<button class="btn sm" onclick="RN.inversion.historialDevoluciones(\'' + inv.id + '\')">📋 Devoluciones</button>')
    +     '<button class="btn sm" onclick="RN.inversion.abrirEditar(\'' + inv.id + '\')">Editar</button>'
    +     '<button class="btn sm danger" onclick="RN.inversion.eliminar(\'' + inv.id + '\')">🗑</button>'
    +   '</div>'
    + '</div>'
    + '</div>';
};
