// modal-paquete.js
// v5.7.4 — Modal de pago desglosado del paquete contratado al proveedor.
// Permite pagar el paquete combinando tres formas de pago:
//   1. Transferencia CUP
//   2. USD (convertido a CUP con la tasa ajustada del mercado informal, -5 redondeo 5)
//   3. Efectivo CUP
// Soporta pagos parciales: si el total pagado no alcanza el costo del paquete,
// se registra el abono y queda un saldo pendiente que se puede completar después
// con otro pago. El paquete se considera "pagado este mes" solo cuando la suma
// de todos los abonos del mes >= costoMes().
//
// Depende de: state.js (gastos, config), calculations.js (costoMes, fmt,
//   pagoPaqueteMes, fechaLocalISO, mesActualHoy), moneda.js (tasaUsd,
//   tasaAjustadaUsd), storage-local.js (save), render.js (renderPaqueteStatus,
//   renderGastos, renderProfit, renderSummary), notify-ui.js (notify).

// ═══════════════════════════════════════════════════════════════════════════
//  APERTURA Y CIERRE DEL MODAL
// ═══════════════════════════════════════════════════════════════════════════

// Abre el modal de pago del paquete. Calcula el costo del mes, lo ya pagado
// (abonos parciales previos) y el saldo pendiente, y resetea los campos.
function abrirModalPaquete() {
  const mes = mesActualHoy();
  const costo = costoMes();
  const yaPagado = _paquetePagadoAcumuladoMes(mes);
  const pendiente = Math.max(0, costo - yaPagado);

  // Información del paquete
  document.getElementById('paq-costo').textContent = fmt(costo);
  document.getElementById('paq-megas').textContent = config.megas + ' Mb';
  document.getElementById('paq-ya-pagado').textContent = fmt(yaPagado);
  document.getElementById('paq-ya-pagado-row').style.display = yaPagado > 0 ? '' : 'none';
  document.getElementById('paq-pendiente').textContent = fmt(pendiente);

  // Resetear campos de entrada.
  // El efectivo se pre-llena con el saldo pendiente: el usuario ve de inmediato
  // cuánto falta pagar. Si introduce USD o transferencia, el efectivo se
  // recalcula automáticamente (ver recalcularEfectivoPaquete).
  document.getElementById('paq-transferencia').value = '';
  document.getElementById('paq-usd').value = '';
  document.getElementById('paq-efectivo').value = pendiente > 0 ? pendiente : '';
  document.getElementById('paq-fecha').value = fechaLocalISO();
  document.getElementById('paq-nota').value = '';

  // Aviso de tasa sin actualizar
  _actualizarAvisoStalePaquete();

  // Calcular desglose inicial
  calcularDesglosePaquete();

  // Mostrar el modal
  document.getElementById('modal-paquete').classList.add('open');
}

function cerrarModalPaquete() {
  document.getElementById('modal-paquete').classList.remove('open');
}

// ═══════════════════════════════════════════════════════════════════════════
//  CÁLCULO DEL DESGLOSE EN TIEMPO REAL
// ═══════════════════════════════════════════════════════════════════════════

// Muestra u oculta el aviso de "tasa sin actualizar hace más de 5 h".
function _actualizarAvisoStalePaquete() {
  const aviso = document.getElementById('paq-usd-stale-aviso');
  if (!aviso) return;
  if (typeof tasaUsdStale5h === 'function' && tasaUsdStale5h()) {
    aviso.style.display = '';
  } else {
    aviso.style.display = 'none';
  }
}

