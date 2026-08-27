/**
 * cobros/inversion.js — Inversión personal y recuperación.
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
 * la app lleva un saldo a devolver y permite registrar devoluciones desde la
 * caja (RN.caja.devolucionPrestamo). Se integra el % de ganancia del mes real.
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
  if (monto <= 0) { RN.notifyUI.toast('Ingresa cuánto pagaste en USD y/o CUP para calcular el monto invertido', 'error'); return; }
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

RN.inversion.eliminar = function (id) {
  RN.uiComponents.confirm('Eliminar inversión', '¿Eliminar esta inversión del registro? Las devoluciones asociadas se conservarán en el historial de gastos.', () => {
    RN.state.investments = RN.state.investments.filter(x => x.id !== id);
    RN.storageLocal.guardar();
    RN.render.todo();
    RN.notifyUI.toast('Inversión eliminada', 'warn');
  }, { danger: true });
};
