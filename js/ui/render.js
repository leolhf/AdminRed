// render.js
// Renderizado principal de la interfaz (resumen, ancho de banda, alarmas, tablas).
// Depende de: state.js, calculations.js

// ═══════════════════════════════════════════════════════════
//  RENDER
// ═══════════════════════════════════════════════════════════
function render() {
  renderSummary(); renderRevSpark(); renderBandwidth(); renderAlarms();
  renderProfit(); renderInvestments(); renderTable1(); renderTable2();
  renderHistory(); renderPaqueteStatus(); syncConfig();
  if(typeof renderSalud==='function') renderSalud();
  if(typeof renderCalendario==='function') renderCalendario();
  if(typeof renderReporteMensual==='function') renderReporteMensual();
}

function mesActualHoy() {
  const ahora=new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;
}

function renderPaqueteStatus() {
  const el=document.getElementById('paquete-status-text');
  const btn=document.getElementById('btn-marcar-paquete-pagado');
  if(!el||!btn) return;
  const mes=mesActualHoy();
  const costo=costoMes();
  // v5.7.4: soporta pagos parciales. El acumulado es la suma de todos los
  // gastos 'paquete' del mes. Si >= costo, está pagado. Si > 0 pero < costo,
  // es un pago parcial con saldo pendiente.
  const acumulado = (typeof _paquetePagadoAcumuladoMes==='function')
    ? _paquetePagadoAcumuladoMes(mes)
    : gastos.filter(g=>g.categoria==='paquete'&&(g.fecha||'').startsWith(mes)).reduce((s,g)=>s+(g.monto||0),0);
  const pagado = acumulado >= costo;
  if(pagado){
    el.innerHTML=`<span class="text-green">✓ Pagado</span> — ${fmt(costo)} · ${config.megas} Mb`;
    btn.style.display='none';
  } else if(acumulado > 0) {
    // Pago parcial: mostrar progreso
    const pendiente = costo - acumulado;
    const pct = Math.round(acumulado / costo * 100);
    el.innerHTML=
      `<span class="text-amber">⚠ Pago parcial</span> — ${fmt(acumulado)} / ${fmt(costo)} (${pct}%) · ${config.megas} Mb` +
      `<br><span style="color:var(--text-muted);font-size:0.78rem">Faltan ${fmt(pendiente)} para completar</span>`;
    btn.textContent = 'Completar pago';
    btn.style.display='';
  } else {
    el.innerHTML=`<span class="text-amber">⚠ Pendiente este mes</span> — ${fmt(costo)} · ${config.megas} Mb`;
    btn.textContent = 'Pagar paquete';
    btn.style.display='';
  }
}

