// gastos.js
// Módulo de gastos adicionales del negocio.
// Depende de: state.js (gastos), calculations.js (fmt), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════
//  MÓDULO DE GASTOS ADICIONALES
// ═══════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
//  PAGO DEL PAQUETE AL PROVEEDOR
// ═══════════════════════════════════════════════════════════════════════════
// v5.7.4: el pago del paquete ahora se hace a través de un modal desglosado
// (modal-paquete.js) que permite pagar con transferencia CUP + USD + efectivo
// CUP, y soporta pagos parciales (múltiples abonos hasta completar el costo).
// Esta función abre el modal. La lógica de registro está en confirmarPagoPaquete().
function marcarPaquetePagado() {
  if(typeof abrirModalPaquete === 'function') {
    abrirModalPaquete();
  } else {
    // Fallback si modal-paquete.js no se cargó (no debería ocurrir)
    notify('No se pudo abrir el modal de pago del paquete', true);
  }
}

function openGastoModal(idx) {
  // Gastos del sistema (inversion, rebaja, paquete) NO se editan desde aquí:
  // - inversion/rebaja: se gestionan desde Inventario (comprar lote, reabastecer, rebaja)
  // - paquete: se gestiona desde el modal de pago del paquete (con desglose USD/transferencia)
  // Solo se pueden editar los gastos manuales: 'operativo' y 'crecimiento'.
  const esSistema = idx!=null && gastos[idx] && ['inversion','rebaja','paquete'].includes(gastos[idx].categoria);
  if(esSistema){
    const cat = gastos[idx].categoria;
    const donde = cat==='paquete' ? 'el botón "Pagar paquete"' : 'la pestaña Inventario';
    notify(`Este gasto se gestiona desde ${donde}, no se puede editar aquí`, true);
    return;
  }
  document.getElementById('g-desc').value='';
  document.getElementById('g-monto').value='';
  document.getElementById('g-fecha').value=fechaLocalISO();
  document.getElementById('g-categoria').value='operativo';
  document.getElementById('gasto-edit-idx').value=idx!=null?idx:'';
  // Resetear campos de lote
  document.getElementById('g-lote-fields').style.display='none';
  document.getElementById('g-monto-field').style.display='';
  // El aviso de paquete ya no es necesario en el select (se quitó la opción),
  // pero lo dejamos oculto por si se reutiliza el elemento.
  const avisoEl = document.getElementById('g-paquete-aviso');
  if(avisoEl) avisoEl.style.display='none';
  if(idx!=null){
    const g=gastos[idx];
    document.getElementById('g-desc').value=g.desc;
    document.getElementById('g-monto').value=g.monto;
    document.getElementById('g-fecha').value=g.fecha || fechaLocalISO();
    document.getElementById('g-categoria').value=(g.categoria==='operativo'||g.categoria==='crecimiento') ? g.categoria : 'operativo';
    onGastoCategoriaChange();
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
    if(typeof registrarParaDeshacer==='function') registrarParaDeshacer(`Comprar lote: ${desc}`);
    comprarInventario(desc, unidad, cantidad, costo, margen);
    closeGastoModal();
    return;
  }

  // ── Gasto operativo / crecimiento normal ──
  const monto=parseFloat(document.getElementById('g-monto').value);
  if(!desc||!monto||monto<=0){notify('Completa descripción y monto',true);return;}
  if(!fecha){notify('Selecciona una fecha',true);return;}
  const idx=document.getElementById('gasto-edit-idx').value;
  if(typeof registrarParaDeshacer==='function') registrarParaDeshacer(idx!==''?`Editar gasto: ${desc}`:`Añadir gasto: ${desc}`);
  if(idx!==''){
    gastos[parseInt(idx)]={desc,monto,fecha,categoria};
    notify('Gasto actualizado');
  } else {
    gastos.push({desc,monto,fecha,categoria});
    notify(`Gasto registrado: −${fmt(monto)}`);
  }
  save(); renderGastos(); renderProfit(); renderSummary(); closeGastoModal();
}

