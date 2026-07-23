// gastos.js
// Módulo de gastos adicionales del negocio.
// Depende de: state.js (gastos), calculations.js (fmt), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════
//  MÓDULO DE GASTOS ADICIONALES
// ═══════════════════════════════════════════════════════════
function openGastoModal(idx) {
  document.getElementById('g-desc').value='';
  document.getElementById('g-monto').value='';
  document.getElementById('g-fecha').value=new Date().toISOString().split('T')[0];
  document.getElementById('g-categoria').value='operativo';
  document.getElementById('gasto-edit-idx').value=idx!=null?idx:'';
  // Resetear campos de lote
  document.getElementById('g-lote-fields').style.display='none';
  document.getElementById('g-monto-field').style.display='';
  if(idx!=null){
    const g=gastos[idx];
    document.getElementById('g-desc').value=g.desc;
    document.getElementById('g-monto').value=g.monto;
    document.getElementById('g-fecha').value=g.fecha;
    document.getElementById('g-categoria').value=g.categoria && g.categoria !== 'inversion' ? g.categoria : 'operativo';
  }
  document.getElementById('modal-gasto').classList.add('open');
}

function closeGastoModal(){ document.getElementById('modal-gasto').classList.remove('open'); }

// Muestra/oculta los campos de lote según la categoría seleccionada
function onGastoCategoriaChange() {
  const val = document.getElementById('g-categoria').value;
  const esLote = val === 'lote';
  document.getElementById('g-lote-fields').style.display = esLote ? '' : 'none';
  document.getElementById('g-monto-field').style.display = esLote ? 'none' : '';
}

function saveGasto() {
  const desc=document.getElementById('g-desc').value.trim();
  const fecha=document.getElementById('g-fecha').value;
  const categoria=document.getElementById('g-categoria').value;

  // ── Si es "por lote", delegar a comprarInventario y reflejarlo en inventario ──
  if(categoria === 'lote') {
    const unidad  = document.getElementById('g-lote-unidad').value;
    const cantidad= parseFloat(document.getElementById('g-lote-cantidad').value);
    const costo   = parseFloat(document.getElementById('g-lote-costo').value);
    const margen  = parseFloat(document.getElementById('g-lote-margen').value)||10;
    if(!desc||!cantidad||cantidad<=0||!costo||costo<=0){
      notify('Completa descripción, cantidad y costo por unidad',true);
      return;
    }
    comprarInventario(desc, unidad, cantidad, costo, margen);
    closeGastoModal();
    return;
  }

  // ── Gasto operativo / crecimiento normal ──
  const monto=parseInt(document.getElementById('g-monto').value);
  if(!desc||!monto){notify('Completa los campos',true);return;}
  const idx=document.getElementById('gasto-edit-idx').value;
  if(idx!==''){
    const esInversion=gastos[parseInt(idx)].categoria==='inversion';
    gastos[parseInt(idx)]={desc,monto,fecha,categoria:esInversion?'inversion':categoria};
    notify('Gasto actualizado');
  } else {
    gastos.push({desc,monto,fecha,categoria});
    notify(`Gasto registrado: −${fmt(monto)}`);
  }
  save(); renderGastos(); renderProfit(); renderSummary(); closeGastoModal();
}

function deleteGasto(idx) {
  const g = gastos[idx];
  let inv = null;
  if(g && g.categoria === 'inversion'){
    if(g.loteId){
      inv = inventario.find(i => i.id === g.loteId);
    } else {
      // Compatibilidad con lotes comprados antes de este cambio (el gasto no guardaba el vínculo):
      // se intenta emparejar por monto y fecha exactos, solo si hay un único candidato posible.
      const candidatos = inventario.filter(i => i.montoTotal === g.monto && i.fecha === g.fecha);
      if(candidatos.length === 1) inv = candidatos[0];
    }
  }
  if(inv){
    const uTxt = inv.unidad==='m' ? 'm' : 'u';
    const vendido = inv.cantidadAsignada > 0;
    const msg = vendido
      ? `Este gasto es la compra del lote "${inv.desc}", que ya tiene ${inv.cantidadAsignada} ${uTxt} vendidas.\n\nEliminarlo también eliminará el lote completo del inventario, pero las ventas ya registradas (y los cobros/deudas que generaron) NO se revierten automáticamente.\n\nRecomendado: elimina primero cada venta de ese lote desde la pestaña Inventario, y luego borra este gasto.\n\n¿Eliminar de todas formas?`
      : `Este gasto es la compra del lote "${inv.desc}" (aún sin ventas). Eliminarlo también quitará el lote del inventario.\n\n¿Continuar?`;
    if(!confirm(msg)) return;
    const invIdx = inventario.findIndex(i => i.id === inv.id);
    if(invIdx !== -1) inventario.splice(invIdx, 1);
  }
  gastos.splice(idx,1);
  save(); renderGastos(); renderProfit(); renderSummary(); renderInventario();
  notify('Gasto eliminado');
}