// Recalcula automáticamente el campo EFECTIVO CUP cuando el usuario cambia
// los campos de Transferencia o USD. La fórmula es:
//   efectivo = max(0, pendiente - transferencia - usdCup)
// El campo de efectivo NO se recalcula cuando el usuario lo edita manualmente,
// para permitir pagos parciales deliberados (el usuario puede bajar el monto
// y se mantiene su valor).
function recalcularEfectivoPaquete() {
  const ajustada = typeof tasaAjustadaUsd === 'function' ? tasaAjustadaUsd() : null;
  const transferencia = parseInt(document.getElementById('paq-transferencia').value) || 0;
  const usd = parseFloat(document.getElementById('paq-usd').value) || 0;
  const usdCup = ajustada !== null ? Math.round(usd * ajustada) : 0;

  const mes = mesActualHoy();
  const costo = costoMes();
  const yaPagado = _paquetePagadoAcumuladoMes(mes);
  const pendiente = Math.max(0, costo - yaPagado);

  const nuevoEfectivo = Math.max(0, pendiente - transferencia - usdCup);
  const campoEfectivo = document.getElementById('paq-efectivo');
  if (campoEfectivo) {
    // Si el cálculo da 0, dejar el campo vacío para no mostrar "0" confuso.
    // Si el usuario no puso nada en transferencia ni USD, mostrar el pendiente.
    campoEfectivo.value = nuevoEfectivo > 0 ? nuevoEfectivo : '';
  }

  // Actualizar el desglose con los nuevos valores
  calcularDesglosePaquete();
}

