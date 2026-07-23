// inversion.js
// Gestión de inversión en equipo/material a recuperar por cuotas.

function ajustarInversion(id) {
  const c = clients.find(x=>x.id===id); if(!c) return;
  document.getElementById('modal-inversion').classList.add('open');
  document.getElementById('inv-client-id').value = id;
  document.getElementById('inv-client-name').value = c.nombre;
  
  document.getElementById('inv-total').value = (typeof c.deudaEquipo === 'number') ? c.deudaEquipo : 0;
  document.getElementById('inv-cuota').value = c.cuotaEquipo || 0;
  
  const modoEl = document.getElementById('inv-modo');
  if(modoEl) {
    modoEl.value = c.modoCuota || 'fijo';
    document.getElementById('inv-pct').value = c.pctCuota || '';
    onModoCuota();
  }
  document.getElementById('inv-liquidar').checked = !!c.quiereLiquidar;
}

function closeInversionModal() {
  document.getElementById('modal-inversion').classList.remove('open');
}

function onModoCuota() {
  const modo = document.getElementById('inv-modo').value;
  document.getElementById('field-cuota-fija').style.display = modo==='pct' ? 'none' : '';
  document.getElementById('field-cuota-pct').style.display  = modo==='pct' ? '' : 'none';
  if(modo==='pct') {
    const total = parseInt(document.getElementById('inv-total').value)||0;
    const pct   = parseInt(document.getElementById('inv-pct').value)||0;
    const calc  = Math.round(total * pct / 100);
    document.getElementById('pct-preview').textContent = pct>0 ? `≈ ${fmt(calc)} por mes` : '';
  }
}

function saveInversion() {
  const id    = parseInt(document.getElementById('inv-client-id').value);
  const total = parseInt(document.getElementById('inv-total').value)||0;
  const modo  = document.getElementById('inv-modo').value;
  let cuota = 0, pct = 0;

  if(modo === 'pct') {
    pct   = parseInt(document.getElementById('inv-pct').value)||0;
    cuota = Math.round(total * pct / 100);
  } else {
    cuota = parseInt(document.getElementById('inv-cuota').value)||0;
  }

  const c = clients.find(x=>x.id===id);
  if(!c) return;

  // Este modal es para deuda de equipo simple de UN cliente (con cuota que sí se
  // cobra en cada cobro normal, vía getCuotaEquipoCliente). No crea ni toca
  // tarjetas de "Inversiones Personales" — eso es exclusivo del botón "+ Nueva"
  // de esa sección (guardarNuevaInversion), que sirve para inversiones de capital
  // tuyas, no para deuda puntual de un cliente.
  const deudaPrevia = (typeof c.deudaEquipo === 'number') ? c.deudaEquipo : 0;
  const incremento  = total - deudaPrevia;

  c.deudaEquipo = total;
  c.cuotaEquipo = cuota;

  if(incremento > 0) {
    gastos.push({
      desc: `Inversión equipo — ${c.nombre}`,
      monto: incremento,
      fecha: new Date().toISOString().split('T')[0],
      categoria: 'inversion'
    });
  }

  c.modoCuota      = modo;
  c.pctCuota       = pct;
  c.quiereLiquidar = document.getElementById('inv-liquidar').checked;

  save(); render(); closeInversionModal();
  notify(total>0 ? `${c.nombre} — deuda equipo: ${fmt(total)}` : `${c.nombre} — inversión saldada`);
}

