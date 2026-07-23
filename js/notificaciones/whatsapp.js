// whatsapp.js
// Recordatorios de pago vía WhatsApp click-to-chat.
// Depende de: state.js (clients), calculations.js (getMora, getStatus, fmt), notify-ui.js (notify)

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
  const monto = client.megas * client.precio;
  const mora = getMora(client);
  const status = getStatus(client);
  
  let message = '';
  
  if(status === 'due') {
    message = `Hola ${client.nombre}, te recordamos que tu pago de internet está VENCIDO. `;
    message += `Monto: ${fmt(monto)} CUP (${client.megas} Mb). Servicio Suspendido `;
    if(mora > 0) {
      message += `Tienes ${mora} mes${mora > 1 ? 'es' : ''} de mora. `;
      message += `Total pendiente: ${fmt(monto * (mora + 1))} CUP. `;
    }
    message += `Por favor realiza el pago lo antes posible. Gracias - Admin Local`;
  } else if(status === 'warn') {
    message = `Hola ${client.nombre}, te recordamos que tu pago de internet vence el día ${client.diaPago}. `;
    message += `Monto: ${fmt(monto)} CUP (${client.megas} Mb). `;
    message += `Gracias por tu preferencia - Admin Local`;
  } else {
    message = `Hola ${client.nombre}, te recordamos tu pago de internet de ${fmt(monto)} CUP (${client.megas} Mb). `;
    message += `Día de pago: ${client.diaPago}. Gracias - Admin Local`;
  }
  
  return message;
}

// Abrir WhatsApp con mensaje prellenado
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
  
  const message = generateReminderMessage(client);
  const encodedMessage = encodeURIComponent(message);
  
  // Formato: https://wa.me/[numero]?text=[mensaje]
  const whatsappUrl = `https://wa.me/${phone}?text=${encodedMessage}`;
  
  window.open(whatsappUrl, '_blank');
  notify(`Abriendo WhatsApp para ${client.nombre}`);
}
