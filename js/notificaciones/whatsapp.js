// whatsapp.js
// Recordatorios de pago vía WhatsApp click-to-chat.
// Depende de: state.js (clients), calculations.js (getMora, getStatus, fmt,
// montoTotalACobrar, fechaLimitePago, mesesRestantesDeuda, fechaLocalISO,
// getPrecioCliente, calcularDescuentoTotal, descuentosPendientesCliente),
// models/investment.js (getCuotaEquipoCliente, getDeudaEquipoCliente),
// notify-ui.js (notify), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════════════════════
//  WHATSAPP CLICK-TO-CHAT
// ═══════════════════════════════════════════════════════════════════════════

// Normalizar número de teléfono para WhatsApp (solo dígitos, sin espacios ni guiones)
function normalizePhone(phone) {
  if(!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

// v5.8.0: Construye la línea de texto con el detalle de descuentos puntuales
// (y recurrente si config.mencionarDescuentoRecurrente) para inyectar en los
// mensajes de WhatsApp. Devuelve '' si no hay descuentos.
// Ej: " 🎁 Se aplicó un descuento de 500 CUP por: Afectación red (−500 CUP)."
function buildDescuentoLinea(client) {
  if(!client) return '';
  const precioMes = (client.megas||0) * getPrecioCliente(client);
  const dt = calcularDescuentoTotal(client, precioMes);
  const puntuales = descuentosPendientesCliente(client);
  const recurrente = dt.recurrente || 0;
  if (recurrente === 0 && puntuales.length === 0) return '';

  const partes = [];
  // Descuento recurrente (solo si el admin quiere mencionarlo)
  if (recurrente > 0 && config.mencionarDescuentoRecurrente) {
    const modoTxt = client.descuentoTipo === 'pct'
      ? client.descuento + '%'
      : fmt(client.descuento);
    partes.push(`descuento recurrente (${modoTxt}): −${fmt(recurrente)}`);
  }
  // Descuentos puntuales con motivo
  puntuales.forEach(d => {
    partes.push(`${d.motivo||'descuento'}: −${fmt(d.monto||0)}`);
  });

  if (partes.length === 0) return '';
  const totalDesc = dt.total || 0;
  return ` 🎁 Descuento aplicado: −${fmt(totalDesc)} (${partes.join('; ')}).`;
}

// v5.8.0: Construye el objeto `extra` con todos los campos de descuento para
// fillWaTemplate, reutilizable por recordatorios y comprobantes.
function _buildDescuentoExtra(client) {
  if(!client) return {};
  const precioMes = (client.megas||0) * getPrecioCliente(client);
  const dt = calcularDescuentoTotal(client, precioMes);
  const puntuales = descuentosPendientesCliente(client);
  const descuentoLinea = buildDescuentoLinea(client);
  const motivoDescuento = puntuales.length > 0 ? (puntuales[0].motivo || '') : '';
  return {
    descuentoLinea,
    descuentoTotal: fmt(dt.total || 0),
    precioBase: fmt(precioMes),
    precioNeto: fmt(Math.max(0, precioMes - (dt.total||0))),
    motivoDescuento
  };
}

// Generar mensaje de recordatorio según el estado del cliente.
// F6: si el admin definió plantillas personalizadas (config.waTemplates),
// se usan esas; si no, se mantienen los textos por defecto originales.
// v5.8.0: incluye línea de descuentos puntuales si los hay.
function generateReminderMessage(client) {
  // BUG FIX: el monto usaba solo megas*precio (el servicio de 1 mes), sin
  // contar la cuota de deuda de equipo ni descontar abonos ya hechos — igual
  // que en el panel "Alertas de cobro" (render.js), que sí usa
  // montoTotalACobrar(). Un cliente con deuda de equipo (ej. Ricardo en el
  // panel: 14,725 CUP totales) recibía por WhatsApp un monto menor al real
  // (10,000 CUP), sin mencionar la deuda de equipo en absoluto.
  const monto = montoTotalACobrar(client); // servicio (+ mora) + cuota de equipo - abono
  const mora = getMora(client);
  const status = getStatus(client);
  const cuotaEquipo = getCuotaEquipoCliente(client);
  const deudaLinea = cuotaEquipo > 0
    ? ` Incluye ${fmt(cuotaEquipo)} de deuda de equipo (restan ${fmt(getDeudaEquipoCliente(client))}, ~${mesesRestantesDeuda(client)} mes${mesesRestantesDeuda(client)===1?'':'es'} si se mantiene así).`
    : '';

  // v5.8.0: línea de descuentos puntuales
  const descuentoLinea = buildDescuentoLinea(client);
  const descExtra = _buildDescuentoExtra(client);

  let message = '';

  // F6: usar plantillas personalizadas si están definidas
  const tpls = (typeof getWaTemplates === 'function') ? getWaTemplates() : null;
  if(tpls) {
    const fechaLimiteTpl = fechaLimitePago(client);
    const extraTpl = Object.assign(
      { mora, deudaLinea, fechaLimite: fechaLimiteTpl.getDate() },
      descExtra
    );
    const keyTpl = status === 'due' ? 'due' : status === 'warn' ? 'warn' : 'ok';
    return fillWaTemplate(tpls[keyTpl], client, monto, extraTpl);
  }

  if(status === 'due') {
    message = `Hola ${client.nombre}, te recordamos que tu pago de internet está VENCIDO. `;
    message += `Monto: ${fmt(monto)} (${client.megas} Mb). Servicio Suspendido.${deudaLinea} `;
    if(mora > 0) {
      message += `Incluye ${mora} mes${mora > 1 ? 'es' : ''} de mora. `;
    }
    if(descuentoLinea) message += descuentoLinea + ' ';
    message += `Por favor realiza el pago lo antes posible. Gracias - Admin Local`;
  } else if(status === 'warn') {
    const fechaLimite = fechaLimitePago(client);
    message = `Hola ${client.nombre}, te recordamos que tu pago de internet vence el día ${fechaLimite.getDate()}. `;
    message += `Monto: ${fmt(monto)} (${client.megas} Mb).${deudaLinea} `;
    if(descuentoLinea) message += descuentoLinea + ' ';
    message += `Gracias por tu preferencia - Admin Local`;
  } else {
    message = `Hola ${client.nombre}, te recordamos tu pago de internet de ${fmt(monto)} (${client.megas} Mb).${deudaLinea} `;
    if(descuentoLinea) message += descuentoLinea + ' ';
    message += `Día de pago: ${client.diaPago}. Gracias - Admin Local`;
  }
  
  return message;
}

// v5.8.0: Genera el mensaje de comprobante de pago tras registrar un cobro.
// `cobro` = entrada del historial {hid, id, nombre, monto, montoEquipo, fecha,
//           nota, numRecibo, descuentoAplicado}.
function generateReceiptMessage(client, cobro) {
  const montoRecibido = cobro.monto || 0;
  const reciboNum = cobro.numRecibo || 'S/N';
  const descExtra = _buildDescuentoExtra(client);

  // Si hay descuentoAplicado guardado en el cobro, usar ese para la línea
  let descuentoLinea = descExtra.descuentoLinea;
  if (cobro.descuentoAplicado && typeof cobro.descuentoAplicado === 'object') {
    const da = cobro.descuentoAplicado;
    const puntualesTxt = (da.puntuales||[]).map(p => `${p.motivo||'descuento'}: −${fmt(p.monto||0)}`).join('; ');
    const recurrenteTxt = (da.recurrente > 0 && config.mencionarDescuentoRecurrente)
      ? `descuento recurrente: −${fmt(da.recurrente)}`
      : '';
    const partes = [recurrenteTxt, puntualesTxt].filter(Boolean);
    if (partes.length > 0) {
      descuentoLinea = ` 🎁 Descuento aplicado: −${fmt(da.total||0)} (${partes.join('; ')}).`;
    }
  } else if (cobro.descuentoAplicado && typeof cobro.descuentoAplicado === 'number' && cobro.descuentoAplicado > 0) {
    descuentoLinea = ` 🎁 Descuento aplicado: −${fmt(cobro.descuentoAplicado)}.`;
  }

  const tpls = (typeof getWaTemplates === 'function') ? getWaTemplates() : null;
  if(tpls && tpls.receipt) {
    const extraTpl = Object.assign({}, descExtra, {
      descuentoLinea,
      montoRecibido: fmt(montoRecibido),
      reciboNum
    });
    return fillWaTemplate(tpls.receipt, client, montoRecibido, extraTpl);
  }

  // Fallback sin plantilla
  let msg = `✅ Hola ${client.nombre}, confirmamos la recepción de tu pago de ${fmt(montoRecibido)} correspondiente al servicio de internet (${client.megas} Mb).`;
  if(descuentoLinea) msg += descuentoLinea;
  msg += ` Recibo: ${reciboNum}. Gracias por tu pago - Admin Local`;
  return msg;
}

// Abrir el modal de confirmación con el mensaje que se va a enviar
let _waPendingClientId = null;

function sendWhatsAppReminder(clientId) {
  const client = clients.find(c => c.id === clientId);
  if(!client) {
    notify('Cliente no encontrado', true);
    return;
  }

  const phone = normalizePhone(client.telefono);
  if(!phone) {
    notify('Este cliente no tiene teléfono configurado', true);
    return;
  }
  if(phone.length < 8) {
    notify('El teléfono de este cliente parece inválido', true);
    return;
  }

  _waPendingClientId = clientId;
  document.getElementById('wa-confirm-title').textContent = `Enviar recordatorio a ${client.nombre}`;
  document.getElementById('wa-confirm-mensaje').value = generateReminderMessage(client);
  document.getElementById('modal-confirmar-whatsapp').classList.add('open');
}

// v5.8.0: Envía el comprobante de pago por WhatsApp tras registrar un cobro.
// `cobro` = entrada del historial. Abre el mismo modal de confirmación pero
// con el mensaje de comprobante.
function sendWhatsAppReceipt(clientId, cobro) {
  const client = clients.find(c => c.id === clientId);
  if(!client) { notify('Cliente no encontrado', true); return; }
  const phone = normalizePhone(client.telefono);
  if(!phone || phone.length < 8) {
    notify('Este cliente no tiene teléfono válido para enviar comprobante', true);
    return;
  }
  _waPendingClientId = clientId;
  _waPendingReceipt = cobro; // guardamos para usar en confirmar
  document.getElementById('wa-confirm-title').textContent = `Enviar comprobante a ${client.nombre}`;
  document.getElementById('wa-confirm-mensaje').value = generateReceiptMessage(client, cobro);
  document.getElementById('modal-confirmar-whatsapp').classList.add('open');
}

function cerrarConfirmarWhatsApp() {
  _waPendingClientId = null;
  _waPendingReceipt = null;
  document.getElementById('modal-confirmar-whatsapp').classList.remove('open');
}

// Recién aquí se abre WhatsApp de verdad, después de que el usuario revisó el mensaje.
// Primero se marca el recordatorio como enviado hoy (la tarjeta se atenúa al re-renderizar)
// y luego se procede a abrir WhatsApp.
// v5.8.0: si _waPendingReceipt está seteado, es un comprobante (no marca recordatorio).
let _waPendingReceipt = null;

function confirmarEnvioWhatsApp() {
  const client = clients.find(c => c.id === _waPendingClientId);
  if(!client) { cerrarConfirmarWhatsApp(); return; }

  const phone = normalizePhone(client.telefono);
  const message = document.getElementById('wa-confirm-mensaje').value;
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;

  // Marcar como enviado HOY solo si es un recordatorio (no comprobante)
  if (!_waPendingReceipt) {
    client.recordatorioEnviado = fechaLocalISO();
    save(); render();
    if(window.FirebaseSync) window.FirebaseSync.syncCliente(client);
  }

  window.open(whatsappUrl, '_blank');
  notify(`Abriendo WhatsApp para ${client.nombre}`);
  cerrarConfirmarWhatsApp();
}
