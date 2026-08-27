/**
 * cobros/descuentos.js — Núcleo de descuentos puntuales (v5.12.5).
 * Tipos: afectacion, bonificacion, ajuste.
 * Modos: fijo (CUP), porcentaje (% del precio mensual), dias (proporcional a días sin servicio).
 * Aplicacion: 'mes' (vigente solo este mes) o 'soloPago' (se consume en el próximo cobro).
 * Operaciones: crear, eliminar, marcar aplicado, revertir (al eliminar cobro), lote.
 */
RN.descuentos = RN.descuentos || {};

RN.descuentos.TIPOS = {
  afectacion: 'Afectación (interrupción/degradación del servicio)',
  bonificacion: 'Bonificación (promoción/fidelización)',
  ajuste: 'Ajuste (administrativo)'
};

RN.descuentos.MODOS = {
  fijo: 'Monto fijo (CUP)',
  porcentaje: 'Porcentaje del precio mensual',
  dias: 'Proporcional a días sin servicio'
};

/** Abre el modal para crear un descuento puntual. */
RN.descuentos.abrirNuevo = function (clienteId, mes) {
  const c = RN.state.clients.find(x => x.id === clienteId);
  if (!c) return;
  const html = `
    <div class="modal-header"><h3>Descuento puntual — ${RN.render.esc(c.nombre)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="form-row cols-2">
        <div><label>Tipo *</label><select id="dc-tipo">${Object.entries(RN.descuentos.TIPOS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div><label>Modo de cálculo *</label><select id="dc-modo">${Object.entries(RN.descuentos.MODOS).map(([k,v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      </div>
      <div class="form-row cols-2">
        <div><label id="dc-valor-label">Valor (CUP) *</label><input id="dc-valor" type="number" step="0.01" value="0"></div>
        <div><label>Motivo *</label><input id="dc-motivo" placeholder="Ej: 2 días sin servicio"></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Aplicación *</label><select id="dc-aplicacion">
          <option value="mes">Este mes (se anula si no se usa al cerrar el mes)</option>
          <option value="soloPago">Solo próximo pago (se consume en el próximo cobro, sin importar el mes)</option>
        </select></div>
        <div><span class="muted" style="display:block;margin-top:28px;font-size:12px" id="dc-aplicacion-info"></span></div>
      </div>
      <p class="muted" id="dc-preview"></p>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.descuentos.guardar('${clienteId}', '${mes}')">Agregar</button></div>`;
  RN.uiComponents.modal(html);

  const modoSel = document.getElementById('dc-modo');
  const actualizarLabel = () => {
    const lbl = document.getElementById('dc-valor-label');
    const m = modoSel.value;
    lbl.textContent = m === 'fijo' ? 'Valor (CUP) *' : (m === 'porcentaje' ? 'Valor (%) *' : 'Días sin servicio *');
    RN.descuentos._preview(clienteId);
  };
  modoSel.addEventListener('change', actualizarLabel);
  document.getElementById('dc-valor').addEventListener('input', () => RN.descuentos._preview(clienteId));
  const aplSel = document.getElementById('dc-aplicacion');
  const actualizarAplInfo = () => {
    const info = document.getElementById('dc-aplicacion-info');
    if (!info) return;
    if (aplSel.value === 'soloPago') {
      info.textContent = '⚠ Se aplicará al próximo cobro del cliente y se consumirá. No se anula al cerrar el mes.';
    } else {
      info.textContent = 'Válido solo para este mes. Se anula si el cliente no paga antes del cierre.';
    }
  };
  aplSel.addEventListener('change', actualizarAplInfo);
  actualizarAplInfo();
  actualizarLabel();
};

RN.descuentos._preview = function (clienteId) {
  const modo = document.getElementById('dc-modo').value;
  const valor = parseFloat(document.getElementById('dc-valor').value) || 0;
  const el = document.getElementById('dc-preview');
  if (!el) return;
  const d = { modo, valor };
  el.textContent = 'Descuento aplicado: ' + RN.calc.formatCUP(RN.calc.valorDescuento(d, clienteId));
};

