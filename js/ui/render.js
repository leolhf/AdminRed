// render.js
// Renderizado principal de la interfaz (resumen, ancho de banda, alarmas, tablas).
// Depende de: state.js, calculations.js

// ═══════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════
function render() {
  renderSummary(); renderRevSpark(); renderBandwidth(); renderAlarms();
  renderProfit(); renderInvestments(); renderTable1(); renderTable2();
  renderHistory(); syncConfig();
}

// ═══════════════════════════════════════════════════════════
//  SPARKLINE — actividad de cobros (últimos 6 meses)
//  SVG generado a mano, sin librerías externas.
// ═══════════════════════════════════════════════════════════
function renderRevSpark() {
  const el=document.getElementById('dash-spark'); if(!el) return;
  const now=new Date();
  const buckets=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label=d.toLocaleDateString('es-CU',{month:'short'});
    buckets.push({key,label,total:0});
  }
  history.forEach(h=>{
    if(!h.fecha) return;
    const mes=h.fecha.substring(0,7);
    const b=buckets.find(x=>x.key===mes);
    if(b) b.total+=h.monto;
  });

  const anyData=buckets.some(b=>b.total>0);
  const w=600,h=54,pad=6;
  const max=Math.max(...buckets.map(b=>b.total),1);
  const stepX=(w-pad*2)/(buckets.length-1);
  const pts=buckets.map((b,i)=>({
    x:pad+i*stepX,
    y:h-pad-(b.total/max)*(h-pad*2),
    ...b
  }));
  const line=pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  const area=line+` L${pts[pts.length-1].x.toFixed(1)},${h-pad} L${pts[0].x.toFixed(1)},${h-pad} Z`;
  const dots=pts.map(p=>`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.6" class="spark-dot"><title>${p.label}: ${fmt(p.total)}</title></circle>`).join('');

  const ultimo=buckets[buckets.length-1];
  el.innerHTML=`
    <div class="dash-spark-head">
      <span class="bw-title">Actividad de cobros · 6 meses</span>
      <span class="dash-spark-cur mono">${ultimo.total>0?fmt(ultimo.total):'—'} <span class="text-muted">este mes</span></span>
    </div>
    ${anyData?`
    <svg viewBox="0 0 ${w} ${h}" class="spark-svg" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--green)" stop-opacity="0.32"/>
          <stop offset="100%" stop-color="var(--green)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#sparkFill)" stroke="none"/>
      <path d="${line}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
    </svg>
    <div class="dash-spark-labels mono">${buckets.map(b=>`<span>${b.label}</span>`).join('')}</div>
    `:`<div class="empty-state" style="padding:14px 0">Aún no hay cobros registrados</div>`}
  `;
}

function renderSummary() {
  const pct=ingresosMes()>0?Math.round(cobrado()/ingresosMes()*100):0;
  const conMora=clients.filter(c=>getMora(c)>0).length;
  const invTotal=inversionTotalHistorica();
  const invRec=recuperadoInversion();
  const invPend=deudaEquipoPendienteTotal();
  const invPct=invTotal>0?Math.round(invRec/invTotal*100):0;
  document.getElementById('summary-cards').innerHTML=`
    <div class="card"><div class="card-label">Ingreso mensual</div><div class="card-value green">${(ingresosMes()/1000).toFixed(1)}K</div><div class="card-sub">CUP esperado</div></div>
    <div class="card"><div class="card-label">Costo del paquete</div><div class="card-value red">${(costoMes()/1000).toFixed(1)}K</div><div class="card-sub">${config.megas} Mb × ${fmt(config.costoPorMega)}</div></div>
    <div class="card"><div class="card-label">Ganancia Mensual</div><div class="card-value ${gananciaMensual()>=0?'green':'red'}">${(gananciaMensual()/1000).toFixed(1)}K</div><div class="card-sub">Ingreso − costo paquete</div></div>
    <div class="card"><div class="card-label">Cobrado</div><div class="card-value blue">${(cobrado()/1000).toFixed(1)}K</div><div class="card-sub">${pct}% del total</div></div>
    <div class="card"><div class="card-label">Pendiente</div><div class="card-value amber">${(pendienteTotal()/1000).toFixed(1)}K</div><div class="card-sub">${clients.filter(c=>!c.pagado).length} clientes</div></div>
    <div class="card"><div class="card-label">Ganancia neta</div><div class="card-value ${ganancia()>=0?'green':'red'}">${(ganancia()/1000).toFixed(1)}K</div><div class="card-sub">tras costo ${fmt(costoMes())}</div></div>
    <div class="card"><div class="card-label">Clientes</div><div class="card-value">${clients.length}</div><div class="card-sub">${totalVendido()} Mb vendidos</div></div>
    ${conMora>0?`<div class="card"><div class="card-label">Con mora</div><div class="card-value" style="color:var(--purple)">${conMora}</div><div class="card-sub">clientes atrasados</div></div>`:''}
    ${invTotal>0?`<div class="card"><div class="card-label">Inversión recuperada</div><div class="card-value amber">${invPct}%</div><div class="card-sub">${fmt(invRec)} de ${fmt(invTotal)}</div></div>`:''}
    ${invPend>0?`<div class="card" onclick="openModalInversionPendiente()" style="cursor:pointer;border-color:var(--amber)">
  <div class="card-label">Inversión pendiente ›</div>
  <div class="card-value amber">${(invPend/1000).toFixed(1)}K</div>
  <div class="card-sub">toca para ver detalle</div>
</div>`:''}
  `;
}

