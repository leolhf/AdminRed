// descuentos-view.js
// v5.8.0: Vista de gestión de descuentos puntuales (afectación / bonificación / ajuste).
// Lista todos los descuentos con filtros por mes, tipo y estado. Permite ver
// el monto calculado, el cliente asociado, y eliminar los no aplicados.
// También muestra un resumen con totales por tipo y estado.
// Depende de: state.js (descuentos, clients, config), calculations.js
//   (getPrecioCliente, fmt, fechaLocalISO), descuentos.js (META_TIPO_DESCUENTO,
//   eliminarDescuentoPuntual), notify-ui.js (notify), storage-local.js (save),
//   render.js (render).

// Calcula el monto de un descuento puntual dado (igual que descuentosPendientesCliente
// pero sin filtrar por aplicado/pendiente, para mostrar todos en la vista).
function _montoDescuento(d) {
  const c = clients.find(x => x.id === d.clienteId);
  if (!c) return 0;
  const precioMes = (c.megas || 0) * getPrecioCliente(c);
  const diasBase = config.diasBaseMes || 30;
  if (d.modo === 'pct')      return Math.round(precioMes * (d.valor || 0) / 100);
  if (d.modo === 'dias')     return Math.round((precioMes / diasBase) * (d.valor || 0));
  return (d.valor || 0); // monto fijo CUP
}

