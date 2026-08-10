// descuentos.js
// v5.8.0 — Sistema de descuentos puntuales (afectacion / bonificacion / ajuste)
// vinculados al cobro y al mensaje de WhatsApp.
//
// Depende de: state.js (descuentos, clients, config), calculations.js
//   (getPrecioCliente, calcularDescuentoTotal, descuentosPendientesCliente,
//    fechaLocalISO, fmt), storage-local.js (save), render.js (render),
//   notify-ui.js (notify).
//
// Modelo de un descuento puntual (ver state.js):
//   { id, clienteId, tipo, motivo, modo, valor, mes, fecha, aplicado, cobroHid }
//     tipo: 'afectacion' | 'bonificacion' | 'ajuste'
//     modo: 'monto' (CUP fijos) | 'pct' (porcentaje) | 'dias' (proporcional a dias sin servicio)
//
// Carga DESPUES de: modal-cobro.js (usa openCobroModal/estado del modal).
// Se invoca desde el sub-panel de descuentos del modal de cobro y desde la
// vista general de descuentos (descuentos-view.js).

// Motivos predefinidos por tipo (el admin puede ampliar en el futuro desde
// Ajustes; por ahora viven aqui como defaults). El usuario siempre puede
// escribir "Otro" y un motivo libre.
const MOTIVOS_DESCUENTO_DEFAULT = {
  afectacion: [
    'Caida del servicio por energia',
    'Caida del enlace / backbone',
    'Saturacion temporal de la red',
    'Mantenimiento programado',
    'Corte por obras en la zona',
    'Problema del proveedor'
  ],
  bonificacion: [
    'Cliente nuevo (mes de lanzamiento)',
    'Trae a un amigo',
    'Pago anticipado / anual',
    'Cumpleanos / aniversario',
    'Buena conducta de pago',
    'Compensacion por referido'
  ],
  ajuste: [
    'Redondeo para cuadrar pago parcial',
    'Compensacion por error de cobro anterior',
    'Ajuste administrativo'
  ]
};

// Devuelve la lista de motivos para un tipo (default si no hay config).
function motivosDescuentoPorTipo(tipo) {
  if (config.motivosDescuento && Array.isArray(config.motivosDescuento[tipo])) {
    return config.motivosDescuento[tipo];
  }
  return MOTIVOS_DESCUENTO_DEFAULT[tipo] || [];
}

// Metadatos de presentacion por tipo (icono, color, etiqueta).
const META_TIPO_DESCUENTO = {
  afectacion:   { icon: '\u26a0\ufe0f', label: 'Afectacion del servicio', color: 'var(--red)'   },
  bonificacion: { icon: '\ud83c\udf81', label: 'Bonificacion',            color: 'var(--green)' },
  ajuste:       { icon: '\u2699\ufe0f', label: 'Ajuste administrativo',    color: 'var(--blue)'  }
};

// Genera un id unico para un descuento puntual.
function _nuevoDescuentoId() {
  return 'dsc_' + Date.now() + '_' + Math.floor(Math.random()*1000);
}

// Crea un descuento puntual y lo agrega a `descuentos`. NO lo marca aplicado
// (se marca al registrar el cobro que lo consume). Devuelve el item creado.
//   clienteId: id del cliente
//   tipo: 'afectacion'|'bonificacion'|'ajuste'
//   motivo: texto (obligatorio)
//   modo: 'monto'|'pct'|'dias'
//   valor: numero (CUP, % o dias segun modo)
//   mes: opcional (por defecto el mes en curso)
function crearDescuentoPuntual(clienteId, tipo, motivo, modo, valor, mes) {
  if (!clienteId && clienteId !== 0) { notify('Falta el cliente', true); return null; }
  if (!tipo || !META_TIPO_DESCUENTO[tipo]) { notify('Tipo de descuento invalido', true); return null; }
  motivo = (motivo||'').trim();
  if (!motivo) { notify('Escribe un motivo para el descuento', true); return null; }
  valor = parseFloat(valor);
  if (isNaN(valor) || valor <= 0) { notify('El valor del descuento debe ser mayor que 0', true); return null; }
  const m = mes || (config.mesActual || fechaLocalISO().slice(0,7));
  const item = {
    id: _nuevoDescuentoId(),
    clienteId,
    tipo,
    motivo,
    modo: modo || 'monto',
    valor,
    mes: m,
    fecha: fechaLocalISO(),
    aplicado: false,
    cobroHid: null
  };
  descuentos.push(item);
  return item;
}