function renderBandwidth() {
  const sold=totalVendido(),total=config.megas,margen=config.margenMegas||0;
  const free=megasDisponiblesParaVenta(); // ya descuenta el margen personal
  const pct=Math.min(100,Math.round(sold/total*100));
  const color=pct>90?'var(--red)':pct>70?'var(--amber)':'var(--green)';
  document.getElementById('bw-bar').style.cssText=`width:${pct}%;background:${color}`;
  document.getElementById('bw-text').textContent=pct+'% usado';
  document.getElementById('bw-sold').textContent=sold+' Mb';
  document.getElementById('bw-free').textContent=Math.max(0,free)+' Mb'+(margen>0?` (reserva ${margen} Mb)`:'');
  document.getElementById('bw-total').textContent=total+' Mb';

  const warn=document.getElementById('bw-warn');
  if(warn){
    if(free<0){
      const faltan=-free;
      const sugerido=Math.ceil((total+faltan)/5)*5;
      warn.style.display='block';
      warn.textContent=`⚠ Te faltan ${faltan} Mb para respetar tu margen de ${margen} Mb. Sugerencia: sube tu paquete a ${sugerido} Mb.`;
    } else {
      warn.style.display='none';
    }
  }
}

function renderAlarms() {
  const alarms=[];
  clients.forEach(c=>{
    if(c.pagado) return;
    const mora=getMora(c);
    const s=getStatus(c);
    const monto=fmt(montoTotalACobrar(c));
    const limDia=(c.diaPago||config.diaInicio)+5;
    // BUG FIX #10: un cliente con mora+vencido genera UNA sola alerta (roja con mora incluida),
    // evitando que aparezca dos veces en el panel.
    if(s==='due') {
      const moraInfo = mora>0 ? ` · ${mora} mes${mora>1?'es':''} mora acumulada` : '';
      alarms.push({c,type:'red',msg:`${c.nombre} — VENCIDO (límite día ${limDia})${moraInfo} · ${monto}`});
    } else if(s==='warn') {
      const moraInfo = mora>0 ? ` · +${mora} mes${mora>1?'es':''} mora` : '';
      alarms.push({c,type:'amber',msg:`${c.nombre} — cobrar desde día ${c.diaPago}${moraInfo} · ${monto}`});
    } else if(mora>0) {
      // Estado ok pero tiene mora pendiente de meses anteriores
      alarms.push({c,type:'purple',msg:`${c.nombre} — ${mora} mes${mora>1?'es':''} de mora · ${monto} adeudado`});
    }
  });
  const sec=document.getElementById('alarm-section');
  if(!alarms.length){sec.style.display='none';return;}
  sec.style.display='block';
  document.getElementById('alarm-list').innerHTML=alarms.map(a=>`
    <div class="alarm-item">
      <div class="alarm-dot dot-${a.type}"></div>
      <div style="flex:1">
        ${a.msg}
        ${a.c.deudaEquipo ? `<div style="font-size:0.66rem;color:var(--amber)">🔧 incluye ${fmt(getCuotaEquipo(a.c))} de deuda (restan ${fmt(getDeudaEquipoCliente(a.c))})</div>` : ''}
      </div>
      <div class="action-group">
        ${a.c.telefono ? `<button class="btn btn-ghost btn-sm" onclick="sendWhatsAppReminder(${a.c.id})" title="Enviar recordatorio WhatsApp">📱</button>` : ''}
        <button class="btn btn-green btn-sm" onclick="openCobroModal(${a.c.id})">Cobrar</button>
      </div>
    </div>`).join('');
}

