// client-history.js
// Historial de pagos de un cliente específico (modal de detalle).
// Depende de: state.js (clients, history), calculations.js (fmt)

// ═══════════════════════════════════════════════════════════
//  HISTORIAL POR CLIENTE
// ═══════════════════════════════════════════════════════════
function verHistorialCliente(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  const cobros=history.filter(h=>h.id===id);
  const totalPagado=cobros.reduce((s,h)=>s+h.monto,0);
  const mora=getMora(c);
  document.getElementById('hc-title').textContent=`📋 ${c.nombre}`;
  document.getElementById('hc-content').innerHTML=`
    <div style="background:var(--bg);border-radius:6px;padding:10px;margin-bottom:12px;font-family:var(--mono);font-size:0.78rem;">
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span class="text-muted">Megas:</span><strong>${c.megas} Mb</strong></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span class="text-muted">$/mes:</span><strong class="text-green">${fmt(c.megas*c.precio)}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span class="text-muted">Día de pago:</span><strong>día ${c.diaPago||config.diaInicio}</strong></div>
      <div style="display:flex;justify-content:space-between;padding:3px 0"><span class="text-muted">Total cobrado:</span><strong class="text-blue">${fmt(totalPagado)}</strong></div>
      ${mora>0?`<div style="display:flex;justify-content:space-between;padding:3px 0"><span class="text-muted">Meses mora:</span><strong style="color:var(--purple)">${mora} mes${mora>1?'es':''}</strong></div>`:''}
      ${c.notas?`<div style="display:flex;justify-content:space-between;padding:3px 0"><span class="text-muted">Notas:</span><span>${c.notas}</span></div>`:''}
    </div>
    <div style="font-family:var(--mono);font-size:0.62rem;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:8px">
      Cobros registrados (${cobros.length})
    </div>
    ${cobros.length?[...cobros].reverse().map(h=>`
      <div class="history-item">
        <div>
          <span class="text-muted mono" style="font-size:0.72rem">${h.fecha}</span>
          ${h.nota?`<div style="font-size:0.66rem;color:var(--text-muted)">${h.nota}</div>`:''}
          ${h.montoEquipo>0?`<div style="font-size:0.66rem;color:var(--amber)">🔧 incluye ${fmt(h.montoEquipo)} de recuperación de inversión</div>`:''}
        </div>
        <span class="mono text-green">+${fmt(h.monto)}</span>
      </div>`).join('')
    :'<div class="empty-state" style="padding:14px 0">Sin cobros aún</div>'}
    <div style="margin-top:12px;display:flex;gap:7px;flex-wrap:wrap;">
      <button class="btn btn-green btn-sm" onclick="openCobroModal(${id});document.getElementById('modal-historial-cliente').classList.remove('open')">💰 Cobrar ahora</button>
      ${mora>0?`<button class="btn btn-sm" style="background:rgba(188,140,255,.15);color:var(--purple);border:1px solid var(--purple)" onclick="ajustarMora(${id})">Ajustar mora</button>`:`<button class="btn btn-sm btn-ghost" onclick="marcarMora(${id})">+ Agregar mora</button>`}
    </div>
  `;
  document.getElementById('modal-historial-cliente').classList.add('open');
}
