// modal-cobro.js
// Modal de registro de cobro/abono a un cliente.

// ═══════════════════════════════════════════════════════════
//  MODAL COBRO
// ═══════════════════════════════════════════════════════════
function openCobroModal(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  const mora=getMora(c);
  const cuotaEq=getCuotaEquipo(c);
  const deudaEq=getDeudaEquipoCliente(c);
  // Servicio y equipo son dos deudas independientes: el servicio se acumula por
  // meses de mora + el mes actual; el equipo tiene su propia deuda total, de la
  // que la "cuota" es solo el mínimo sugerido de este mes (se puede pagar más
  // o menos, incluso liquidarla completa de una vez).
  const servicioTotal = c.megas * c.precio * (mora + 1);
  const abono = c.abono || 0;
  const faltaServicio = Math.max(0, servicioTotal - abono);

  document.getElementById('cobro-id').value=id;
  document.getElementById('cobro-title').textContent=`Cobrar a ${c.nombre}`;
  document.getElementById('cobro-info').innerHTML=`
    ${c.megas} Mb × ${c.precio.toLocaleString()} = ${fmt(c.megas*c.precio)}/mes
    ${mora>0?`<br><span style="color:var(--purple)">⚠ ${mora} mes${mora>1?'es':''} mora = ${fmt(servicioTotal)} (servicio acumulado)</span>`:''}
    ${abono>0?`<br><span style="color:var(--blue)">💰 Abono previo: ${fmt(abono)} · Falta servicio: ${fmt(faltaServicio)}</span>`:''}
    ${deudaEq>0?`<br><span style="color:var(--amber)">🔧 Deuda equipo: ${fmt(deudaEq)} · cuota sugerida este mes: ${fmt(cuotaEq)}</span>`:''}
    <br><span style="color:var(--text-muted);font-size:0.72rem">Servicio y equipo se cobran por separado · monto menor = abono parcial</span>
  `;
  document.getElementById('cobro-monto-servicio').value = faltaServicio;

  const equipoWrap  = document.getElementById('cobro-monto-equipo-wrap');
  const equipoInput = document.getElementById('cobro-monto-equipo');
  if (deudaEq > 0) {
    equipoWrap.style.display = '';
    equipoInput.max   = deudaEq;
    equipoInput.value = cuotaEq > 0 ? cuotaEq : deudaEq;
  } else {
    equipoWrap.style.display = 'none';
    equipoInput.value = 0;
  }

  document.getElementById('cobro-fecha').value=fechaLocalISO();
  document.getElementById('cobro-nota').value='';
  document.getElementById('modal-cobro').classList.add('open');
}

function closeCobroModal(){ document.getElementById('modal-cobro').classList.remove('open'); }

function registrarCobro() {
  const id             = parseInt(document.getElementById('cobro-id').value);
  const montoServicio  = parseInt(document.getElementById('cobro-monto-servicio').value) || 0;
  const montoEquipoIn  = parseInt(document.getElementById('cobro-monto-equipo').value) || 0;
  const fecha = document.getElementById('cobro-fecha').value;
  const nota  = document.getElementById('cobro-nota').value.trim();
  const c = clients.find(x=>x.id===id);
  if(!c || (montoServicio + montoEquipoIn) <= 0){notify('Ingresa un monto válido',true);return;}
  if(typeof registrarParaDeshacer==='function') registrarParaDeshacer(`Cobro a ${c.nombre}`);

  const mora          = getMora(c);
  const precioPorMes  = c.megas * c.precio;
  const servicioTotal = precioPorMes * (mora + 1);
  const deudaEqActual = getDeudaEquipoCliente(c);

  // Snapshot del estado previo para poder revertir con eliminarCobro
  const prevState = { pagado:c.pagado, mora:c.mora||0, abono:c.abono||0, deudaEquipo:c.deudaEquipo||0 };

  // ── DEUDA DE EQUIPO ── pago independiente del servicio, se puede abonar
  // parcial o liquidar completa; nunca deja la deuda por debajo de 0.
  const montoEquipo = Math.min(Math.max(0, montoEquipoIn), deudaEqActual);
  if (montoEquipo > 0) c.deudaEquipo = Math.max(0, deudaEqActual - montoEquipo);

  // ── SERVICIO ── se cobra por meses de mora + mes actual, admite abono parcial.
  if (montoServicio >= servicioTotal) {
    c.pagado = true;
    c.mora   = 0;
    c.abono  = 0;
  } else if (montoServicio > 0) {
    c.abono = (c.abono || 0) + montoServicio;
    while (c.mora > 0 && c.abono >= precioPorMes) {
      c.mora  -= 1;
      c.abono -= precioPorMes;
    }
    if (c.mora === 0 && c.abono >= precioPorMes) {
      c.pagado = true;
      c.abono  = 0;
    }
  }

  if(c.fechaInicio) delete c.fechaInicio;
  if(c.mesInicio)   delete c.mesInicio;

  const monto = montoServicio + montoEquipo;
  history.push({
    hid: Date.now()+'-'+Math.floor(Math.random()*1000),
    id, nombre:c.nombre, monto, montoEquipo, fecha, nota,
    parcial: !c.pagado,
    tipo: 'servicio',
    prevState
  });

  c.ultimaEdicion = new Date().toISOString();
  save(); render(); closeCobroModal();

  const restanteServicio = c.pagado ? 0 : Math.max(0, precioPorMes*((c.mora||0)+1) - (c.abono||0));
  const restanteEquipo   = c.deudaEquipo || 0;
  const partes = [];
  if (montoServicio>0) partes.push(`servicio ${fmt(montoServicio)}`);
  if (montoEquipo>0)   partes.push(`equipo ${fmt(montoEquipo)}`);
  let msg = `Cobro a ${c.nombre} — ${partes.join(' + ')}`;
  if (restanteServicio>0) msg += ` · falta servicio ${fmt(restanteServicio)}`;
  if (restanteEquipo>0)   msg += ` · falta equipo ${fmt(restanteEquipo)}`;
  notify(msg);

  if(window.FirebaseSync) window.FirebaseSync.syncCliente(c);
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
  if(c && window.FirebaseSync) window.FirebaseSync.syncCliente(c);
}