function renderProfit() {
  const moraPendiente=clients.filter(c=>!c.pagado&&getMora(c)>0).reduce((s,c)=>s+c.megas*c.precio*getMora(c),0);
  const tg=totalGastos();
  const rec=recuperadoInversion();
  const invPend=deudaEquipoPendienteTotal();
  document.getElementById('profit-rows').innerHTML=`
    <div class="pb-row"><span>Costo servicio (${config.megas} Mb × ${fmt(config.costoPorMega)})</span><span class="text-red">−${fmt(costoMes())}</span></div>
    <div class="pb-row"><span>Ingresos brutos clientes</span><span class="text-green">+${fmt(ingresosMes())}</span></div>
    ${tg>0?`<div class="pb-row"><span>Gastos adicionales</span><span class="text-red">−${fmt(tg)}</span></div>`:''}
    ${moraPendiente>0?`<div class="pb-row"><span>Mora pendiente por cobrar</span><span style="color:var(--purple)">+${fmt(moraPendiente)}</span></div>`:''}
    ${rec>0?`<div class="pb-row"><span>Recuperación de inversión cobrada</span><span class="text-amber">+${fmt(rec)}</span></div>`:''}
    <div class="pb-row"><span>Ganancia neta estimada</span><span class="${ganancia()>=0?'text-green':'text-red'}">${fmt(ganancia())}</span></div>
    ${rec>0?`<div class="pb-row"><span>Ganancia ajustada (con recuperación)</span><span class="${gananciaAjustada()>=0?'text-green':'text-red'}">${fmt(gananciaAjustada())}</span></div>`:''}
    ${invPend>0?`<div class="pb-row"><span>Inversión aún pendiente por cobrar</span><span class="text-amber">${fmt(invPend)}</span></div>`:''}
  `;
}

function renderTable1() {
  const rows=ordenarPorUrgenciaCobro(clients).map(c=>`
    <tr>
      <td>
        <strong>${c.nombre}</strong>
        ${c.notas?`<div style="font-size:0.66rem;color:var(--text-muted)">${c.notas}</div>`:''}
        ${getMora(c)>0?`<div class="mora-tag">⚠ ${getMora(c)} mes${getMora(c)>1?'es':''} mora</div>`:''}
      </td>
      <td class="mono">${c.megas?c.megas+' Mb':'<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="mono">${c.megas&&c.precio?c.precio.toLocaleString():'<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="mono text-green">${c.megas&&c.precio?fmt(c.megas*c.precio):'<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${c.megas?clientLabel(c):'<span class="status-badge" style="background:rgba(120,120,120,.18);color:var(--text-muted)">Pendiente megas</span>'}</td>
      <td class="mono hide-sm">día ${c.diaPago}</td>
      <td>${c.megas?`<button class="btn btn-green btn-sm" onclick="openCobroModal(${c.id})">${c.pagado?'Re-cobrar':'Cobrar'}</button>`:'<span style="color:var(--text-muted);font-size:0.72rem">Sin megas</span>'}</td>
    </tr>`).join('');
  document.getElementById('client-table-body').innerHTML=rows||'<tr><td colspan="7" class="empty-state">Sin clientes</td></tr>';
}

