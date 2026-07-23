// modal-cobro.js
// Modal de registro de cobro/abono a un cliente.

// ═══════════════════════════════════════════════════════════
//  MODAL COBRO
// ═══════════════════════════════════════════════════════════
function openCobroModal(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  const mora=getMora(c);
  const cuotaEq=getCuotaEquipo(c);
  // BUG FIX #1: la cuota de equipo se cobra UNA vez por mes, no acumulada con mora.
  // El servicio sí se acumula (mora meses + el mes actual), pero el equipo es cuota fija mensual.
  const servicioTotal = c.megas * c.precio * (mora + 1);
  const montoTotal = servicioTotal + cuotaEq;
  const abono = c.abono || 0;
  const falta = Math.max(0, montoTotal - abono);

  document.getElementById('cobro-id').value=id;
  document.getElementById('cobro-title').textContent=`Cobrar a ${c.nombre}`;
  document.getElementById('cobro-info').innerHTML=`
    ${c.megas} Mb × ${c.precio.toLocaleString()} = ${fmt(c.megas*c.precio)}/mes
    ${mora>0?`<br><span style="color:var(--purple)">⚠ ${mora} mes${mora>1?'es':''} mora = ${fmt(servicioTotal)} (servicio acumulado)</span>`:''}
    ${cuotaEq>0?`<br><span style="color:var(--amber)">🔧 +${fmt(cuotaEq)} cuota equipo este mes (deuda total: ${fmt(getDeudaEquipoCliente(c))})</span>`:''}
    ${abono>0?`<br><span style="color:var(--blue)">💰 Abono previo: ${fmt(abono)} · Falta: ${fmt(falta)}</span>`:''}
    <br><span style="color:var(--text-muted);font-size:0.72rem">Total esperado: ${fmt(montoTotal)} · Monto menor = abono parcial</span>
  `;
  document.getElementById('cobro-monto').value = falta > 0 ? falta : montoTotal;
  document.getElementById('cobro-fecha').value=new Date().toISOString().split('T')[0];
  document.getElementById('cobro-nota').value='';
  document.getElementById('modal-cobro').classList.add('open');
}

function closeCobroModal(){ document.getElementById('modal-cobro').classList.remove('open'); }

function registrarCobro() {
  const id    = parseInt(document.getElementById('cobro-id').value);
  const monto = parseInt(document.getElementById('cobro-monto').value);
  const fecha = document.getElementById('cobro-fecha').value;
  const nota  = document.getElementById('cobro-nota').value.trim();
  const c = clients.find(x=>x.id===id);
  if(!c||!monto||monto<=0){notify('Ingresa un monto válido',true);return;}

  const mora    = getMora(c);
  const cuotaEq = getCuotaEquipo(c);
  // BUG FIX #1: equipo se cobra solo una vez por mes (no multiplicado por mora)
  const servicioTotal  = c.megas * c.precio * (mora + 1);
  const montoEsperado  = servicioTotal + cuotaEq;

  // Snapshot del estado previo para poder revertir con eliminarCobro
  const prevState = { pagado:c.pagado, mora:c.mora||0, abono:c.abono||0, deudaEquipo:c.deudaEquipo||0 };

  let montoEquipo = 0;

  if(monto >= montoEsperado) {
    // ── PAGO COMPLETO ──
    c.pagado = true;
    c.mora   = 0;
    c.abono  = 0;
    if(cuotaEq > 0) {
      montoEquipo   = cuotaEq;
      c.deudaEquipo = Math.max(0, (c.deudaEquipo||0) - cuotaEq);
    }
  } else {
    // ── ABONO PARCIAL ──
    // Separar proporcionalmente cuánto va a servicio y cuánto a equipo
    const propEquipo    = montoEsperado > 0 ? cuotaEq / montoEsperado : 0;
    const abonoEquipo   = Math.round(monto * propEquipo);
    const abonoServicio = monto - abonoEquipo;

    // Acumular abono de servicio
    c.abono = (c.abono || 0) + abonoServicio;

    // Descontar meses de mora completos ya cubiertos por el abono de servicio
    const precioPorMes = c.megas * c.precio;
    while(c.mora > 0 && c.abono >= precioPorMes) {
      c.mora  -= 1;
      c.abono -= precioPorMes;
    }

    // BUG FIX #2: si el abono cubre el mes actual también (mora=0 y abono>=servicio mes)
    if(c.mora === 0 && c.abono >= precioPorMes) {
      c.pagado = true;
      c.abono  = 0;
    }

    // Abono a deuda de equipo
    if(cuotaEq > 0 && abonoEquipo > 0) {
      montoEquipo   = abonoEquipo;
      c.deudaEquipo = Math.max(0, (c.deudaEquipo||0) - abonoEquipo);
    }
  }

  if(c.fechaInicio) delete c.fechaInicio;
  if(c.mesInicio)   delete c.mesInicio;

  history.push({
    hid: Date.now()+'-'+Math.floor(Math.random()*1000),
    id, nombre:c.nombre, monto, montoEquipo, fecha, nota,
    parcial: monto < montoEsperado,
    tipo: 'servicio',
    prevState
  });

  save(); render(); closeCobroModal();

  if(monto < montoEsperado) {
    notify(`Abono de ${c.nombre} — ${fmt(monto)} · falta ${fmt(montoEsperado-monto)}`);
  } else {
    notify(`Cobro de ${c.nombre} — ${fmt(monto)}`);
  }
}

function eliminarCobro(hid) {
  const idx = history.findIndex(h=>h.hid===hid);
  if(idx===-1) return;
  if(!confirm('¿Eliminar este cobro? Se revierte el estado del cliente a como estaba antes.')) return;
  const h = history[idx];
  const c = clients.find(x=>x.id===h.id);
  if(c && h.prevState) {
    c.pagado      = h.prevState.pagado;
    c.mora        = h.prevState.mora;
    c.abono       = h.prevState.abono;
    c.deudaEquipo = h.prevState.deudaEquipo;
  }
  history.splice(idx,1);
  save(); render();
  notify(`Cobro de ${h.nombre} eliminado`);
}