function deleteGasto(idx) {
  const g = gastos[idx];
  if(typeof registrarParaDeshacer==='function') registrarParaDeshacer(`Eliminar gasto: ${g?g.desc:''}`);
  let inv = null;
  let esReabastecimiento = false;
  if(g && g.categoria === 'inversion' && g.reabastecimiento && g.loteId){
    // Gasto de REABASTECIMIENTO de un lote existente: NO se borra el lote,
    // solo se restan las unidades añadidas y se re-promedia el costo al valor
    // que tenía antes de este reabastecimiento.
    esReabastecimiento = true;
    inv = inventario.find(i => i.id === g.loteId);
    if(inv){
      const uTxt = inv.unidad==='m' ? 'm' : 'u';
      const cantReab = g.cantidadReab || 0;
      const costoReab = g.costoUnitReab || 0;
      const msg = `Este gasto es un reabastecimiento del lote \"${inv.desc}\" (+${cantReab} ${uTxt} × ${fmt(costoReab)}).\n\n` +
        `Al eliminarlo, se restan ${cantReab} ${uTxt} del lote y el costo promedio vuelve a su valor anterior.\n\n` +
        `NOTA: si ya vendiste material del stock reabastecido, esas ventas quedan huérfanas de unidades (stock negativo). Asegúrate de que haya suficientes unidades disponibles.\n\n` +
        `¿Eliminar este reabastecimiento?`;
      if(!confirm(msg)) return;
      // Restar las unidades y el monto del reabastecimiento
      inv.cantidadTotal = Math.max(0, inv.cantidadTotal - cantReab);
      inv.montoTotal    = Math.max(0, inv.montoTotal - (cantReab * costoReab));
      // Re-promediar el costo al valor que tenía ANTES de este reabastecimiento.
      // costoViejo = (montoTotal después de restar) / (unidades disponibles después de restar)
      const dispDespues = unidadesDisponibles(inv.id);
      if(dispDespues > 0){
        inv.costoPorUnidad = Math.round((inv.montoTotal / (inv.cantidadTotal - (inv.cantidadAsignada||0) - (inv.cantidadRebajada||0))) * 100) / 100;
      } else {
        // Si no quedan unidades disponibles, usar el costo del stock que queda
        inv.costoPorUnidad = inv.cantidadTotal > 0 ? Math.round((inv.montoTotal / inv.cantidadTotal) * 100) / 100 : costoReab;
      }
    }
    // NO entrar al bloque if(inv) de abajo (ese borra el lote entero).
    inv = null;
  } else if(g && g.categoria === 'inversion'){
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
    // v5.7.1: además de avisar, enumerar las ventas asociadas y, si las hay,
    // ofrecer revertirlas automáticamente ANTES de borrar el gasto/lote, para no
    // dejar cobros (history) ni deudas (deudaEquipo) huérfanos apuntando a un
    // lote que ya no existe. Si el usuario insiste en borrar sin revertir, se le
    // exige una segunda confirmación explícita para que sea consciente del
    // estado inconsistente que queda.
    const ventasLote = asignacionesInventario.filter(v => v.inventarioId === inv.id);
    const vendido = inv.cantidadAsignada > 0;
    const listadoVentas = ventasLote.length
      ? ventasLote.map(v=>{
          const cli = clients.find(x=>x.id===v.clienteId);
          const modo = v.modoPago==='momento' ? 'pagado al momento' : 'a plazo (deuda)';
          return `   • ${cli?cli.nombre:'(cliente eliminado)'} — ${v.cantidad}${uTxt} · ${fmt(v.monto)} (${modo})`;
        }).join('\n')
      : '';
    const msg = vendido
      ? `Este gasto es la compra del lote "${inv.desc}", que ya tiene ${inv.cantidadAsignada} ${uTxt} vendidas en ${ventasLote.length} venta(s):\n\n${listadoVentas}\n\n` +
        `OPCIÓN RECOMENDADA: elimina primero cada venta desde la pestaña Inventario (el material vuelve al lote y se revierten cobros/deudas).\n\n` +
        `Si eliminas este gasto ahora SIN revertir las ventas:\n  • el lote se borrará del inventario\n  • los cobros/deudas que generaron esas ventas QUEDARÁN HUÉRFANOS (sin lote de referencia)\n\n` +
        `¿Eliminar el gasto y el lote de TODOS MODOS (dejar ventas huérfanas)?`
      : `Este gasto es la compra del lote "${inv.desc}" (aún sin ventas). Eliminarlo también quitará el lote del inventario.\n\n¿Continuar?`;
    if(!confirm(msg)) return;
    // Si había ventas, exigir una segunda confirmación explícita (acciones
    // destructivas en dos pasos) para reducir borrados accidentales que dejan
    // datos inconsistentes.
    if(vendido && !confirm(`Última confirmación: vas a borrar el lote "${inv.desc}" con ${ventasLote.length} venta(s) SIN revertir. ¿Estás seguro?`)) return;
    const invIdx = inventario.findIndex(i => i.id === inv.id);
    if(invIdx !== -1) inventario.splice(invIdx, 1);
  } else if (g && g.categoria === 'inversion') {
    // Inversión de equipo PUNTUAL de un cliente (sin lote de inventario): el
    // gasto se creó desde ajustarInversion()/saveInversion() como
    // "Inversión equipo — {nombre}". Si se borra el gasto, el cliente sigue
    // teniendo su deudaEquipo y los cobros de cuota en history — pero el capital
    // invertido ya no se contabiliza en la "recuperación de inversión". Avisar
    // para que el usuario sepa que la métrica de recuperación puede quedar
    // inconsistente, y dejarle decidir.
    const esEquipoCliente = /Inversión[ -]?equipo/i.test(g.desc || '');
    if(esEquipoCliente){
      const msg2 = `Este gasto es una inversión en equipo de un cliente ("${g.desc}").\n\n` +
        `Borrarlo NO elimina la deuda del cliente ni sus cobros de cuota (eso se gestiona desde el cliente), pero el capital invertido dejará de contar en la sección "Recuperación de inversión", por lo que el % podría verse inconsistente.\n\n¿Eliminar el gasto de todos modos?`;
      if(!confirm(msg2)) return;
    }
  } else if (g && g.categoria === 'rebaja' && g.loteId) {
    // Gasto de rebaja de inventario vinculado a un lote: al borrarlo hay que
    // DEVOLVER el material al stock disponible del lote (restando de
    // cantidadRebajada), igual que hace eliminarRebaja() desde la pestaña
    // Inventario. Sin esto, borrar el gasto desde Gastos dejaría el lote con
    // un cantidadRebajada inconsistente (material "perdido" para siempre).
    const inv = inventario.find(i => i.id === g.loteId);
    if(inv){
      const uTxt = inv.unidad==='m' ? 'm' : 'u';
      const msg3 = `Este gasto es una rebaja de inventario de "${inv.desc}" (${g.cantidad||0} ${uTxt}).\n\n` +
        `Al eliminarlo, el material vuelve al stock disponible del lote y se borra el gasto de ${fmt(g.monto)}.\n\n¿Revertir la rebaja y eliminar el gasto?`;
      if(!confirm(msg3)) return;
      inv.cantidadRebajada = Math.max(0, (inv.cantidadRebajada||0) - (g.cantidad||0));
      inv.montoRebajado    = Math.max(0, (inv.montoRebajado||0) - (g.monto||0));
    }
  }
  gastos.splice(idx,1);
  save(); renderGastos(); renderProfit(); renderSummary(); renderInventario();
  notify('Gasto eliminado');
}