// Elimina un descuento puntual por id (solo si no esta aplicado).
function eliminarDescuentoPuntual(id) {
  const i = descuentos.findIndex(d => d.id === id);
  if (i === -1) return;
  const d = descuentos[i];
  if (d.aplicado) {
    notify('Ese descuento ya se aplico en un cobro; eliminale el cobro primero para revertirlo', true);
    return;
  }
  descuentos.splice(i, 1);
  save();
  notify('Descuento eliminado');
}

// Marca un conjunto de descuentos puntuales como aplicados por un cobro.
// Se invoca desde registrarCobro() con los ids que se consumieron.
function marcarDescuentosAplicados(ids, cobroHid) {
  if (!ids || !ids.length) return;
  ids.forEach(id => {
    const d = descuentos.find(x => x.id === id);
    if (d && !d.aplicado) { d.aplicado = true; d.cobroHid = cobroHid || null; }
  });
}

// Revierte la marca de aplicado de los descuentos vinculados a un cobro
// (se invoca desde eliminarCobro() para que el descuento quede disponible
// de nuevo si el admin vuelve a cobrar).
function revertirDescuentosDeCobro(cobroHid) {
  if (!cobroHid) return;
  descuentos.forEach(d => {
    if (d.cobroHid === cobroHid && d.aplicado) { d.aplicado = false; d.cobroHid = null; }
  });
}

// Total en CUP de los descuentos puntuales pendientes de un cliente (mes en curso).
function totalDescuentosPendientes(clienteId, mes) {
  const c = clients.find(x => x.id === clienteId);
  if (!c) return 0;
  return descuentosPendientesCliente(c, mes).reduce((s,d)=>s+(d.monto||0), 0);
}

// ББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББ
//  UI: sub-panel de descuentos dentro del modal de cobro
// ББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББ
// Estado temporal del sub-panel: lista de descuentos PENDIENTES ya existentes
// (del mes) mas los NUEVOS que el admin crea dentro del modal. Al confirmar el
// cobro se persisten y se marcan aplicados.
let _cobroDescClienteId = null;
// Descuentos nuevos creados en esta sesion del modal (aun no guardados en `descuentos`):
// cada uno {tempId, tipo, motivo, modo, valor, monto}
let _cobroDescNuevos = [];

// Abre el modal de cobro con contexto de descuentos (lo llama openCobroModal).
function _initCobroDescuentos(clienteId) {
  _cobroDescClienteId = clienteId;
  _cobroDescNuevos = [];
  renderCobroDescuentosPanel();
}

// Descuentos efectivos del cobro = pendientes ya guardados + nuevos del modal.
// Devuelve array de {id|tempId, tipo, motivo, modo, valor, monto, esNuevo}.
function _descuentosEfectivosCobro() {
  const c = clients.find(x => x.id === _cobroDescClienteId);
  const pendientes = c ? descuentosPendientesCliente(c).map(d => ({...d, esNuevo:false})) : [];
  const nuevos = _cobroDescNuevos.map(d => ({...d, esNuevo:true}));
  return pendientes.concat(nuevos);
}

