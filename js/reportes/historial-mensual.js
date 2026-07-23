// historial-mensual.js
// Historial mensual agrupado de cobros.

// BUG FIX #9: _histCollapsedInit se reinicia cuando el número de meses cambia,
// para que meses nuevos se colapsen automáticamente.
let _histMesesCount = 0;
const _histCollapsed = new Set();

function toggleHistoryGroup(mes) {
  if(_histCollapsed.has(mes)) _histCollapsed.delete(mes);
  else _histCollapsed.add(mes);
  renderHistory();
}

function renderHistory() {
  const el = document.getElementById('history-list');
  if(!history.length) { el.innerHTML='<div class="empty-state">Sin registros aún</div>'; return; }

  const grouped = {};
  [...history].reverse().forEach(h=>{
    const mes = h.fecha ? h.fecha.substring(0,7) : 'sin-fecha';
    if(!grouped[mes]) grouped[mes]=[];
    grouped[mes].push(h);
  });
  const meses = Object.keys(grouped);

  // BUG FIX #9: si el número de meses creció, colapsar los que no estaban antes
  if(meses.length > _histMesesCount) {
    // Colapsar todos excepto el más reciente
    meses.slice(1).forEach(m => _histCollapsed.add(m));
    _histMesesCount = meses.length;
  }

  el.innerHTML = meses.map(mes=>{
    const items    = grouped[mes];
    const total    = items.reduce((s,h)=>s+h.monto, 0);
    const label    = mes==='sin-fecha' ? 'Sin fecha'
                   : new Date(mes+'-15').toLocaleDateString('es-CU',{month:'long',year:'numeric'});
    const collapsed = _histCollapsed.has(mes);

    const rows = items.map(h=>`
      <div class="history-item" style="padding-left:8px">
        <div>
          <strong>${h.nombre}</strong>
          <span class="text-muted mono" style="font-size:0.66rem;margin-left:8px">${h.fecha||''}</span>
          ${h.parcial ? '<span class="status-badge badge-partial" style="margin-left:4px">Abono</span>' : ''}
          ${h.montoEquipo>0 ? `<span class="status-badge" style="margin-left:4px;background:rgba(242,167,60,.15);color:var(--amber)">🔧 ${fmt(h.montoEquipo)}</span>` : ''}
          ${h.nota ? `<div style="font-size:0.66rem;color:var(--text-muted)">${h.nota}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="mono text-green">+${fmt(h.monto)}</span>
          ${h.hid ? `<button class="btn btn-ghost btn-sm" onclick="eliminarCobro('${h.hid}')" title="Eliminar cobro">🗑</button>` : ''}
        </div>
      </div>`).join('');

    return `
      <div class="history-group">
        <div class="history-group-header" onclick="toggleHistoryGroup('${mes}')">
          <span class="history-chevron ${collapsed?'':'open'}">▸</span>
          <span class="history-group-label">${label}</span>
          <span class="history-group-count">${items.length} cobro${items.length!==1?'s':''}</span>
          <span class="mono text-green history-group-total">+${fmt(total)}</span>
        </div>
        ${collapsed ? '' : `<div class="history-group-body">${rows}</div>`}
      </div>`;
  }).join('');
}