function renderGastos() {
  const el=document.getElementById('gastos-list');

  // v5.7: separar correctamente las categorias de gasto para el resumen.
  // Solo se cuentan los gastos DEL MES en curso (gastosDelMes), no los
  // acumulados de inversion de meses anteriores.
  const gMes = gastosDelMes();
  const opGastos   = gMes.filter(g=>g.categoria==='operativo').reduce((s,g)=>s+g.monto,0);
  const invGastos  = gMes.filter(g=>g.categoria==='inversion' || g.categoria==='rebaja').reduce((s,g)=>s+g.monto,0);
  const crecGastos = gMes.filter(g=>g.categoria==='crecimiento').reduce((s,g)=>s+g.monto,0);
  const paqGasto   = pagoPaqueteMes();        // lo pagado al proveedor este mes (caja)
  const paqPagado  = paquetePagadoEsteMes();

  // --- CAJA REAL DEL MES (lo que realmente entro/salio) ---
  const cobServ = cobradoServiciosMes();
  const cobEq   = cobradoEquipoMes();
  const cobTot  = cobradoTotalMes();
  const gastosReales = gastosRealesMes();
  const ganR    = gananciaReal();

  // --- PROYECCION (lo esperado, solo informativo) ---
  const ingEsp  = ingresosMes();
  const pend    = pendienteTotal();
  const ganProj = ganancia();

  document.getElementById('gastos-resumen').innerHTML=`
    <div class="bw-title" style="margin:2px 0 6px;font-size:0.8rem">Caja del mes (real)</div>
    <div class="pb-row"><span>Cobrado en servicios</span><span class="text-green">+${fmt(cobServ)}</span></div>
    ${cobEq>0?`<div class="pb-row"><span>Cobrado en cuotas de equipo</span><span class="text-amber">+${fmt(cobEq)}</span></div>`:''}
    <div class="pb-row"><span>Total cobrado este mes</span><span class="text-green"><strong>+${fmt(cobTot)}</strong></span></div>
    <div class="pb-row"><span>Pago paquete al proveedor</span><span class="text-red">${paqPagado?`-${fmt(paqGasto)}`:`<span style="color:var(--amber)">Pendiente (${fmt(costoMes())})</span>`}</span></div>
    ${opGastos>0?`<div class="pb-row"><span>Gastos operativos (luz, transporte…)</span><span class="text-red">-${fmt(opGastos)}</span></div>`:''}
    ${crecGastos>0?`<div class="pb-row"><span>Crecimiento de red (antenas, switches)</span><span class="text-red">-${fmt(crecGastos)}</span></div>`:''}
    ${invGastos>0?`<div class="pb-row"><span>Inversión del mes (lotes, capital)</span><span style="color:var(--amber)">-${fmt(invGastos)}</span></div>`:''}
    <div class="pb-row"><span><strong>Ganancia neta real (caja)</strong></span><span class="${ganR>=0?'text-green':'text-red'}"><strong>${fmt(ganR)}</strong></span></div>

    <div class="bw-title" style="margin:12px 0 6px;font-size:0.8rem;color:var(--text-muted)">Proyección (esperado)</div>
    <div class="pb-row"><span>Ingreso esperado del mes</span><span class="text-green">${fmt(ingEsp)}</span></div>
    <div class="pb-row"><span>Costo paquete contratado</span><span class="text-red">-${fmt(costoMes())}</span></div>
    <div class="pb-row"><span>Pendiente por cobrar</span><span style="color:var(--purple)">${fmt(pend)}</span></div>
    <div class="pb-row"><span>Ganancia proyectada (si todos pagan)</span><span class="${ganProj>=0?'text-green':'text-red'}">${fmt(ganProj)}</span></div>
  `;
  if(!gastos.length){el.innerHTML='<div class="empty-state">Sin gastos registrados este mes</div>';return;}

  // ── v5.7.7: agrupar gastos por categoría con subtotales y badges de color ──
  // Orden de categorías para mostrar (las del sistema primero, luego las manuales)
  const ORDEN_CAT = [
    {key:'paquete',      icon:'🌐', label:'Pago del paquete',      color:'var(--cyan)',   esSistema:true},
    {key:'inversion',    icon:'📦', label:'Inversión / lotes',      color:'var(--amber)',  esSistema:true},
    {key:'rebaja',       icon:'📉', label:'Rebajas de inventario',  color:'var(--red)',    esSistema:true},
    {key:'operativo',    icon:'🔧', label:'Operativos',             color:'var(--blue)',   esSistema:false},
    {key:'crecimiento',  icon:'📡', label:'Crecimiento de red',     color:'var(--green)',  esSistema:false},
  ];

  // Función helper para renderizar un gasto individual
  function renderGastoItem(g, i) {
    const esSistema = ['inversion','rebaja','paquete'].includes(g.categoria);
    return `
    <div class="gasto-item">
      <div style="flex:1;min-width:0">
        <div class="gasto-desc">${g.desc}</div>
        <div style="font-size:0.62rem;color:var(--text-muted);font-family:var(--mono)">${g.fecha || '—'}</div>
      </div>
      <span class="gasto-monto">−${fmt(g.monto)}</span>
      ${esSistema
        ? '<button class="btn btn-ghost btn-sm" disabled style="opacity:0.3;cursor:not-allowed" title="Los gastos del sistema se gestionan desde su sección (Inventario / Pagar paquete)">🔒</button>'
        : `<button class="btn btn-ghost btn-sm" onclick="openGastoModal(${i})" title="Editar">✏</button>`}
      <button class="btn btn-red btn-sm" onclick="deleteGasto(${i})" title="Eliminar">🗑</button>
    </div>`;
  }

  // Construir HTML agrupado
  let html = '';
  let totalGeneral = 0;
  for(const cat of ORDEN_CAT){
    const items = gastos.map((g,i)=>({g,i})).filter(({g})=>g.categoria===cat.key);
    if(items.length===0) continue;
    const subtotal = items.reduce((s,{g})=>s+(g.monto||0),0);
    totalGeneral += subtotal;
    html += `
    <div class="gasto-grupo">
      <div class="gasto-grupo-header">
        <span class="gasto-badge" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}44">${cat.icon} ${cat.label}</span>
        <span class="gasto-grupo-subtotal">${items.length} gasto${items.length>1?'s':''} · <strong style="color:var(--text)">${fmt(subtotal)}</strong></span>
      </div>
      ${items.map(({g,i})=>renderGastoItem(g,i)).join('')}
    </div>`;
  }
  // Categoría desconocida (por compatibilidad con datos antiguos)
  const sinCat = gastos.map((g,i)=>({g,i})).filter(({g})=>!ORDEN_CAT.some(c=>c.key===g.categoria));
  if(sinCat.length>0){
    const subtotal = sinCat.reduce((s,{g})=>s+(g.monto||0),0);
    totalGeneral += subtotal;
    html += `
    <div class="gasto-grupo">
      <div class="gasto-grupo-header">
        <span class="gasto-badge" style="background:var(--text-muted)22;color:var(--text-muted);border:1px solid var(--text-muted)44">Otros</span>
        <span class="gasto-grupo-subtotal">${sinCat.length} gasto${sinCat.length>1?'s':''} · <strong style="color:var(--text)">${fmt(subtotal)}</strong></span>
      </div>
      ${sinCat.map(({g,i})=>renderGastoItem(g,i)).join('')}
    </div>`;
  }
  html += `<div class="gasto-total-general">Total general: <strong>${fmt(totalGeneral)}</strong></div>`;
  el.innerHTML = html;
}

function switchGastosTab(name) {
  // Sub-pestañas internas del panel de gastos (gastos / historial / inventario).
  // Algunas pueden no existir según el layout (p.ej. el inventario tiene su
  // propia pestaña top-level 'tab-inventario'); se protege con null-checks
  // para que la función no lance si falta un panel o botón.
  ['gastos','historial','inventario'].forEach(n => {
    const panel = document.getElementById('gpanel-' + n);
    if(panel) panel.style.display = n === name ? '' : 'none';
  });
  const titles = { gastos: 'Gastos del mes', historial: 'Historial de cobros', inventario: 'Inventario de material' };
  const titleEl = document.getElementById('gsub-title');
  if(titleEl && titles[name]) titleEl.textContent = titles[name];
  const addBtn = document.getElementById('gsub-btn-add');
  if(addBtn) addBtn.style.display = name === 'gastos' ? '' : 'none';
  if (name === 'historial' && typeof renderHistory === 'function') renderHistory();
  if (name === 'inventario' && typeof renderInventario === 'function') renderInventario();
  // Botones activos
  ['historial','inventario'].forEach(n => {
    const btn = document.getElementById('gsub-btn-' + n);
    if (btn) btn.style.fontWeight = n === name ? 'bold' : '';
  });
}