// Renderiza el sub-panel de descuentos del modal de cobro.
function renderCobroDescuentosPanel() {
  const wrap = document.getElementById('cobro-descuentos-panel');
  if (!wrap) return;
  const c = clients.find(x => x.id === _cobroDescClienteId);
  if (!c) { wrap.style.display = 'none'; return; }

  const dt = calcularDescuentoTotal(c, (c.megas||0)*getPrecioCliente(c));
  const recurrente = dt.recurrente;
  const puntuales = _descuentosEfectivosCobro();
  const puntualMonto = puntuales.reduce((s,d)=>s+(d.monto||0),0);
  const totalDesc = Math.min((c.megas||0)*getPrecioCliente(c), recurrente + puntualMonto);

  const precioBase = (c.megas||0)*getPrecioCliente(c);
  const precioNeto = Math.max(0, precioBase - totalDesc);

  // Recalcular el campo de servicio con el nuevo neto si el admin no lo edito
  // manualmente (lo hace openCobroModal / una funcion dedicada). Aqui solo
  // mostramos el resumen; el recalculo del input lo dispara _refrescarCobroMonto.
  let filas = '';
  if (recurrente > 0 && config.mencionarDescuentoRecurrente) {
    filas += `<div class="desc-fila" style="color:var(--text-muted)">
      <span>\ud83d\udcb3 Descuento recurrente (${c.descuentoTipo==='pct'?c.descuento+'%':fmt(c.descuento)})</span>
      <span>\u2212${fmt(recurrente)}</span>
    </div>`;
  }
  puntuales.forEach(d => {
    const meta = META_TIPO_DESCUENTO[d.tipo] || META_TIPO_DESCUENTO.ajuste;
    const modoTxt = d.modo==='pct' ? d.valor+'%' : d.modo==='dias' ? d.valor+' dias' : fmt(d.valor);
    filas += `<div class="desc-fila" style="color:${meta.color}">
      <span>${meta.icon} ${escHtml(d.motivo)} <span style="font-size:0.62rem;opacity:.7">(${modoTxt})</span></span>
      <span>\u2212${fmt(d.monto)}${d.esNuevo ? ` <button class="btn btn-ghost btn-sm" style="padding:0 4px;font-size:0.6rem" onclick="quitarDescuentoCobro('${d.esNuevo?d.tempId:d.id}','${d.esNuevo?1:0}')">\u2715</button>`:''}</span>
    </div>`;
  });

  const hayPendientes = puntuales.length > 0;
  wrap.style.display = '';
  wrap.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <span style="font-family:var(--mono);font-size:0.66rem;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted)">\ud83c\udf81 Descuentos de este cobro</span>
      <button type="button" class="btn btn-ghost btn-sm" style="font-size:0.66rem;padding:3px 8px" onclick="abrirFormDescuentoCobro()">+ A\u00f1adir descuento puntual</button>
    </div>
    ${hayPendientes || recurrente>0 ? `<div class="desc-lista">${filas}</div>` : '<div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:6px">Sin descuentos puntuales este mes.</div>'}
    <div class="desc-resumen" style="font-size:0.74rem;font-family:var(--mono);padding:8px;background:var(--bg);border-radius:5px;margin-top:6px">
      <div style="display:flex;justify-content:space-between"><span>Precio base:</span><span>${fmt(precioBase)}</span></div>
      ${totalDesc>0?`<div style="display:flex;justify-content:space-between;color:var(--green)"><span>Descuento total:</span><span>\u2212${fmt(totalDesc)}</span></div>`:''}
      <div style="display:flex;justify-content:space-between;font-weight:600"><span>Precio neto/mes:</span><span>${fmt(precioNeto)}</span></div>
    </div>
    <div id="cobro-desc-form" style="display:none;margin-top:10px"></div>
  `;
  _refrescarCobroMonto(totalDesc, precioNeto);
}

// Recalcula el campo "Monto servicio" del modal a partir del neto del mes
// (mora + 1) menos el abono previo. Respeta si el admin ya edito el campo
// manualmente: solo lo auto-actualiza mientras no haya foco en el input.
function _refrescarCobroMonto(totalDesc, precioNeto) {
  const input = document.getElementById('cobro-monto-servicio');
  if (!input) return;
  if (document.activeElement === input) return; // no pisar lo que edita el admin
  const c = clients.find(x => x.id === _cobroDescClienteId);
  if (!c) return;
  const mora = getMora(c);
  const servicioTotal = precioNeto * (mora + 1);
  const falta = Math.max(0, servicioTotal - (c.abono||0));
  input.value = falta;
  if (typeof calcularCobroUsd === 'function') calcularCobroUsd();
}

// Escapa HTML basico para motivos escritos a mano.
function escHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

// Abre el mini-formulario para anadir un descuento puntual al cobro actual.
function abrirFormDescuentoCobro() {
  const form = document.getElementById('cobro-desc-form');
  if (!form) return;
  const tiposOpts = Object.entries(META_TIPO_DESCUENTO)
    .map(([k,v])=>`<option value="${k}">${v.icon} ${v.label}</option>`).join('');
  form.style.display = '';
  form.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:6px;padding:10px;background:var(--surface)">
      <div class="form-row">
        <div class="field"><label>Tipo</label>
          <select id="dsc-tipo" onchange="onDscTipoChange()">${tiposOpts}</select>
        </div>
        <div class="field"><label>Modo</label>
          <select id="dsc-modo" onchange="onDscModoChange();actualizarVistaPreviaDsc()">
            <option value="monto">Monto fijo (CUP)</option>
            <option value="pct">Porcentaje (%)</option>
            <option value="dias">Dias sin servicio</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Motivo</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <select id="dsc-motivo-pre" onchange="onDscMotivoPreChange()" style="flex:1;min-width:140px">
            <option value="">— Elegir motivo predefinido —</option>
          </select>
          <input type="text" id="dsc-motivo" placeholder="o escribe un motivo libre" style="flex:2;min-width:160px">
        </div>
      </div>
      <div class="form-row">
        <div class="field"><label id="dsc-valor-label">Valor (CUP)</label>
          <input type="number" id="dsc-valor" min="0" step="0.01" oninput="actualizarVistaPreviaDsc()">
        </div>
        <div class="field" style="display:flex;align-items:flex-end">
          <span id="dsc-vista" style="font-size:0.72rem;color:var(--text-muted);font-family:var(--mono)">—</span>
        </div>
      </div>
      <div style="display:flex;gap:7px;margin-top:8px">
        <button type="button" class="btn btn-green btn-sm" onclick="confirmarDescuentoCobro()">A\u00f1adir</button>
        <button type="button" class="btn btn-ghost btn-sm" onclick="cerrarFormDescuentoCobro()">Cancelar</button>
      </div>
    </div>`;
  onDscTipoChange(); // puebla motivos predefinidos del tipo por defecto
}

