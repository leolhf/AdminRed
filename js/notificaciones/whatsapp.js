// whatsapp.js
// Recordatorios de pago vía WhatsApp click-to-chat.
// Depende de: state.js (clients), calculations.js (getMora, getStatus, fmt,
// montoTotalACobrar, fechaLimitePago, mesesRestantesDeuda, fechaLocalISO),
// models/investment.js (getCuotaEquipoCliente, getDeudaEquipoCliente),
// notify-ui.js (notify), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════
//  WHATSAPP CLICK-TO-CHAT
// ═══════════════════════════════════════════════════════════

// Normalizar número de teléfono para WhatsApp (solo dígitos, sin espacios ni guiones)
function normalizePhone(phone) {
  if(!phone) return '';
  return phone.replace(/[^0-9]/g, '');
}

// Generar mensaje de recordatorio según el estado del cliente
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

  let message = '';

  if(status === 'due') {
    message = `Hola ${client.nombre}, te recordamos que tu pago de internet está VENCIDO. `;
    message += `Monto: ${fmt(monto)} (${client.megas} Mb). Servicio Suspendido.${deudaLinea} `;
    if(mora > 0) {
      message += `Incluye ${mora} mes${mora > 1 ? 'es' : ''} de mora. `;
    }
    message += `Por favor realiza el pago lo antes posible. Gracias - Admin Local`;
  } else if(status === 'warn') {
    const fechaLimite = fechaLimitePago(client);
    message = `Hola ${client.nombre}, te recordamos que tu pago de internet vence el día ${fechaLimite.getDate()}. `;
    message += `Monto: ${fmt(monto)} (${client.megas} Mb).${deudaLinea} `;
    message += `Gracias por tu preferencia - Admin Local`;
  } else {
    message = `Hola ${client.nombre}, te recordamos tu pago de internet de ${fmt(monto)} (${client.megas} Mb).${deudaLinea} `;
    message += `Día de pago: ${client.diaPago}. Gracias - Admin Local`;
  }
  
  return message;
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

function cerrarConfirmarWhatsApp() {
  _waPendingClientId = null;
  document.getElementById('modal-confirmar-whatsapp').classList.remove('open');
}

// Recién aquí se abre WhatsApp de verdad, después de que el usuario revisó el mensaje.
// Primero se marca el recordatorio como enviado hoy (la tarjeta se atenúa al re-renderizar)
// y luego se procede a abrir WhatsApp.
function confirmarEnvioWhatsApp() {
  const client = clients.find(c => c.id === _waPendingClientId);
  if(!client) { cerrarConfirmarWhatsApp(); return; }

  const phone = normalizePhone(client.telefono);
  const message = document.getElementById('wa-confirm-mensaje').value;
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;

  // Marcar como enviado HOY (se guarda la fecha, no un booleano, para que
  // se "resetee" solo al día siguiente sin tocar nada) y refrescar antes de abrir WhatsApp.
  client.recordatorioEnviado = fechaLocalISO();
  save(); render();
  if(window.FirebaseSync) window.FirebaseSync.syncCliente(client);

  window.open(whatsappUrl, '_blank');
  notify(`Abriendo WhatsApp para ${client.nombre}`);
  cerrarConfirmarWhatsApp();
}
