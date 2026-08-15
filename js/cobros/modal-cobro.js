// modal-cobro.js
// Modal de registro de cobro/abono a un cliente.
// Depende de: state.js, calculations-clientes.js (getMora, getCuotaEquipo, getDeudaEquipoCliente,
//             getPrecioCliente, calcularDescuento, montoTotalACobrar),
//             calculations-utils.js (fmt, fechaLocalISO, siguienteRecibo, formatoRecibo)

// ═══════════════════════════════════════════════════════════════════════════════
//  MODAL COBRO
// ═══════════════════════════════════════════════════════════════════════════════
function openCobroModal(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  const mora=getMora(c);
  const cuotaEq=getCuotaEquipo(c);
  const deudaEq=getDeudaEquipoCliente(c);
  const precioMega=getPrecioCliente(c);
  // Servicio y equipo son dos deudas independientes: el servicio se acumula por
  // meses de mora + el mes actual; el equipo tiene su propia deuda total, de la
  // que la "cuota" es solo el minimo sugerido de este mes (se puede pagar mas
  // o menos, incluso liquidarla completa de una vez).
  // v5.8.0: usar calcularDescuentoTotal (recurrente + puntuales del mes).
  const precioPorMes = c.megas * precioMega;
  const descTot = calcularDescuentoTotal(c, precioPorMes);
  const descuento = descTot.total;
  const precioNeto = Math.max(0, precioPorMes - descuento);
  const servicioTotal = precioNeto * (mora + 1);
  const abono = c.abono || 0;
  const faltaServicio = Math.max(0, servicioTotal - abono);

  // Feature #5: mostrar el plan si lo tiene
  const plan = getPlanCliente(c);
  const planTxt = plan ? `<br><span style="color:var(--blue)">\u{1F4CB} Plan: ${plan.nombre}</span>` : '';

  // v5.8.0: mostrar descuento recurrente + puntuales
  let descTxt = '';
  if (descTot.recurrente > 0) {
    descTxt += `<br><span style="color:var(--green)">\u{1F4B3} Descuento recurrente: \u2212${fmt(descTot.recurrente)} (${c.descuentoTipo==='pct'?c.descuento+'%':'monto fijo'})</span>`;
  }
  if (descTot.puntuales.length > 0) {
    const sumaP = descTot.puntuales.reduce((s,d)=>s+d.monto,0);
    descTxt += `<br><span style="color:var(--green)">\u{1F381} ${descTot.puntuales.length} descuento(s) puntual(es) este mes: \u2212${fmt(sumaP)}</span>`;
  }
  if (descuento > 0) {
    descTxt += `<br><span style="color:var(--green)">Precio neto: ${fmt(precioNeto)}/mes</span>`;
  }

  document.getElementById('cobro-id').value=id;
  document.getElementById('cobro-title').textContent=`Cobrar a ${c.nombre}`;
  document.getElementById('cobro-info').innerHTML=`
    ${c.megas} Mb \u00d7 ${precioMega.toLocaleString()} = ${fmt(precioPorMes)}/mes${planTxt}${descTxt}
    ${mora>0?`<br><span style="color:var(--purple)">\u26a0 ${mora} mes${mora>1?'es':''} mora = ${fmt(servicioTotal)} (servicio acumulado)</span>`:''}
    ${abono>0?`<br><span style="color:var(--blue)">\u{1F4B0} Abono previo: ${fmt(abono)} \u00b7 Falta servicio: ${fmt(faltaServicio)}</span>`:''}
    ${deudaEq>0?`<br><span style="color:var(--amber)">\u{1F527} Deuda equipo: ${fmt(deudaEq)} \u00b7 cuota sugerida este mes: ${fmt(cuotaEq)}</span>`:''}
    <br><span style="color:var(--text-muted);font-size:0.72rem">Servicio y equipo se cobran por separado \u00b7 monto menor = abono parcial</span>
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
  // Resetear la seccion de pago en USD: siempre arranca en CUP.
  const radioCup = document.querySelector('input[name="cobro-moneda"][value="CUP"]');
  if (radioCup) radioCup.checked = true;
  const usdPanel = document.getElementById('cobro-usd-panel');
  if (usdPanel) usdPanel.style.display = 'none';
  const btnTasaCobro = document.getElementById('btn-actualizar-tasa-cobro');
  if (btnTasaCobro) btnTasaCobro.style.display = 'none';
  const usdInput = document.getElementById('cobro-usd-recibidos');
  if (usdInput) usdInput.value = '';
  const usdDesglose = document.getElementById('cobro-usd-desglose');
  if (usdDesglose) usdDesglose.innerHTML = 'Ingresa los USD recibidos para ver el desglose.';
  // v5.8.0: inicializar el sub-panel de descuentos puntuales
  if (typeof _initCobroDescuentos === 'function') _initCobroDescuentos(id);
  document.getElementById('modal-cobro').classList.add('open');
}

function closeCobroModal(){ document.getElementById('modal-cobro').classList.remove('open'); }

// ─────────────────────────────────────────────────────────────────────────────
//  PAGO EN USD — conversión y cálculo de vuelto
// ─────────────────────────────────────────────────────────────────────────────
// Cuando el cliente paga en USD, se usa una tasa ajustada: la tasa del día menos
// 5 CUP, redondeada al múltiplo de 5 más cercano. Los USD que entrega el cliente
// se convierten a CUP con esa tasa ajustada y se compara con el monto a cobrar
// (servicio + equipo) para calcular el vuelto a devolver.

// Devuelve la moneda seleccionada actualmente en el modal ('CUP' o 'USD').
function _cobroMonedaSel() {
  const radios = document.getElementsByName('cobro-moneda');
  for (const r of radios) { if (r.checked) return r.value; }
  return 'CUP';
}

// Handler al cambiar el radio de moneda. Muestra/oculta el panel USD y
// habilita/deshabilita el botón de actualizar tasa.
function onCobroMonedaChange() {
  const moneda = _cobroMonedaSel();
  const panel = document.getElementById('cobro-usd-panel');
  const btnTasa = document.getElementById('btn-actualizar-tasa-cobro');
  if (moneda === 'USD') {
    if (panel) panel.style.display = '';
    if (btnTasa) btnTasa.style.display = '';
    _actualizarAvisoStaleCobro();
    calcularCobroUsd();
  } else {
    if (panel) panel.style.display = 'none';
    if (btnTasa) btnTasa.style.display = 'none';
  }
}

// Muestra u oculta el aviso de "tasa sin actualizar hace más de 5 h".
function _actualizarAvisoStaleCobro() {
  const aviso = document.getElementById('cobro-usd-stale-aviso');
  if (!aviso) return;
  if (typeof tasaUsdStale5h === 'function' && tasaUsdStale5h()) {
    aviso.style.display = '';
  } else {
    aviso.style.display = 'none';
  }
}

// Calcula el desglose del pago en USD en tiempo real mientras el admin escribe.
// Muestra: tasa del día, tasa ajustada, USD×tasa = CUP, monto a cobrar, vuelto.
function calcularCobroUsd() {
  const desglose = document.getElementById('cobro-usd-desglose');
  if (!desglose) return;

  const tasaDia = typeof tasaUsd === 'function' ? tasaUsd() : null;
  if (tasaDia === null) {
    desglose.innerHTML = '<span style="color:var(--amber)">No hay tasa USD configurada. Pulsa «Actualizar tasa» o configúrala en Ajustes.</span>';
    return;
  }

  const ajustada = typeof tasaAjustadaUsd === 'function' ? tasaAjustadaUsd() : null;
  if (ajustada === null) {
    desglose.innerHTML = '<span style="color:var(--amber)">No hay tasa USD configurada.</span>';
    return;
  }

  const usdInput = document.getElementById('cobro-usd-recibidos');
  const usd = parseFloat(usdInput ? usdInput.value : 0) || 0;
  const cupConvertido = Math.round(usd * ajustada);

  // Monto a cobrar = servicio + equipo (lo que hay en los campos del modal).
  const montoServicio = parseInt(document.getElementById('cobro-monto-servicio').value) || 0;
  const montoEquipo = parseInt(document.getElementById('cobro-monto-equipo').value) || 0;
  const aCobrar = montoServicio + montoEquipo;

  const vuelto = cupConvertido - aCobrar;
  const vueltoColor = vuelto >= 0 ? 'var(--green)' : 'var(--red)';
  const vueltoLabel = vuelto >= 0 ? 'Vuelto a devolver' : 'Falta (cliente debe completar)';

  if (usd <= 0) {
    desglose.innerHTML = `
      Tasa del día: <strong>${tasaDia} CUP/USD</strong><br>
      Tasa ajustada: <strong>${ajustada} CUP/USD</strong> (−5, redondeo múltiplo 5)<br>
      <span style="color:var(--text-muted)">Ingresa los USD recibidos para ver el desglose.</span>
    `;
    return;
  }

  desglose.innerHTML = `
    Tasa del día: <strong>${tasaDia} CUP/USD</strong><br>
    Tasa ajustada: <strong>${ajustada} CUP/USD</strong> (−5, redondeo múltiplo 5)<br>
    ${usd} USD × ${ajustada} = <strong>${cupConvertido.toLocaleString('es-CU')} CUP</strong><br>
    Monto a cobrar: <strong>${aCobrar.toLocaleString('es-CU')} CUP</strong><br>
    <span style="color:${vueltoColor};font-weight:600">${vueltoLabel}: ${Math.abs(vuelto).toLocaleString('es-CU')} CUP</span>
  `;
}

// Handler del botón "Actualizar tasa" dentro del modal de cobro.
// Reutiliza actualizarTasaUsd() de moneda.js y refresca el desglose.
async function clickActualizarTasaUsdCobro() {
  const btn = document.getElementById('btn-actualizar-tasa-cobro');
  const desglose = document.getElementById('cobro-usd-desglose');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Actualizando…'; }
  if (desglose) desglose.innerHTML = '<span style="color:var(--text-muted)">Consultando tasa…</span>';

  const ok = await actualizarTasaUsd((msg) => {
    if (desglose) desglose.innerHTML = `<span style="color:var(--text-muted)">${msg}</span>`;
  });

  if (btn) { btn.disabled = false; btn.textContent = '🔄 Actualizar tasa'; }
  _actualizarAvisoStaleCobro();
  calcularCobroUsd();
  if (ok) notify('Tasa USD actualizada');
  else notify('No se pudo actualizar automáticamente — usa el valor manual en Ajustes', 'warn');
}

function registrarCobro() {
  const id             = parseInt(document.getElementById('cobro-id').value);
  const fecha = document.getElementById('cobro-fecha').value;
  let nota  = document.getElementById('cobro-nota').value.trim();
  const c = clients.find(x=>x.id===id);
  if(!c){notify('Cliente no encontrado',true);return;}

  const mora          = getMora(c);
  const precioMega    = getPrecioCliente(c);
  const precioPorMes  = c.megas * precioMega;
  // v5.8.0: descuento total = recurrente + puntuales pendientes del mes.
  const descTot       = calcularDescuentoTotal(c, precioPorMes);
  const descuento     = descTot.total;
  const precioNeto    = Math.max(0, precioPorMes - descuento);
  const servicioTotal = precioNeto * (mora + 1);
  const deudaEqActual = getDeudaEquipoCliente(c);

  // ── Determinar moneda del pago y calcular montos ──
  const moneda = _cobroMonedaSel();
  let montoServicio, montoEquipoIn;

  if (moneda === 'USD') {
    // Pago en USD: el cliente entrega una cantidad de USD que se convierte a CUP
    // con la tasa ajustada (tasa del día −5, redondeo múltiplo 5). El CUP total
    // convertido se asigna primero al servicio y el resto al equipo.
    const ajustada = tasaAjustadaUsd();
    if (ajustada === null) {
      notify('No hay tasa USD configurada. Configúrala en Ajustes o pulsa «Actualizar tasa».', true);
      return;
    }
    const usdRecibidos = parseFloat(document.getElementById('cobro-usd-recibidos').value) || 0;
    if (usdRecibidos <= 0) {
      notify('Ingresa la cantidad de USD recibidos', true);
      return;
    }
    const cupTotal = Math.round(usdRecibidos * ajustada);
    const faltaServicio = Math.max(0, servicioTotal - (c.abono || 0));
    // Asignar al servicio primero, luego al equipo
    montoServicio = Math.min(cupTotal, faltaServicio);
    montoEquipoIn = Math.min(cupTotal - montoServicio, deudaEqActual);
    // Actualizar los campos visibles del modal para que el admin vea el desglose
    document.getElementById('cobro-monto-servicio').value = montoServicio;
    document.getElementById('cobro-monto-equipo').value = montoEquipoIn;
    // Construir nota del desglose en USD
    const vuelto = cupTotal - (montoServicio + montoEquipoIn);
    const desgloseUsd = `Pago en USD: ${usdRecibidos} USD × ${ajustada} (tasa ${tasaUsd()}−5 redond.) = ${cupTotal.toLocaleString('es-CU')} CUP. Vuelto: ${vuelto.toLocaleString('es-CU')} CUP.`;
    nota = nota ? `${nota} | ${desgloseUsd}` : desgloseUsd;
  } else {
    // Pago en CUP: usar los valores de los campos directamente
    montoServicio  = parseInt(document.getElementById('cobro-monto-servicio').value) || 0;
    montoEquipoIn  = parseInt(document.getElementById('cobro-monto-equipo').value) || 0;
  }

  if((montoServicio + montoEquipoIn) <= 0){notify('Ingresa un monto válido',true);return;}
  if(typeof registrarParaDeshacer==='function') registrarParaDeshacer(`Cobro a ${c.nombre}`);

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
    while (c.mora > 0 && c.abono >= precioNeto) {
      c.mora  -= 1;
      c.abono -= precioNeto;
    }
    if (c.mora === 0 && c.abono >= precioNeto) {
      c.pagado = true;
      c.abono  = 0;
    }
  }

  if(c.fechaInicio) delete c.fechaInicio;
  if(c.mesInicio)   delete c.mesInicio;

  const monto = montoServicio + montoEquipo;
  // Feature #4: numero de recibo auto-incremental
  const numRecibo = siguienteRecibo();
  const hid = Date.now()+'-'+Math.floor(Math.random()*1000);

  // v5.8.0: persistir los descuentos NUEVOS creados en el modal y marcar
  // TODOS los descuentos puntuales pendientes de este cliente como aplicados
  // a este cobro. Solo si el cobro toco el servicio (montoServicio>0).
  let idsDescAplicados = [];
  if (montoServicio > 0 && typeof _persistirDescuentosNuevosCobro === 'function') {
    idsDescAplicados = _persistirDescuentosNuevosCobro(fecha.slice(0,7));
  }
  // Construir el objeto descuentoAplicado (recurrente + puntuales con motivo).
  const puntualesObj = descTot.puntuales.map(d => ({
    id: d.id, tipo: d.tipo, motivo: d.motivo, modo: d.modo, valor: d.valor, monto: d.monto
  }));
  const descuentoAplicado = (descuento>0 || puntualesObj.length>0) ? {
    total: descuento,
    recurrente: descTot.recurrente,
    puntuales: puntualesObj
  } : 0;

  history.push({
    hid,
    id, nombre:c.nombre, monto, montoEquipo, fecha, nota,
    parcial: !c.pagado,
    tipo: 'servicio',
    numRecibo: formatoRecibo(numRecibo),
    descuentoAplicado,
    prevState
  });

  // Marcar los descuentos puntuales como aplicados (vinculados a este cobro).
  if (montoServicio > 0 && typeof marcarDescuentosAplicados === 'function') {
    marcarDescuentosAplicados(idsDescAplicados, hid);
  }

  c.ultimaEdicion = new Date().toISOString();
  save(); render(); closeCobroModal();

  const restanteServicio = c.pagado ? 0 : Math.max(0, precioNeto*((c.mora||0)+1) - (c.abono||0));
  const restanteEquipo   = c.deudaEquipo || 0;
  const partes = [];
  if (montoServicio>0) partes.push(`servicio ${fmt(montoServicio)}`);
  if (montoEquipo>0)   partes.push(`equipo ${fmt(montoEquipo)}`);
  let msg = `Cobro a ${c.nombre} — ${partes.join(' + ')}`;
  if (restanteServicio>0) msg += ` · falta servicio ${fmt(restanteServicio)}`;
  if (restanteEquipo>0)   msg += ` · falta equipo ${fmt(restanteEquipo)}`;
  msg += ` · Recibo ${formatoRecibo(numRecibo)}`;
  notify(msg);

  // Feature #4: ofrecer generar recibo + v5.8.0: ofrecer enviar comprobante por WhatsApp
  if(!c.pagado || montoServicio>0 || montoEquipo>0){
    const hNuevo = history[history.length-1];
    setTimeout(()=>{
      const tieneTelefono = c.telefono && normalizePhone(c.telefono).length >= 8;
      let pregunta = `¿Generar recibo ${formatoRecibo(numRecibo)} para ${c.nombre}?\n\nSe abrirá una vista lista para imprimir o guardar como PDF.`;
      if (tieneTelefono) {
        pregunta += `\n\n¿También enviar comprobante por WhatsApp?`;
        if(confirm(pregunta)){
          generarRecibo(hNuevo);
          // Pequeño retardo para que el recibo se muestre, luego ofrecer WhatsApp
          setTimeout(()=>{
            if(confirm(`¿Enviar comprobante de pago por WhatsApp a ${c.nombre}?\n\nSe abrirá WhatsApp con el mensaje listo para revisar y enviar.`)){
              sendWhatsAppReceipt(c.id, hNuevo);
            }
          }, 400);
        }
      } else {
        if(confirm(pregunta)){
          generarRecibo(hNuevo);
        }
      }
    },200);
  }

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
  // v5.8.0: revertir descuentos puntuales aplicados por este cobro para que vuelvan a estar disponibles.
  if (typeof revertirDescuentosDeCobro === 'function') revertirDescuentosDeCobro(hid);
  history.splice(idx,1);
  save(); render();
  notify(`Cobro de ${h.nombre} eliminado`);
  if(c && window.FirebaseSync) window.FirebaseSync.syncCliente(c);
}