// Ordena clientes por número de IP (octeto por octeto, numéricamente,
// no como texto — así 192.168.1.9 queda antes que 192.168.1.10).
// Clientes sin IP asignada van al final, y entre ellos se mantiene el
// orden por nombre.
function compararPorIP(a,b){
  const ipA=(a.ip||'').trim(), ipB=(b.ip||'').trim();
  if(!ipA && !ipB) return a.nombre.localeCompare(b.nombre);
  if(!ipA) return 1;
  if(!ipB) return -1;
  const partsA=ipA.split('.').map(n=>parseInt(n,10));
  const partsB=ipB.split('.').map(n=>parseInt(n,10));
  for(let i=0;i<Math.max(partsA.length,partsB.length);i++){
    const na=isNaN(partsA[i])?-1:partsA[i];
    const nb=isNaN(partsB[i])?-1:partsB[i];
    if(na!==nb) return na-nb;
  }
  return 0;
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
  // v5.5.1: el % de cobro se calcula sobre los clientes cuyo corte ya
  // llegó (ingresosEsperadosHoy), no sobre el total mensual completo.
  const ingEsperadaHoy=ingresosEsperadosHoy();
  const pct=ingEsperadaHoy>0?Math.round(cobradoAlCorte()/ingEsperadaHoy*100):0;
  const pctMes=ingresosMes()>0?Math.round(cobrado()/ingresosMes()*100):0;
  const conMora=clients.filter(c=>getMora(c)>0).length;
  const invTotal=inversionTotalHistorica();
  const invRec=recuperadoInversion();
  const invPend=deudaEquipoPendienteTotal();
  const invPct=invTotal>0?Math.round(invRec/invTotal*100):0;
  // v5.6.0: equivalencia USD en las tarjetas financieras (solo si hay tasa).
  // subUsd(cup) devuelve " · ≈ $X.XX USD" para añadirlo al card-sub, o '' si no hay tasa.
  const subUsd=(cup)=>{const u=cupToUsd(cup);return u===null?'':` · ≈ ${fmtUsd(u)} USD`;};
  // v5.7: ganancia REAL de caja del mes (cobrado - pagado).
  const ganR=gananciaReal();
  const ganRColor=ganR>=0?'green':'red';
  document.getElementById('summary-cards').innerHTML=`
    <div class="card"><div class="card-label">Ingreso mensual</div><div class="card-value green" data-countup="${ingresosMes()/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="card-sub">CUP esperado${subUsd(ingresosMes())}</div></div>
    <div class="card"><div class="card-label">Costo del paquete</div><div class="card-value red" data-countup="${costoMes()/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="card-sub">${config.megas} Mb × ${fmt(config.costoPorMega)}</div></div>
    <div class="card"><div class="card-label">Ganancia Mensual</div><div class="card-value ${gananciaMensual()>=0?'green':'red'}" data-countup="${gananciaMensual()/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="card-sub">Ingreso − costo paquete</div></div>
    <div class="card"><div class="card-label">Cobrado</div><div class="card-value blue" data-countup="${cobrado()/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="card-sub">${pct}% al corte · ${pctMes}% del mes${subUsd(cobrado())}</div></div>
    <div class="card"><div class="card-label">Pendiente</div><div class="card-value amber" data-countup="${pendienteTotal()/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="card-sub">${clients.filter(c=>!c.pagado && facturacionIniciada(c)).length} clientes${subUsd(pendienteTotal())}</div></div>
    <div class="card"><div class="card-label">Ganancia neta (caja)</div><div class="card-value ${ganRColor}" data-countup="${ganR/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div><div class="card-sub">cobrado - pagado del mes${subUsd(ganR)}</div></div><div class="card"><div class="card-label">Clientes</div><div class="card-value" data-countup="${clients.length}">0</div><div class="card-sub">${totalVendido()} Mb vendidos</div></div>
    ${conMora>0?`<div class="card"><div class="card-label">Con mora</div><div class="card-value" style="color:var(--purple)" data-countup="${conMora}">0</div><div class="card-sub">clientes atrasados</div></div>`:''}
    ${invTotal>0?`<div class="card"><div class="card-label">Inversión recuperada</div><div class="card-value amber" data-countup="${invPct}" data-countup-suffix="%">0%</div><div class="card-sub">${fmt(invRec)} de ${fmt(invTotal)}</div></div>`:''}
    ${invPend>0?`<div class="card" onclick="openModalInversionPendiente()" style="cursor:pointer;border-color:var(--amber)">
  <div class="card-label">Inversión pendiente ›</div>
  <div class="card-value amber" data-countup="${invPend/1000}" data-countup-decimals="1" data-countup-suffix="K">0K</div>
  <div class="card-sub">toca para ver detalle</div>
</div>`:''}
  `;
  animateCountUpCards(document.getElementById('summary-cards'));
}