function cerrarFormDescuentoCobro() {
  const form = document.getElementById('cobro-desc-form');
  if (form) { form.style.display = 'none'; form.innerHTML = ''; }
}

// Al cambiar el tipo, repuebla el select de motivos predefinidos.
function onDscTipoChange() {
  const tipo = document.getElementById('dsc-tipo').value;
  const sel = document.getElementById('dsc-motivo-pre');
  if (!sel) return;
  const motivos = motivosDescuentoPorTipo(tipo);
  sel.innerHTML = '<option value="">— Elegir motivo predefinido —</option>' +
    motivos.map(m=>`<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');
  const mi = document.getElementById('dsc-motivo');
  if (mi) mi.value = '';
}

// Al elegir un motivo predefinido, lo vuelca al input de motivo libre.
function onDscMotivoPreChange() {
  const pre = document.getElementById('dsc-motivo-pre').value;
  const mi = document.getElementById('dsc-motivo');
  if (mi && pre) mi.value = pre;
}

// Al cambiar el modo, ajusta la etiqueta del campo valor.
function onDscModoChange() {
  const modo = document.getElementById('dsc-modo').value;
  const lbl = document.getElementById('dsc-valor-label');
  if (!lbl) return;
  if (modo === 'pct')       lbl.textContent = 'Porcentaje (%)';
  else if (modo === 'dias') lbl.textContent = 'Dias sin servicio';
  else                      lbl.textContent = 'Valor (CUP)';
}

// Vista previa en vivo del monto que se descontara.
function actualizarVistaPreviaDsc() {
  const v = document.getElementById('dsc-vista');
  if (!v) return;
  const modo = document.getElementById('dsc-modo').value;
  const valor = parseFloat(document.getElementById('dsc-valor').value)||0;
  const c = clients.find(x => x.id === _cobroDescClienteId);
  const precioMes = c ? (c.megas||0)*getPrecioCliente(c) : 0;
  let monto = 0;
  if (modo === 'pct')      monto = Math.round(precioMes * valor / 100);
  else if (modo === 'dias') monto = Math.round((precioMes / (config.diasBaseMes||30)) * valor);
  else                      monto = valor;
  v.textContent = monto>0 ? `Se descontaran ${fmt(monto)}` : '—';
}

// Confirma el descuento del formulario y lo agrega a _cobroDescNuevos.
function confirmarDescuentoCobro() {
  const tipo = document.getElementById('dsc-tipo').value;
  const modo = document.getElementById('dsc-modo').value;
  const motivo = (document.getElementById('dsc-motivo').value||'').trim();
  const valor = parseFloat(document.getElementById('dsc-valor').value);
  if (!motivo) { notify('Escribe o elige un motivo', true); return; }
  if (isNaN(valor) || valor <= 0) { notify('El valor debe ser mayor que 0', true); return; }

  const c = clients.find(x => x.id === _cobroDescClienteId);
  const precioMes = c ? (c.megas||0)*getPrecioCliente(c) : 0;
  let monto = 0;
  if (modo === 'pct')      monto = Math.round(precioMes * valor / 100);
  else if (modo === 'dias') monto = Math.round((precioMes / (config.diasBaseMes||30)) * valor);
  else                      monto = valor;

  _cobroDescNuevos.push({ tempId: 'tmp_'+Date.now()+'_'+Math.floor(Math.random()*1000), tipo, motivo, modo, valor, monto });
  cerrarFormDescuentoCobro();
  renderCobroDescuentosPanel();
  notify('Descuento anadido al cobro');
}

// Quita un descuento del cobro: si es nuevo (tempId), lo saca de _cobroDescNuevos;
// si es uno ya guardado (id), lo elimina de `descuentos`.
function quitarDescuentoCobro(idStr, esNuevo) {
  if (esNuevo == 1 || esNuevo === '1') {
    _cobroDescNuevos = _cobroDescNuevos.filter(d => d.tempId !== idStr);
    renderCobroDescuentosPanel();
  } else {
    eliminarDescuentoPuntual(idStr);
    renderCobroDescuentosPanel();
  }
}

// Persiste los descuentos NUEVOS del cobro actual en `descuentos` (sin marcar
// aplicados todavia) y devuelve la lista de ids [id guardados] + tempIds.
// Se llama desde registrarCobro() ANTES de marcar aplicados.
function _persistirDescuentosNuevosCobro(mes) {
  const ids = [];
  _cobroDescNuevos.forEach(d => {
    const item = crearDescuentoPuntual(_cobroDescClienteId, d.tipo, d.motivo, d.modo, d.valor, mes);
    if (item) ids.push(item.id);
  });
  _cobroDescNuevos = [];
  return ids;
}

// ББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББ
//  APLICACION EN LOTE (afectacion a varios clientes a la vez)
// ББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББ
// Estado del modal de lote.
let _loteSeleccion = [];
function abrirModalLoteDescuento() {
  _loteSeleccion = [];
  const el = document.getElementById('lote-desc-lista');
  if (el) {
    el.innerHTML = clients.filter(c=>c.megas).map(c=>`
      <label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);cursor:pointer">
        <input type="checkbox" value="${c.id}" onchange="toggleLoteDesc(${c.id}, this.checked)" style="width:auto">
        <span>${escHtml(c.nombre)} <span style="font-size:0.66rem;color:var(--text-muted)">${c.megas} Mb · ${fmt((c.megas||0)*getPrecioCliente(c))}/mes</span></span>
      </label>`).join('') || '<div class="empty-state">Sin clientes activos</div>';
  }
  const tipoSel = document.getElementById('lote-dsc-tipo');
  if (tipoSel) onLoteDscTipoChange();
  const valorIn = document.getElementById('lote-dsc-valor');
  if (valorIn) valorIn.oninput = previsualizarLoteDesc;
  const modoSel = document.getElementById('lote-dsc-modo');
  if (modoSel) modoSel.onchange = previsualizarLoteDesc;
  document.getElementById('modal-lote-descuento').classList.add('open');
}
function cerrarModalLoteDescuento(){ document.getElementById('modal-lote-descuento').classList.remove('open'); }
function toggleLoteDesc(id, checked) {
  if (checked) { if(!_loteSeleccion.includes(id)) _loteSeleccion.push(id); }
  else { _loteSeleccion = _loteSeleccion.filter(x=>x!==id); }
  previsualizarLoteDesc();
}
function onLoteDscTipoChange() {
  const tipo = document.getElementById('lote-dsc-tipo').value;
  const sel = document.getElementById('lote-dsc-motivo-pre');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Elegir motivo predefinido —</option>' +
    motivosDescuentoPorTipo(tipo).map(m=>`<option value="${escHtml(m)}">${escHtml(m)}</option>`).join('');
  const mi = document.getElementById('lote-dsc-motivo');
  if (mi) mi.value='';
}
function onLoteDscMotivoPreChange() {
  const pre = document.getElementById('lote-dsc-motivo-pre').value;
  const mi = document.getElementById('lote-dsc-motivo');
  if (mi && pre) mi.value = pre;
}
function previsualizarLoteDesc() {
  const v = document.getElementById('lote-dsc-vista');
  if (!v) return;
  const modo = document.getElementById('lote-dsc-modo').value;
  const valor = parseFloat(document.getElementById('lote-dsc-valor').value)||0;
  if (!_loteSeleccion.length || !valor) { v.textContent = '—'; return; }
  let total = 0;
  _loteSeleccion.forEach(id => {
    const c = clients.find(x=>x.id===id); if(!c) return;
    const precioMes = (c.megas||0)*getPrecioCliente(c);
    let m = 0;
    if (modo==='pct') m = Math.round(precioMes*valor/100);
    else if (modo==='dias') m = Math.round((precioMes/(config.diasBaseMes||30))*valor);
    else m = valor;
    total += Math.min(m, precioMes);
  });
  v.textContent = `${_loteSeleccion.length} cliente(s) · total descontado: ${fmt(total)}`;
}
function aplicarLoteDescuento() {
  const tipo = document.getElementById('lote-dsc-tipo').value;
  const modo = document.getElementById('lote-dsc-modo').value;
  const motivo = (document.getElementById('lote-dsc-motivo').value||'').trim();
  const valor = parseFloat(document.getElementById('lote-dsc-valor').value);
  if (!_loteSeleccion.length) { notify('Selecciona al menos un cliente', true); return; }
  if (!motivo) { notify('Escribe o elige un motivo', true); return; }
  if (isNaN(valor) || valor <= 0) { notify('El valor debe ser mayor que 0', true); return; }
  let n = 0;
  _loteSeleccion.forEach(id => {
    if (crearDescuentoPuntual(id, tipo, motivo, modo, valor)) n++;
  });
  save(); render();
  if (typeof renderDescuentosView === 'function') renderDescuentosView();
  notify(`Descuento aplicado a ${n} cliente(s)`);
  cerrarModalLoteDescuento();
}

// ББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББ
//  ANULAR DESCUENTOS NO APLICADOS AL CIERRE DE MES
// ББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББББ
// Elimina los descuentos puntuales del mes que cierra que no llegaron a
// consumirse en ningun cobro. Se invoca desde iniciarNuevoMes().
function anularDescuentosNoAplicadosMes(mes) {
  const antes = descuentos.length;
  descuentos = descuentos.filter(d => !(d.mes === mes && !d.aplicado));
  return antes - descuentos.length;
}