function liquidarDeuda(id) {
  const c = clients.find(x=>x.id===id);
  const deudaActual = (typeof c?.deudaEquipo === 'number') ? c.deudaEquipo : 0;
  if(!c || deudaActual<=0) { notify('Este cliente no tiene deuda de equipo', true); return; }

  const input = prompt(
    `Deuda actual de ${c.nombre}: ${fmt(deudaActual)}\n¿Cuánto va a pagar? (vacío = liquidar todo)`,
    deudaActual
  );
  if(input===null) return;

  let monto = parseInt(input)||0;
  if(monto<=0) { notify('Monto inválido', true); return; }
  if(monto > deudaActual) monto = deudaActual;

  const esTotal  = monto >= deudaActual;
  const prevState = { pagado:c.pagado, mora:c.mora||0, abono:c.abono||0, deudaEquipo:deudaActual };

  c.deudaEquipo = Math.max(0, deudaActual - monto);
  if(c.deudaEquipo<=0) { c.deudaEquipo=0; c.quiereLiquidar=false; }

  history.push({
    hid: Date.now()+'-'+Math.floor(Math.random()*1000),
    id, nombre:c.nombre, monto, montoEquipo: monto,
    fecha: new Date().toISOString().split('T')[0],
    nota: esTotal ? 'Liquidación total de deuda de equipo'
                  : `Abono a deuda de equipo (restan ${fmt(c.deudaEquipo)})`,
    parcial: !esTotal, tipo: 'liquidacion-equipo', prevState
  });

  save(); render();
  notify(esTotal ? `${c.nombre} liquidó su deuda — ${fmt(monto)}`
                 : `${c.nombre} abonó ${fmt(monto)} — restan ${fmt(c.deudaEquipo)}`);
}

function openModalInversionPendiente() {
  // Clientes con deuda de equipo
  const conDeuda = clients.filter(c => c.deudaEquipo > 0)
    .sort((a,b) => b.deudaEquipo - a.deudaEquipo);

  // Ventas de inventario a plazo sin liquidar (clienteId aún existe)
  const ventasPlazo = asignacionesInventario.filter(v => v.modoPago === 'plazo');

  // Agrupar ventas de inventario por cliente
  const invPorCliente = {};
  ventasPlazo.forEach(v => {
    const c = clients.find(x => x.id === v.clienteId);
    if(!c) return;
    if(!invPorCliente[c.id]) invPorCliente[c.id] = { nombre: c.nombre, monto: 0 };
    invPorCliente[c.id].monto += v.monto;
  });

  const totalEquipo = conDeuda.reduce((s,c) => s + c.deudaEquipo, 0);
  const totalInv    = Object.values(invPorCliente).reduce((s,x) => s + x.monto, 0);

  const filasEquipo = conDeuda.map(c => `
    <div class="history-item">
      <div>
        <strong>${c.nombre}</strong>
        <div style="font-size:0.68rem;color:var(--text-muted);font-family:var(--mono)">
          Cuota: ${fmt(c.cuotaEquipo)}/mes · ~${mesesRestantesDeuda(c)} mes(es)
        </div>
      </div>
      <div style="text-align:right">
        <div class="mono text-amber">${fmt(c.deudaEquipo)}</div>
        <button class="btn btn-amber btn-sm" onclick="ajustarInversion(${c.id});document.getElementById('modal-inv-pendiente').classList.remove('open')">
          Ver
        </button>
      </div>
    </div>`).join('');

  const filasInv = Object.entries(invPorCliente).map(([id,x]) => `
    <div class="history-item">
      <div>
        <strong>${x.nombre}</strong>
        <div style="font-size:0.68rem;color:var(--text-muted);font-family:var(--mono)">Inventario a plazo</div>
      </div>
      <span class="mono text-amber">${fmt(x.monto)}</span>
    </div>`).join('');

  document.getElementById('modal-inv-pendiente-content').innerHTML = `
    ${conDeuda.length ? `
      <div class="bw-title" style="margin-bottom:8px">Deuda de equipo</div>
      ${filasEquipo}
      <div class="history-item" style="font-weight:700">
        <span>Subtotal</span>
        <span class="mono text-amber">${fmt(totalEquipo)}</span>
      </div>` : ''}
    ${Object.keys(invPorCliente).length ? `
      <div class="bw-title" style="margin:14px 0 8px">Inventario a plazo</div>
      ${filasInv}
      <div class="history-item" style="font-weight:700">
        <span>Subtotal</span>
        <span class="mono text-amber">${fmt(totalInv)}</span>
      </div>` : ''}
    <div class="history-item" style="font-weight:700;font-size:0.9rem;border-top:2px solid var(--border);padding-top:10px">
      <span>Total pendiente por recuperar</span>
      <span class="mono text-amber">${fmt(totalEquipo + totalInv)}</span>
    </div>
  `;

  document.getElementById('modal-inv-pendiente').classList.add('open');
}