// Renderiza la vista completa de descuentos.
function renderDescuentosView() {
  const lista = document.getElementById('descuentos-list');
  const resumen = document.getElementById('descuentos-resumen');
  const selMes = document.getElementById('desc-filtro-mes');
  const selTipo = document.getElementById('desc-filtro-tipo');
  const selEstado = document.getElementById('desc-filtro-estado');
  if (!lista) return;

  // Poblar el select de meses con los meses disponibles en descuentos + mes actual
  if (selMes) {
    const mesesSet = new Set();
    (descuentos || []).forEach(d => { if (d.mes) mesesSet.add(d.mes); });
    mesesSet.add(config.mesActual || fechaLocalISO().slice(0, 7));
    const meses = Array.from(mesesSet).sort().reverse();
    const actual = selMes.value;
    selMes.innerHTML = '<option value="">Todos los meses</option>' +
      meses.map(m => `<option value="${m}">${_formatMes(m)}</option>`).join('');
    if (actual) selMes.value = actual;
  }

  const fMes = selMes ? selMes.value : '';
  const fTipo = selTipo ? selTipo.value : '';
  const fEstado = selEstado ? selEstado.value : '';

  // Filtrar
  let items = (descuentos || []).slice();
  if (fMes)    items = items.filter(d => d.mes === fMes);
  if (fTipo)   items = items.filter(d => d.tipo === fTipo);
  if (fEstado === 'pendiente') items = items.filter(d => !d.aplicado);
  if (fEstado === 'aplicado')   items = items.filter(d => d.aplicado);

  // Ordenar: pendientes primero, luego por fecha descendente
  items.sort((a, b) => {
    if (a.aplicado !== b.aplicado) return a.aplicado ? 1 : -1;
    return (b.fecha || '').localeCompare(a.fecha || '');
  });

  // Resumen
  if (resumen) {
    const todos = (descuentos || []);
    const pendientes = todos.filter(d => !d.aplicado);
    const aplicados = todos.filter(d => d.aplicado);
    const totalPendiente = pendientes.reduce((s, d) => s + _montoDescuento(d), 0);
    const totalAplicado = aplicados.reduce((s, d) => s + _montoDescuento(d), 0);
    const nAfect = todos.filter(d => d.tipo === 'afectacion').length;
    const nBonif = todos.filter(d => d.tipo === 'bonificacion').length;
    const nAjuste = todos.filter(d => d.tipo === 'ajuste').length;
    resumen.innerHTML = `
      <div class="stat-card" style="flex:1;min-width:120px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px">
        <div style="font-size:0.64rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Pendientes</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--amber)">${pendientes.length}</div>
        <div style="font-size:0.66rem;color:var(--text-muted)">${fmt(totalPendiente)}</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:120px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px">
        <div style="font-size:0.64rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Aplicados</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--green)">${aplicados.length}</div>
        <div style="font-size:0.66rem;color:var(--text-muted)">${fmt(totalAplicado)}</div>
      </div>
      <div class="stat-card" style="flex:1;min-width:120px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px">
        <div style="font-size:0.64rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Por tipo</div>
        <div style="font-size:0.78rem;font-weight:600;line-height:1.5">
          <span style="color:var(--red)">⚠️ ${nAfect}</span> ·
          <span style="color:var(--green)">🎁 ${nBonif}</span> ·
          <span style="color:var(--blue)">🔧 ${nAjuste}</span>
        </div>
      </div>
    `;
  }

  // Lista
  if (items.length === 0) {
    lista.innerHTML = '<div class="empty-state">No hay descuentos puntuales que coincidan con los filtros.<br><br>Usa el botón <strong>+ Descuento por lote</strong> o añade descuentos desde el modal de cobro de un cliente.</div>';
    return;
  }

  lista.innerHTML = items.map(d => {
    const c = clients.find(x => x.id === d.clienteId);
    const meta = META_TIPO_DESCUENTO[d.tipo] || META_TIPO_DESCUENTO.ajuste;
    const monto = _montoDescuento(d);
    const modoTxt = d.modo === 'pct' ? d.valor + '%' : d.modo === 'dias' ? d.valor + ' días' : fmt(d.valor);
    const estadoBadge = d.aplicado
      ? '<span style="font-size:0.6rem;padding:2px 6px;border-radius:4px;background:var(--green);color:#fff">✅ Aplicado</span>'
      : '<span style="font-size:0.6rem;padding:2px 6px;border-radius:4px;background:var(--amber);color:#fff">⏳ Pendiente</span>';
    const clienteNombre = c ? c.nombre : 'Cliente eliminado';
    const fechaTxt = d.fecha ? d.fecha.slice(0, 10) : (d.mes || '—');
    const mesTxt = d.mes ? _formatMes(d.mes) : '—';
    const escMotivo = (d.motivo || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escNombre = clienteNombre.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const puedeEliminar = !d.aplicado;

    return `
      <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <div style="font-size:1.3rem">${meta.icon}</div>
        <div style="flex:1;min-width:180px">
          <div style="font-weight:600;font-size:0.84rem">${escMotivo}</div>
          <div style="font-size:0.7rem;color:var(--text-muted)">${escNombre} · ${mesTxt} · ${fechaTxt}</div>
          <div style="font-size:0.66rem;color:${meta.color}">${meta.label} · modo: ${modoTxt}</div>
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;font-size:0.9rem;color:var(--green)">−${fmt(monto)}</div>
          ${estadoBadge}
        </div>
        <div style="display:flex;gap:4px">
          ${puedeEliminar ? `<button class="btn btn-ghost btn-sm" style="font-size:0.62rem;padding:3px 8px;color:var(--red)" onclick="eliminarDescuentoVista('${d.id}')">✕ Eliminar</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

// Elimina un descuento desde la vista (solo si no está aplicado).
function eliminarDescuentoVista(id) {
  const d = (descuentos || []).find(x => x.id === id);
  if (!d) return;
  if (d.aplicado) { notify('No se puede eliminar un descuento ya aplicado', true); return; }
  if (!confirm(`¿Eliminar el descuento "${d.motivo}"?`)) return;
  eliminarDescuentoPuntual(id);
  save();
  renderDescuentosView();
  render();
  notify('Descuento eliminado');
}

// Formatea un mes "YYYY-MM" a texto legible "Mes AAAA".
function _formatMes(mes) {
  if (!mes || mes.length < 7) return mes || '—';
  const [anio, mesNum] = mes.split('-');
  const mesesTxt = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const idx = parseInt(mesNum, 10) - 1;
  return (mesesTxt[idx] || mesNum) + ' ' + anio;
}

// Exporta los descuentos (filtrados o todos) a CSV.
function exportDescuentosCSV() {
  const selMes = document.getElementById('desc-filtro-mes');
  const selTipo = document.getElementById('desc-filtro-tipo');
  const selEstado = document.getElementById('desc-filtro-estado');
  const fMes = selMes ? selMes.value : '';
  const fTipo = selTipo ? selTipo.value : '';
  const fEstado = selEstado ? selEstado.value : '';

  let items = (descuentos || []).slice();
  if (fMes)    items = items.filter(d => d.mes === fMes);
  if (fTipo)   items = items.filter(d => d.tipo === fTipo);
  if (fEstado === 'pendiente') items = items.filter(d => !d.aplicado);
  if (fEstado === 'aplicado')   items = items.filter(d => d.aplicado);

  const rows = [['Cliente', 'Tipo', 'Motivo', 'Modo', 'Valor', 'Monto CUP', 'Mes', 'Fecha', 'Estado']];
  items.forEach(d => {
    const c = clients.find(x => x.id === d.clienteId);
    rows.push([
      c ? `"${c.nombre.replace(/"/g, '""')}"` : 'Cliente eliminado',
      d.tipo || '',
      `"${(d.motivo || '').replace(/"/g, '""')}"`,
      d.modo || 'monto',
      d.valor || 0,
      _montoDescuento(d),
      d.mes || '',
      d.fecha ? d.fecha.slice(0, 10) : '',
      d.aplicado ? 'aplicado' : 'pendiente'
    ]);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `descuentos_${fechaLocalISO()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  notify(`CSV exportado: ${items.length} descuento(s)`);
}