function renderGastos() {
  const el=document.getElementById('gastos-list');

  // BUG FIX #7: separar correctamente las categorías de gasto para el resumen
  const opGastos   = gastos.filter(g=>g.categoria==='operativo').reduce((s,g)=>s+g.monto,0);
  const invGastos  = gastos.filter(g=>g.categoria==='inversion').reduce((s,g)=>s+g.monto,0);
  const crecGastos = gastos.filter(g=>g.categoria==='crecimiento').reduce((s,g)=>s+g.monto,0);
  const gan  = ganancia();
  const rec  = recuperadoInversion();
  const ganAj= gananciaAjustada();

  document.getElementById('gastos-resumen').innerHTML=`
    <div class="pb-row"><span>Ingreso bruto esperado</span><span class="text-green">${fmt(ingresosMes())}</span></div>
    <div class="pb-row"><span>Costo servicio contratado</span><span class="text-red">−${fmt(costoMes())}</span></div>
    ${opGastos>0?`<div class="pb-row"><span>Gastos operativos</span><span class="text-red">−${fmt(opGastos)}</span></div>`:''}
    ${invGastos>0?`<div class="pb-row"><span>Inversión en equipo/material</span><span class="text-amber">−${fmt(invGastos)}</span></div>`:''}
    ${crecGastos>0?`<div class="pb-row"><span>Crecimiento de red</span><span class="text-red">−${fmt(crecGastos)}</span></div>`:''}
    <div class="pb-row"><span><strong>Ganancia neta real</strong></span><span class="${gan>=0?'text-green':'text-red'}"><strong>${fmt(gan)}</strong></span></div>
    ${rec>0?`
    <div class="pb-row"><span>Recuperación de inversión cobrada</span><span class="text-amber">+${fmt(rec)}</span></div>
    <div class="pb-row"><span>Ganancia ajustada (con recuperación)</span><span class="${ganAj>=0?'text-green':'text-red'}">${fmt(ganAj)}</span></div>
    `:''}
  `;
  if(!gastos.length){el.innerHTML='<div class="empty-state">Sin gastos registrados este mes</div>';return;}
  el.innerHTML=gastos.map((g,i)=>`
    <div class="gasto-item">
      <div style="flex:1">
        <div class="gasto-desc">${g.categoria==='inversion'?'📦 ':g.categoria==='crecimiento'?'📡 ':''}${g.desc}</div>
        <div style="font-size:0.62rem;color:var(--text-muted);font-family:var(--mono)">${g.fecha}</div>
      </div>
      <span class="gasto-monto">−${fmt(g.monto)}</span>
      <button class="btn btn-ghost btn-sm" onclick="openGastoModal(${i})" title="Editar">✏</button>
      <button class="btn btn-red btn-sm" onclick="deleteGasto(${i})" title="Eliminar">🗑</button>
    </div>`).join('');
}

function switchGastosTab(name) {
  ['gastos','historial','inventario'].forEach(n => {
    document.getElementById('gpanel-' + n).style.display = n === name ? '' : 'none';
  });
  const titles = { gastos: 'Gastos del mes', historial: 'Historial de cobros', inventario: 'Inventario de material' };
  document.getElementById('gsub-title').textContent = titles[name];
  document.getElementById('gsub-btn-add').style.display = name === 'gastos' ? '' : 'none';
  if (name === 'historial') renderHistory();
  if (name === 'inventario') renderInventario();
  // Botones activos
  ['historial','inventario'].forEach(n => {
    const btn = document.getElementById('gsub-btn-' + n);
    if (btn) btn.style.fontWeight = n === name ? 'bold' : '';
  });
}