function renderTable2() {
  const q=(document.getElementById('search-input').value||'').toLowerCase();
  const f=document.getElementById('filter-status').value;
  const filtered=clients.filter(c=>{
    const matchQ=!q||c.nombre.toLowerCase().includes(q)||(c.notas||'').toLowerCase().includes(q);
    if(!matchQ) return false;
    if(!f) return true;
    if(f==='mora') return getMora(c)>0;
    return getStatus(c)===f;
  });
  const rows=filtered.map(c=>`
    <tr class="estado-${getStatus(c)}${getMora(c)>0?' con-mora':''}">
      <td data-label="Cliente">
        <strong style="cursor:pointer" onclick="verHistorialCliente(${c.id})">${c.nombre} <span style="font-size:0.7rem;color:var(--text-muted)">›</span></strong>
        ${c.notas?`<div style="font-size:0.66rem;color:var(--text-muted)">${c.notas}</div>`:''}
        ${getMora(c)>0?`<div class="mora-detail">⚠ ${getMora(c)} mes${getMora(c)>1?'es':''} de mora · ${fmt(c.megas*c.precio*getMora(c))}</div>`:''}
        ${c.deudaEquipo?`<div class="mora-detail" style="color:var(--amber)">🔧 Debe equipo: ${fmt(getDeudaEquipoCliente(c))} (cuota ${fmt(getCuotaEquipoCliente(c))})
  ${mesesRestantesDeuda(c)===Infinity
    ? ' · define una cuota para estimar'
    : ` · ~${mesesRestantesDeuda(c)} mes(es), hasta ${fechaFinDeuda(c)}`}
</div>`:''}
        ${getLateLabel(c.id)}
      </td>
      <td data-label="Megas"><input class="inline-input" type="number" min="0" value="${c.megas||''}" placeholder="—" onchange="updateField(${c.id},'megas',+this.value)"> ${c.megas?'Mb':''}</td>
      <td data-label="$/Mega"><input class="inline-input" type="number" min="0" value="${c.precio||''}" placeholder="—" onchange="updateField(${c.id},'precio',+this.value)"></td>
      <td data-label="Total mes" class="mono">${c.megas&&c.precio?fmt(c.megas*c.precio):'<span style="color:var(--text-muted)">—</span>'}</td>
      <td data-label="Pagado">
        ${c.megas
          ? `<span class="status-badge ${c.pagado?'badge-paid':(c.abono&&c.abono>0?'badge-partial':'badge-warn')}">${c.pagado?'Sí':(c.abono&&c.abono>0?`Abono ${fmt(c.abono)}`:'No')}</span>`
          : '<span style="color:var(--text-muted);font-size:0.72rem">—</span>'}
      </td>
      <td data-label="Estado">${c.megas?clientLabel(c):'<span class="status-badge" style="background:rgba(120,120,120,.18);color:var(--text-muted)">Pendiente megas</span>'}</td>
      <td data-label="Acciones"><div class="action-group">
        <button class="btn btn-ghost btn-sm" onclick="verHistorialCliente(${c.id})" title="Historial">📋</button>
        <button class="btn btn-ghost btn-sm" onclick="editClient(${c.id})" title="Editar">✏</button>
        <button class="btn btn-ghost btn-sm" onclick="ajustarInversion(${c.id})" title="Ajustar inversión">🔧</button>
        ${c.deudaEquipo ? `<button class="btn btn-amber btn-sm" onclick="liquidarDeuda(${c.id})" title="Liquidar deuda completa">🎯</button>` : ''}
        ${c.telefono ? `<button class="btn btn-ghost btn-sm" onclick="sendWhatsAppReminder(${c.id})" title="Enviar recordatorio WhatsApp">📱</button>` : ''}
        ${c.megas ? `<button class="btn btn-green btn-sm" onclick="openCobroModal(${c.id})" title="Cobrar">💰</button>` : ''}
        <button class="btn btn-red btn-sm"   onclick="confirmDelete(${c.id})" title="Eliminar">🗑</button>
      </div></td>
    </tr>`).join('');
  document.getElementById('client-table-body2').innerHTML=rows||`<tr><td colspan="7" class="empty-state">${q||f?'Sin resultados':'Sin clientes'}</td></tr>`;
}

function toggleSearchClear(){
  const inp=document.getElementById('search-input'), btn=document.getElementById('search-clear');
  if(!inp||!btn) return;
  btn.style.display=inp.value?'flex':'none';
}

function syncConfig() {
  document.getElementById('cfg-megas').value     =config.megas;
  document.getElementById('cfg-margen').value    =config.margenMegas||0;
  document.getElementById('cfg-costo').value     =config.costoPorMega;
  document.getElementById('cfg-dia-inicio').value=config.diaInicio;
}