// Calcula y muestra el desglose del pago en tiempo real mientras el admin
// escribe en los campos. Muestra: tasa del día, tasa ajustada, conversión USD,
// total pagado, y si alcanza o falta para cubrir el saldo pendiente.
function calcularDesglosePaquete() {
  const desglose = document.getElementById('paq-desglose');
  if (!desglose) return;

  const tasaDia = typeof tasaUsd === 'function' ? tasaUsd() : null;
  const ajustada = typeof tasaAjustadaUsd === 'function' ? tasaAjustadaUsd() : null;

  // Leer los tres campos de pago
  const transferencia = parseInt(document.getElementById('paq-transferencia').value) || 0;
  const usd = parseFloat(document.getElementById('paq-usd').value) || 0;
  const efectivo = parseInt(document.getElementById('paq-efectivo').value) || 0;

  // Convertir USD a CUP con la tasa ajustada (-5, redondeo múltiplo 5)
  const usdCup = ajustada !== null ? Math.round(usd * ajustada) : 0;
  const totalCup = transferencia + usdCup + efectivo;

  // Saldo pendiente (costo - ya pagado en abonos previos del mes)
  const mes = mesActualHoy();
  const costo = costoMes();
  const yaPagado = _paquetePagadoAcumuladoMes(mes);
  const pendiente = Math.max(0, costo - yaPagado);

  // Diferencia entre lo que se va a pagar ahora y el saldo pendiente
  const diferencia = totalCup - pendiente;

  // Construir el HTML del desglose
  let html = '';

  // Si hay USD pero no hay tasa, mostrar aviso
  if (usd > 0 && ajustada === null) {
    html += '<div style="color:var(--amber);margin-bottom:6px">⚠ No hay tasa USD configurada. Pulsa «Actualizar tasa» o configúrala en Ajustes.</div>';
  }

  // Tasa info (solo si hay tasa)
  if (tasaDia !== null) {
    html += `<div style="color:var(--text-muted);margin-bottom:6px">` +
      `Tasa del día: <strong>${tasaDia} CUP/USD</strong> · ` +
      `Tasa ajustada: <strong>${ajustada} CUP/USD</strong> (−5, redondeo 5)` +
      `</div>`;
  }

  // Detalle de cada componente
  if (transferencia > 0) {
    html += `<div class="paq-line"><span>Transferencia CUP</span><span>${fmt(transferencia)}</span></div>`;
  }
  if (usd > 0) {
    if (ajustada !== null) {
      html += `<div class="paq-line"><span>USD (${usd} × ${ajustada})</span><span>${fmt(usdCup)}</span></div>`;
    } else {
      html += `<div class="paq-line"><span>USD (${usd})</span><span style="color:var(--red)">sin tasa</span></div>`;
    }
  }
  if (efectivo > 0) {
    html += `<div class="paq-line"><span>Efectivo CUP</span><span>${fmt(efectivo)}</span></div>`;
  }

  // Total y estado
  if (totalCup > 0) {
    html += `<div class="paq-line paq-total"><span>Total a pagar</span><span>${fmt(totalCup)}</span></div>`;
    html += `<div class="paq-line"><span>Saldo pendiente antes de este pago</span><span>${fmt(pendiente)}</span></div>`;

    if (diferencia === 0) {
      html += `<div class="paq-estado paq-ok">✓ Cubre exactamente el saldo pendiente</div>`;
    } else if (diferencia > 0) {
      html += `<div class="paq-estado paq-ok">✓ Sobran ${fmt(diferencia)} — el paquete queda completamente pagado</div>`;
    } else {
      const nuevoPendiente = Math.abs(diferencia);
      html += `<div class="paq-estado paq-warn">⚠ Pago parcial — faltan ${fmt(nuevoPendiente)} para completar el paquete</div>`;
    }
  } else if (tasaDia !== null) {
    html += `<div style="color:var(--text-muted)">Ingresa los montos de cada forma de pago para ver el desglose.</div>`;
  } else {
    html += `<div style="color:var(--text-muted)">Sin tasa USD configurada. Puedes pagar en CUP o configurar la tasa en Ajustes.</div>`;
  }

  desglose.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ACTUALIZACIÓN DE TASA DENTRO DEL MODAL
// ═══════════════════════════════════════════════════════════════════════════

// Handler del botón "Actualizar tasa" dentro del modal del paquete.
async function clickActualizarTasaPaquete() {
  const btn = document.getElementById('btn-actualizar-tasa-paquete');
  const desglose = document.getElementById('paq-desglose');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Actualizando…'; }
  if (desglose) desglose.innerHTML = '<span style="color:var(--text-muted)">Consultando tasa…</span>';

  const ok = await actualizarTasaUsd((msg) => {
    if (desglose) desglose.innerHTML = `<span style="color:var(--text-muted)">${msg}</span>`;
  });

  if (btn) { btn.disabled = false; btn.textContent = '🔄 Actualizar tasa'; }
  _actualizarAvisoStalePaquete();
  // Tras actualizar la tasa, recalcular el efectivo (el USD puede haber
  // cambiado su equivalente en CUP y el efectivo debe ajustarse).
  recalcularEfectivoPaquete();
  if (ok) notify('Tasa USD actualizada');
  else notify('No se pudo actualizar automáticamente — usa el valor manual en Ajustes', 'warn');
}

// ═══════════════════════════════════════════════════════════════════════════
//  REGISTRO DEL PAGO
// ═══════════════════════════════════════════════════════════════════════════

// Registra el pago del paquete con el desglose introducido. Soporta pagos
// parciales: si el total no alcanza el costo, se registra el abono y el
// paquete queda con saldo pendiente. Se pueden hacer múltiples abonos en el
// mismo mes hasta completar el costo.
function confirmarPagoPaquete() {
  const mes = mesActualHoy();
  const costo = costoMes();
  const yaPagado = _paquetePagadoAcumuladoMes(mes);
  const pendiente = Math.max(0, costo - yaPagado);

  // Leer los campos
  const transferencia = parseInt(document.getElementById('paq-transferencia').value) || 0;
  const usd = parseFloat(document.getElementById('paq-usd').value) || 0;
  const efectivo = parseInt(document.getElementById('paq-efectivo').value) || 0;
  const fecha = document.getElementById('paq-fecha').value || fechaLocalISO();
  let nota = document.getElementById('paq-nota').value.trim();

  // Convertir USD con tasa ajustada
  const ajustada = typeof tasaAjustadaUsd === 'function' ? tasaAjustadaUsd() : null;
  const usdCup = (usd > 0 && ajustada !== null) ? Math.round(usd * ajustada) : 0;
  const totalCup = transferencia + usdCup + efectivo;

  // Validaciones
  if (totalCup <= 0) {
    notify('Ingresa al menos un monto en alguna forma de pago', true);
    return;
  }
  if (usd > 0 && ajustada === null) {
    notify('No hay tasa USD configurada. Configúrala en Ajustes o pulsa «Actualizar tasa».', true);
    return;
  }

  // Registrar para deshacer
  if (typeof registrarParaDeshacer === 'function') {
    const etiqueta = (yaPagado + totalCup >= costo)
      ? `Pagar paquete (${config.megas} Mb) — completado`
      : `Abono paquete (${config.megas} Mb) — ${fmt(totalCup)}`;
    registrarParaDeshacer(etiqueta);
  }

  // Construir la descripción y nota con el desglose
  const desglosePartes = [];
  if (transferencia > 0) desglosePartes.push(`transferencia ${fmt(transferencia)}`);
  if (usdCup > 0) desglosePartes.push(`${usd} USD × ${ajustada} = ${fmt(usdCup)}`);
  if (efectivo > 0) desglosePartes.push(`efectivo ${fmt(efectivo)}`);
  const desgloseTxt = desglosePartes.join(' + ');

  const esCompleto = (yaPagado + totalCup >= costo);
  const desc = esCompleto
    ? `Pago paquete contratado (${config.megas} Mb) — ${desgloseTxt}`
    : `Abono paquete (${config.megas} Mb) — ${desgloseTxt} [parcial]`;

  // Nota con el desglose detallado para el registro histórico
  const desgloseNota = `Desglose: transferencia=${transferencia}, usd=${usd}, usdTasa=${ajustada || 'N/A'}, usdCup=${usdCup}, efectivo=${efectivo}. ${esCompleto ? 'Pago completo.' : 'Pago parcial, faltan ' + fmt(costo - yaPagado - totalCup) + '.'}`;
  if (nota) {
    nota = nota + ' | ' + desgloseNota;
  } else {
    nota = desgloseNota;
  }

  // Crear el gasto de categoría 'paquete' con el monto total en CUP
  // y el desglose guardado como campo estructurado para auditoría.
  gastos.push({
    desc: desc,
    monto: totalCup,
    fecha: fecha,
    categoria: 'paquete',
    nota: nota,
    desglose: {
      transferencia: transferencia,
      usd: usd,
      usdTasa: ajustada || 0,
      usdCup: usdCup,
      efectivo: efectivo
    }
  });

  // Si el pago completa el costo del mes, marcar como pagado.
  // (paquetePagadoEsteMes() ahora verifica acumulado >= costo, pero
  // mantenemos config.paquetePagadoMes para compatibilidad y rapidez.)
  if (esCompleto) {
    config.paquetePagadoMes = mes;
  }

  save();
  if (typeof renderGastos === 'function') renderGastos();
  if (typeof renderProfit === 'function') renderProfit();
  if (typeof renderSummary === 'function') renderSummary();
  if (typeof renderPaqueteStatus === 'function') renderPaqueteStatus();
  cerrarModalPaquete();

  // Notificación informativa
  if (esCompleto) {
    const sobrante = (yaPagado + totalCup) - costo;
    let msg = `Paquete pagado — ${fmt(totalCup)} (${desglosePartes.join(' + ')})`;
    if (sobrante > 0) msg += ` · sobran ${fmt(sobrante)}`;
    notify(msg);
  } else {
    const nuevoPendiente = costo - yaPagado - totalCup;
    notify(`Abono paquete ${fmt(totalCup)} — faltan ${fmt(nuevoPendiente)} para completar`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FUNCIÓN AUXILIAR — TOTAL ACUMULADO DE PAGOS DEL PAQUETE EN UN MES
// ═══════════════════════════════════════════════════════════════════════════

// Devuelve la suma de todos los gastos de categoría 'paquete' del mes
// especificado ('YYYY-MM'). Esto permite saber cuánto se ha pagado ya del
// paquete en el mes, incluyendo abonos parciales múltiples.
// Si mesKey es null/undefined, usa el mes actual.
function _paquetePagadoAcumuladoMes(mesKey) {
  const mes = mesKey || mesActualHoy();
  return gastos
    .filter(g => g.categoria === 'paquete' && (g.fecha || '').startsWith(mes))
    .reduce((s, g) => s + (g.monto || 0), 0);
}