RN.descuentos.guardar = function (clienteId, mes) {
  const tipo = document.getElementById('dc-tipo').value;
  const modo = document.getElementById('dc-modo').value;
  const valor = parseFloat(document.getElementById('dc-valor').value) || 0;
  const motivo = document.getElementById('dc-motivo').value.trim();
  const aplicacion = document.getElementById('dc-aplicacion') ? document.getElementById('dc-aplicacion').value : 'mes';
  const soloPago = (aplicacion === 'soloPago');
  if (!motivo) { RN.notifyUI.toast('El motivo es obligatorio', 'error'); return; }
  if (valor <= 0) { RN.notifyUI.toast('El valor debe ser mayor que 0', 'error'); return; }

  RN.state.descuentos.push({
    id: RN.calc.uid('desc'),
    clienteId,
    tipo,
    motivo,
    modo,
    valor,
    mes,
    soloPago,
    fecha: new Date().toISOString(),
    estado: 'pendiente',
    cobroHid: null
  });
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.notifyUI.toast(soloPago ? 'Descuento de un solo pago agregado (se consumirá en el próximo cobro)' : 'Descuento puntual agregado', 'success');
  // Reabrir el modal de cobro para ver el recálculo en vivo
  RN.modalCobro.abrir(clienteId);
};

/** Elimina un descuento puntual (o lo anula si ya fue aplicado). */
RN.descuentos.eliminar = function (id, reabrirCobro) {
  const d = RN.state.descuentos.find(x => x.id === id);
  if (!d) return;
  if (d.estado === 'aplicado') {
    // revertir: marcar anulado y recalcular no es trivial; anulamos
    RN.uiComponents.confirm('Anular descuento aplicado', 'Este descuento ya fue aplicado en un cobro. ¿Anularlo de todos modos?', () => {
      d.estado = 'anulado';
      RN.storageLocal.guardar();
      RN.render.todo();
      if (reabrirCobro) RN.modalCobro.abrir(d.clienteId);
      RN.notifyUI.toast('Descuento anulado', 'warn');
    }, { danger: true });
  } else {
    RN.state.descuentos = RN.state.descuentos.filter(x => x.id !== id);
    RN.storageLocal.guardar();
    RN.render.todo();
    if (reabrirCobro) RN.modalCobro.abrir(d.clienteId);
    RN.notifyUI.toast('Descuento eliminado', 'warn');
  }
};

/** Revierte descuentos asociados a un cobro al eliminar ese cobro. */
RN.descuentos.revertirPorCobro = function (cobroId) {
  RN.state.descuentos.forEach(d => {
    if (d.cobroHid === cobroId) {
      d.estado = 'pendiente';
      d.cobroHid = null;
    }
  });
};

/** Descuento por lote: aplicar el mismo descuento a varios clientes. */
RN.descuentos.abrirLote = function () {
  const activos = RN.calc.clientesActivos();
  if (!activos.length) { RN.notifyUI.toast('No hay clientes activos', 'warn'); return; }
  const cliOpts = activos.map(c => `<option value="${c.id}">${RN.render.esc(c.nombre)}</option>`).join('');
  const html = `
    <div class="modal-header"><h3>Descuento por lote</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <p class="muted mb-16">Aplica el mismo descuento puntual a varios clientes a la vez.</p>
      <div class="form-row"><div><label>Clientes (Ctrl/Cmd para varios) *</label>
        <select id="lot-cli" multiple style="height:140px">${cliOpts}</select></div></div>
      <div class="form-row cols-2">
        <div><label>Tipo</label><select id="lot-tipo">${Object.keys(RN.descuentos.TIPOS).map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
        <div><label>Modo</label><select id="lot-modo">${Object.keys(RN.descuentos.MODOS).map(k => `<option value="${k}">${k}</option>`).join('')}</select></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Valor</label><input id="lot-valor" type="number" step="0.01" value="0"></div>
        <div><label>Motivo *</label><input id="lot-motivo" placeholder="Ej: interrupción general"></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.descuentos.guardarLote()">Aplicar lote</button></div>`;
  RN.uiComponents.modal(html, { lg: true });
};

RN.descuentos.guardarLote = function () {
  const clientes = Array.from(document.getElementById('lot-cli').selectedOptions).map(o => o.value);
  if (!clientes.length) { RN.notifyUI.toast('Selecciona al menos un cliente', 'error'); return; }
  const tipo = document.getElementById('lot-tipo').value;
  const modo = document.getElementById('lot-modo').value;
  const valor = parseFloat(document.getElementById('lot-valor').value) || 0;
  const motivo = document.getElementById('lot-motivo').value.trim();
  if (!motivo) { RN.notifyUI.toast('El motivo es obligatorio', 'error'); return; }
  const mes = RN.calc.mesActualStr();
  clientes.forEach(cid => {
    RN.state.descuentos.push({
      id: RN.calc.uid('desc'), clienteId: cid, tipo, motivo, modo, valor,
      mes, soloPago: false, fecha: new Date().toISOString(), estado: 'pendiente', cobroHid: null
    });
  });
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast(`Descuento aplicado a ${clientes.length} cliente(s)`, 'success');
};
