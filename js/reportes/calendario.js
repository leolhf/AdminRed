// calendario.js
// Calendario visual mensual de cobros.
// Feature #7: Muestra un calendario del mes en curso donde cada dia se colorea
//              segun el estado de cobro de los clientes cuyo dia de pago cae ese dia:
//              - Verde: todos pagados
//              - Amarillo: algunos pagados, algunos pendientes
//              - Rojo: todos pendientes o con mora
//              - Gris: sin clientes con cobro ese dia
//              Al hacer clic en un dia, muestra el detalle de clientes.
// Depende de: state.js (clients, config), calculations.js (getMora, getPrecioCliente,
//             facturacionIniciada, fmt), ui/tabs.js (switchTab — no directo)

let calendarioMesOffset=0; // 0 = mes actual, -1 = mes anterior, +1 = proximo mes

function renderCalendario() {
  const el=document.getElementById('calendario-content');
  if(!el) return;

  // Calcular mes a mostrar
  const ahora=new Date();
  const fechaMes=new Date(ahora.getFullYear(),ahora.getMonth()+calendarioMesOffset,1);
  const anio=fechaMes.getFullYear();
  const mes=fechaMes.getMonth(); // 0-11
  const primerDia=new Date(anio,mes,1);
  const ultimoDia=new Date(anio,mes+1,0);
  const diasEnMes=ultimoDia.getDate();
  // Dia de la semana del primer dia (0=domingo, 6=sabado)
  const diaSemanaInicio=primerDia.getDay();

  const mesLabel=fechaMes.toLocaleDateString('es-CU',{month:'long',year:'numeric'});
  const esMesActual=calendarioMesOffset===0;
  const hoy=ahora.getDate();

  // Agrupar clientes por dia de pago
  const clientesPorDia={};
  clients.forEach(c=>{
    if(!c.diaPago) return;
    if(!facturacionIniciada(c) && esMesActual) return; // no mostrar futuros
    const dia=c.diaPago;
    if(dia<1||dia>diasEnMes) return;
    if(!clientesPorDia[dia]) clientesPorDia[dia]=[];
    clientesPorDia[dia].push(c);
  });

  // Construir grid del calendario
  const diasSemana=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
  let html=`
    <div class="calendario-wrap">
      <div class="calendario-header">
        <button class="btn btn-ghost btn-sm" onclick="cambiarMesCal(-1)">‹</button>
        <h3>${mesLabel}</h3>
        <button class="btn btn-ghost btn-sm" onclick="cambiarMesCal(1)">›</button>
      </div>
      <div class="calendario-grid">
  `;

  // Encabezados de dias de semana
  diasSemana.forEach(d=>{
    html+=`<div class="cal-dia-header">${d}</div>`;
  });

  // Celdas vacias antes del primer dia
  for(let i=0;i<diaSemanaInicio;i++){
    html+=`<div class="cal-dia cal-dia-vacio"></div>`;
  }

  // Dias del mes
  let totalEsperado=0, totalCobrado=0, totalPendiente=0;
  for(let dia=1;dia<=diasEnMes;dia++){
    const clientesDia=clientesPorDia[dia]||[];
    const nClientes=clientesDia.length;
    const nPagados=clientesDia.filter(c=>c.pagado).length;
    const nPendientes=nClientes-nPagados;
    const nConMora=clientesDia.filter(c=>getMora(c)>0).length;

    let clase='cal-dia';
    let badge='';
    if(nClientes===0){
      clase+=' cal-dia-vacio-num';
    } else if(nPagados===nClientes){
      clase+=' cal-dia-ok';
      badge='✓';
    } else if(nPagados>0){
      clase+=' cal-dia-parcial';
      badge=`${nPagados}/${nClientes}`;
    } else if(nConMora>0){
      clase+=' cal-dia-mora';
      badge='⚠';
    } else {
      clase+=' cal-dia-pendiente';
      badge='●';
    }

    // Marcar hoy
    if(esMesActual&&dia===hoy) clase+=' cal-dia-hoy';

    // Calcular montos
    const montoEsperado=clientesDia.reduce((s,c)=>s+precioNetoCliente(c),0);
    const montoCobrado=clientesDia.filter(c=>c.pagado).reduce((s,c)=>s+precioNetoCliente(c),0);
    totalEsperado+=montoEsperado;
    totalCobrado+=montoCobrado;
    totalPendiente+=montoEsperado-montoCobrado;

    const detalle=nClientes>0?clientesDia.map(c=>
      `${c.nombre} — ${fmt(precioNetoCliente(c))}${c.pagado?' ✓':' ✗'}${getMora(c)>0?' ⚠mora':''}`
    ).join('\\n'):'';

    html+=`<div class="${clase}" ${nClientes>0?`onclick="verDiaCalendario(${dia},${anio},${mes})" title="${detalle}"`:''}>
      <span class="cal-dia-num">${dia}</span>
      ${nClientes>0?`<span class="cal-dia-badge">${badge}</span>`:''}
      ${nClientes>0?`<span class="cal-dia-monto mono">${fmt(montoCobrado)}/${fmt(montoEsperado)}</span>`:''}
    </div>`;
  }

  html+=`</div>`; // grid

  // Resumen del mes
  const pct=totalEsperado>0?Math.round(totalCobrado/totalEsperado*100):0;
  html+=`
    <div class="calendario-resumen">
      <div class="cal-resumen-item">
        <span class="cal-resumen-label">Esperado</span>
        <span class="cal-resumen-val mono">${fmt(totalEsperado)}</span>
      </div>
      <div class="cal-resumen-item">
        <span class="cal-resumen-label">Cobrado</span>
        <span class="cal-resumen-val mono text-green">${fmt(totalCobrado)}</span>
      </div>
      <div class="cal-resumen-item">
        <span class="cal-resumen-label">Pendiente</span>
        <span class="cal-resumen-val mono text-amber">${fmt(totalPendiente)}</span>
      </div>
      <div class="cal-resumen-item">
        <span class="cal-resumen-label">Tasa</span>
        <span class="cal-resumen-val">${pct}%</span>
      </div>
    </div>
    <div class="calendario-leyenda">
      <span class="cal-leyenda-item"><span class="cal-leyenda-color cal-dia-ok"></span> Todos pagados</span>
      <span class="cal-leyenda-item"><span class="cal-leyenda-color cal-dia-parcial"></span> Parcial</span>
      <span class="cal-leyenda-item"><span class="cal-leyenda-color cal-dia-pendiente"></span> Pendiente</span>
      <span class="cal-leyenda-item"><span class="cal-leyenda-color cal-dia-mora"></span> Con mora</span>
    </div>
  `;

  html+=`</div>`; // wrap
  el.innerHTML=html;
}

