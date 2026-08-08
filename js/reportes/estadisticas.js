// estadisticas.js
// Renderizado de la pestaña de estadísticas.
// Depende de: state.js, calculations.js, tendencia.js (renderTrend)

// ═══════════════════════════════════════════════════════════
//  ESTADÍSTICAS
// ═══════════════════════════════════════════════════════════
function renderEstadisticas() {
  renderTrend();
  const total=ingresosMes(),costo=costoMes(),gan=ganancia();
  const pagados=clients.filter(c=>c.pagado).length;
  const pct=clients.length?Math.round(pagados/clients.length*100):0;
  const totalHist=history.reduce((s,h)=>s+h.monto,0);
  const promMega=clients.length?Math.round(clients.reduce((s,c)=>s+getPrecioCliente(c),0)/clients.length):0;
  const conMora=clients.filter(c=>getMora(c)>0);
  const moraTotal=conMora.reduce((s,c)=>s+precioNetoCliente(c)*getMora(c),0);

  document.getElementById('stat-cards').innerHTML=`
    <div class="stat-card"><div class="card-label">Ingresos proyectados/mes</div><div class="big-num green" data-countup="${total/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="sub">CUP si todos pagan</div></div>
    <div class="stat-card"><div class="card-label">Ganancia neta/mes</div><div class="big-num ${gan>=0?'green':'red'}" data-countup="${gan/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="sub">tras costo ${fmt(costo)}</div></div>
    <div class="stat-card"><div class="card-label">Tasa de cobro</div><div class="big-num blue" data-countup="${pct}" data-countup-suffix="%">0%</div><div class="sub">${pagados} de ${clients.length} clientes</div></div>
    <div class="stat-card"><div class="card-label">Total historial</div><div class="big-num amber" data-countup="${totalHist/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="sub">${history.length} cobros</div></div>
    <div class="stat-card"><div class="card-label">Precio prom/mega</div><div class="big-num" data-countup="${promMega}" data-countup-format="cup">0 CUP</div><div class="sub">CUP por Mb</div></div>
    <div class="stat-card"><div class="card-label">Mora pendiente</div><div class="big-num" style="color:var(--purple)" ${moraTotal>0?`data-countup="${moraTotal/1000}" data-countup-decimals="1" data-countup-suffix="K"`:''}>${moraTotal>0?'0K':'—'}</div><div class="sub">${conMora.length} cliente${conMora.length!==1?'s':''}</div></div>
    <div class="stat-card"><div class="card-label">Margen</div><div class="big-num ${gan>=0?'green':'red'}" data-countup="${total>0?Math.round(gan/total*100):0}" data-countup-suffix="%">0%</div><div class="sub">sobre ingresos brutos</div></div>
  `;
  animateCountUpCards(document.getElementById('stat-cards'));

  const maxAporte=clients.length?Math.max(...clients.map(c=>precioNetoCliente(c))):1;
  document.getElementById('stat-bars').innerHTML=clients.length
    ?clients.slice().sort((a,b)=>precioNetoCliente(b)-precioNetoCliente(a)).map(c=>{
      const aporte=precioNetoCliente(c);
      const pctBar=Math.round(aporte/maxAporte*100);
      const color=c.pagado?'var(--green)':getMora(c)>0?'var(--purple)':'var(--amber)';
      return `<div class="chart-bar-row">
        <div class="bar-label">${c.nombre}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pctBar}%;background:${color}"></div></div>
        <div class="bar-val">${fmt(aporte)}</div>
      </div>`;
    }).join('')
    :'<div class="empty-state">Sin clientes</div>';

  const sorted=clients.slice().sort((a,b)=>precioNetoCliente(b)-precioNetoCliente(a));
  document.getElementById('stat-ranking').innerHTML=sorted.map((c,i)=>{
    const aporte=precioNetoCliente(c);
    const pctA=total>0?Math.round(aporte/total*100):0;
    const mora=getMora(c);
    const plan=getPlanCliente(c);
    const descTxt=c.descuento?`<div style="font-size:0.62rem;color:var(--green)">🎁 −${c.descuentoTipo==='pct'?c.descuento+'%':fmt(c.descuento)}</div>`:'';
    const planTxt=plan?`<div style="font-size:0.62rem;color:var(--blue)">📋 ${plan.nombre}</div>`:'';
    return `<tr class="${c.pagado?'estado-ok':getMora(c)>0?'con-mora':'estado-warn'}">
      <td data-label="#" class="mono text-muted rank-num">${i+1}</td>
      <td data-label="Cliente"><strong style="cursor:pointer;text-decoration:underline dotted" onclick="verHistorialCliente(${c.id})">${c.nombre}</strong>${planTxt}${descTxt}</td>
      <td data-label="Megas" class="mono">${c.megas} Mb</td>
      <td data-label="$/mes" class="mono text-green">${fmt(aporte)}</td>
      <td data-label="% del total"><span class="pct-pill">${pctA}%</span></td>
      <td data-label="Mora">${mora>0?`<span class="status-badge badge-mora">${mora} mes${mora>1?'es':''}</span>`:'<span class="text-muted">—</span>'}</td>
      <td data-label="Estado">${clientLabel(c)}</td>
    </tr>`;
  }).join('')||'<tr><td colspan="7" class="empty-state">Sin clientes</td></tr>';

  // Agrupar por id de cliente (no por nombre) para que un cliente renombrado
  // o dos clientes con el mismo nombre no mezclen ni dupliquen su historial.
  const porCliente={};
  history.forEach(h=>{
    const key=h.id!=null?h.id:`sin-id-${h.nombre}`; // fallback por si algún registro viejo no tiene id
    if(!porCliente[key]) porCliente[key]={nombre:h.nombre,total:0};
    const clienteActual=clients.find(c=>c.id===h.id);
    if(clienteActual) porCliente[key].nombre=clienteActual.nombre; // usar el nombre más reciente
    porCliente[key].total+=h.monto;
  });
  const histRows=Object.values(porCliente).sort((a,b)=>b.total-a.total);
  document.getElementById('stat-history-summary').innerHTML=histRows.length
    ?histRows.map(r=>`<div class="pb-row"><span>${r.nombre}</span><span class="text-green mono">+${fmt(r.total)}</span></div>`).join('')
     +`<div class="pb-row"><span>Total cobrado</span><span class="text-blue mono">${fmt(totalHist)}</span></div>`
    :'<div class="empty-state" style="padding:10px 0">Sin historial</div>';

  const recientes=[...history].reverse().slice(0,15);
  document.getElementById('stat-recent').innerHTML=recientes.length
    ?recientes.map(h=>`
      <div class="history-item">
        <div>
          <strong>${h.nombre}</strong>
          <span class="text-muted mono" style="font-size:0.66rem;margin-left:8px">${h.fecha}</span>
          ${h.nota?`<div style="font-size:0.64rem;color:var(--text-muted)">${h.nota}</div>`:''}
        </div>
        <span class="mono text-green">+${fmt(h.monto)}</span>
      </div>`).join('')
    :'<div class="empty-state">Sin cobros registrados</div>';

  // ── RECUPERACIÓN DE INVERSIÓN ──
  // v5.7.1: se usa el helper unificado resumenInversion() (calculations.js), que
  // separa correctamente los TRES modelos de inversión y evita el doble conteo
  // que tenía el cálculo anterior:
  //  - recuperadoInversion() suma TODO history.montoEquipo (deuda de equipo +
  //    inventario), pero las "inversiones personales" NO generan montoEquipo
  //    (son proyección), así que su capital aparecía como "nunca recuperado".
  //  - Además se volvía a sumar history.montoEquipo filtrando por nota '📦'
  //    (recuperadoInv), contando los cobros de inventario DOS veces.
  // Ahora cada modelo usa su fuente correcta y el % es coherente.
  const rInv = resumenInversion();

  // Inventario disponible (sin vender), a costo — capital aún inmovilizado.
  const invDisponible = inventario.reduce((s,i)=>{
    if(i.cantidadTotal==null) return s; // lote antiguo sin control por cantidad, se omite
    return s + ((i.cantidadTotal - i.cantidadAsignada) * i.costoPorUnidad);
  },0);

  const secInv = document.createElement('div');
  secInv.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:12px;margin-top:14px';
  secInv.innerHTML = `
    <div class="bw-title" style="margin-bottom:10px">💰 Recuperación de inversión</div>
    <div class="pb-row"><span>Total invertido (personal + equipo/inventario)</span>
      <span class="mono text-red">−${fmt(rInv.capitalTotal)}</span></div>
    <div class="pb-row"><span>&nbsp;&nbsp;• Inversiones personales (infraestructura)</span>
      <span class="mono text-muted">−${fmt(rInv.capitalPersonalTotal)}</span></div>
    <div class="pb-row"><span>&nbsp;&nbsp;• Equipo/lotes (capital recuperable por cobros)</span>
      <span class="mono text-muted">−${fmt(rInv.capitalEquipoTotal)}</span></div>
    <div class="pb-row"><span>Recuperado hasta hoy</span>
      <span class="mono text-green">+${fmt(rInv.recuperadoTotal)}</span></div>
    <div class="pb-row"><span>&nbsp;&nbsp;• Recuperación proyectada (inversiones personales)</span>
      <span class="mono text-muted">+${fmt(rInv.recuperadoPersonal)}</span></div>
    <div class="pb-row"><span>&nbsp;&nbsp;• Cobrado en cuotas/ventas (equipo + inventario)</span>
      <span class="mono text-muted">+${fmt(rInv.recuperadoEquipo)}</span></div>
    <div class="pb-row"><span>Pendiente por cobrar de clientes (equipo + inventario a plazo)</span>
      <span class="mono text-amber">${fmt(rInv.pendienteTotal)}</span></div>
    <div class="pb-row"><span>Inventario disponible (sin vender, a costo)</span>
      <span class="mono text-blue">${fmt(invDisponible)}</span></div>
    <div style="margin-top:10px">
      <div class="bw-header"><span style="font-size:0.68rem;color:var(--text-muted);font-family:var(--mono)">Progreso de recuperación</span>
      <span style="font-size:0.68rem;font-family:var(--mono)">${rInv.pct}%</span></div>
      <div class="bw-bar-bg"><div class="bw-bar-fill" style="width:${rInv.pct}%;background:var(--amber)"></div></div>
    </div>
    <div style="margin-top:10px;text-align:right">
      <button class="btn btn-amber btn-sm" onclick="openModalInversionPendiente()">Ver detalle por cliente ›</button>
    </div>
  `;
  // Insertarlo justo en el lugar donde antes estaba "Ingresos por cliente"
  const tabEst = document.getElementById('tab-estadisticas');
  const anchor = document.getElementById('recuperacion-anchor');
  // Evitar duplicados si ya existe
  const old = tabEst.querySelector('.inv-recuperacion');
  if(old) old.remove();
  secInv.classList.add('inv-recuperacion');
  if(anchor){
    anchor.after(secInv);
  } else {
    tabEst.appendChild(secInv); // fallback por si no se encuentra el marcador
  }
}