function renderBandwidth() {
  const sold=totalVendido(),total=config.megas,margen=config.margenMegas||0,sobre=config.sobreventaMegas||0;
  const libreReal=total-margen;                       // libre respetando solo el paquete contratado
  const free=megasDisponiblesParaVenta();             // libre incluyendo la sobreventa permitida
  // La barra mide ocupacion sobre el paquete contratado (sin sobreventa):
  // verde <70%, ambar 70-100% (cerca del tope real), rojo >100% (en zona de sobreventa)
  const pct=Math.min(100,Math.round(sold/total*100));
  const enSobreventa=sold>libreReal;
  const color=enSobreventa?'var(--red)':pct>90?'var(--amber)':pct>70?'var(--amber)':'var(--green)';
  document.getElementById('bw-bar').style.cssText=`width:${pct}%;background:${color}`;
  document.getElementById('bw-text').textContent=pct+'% usado';
  document.getElementById('bw-sold').textContent=sold+' Mb';
  // Libre incluye la sobreventa; se muestra el limite total (contratado+sobreventa)
  const limTotal=total+sobre;
  const libresTxt=Math.max(0,free)+' Mb'+(margen>0?` (reserva ${margen} Mb)`:'')+(sobre>0?` · limite ${limTotal} Mb`:'');
  document.getElementById('bw-free').textContent=libresTxt;
  document.getElementById('bw-total').textContent=total+' Mb'+(sobre>0?` (+${sobre} sobreventa)`:'');

  const warn=document.getElementById('bw-warn');
  if(warn){
    if(free<0){
      const faltan=-free;
      const sugerido=Math.ceil((total+faltan)/5)*5;
      warn.style.display='block';
      warn.textContent=`⚠ Te faltan ${faltan} Mb incluso usando tu sobreventa de ${sobre} Mb. Sugerencia: sube tu paquete a ${sugerido} Mb o aumenta la sobreventa permitida.`;
    } else if(enSobreventa){
      const usadaSobre=sold-libreReal;
      warn.style.display='block';
      warn.textContent=`⚠ Estas en zona de sobreventa: +${usadaSobre} Mb por encima de tu paquete de ${total} Mb (sobreventa permitida ${sobre} Mb).`;
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
  // BUG FIX: el wrapper externo (#alarm-section-wrapper) tiene display:none en
  // el HTML y nunca se mostraba — solo se togueaba el div interno (#alarm-section).
  // El usuario veía el panel de alertas en blanco aunque hubiera cobros pendientes.
  const wrapper=document.getElementById('alarm-section-wrapper');
  if(!alarms.length){
    sec.style.display='none';
    if(wrapper) wrapper.style.display='none';
    return;
  }
  sec.style.display='block';
  if(wrapper) wrapper.style.display='';
  document.getElementById('alarm-list').innerHTML=alarms.map(a=>{
    const enviado = a.c.recordatorioEnviado===fechaLocalISO();
    return `
    <div class="alarm-item${enviado?' sent':''}">
      <div class="alarm-dot dot-${a.type}"></div>
      <div style="flex:1">
        ${a.msg}${enviado?' <span style="color:var(--green);font-size:0.7rem">✓ recordatorio enviado hoy</span>':''}
        ${a.c.deudaEquipo ? `<div style="font-size:0.66rem;color:var(--amber)">🔧 incluye ${fmt(getCuotaEquipo(a.c))} de deuda (restan ${fmt(getDeudaEquipoCliente(a.c))})</div>` : ''}
      </div>
      <div class="action-group">
        ${a.c.telefono ? `<button class="btn btn-ghost btn-sm" onclick="sendWhatsAppReminder(${a.c.id})" title="Enviar recordatorio WhatsApp">📱</button>` : ''}
        <button class="btn btn-green btn-sm" onclick="openCobroModal(${a.c.id})">Cobrar</button>
      </div>
    </div>`;
  }).join('');
}

function renderProfit() {
  const moraPendiente=clients.filter(c=>!c.pagado&&getMora(c)>0).reduce((s,c)=>s+precioNetoCliente(c)*getMora(c),0);
  const invPend=deudaEquipoPendienteTotal();

  // --- v5.7: CAJA REAL DEL MES (lo que realmente entro/salio) ---
  const cobServ = cobradoServiciosMes();
  const cobEq   = cobradoEquipoMes();
  const cobTot  = cobradoTotalMes();
  const paqGasto= pagoPaqueteMes();
  const paqPag  = paquetePagadoEsteMes();
  const tg      = totalGastos();          // gastos operativos del mes (sin paquete ni inversion)
  const invCap  = inversionCapitalMes();  // capital invertido este mes (equipo/rebaja) — se recupera, no es gasto operativo
  const ganR    = gananciaReal();

  // --- PROYECCION (lo esperado, solo informativo) ---
  const ingEsp  = ingresosMes();
  const pend    = pendienteTotal();
  const ganProj = ganancia();

  document.getElementById('profit-rows').innerHTML=`
    <div class="bw-title" style="margin:2px 0 6px;font-size:0.8rem">Caja del mes (real)</div>
    <div class="pb-row"><span>Cobrado en servicios</span><span class="text-green">+${fmt(cobServ)}</span></div>
    ${cobEq>0?`<div class="pb-row"><span>Cobrado en cuotas de equipo</span><span class="text-amber">+${fmt(cobEq)}</span></div>`:''}
    <div class="pb-row"><span>Total cobrado este mes</span><span class="text-green"><strong>+${fmt(cobTot)}</strong></span></div>
    <div class="pb-row"><span>Pago paquete al proveedor</span><span class="text-red">${paqPag?`-${fmt(paqGasto)}`:`<span style="color:var(--amber)">Pendiente (${fmt(costoMes())})</span>`}</span></div>
    ${tg>0?`<div class="pb-row"><span>Gastos del mes</span><span class="text-red">-${fmt(tg)}</span></div>`:''}
    ${invCap>0?`<div class="pb-row"><span>Inversion del mes (capital)</span><span class="text-amber">-${fmt(invCap)}</span></div>`:''}
    <div class="pb-row"><span><strong>Ganancia neta real (caja)</strong></span><span class="${ganR>=0?'text-green':'text-red'}"><strong>${fmt(ganR)}</strong></span></div>

    <div class="bw-title" style="margin:12px 0 6px;font-size:0.8rem;color:var(--text-muted)">Proyeccion (esperado)</div>
    <div class="pb-row"><span>Ingresos brutos esperados</span><span class="text-green">+${fmt(ingEsp)}</span></div>
    <div class="pb-row"><span>Costo servicio (${config.megas} Mb x ${fmt(config.costoPorMega)})</span><span class="text-red">-${fmt(costoMes())}</span></div>
    ${moraPendiente>0?`<div class="pb-row"><span>Mora pendiente por cobrar</span><span style="color:var(--purple)">+${fmt(moraPendiente)}</span></div>`:''}
    <div class="pb-row"><span>Pendiente por cobrar</span><span style="color:var(--purple)">${fmt(pend)}</span></div>
    <div class="pb-row"><span>Ganancia proyectada (si todos pagan)</span><span class="${ganProj>=0?'text-green':'text-red'}">${fmt(ganProj)}</span></div>
    ${invPend>0?`<div class="pb-row"><span>Inversion aun pendiente por cobrar</span><span class="text-amber">${fmt(invPend)}</span></div>`:''}
  `;
}

function renderTable1() {
  const pendientes=clients.filter(requiereAtencion);
  const hoyEs=new Date().getDate();
  const rows=ordenarPorUrgenciaCobro(pendientes).map(c=>{
    const pagaHoy=(c.diaPago||config.diaInicio)===hoyEs && c.megas;
    const hoyDot=pagaHoy?`<span class="paga-hoy-dot" title="Paga hoy"></span>`:'';
    return `<tr class="${pagaHoy?'paga-hoy-row':''}">
      <td>
        <strong>${c.nombre}</strong>${hoyDot}
        ${c.ip?`<div style="font-size:0.66rem;color:var(--text-muted)">IP: ${c.ip}</div>`:''}
        ${getMora(c)>0?`<div class="mora-tag">⚠ ${getMora(c)} mes${getMora(c)>1?'es':''} mora</div>`:''}
      </td>
      <td class="mono">${c.megas?c.megas+' Mb':'<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="mono">${c.megas?getPrecioCliente(c).toLocaleString():'<span style="color:var(--text-muted)">—</span>'}</td>
      <td class="mono text-green">${c.megas?fmt(precioNetoCliente(c)):'<span style="color:var(--text-muted)">—</span>'}</td>
      <td>${c.megas?clientLabel(c):'<span class="status-badge" style="background:rgba(120,120,120,.18);color:var(--text-muted)">Pendiente megas</span>'}</td>
      <td class="mono hide-sm">día ${c.diaPago}</td>
      <td>${c.megas?`<button class="btn btn-green btn-sm" onclick="openCobroModal(${c.id})">${c.pagado?'Re-cobrar':'Cobrar'}</button>`:'<span style="color:var(--text-muted);font-size:0.72rem">Sin megas</span>'}</td>
    </tr>`;
  }).join('');
  document.getElementById('client-table-body').innerHTML=rows||'<tr><td colspan="7" class="empty-state">Sin deudas ni cobros pendientes 🎉</td></tr>';
}

function renderTable2() {
  const q=(document.getElementById('search-input').value||'').toLowerCase();
  const f=document.getElementById('filter-status').value;
  const hoyEs=new Date().getDate();
  const filtered=clients.filter(c=>{
    const matchQ=!q||c.nombre.toLowerCase().includes(q)||(c.ip||'').toLowerCase().includes(q);
    if(!matchQ) return false;
    if(!f) return true;
    if(f==='mora') return getMora(c)>0;
    return getStatus(c)===f;
  });
  const rows=[...filtered].sort(compararPorIP).map(c=>`
    <tr class="estado-${getStatus(c)}${getMora(c)>0?' con-mora':''}${(c.diaPago||config.diaInicio)===hoyEs&&!c.pagado&&c.megas?' paga-hoy-row':''}${c.suspendido?' suspendido-row':''}">
      <td data-label="Cliente">
        <strong style="cursor:pointer" onclick="verHistorialCliente(${c.id})">${c.nombre} <span style="font-size:0.7rem;color:var(--text-muted)">›</span></strong>${(c.diaPago||config.diaInicio)===hoyEs&&!c.pagado&&c.megas?'<span class="paga-hoy-dot" title="Paga hoy"></span>':''}${c.suspendido?'<span class="status-badge badge-suspendido" title="Conexión suspendida">🔌 Suspendido</span>':''}
        ${c.ip?`<div style="font-size:0.66rem;color:var(--text-muted)">IP: ${c.ip}</div>`:''}
        ${getPlanCliente(c)?`<div style="font-size:0.66rem;color:var(--blue)">📋 Plan: ${getPlanCliente(c).nombre}</div>`:''}
        ${c.descuento?`<div style="font-size:0.66rem;color:var(--green)">🎁 Descuento: −${c.descuentoTipo==='pct'?c.descuento+'%':fmt(c.descuento)}</div>`:''}
        ${getMora(c)>0?`<div class="mora-detail">⚠ ${getMora(c)} mes${getMora(c)>1?'es':''} de mora · ${fmt(precioNetoCliente(c)*getMora(c))}</div>`:''}
        ${c.deudaEquipo?`<div class="mora-detail" style="color:var(--amber)">🔧 Debe equipo: ${fmt(getDeudaEquipoCliente(c))} (cuota ${fmt(getCuotaEquipoCliente(c))})
  ${mesesRestantesDeuda(c)===Infinity
    ? ' · define una cuota para estimar'
    : ` · ~${mesesRestantesDeuda(c)} mes(es), hasta ${fechaFinDeuda(c)}`}
</div>
${(()=>{const p=getProgresoEquipoCliente(c);return p.total>0?`<div class="progreso-equipo" title="${fmt(p.recuperado)} de ${fmt(p.total)} recuperado">
  <div class="progreso-equipo-track"><div class="progreso-equipo-fill" style="width:${p.pct}%"></div></div>
  <div class="progreso-equipo-label">${p.pct}% recuperado</div>
</div>`:'';})()}`:''}
        ${getLateLabel(c.id)}
      </td>
      <td data-label="Megas"><input class="inline-input" type="number" min="0" value="${c.megas||''}" placeholder="—" onchange="updateField(${c.id},'megas',+this.value)"> ${c.megas?'Mb':''}</td>
      <td data-label="$/Mega"><input class="inline-input" type="number" min="0" value="${c.precio||''}" placeholder="—" onchange="updateField(${c.id},'precio',+this.value)"></td>
      <td data-label="Total mes" class="mono">${c.megas?fmt(precioNetoCliente(c)):'<span style="color:var(--text-muted)">—</span>'}</td>
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
        ${c.megas?`<button class="btn btn-ghost btn-sm" onclick="toggleSuspendido(${c.id})" title="${c.suspendido?'Reactivar conexión':'Suspender conexión'}">${c.suspendido?'🔌':'✅'}</button>`:''}
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
  document.getElementById('cfg-megas').value       =config.megas;
  document.getElementById('cfg-margen').value      =config.margenMegas||0;
  document.getElementById('cfg-sobreventa').value  =config.sobreventaMegas||0;
  document.getElementById('cfg-costo').value       =config.costoPorMega;
  document.getElementById('cfg-dia-inicio').value  =config.diaInicio;
}