function cambiarMesCal(delta) {
  calendarioMesOffset+=delta;
  renderCalendario();
}

function verDiaCalendario(dia, anio, mes) {
  // Mostrar los clientes que pagan ese dia en un modal interactivo
  const clientesDia=clients.filter(c=>c.diaPago===dia);
  if(!clientesDia.length) return;
  const fechaStr=new Date(anio,mes,dia).toLocaleDateString('es-CU',{weekday:'long',day:'numeric',month:'long'});

  // Construir modal
  let existing=document.getElementById('cal-dia-modal');
  if(existing) existing.remove();

  let rowsHtml='';
  clientesDia.forEach(c=>{
    const monto=precioNetoCliente(c);
    const plan=getPlanCliente(c);
    const descTxt=c.descuento?` · <span style="color:var(--green)">−${c.descuentoTipo==='pct'?c.descuento+'%':fmt(c.descuento)}</span>`:'';
    const moraTxt=getMora(c)>0?` · <span style="color:var(--red)">⚠ ${getMora(c)} mes mora</span>`:'';
    const planTxt=plan?` · <span style="color:var(--blue)">📋 ${plan.nombre}</span>`:'';
    const estadoIcon=c.pagado?'✅':'⏳';
    const cobrarBtn=c.pagado
      ? '<span style="color:var(--green);font-size:0.8rem">Pagado</span>'
      : `<button class="btn btn-green btn-sm" onclick="cerrarCalDiaModal();openCobroModal(${c.id})">💰 Cobrar</button>`;
    rowsHtml+=`
      <div class="caldia-row">
        <div class="caldia-info">
          <div class="caldia-nombre">${estadoIcon} ${c.nombre}</div>
          <div class="caldia-detalle"><span class="mono">${fmt(monto)}</span>${descTxt}${moraTxt}${planTxt}</div>
        </div>
        <div class="caldia-accion">${cobrarBtn}</div>
      </div>`;
  });

  const modal=document.createElement('div');
  modal.id='cal-dia-modal';
  modal.className='modal-overlay open';
  modal.innerHTML=`
    <div class="modal" style="max-width:500px">
      <div class="modal-header">
        <h3>📅 ${fechaStr}</h3>
        <button class="modal-close" onclick="cerrarCalDiaModal()">✕</button>
      </div>
      <div class="modal-body">
        <p style="color:var(--text-muted);margin-bottom:12px">${clientesDia.length} cliente(s) con pago este día</p>
        ${rowsHtml}
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function cerrarCalDiaModal() {
  const m=document.getElementById('cal-dia-modal');
  if(m) m.remove();
}
