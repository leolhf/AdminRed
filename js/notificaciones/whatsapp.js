/**
 * notificaciones/whatsapp.js — Envío de recordatorios y recibos por WhatsApp.
 * Usa enlaces wa.me (sin API paga). Abre WhatsApp con el mensaje prellenado.
 */
RN.whatsapp = RN.whatsapp || {};

/** Normaliza un teléfono a formato internacional sin + ni espacios. */
RN.whatsapp.normalizarTel = function (tel) {
  if (!tel) return '';
  let t = tel.replace(/[^\d]/g, '');
  // Si empieza con 0, quitarlo; si no tiene código de país asumir 53 (Cuba)
  if (t.startsWith('0')) t = t.slice(1);
  if (t.length === 8) t = '53' + t;
  return t;
};

/** Abre WhatsApp con un número y mensaje. */
RN.whatsapp.enviar = function (tel, mensaje) {
  const num = RN.whatsapp.normalizarTel(tel);
  if (!num) { RN.notifyUI.toast('El cliente no tiene teléfono válido', 'warn'); return; }
  const url = `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`;
  window.open(url, '_blank');
};

/** Envía recordatorio de pago a un cliente. */
RN.whatsapp.enviarRecordatorio = function (clienteId) {
  const c = RN.state.clients.find(x => x.id === clienteId);
  if (!c) return;
  if (!c.telefono) { RN.notifyUI.toast('El cliente no tiene teléfono', 'warn'); return; }
  const tpls = RN.waTemplates.cargar();
  const mora = RN.calc.getMora(c);
  const tpl = mora > 0 ? tpls.mora : tpls.recordatorio;
  const ctx = {
    nombre: c.nombre,
    precioBase: RN.calc.formatCUP(RN.calc.getPrecioBase(c)),
    descuentoRecurrente: RN.calc.formatCUP(RN.calc.getDescuentoRecurrente(c)),
    descuentoLinea: RN.calc.formatCUP(RN.calc.getDescuentosPuntualesMes(c.id)),
    precioNeto: RN.calc.formatCUP(RN.calc.getPrecioNeto(c)),
    mes: RN.calc.mesTexto(RN.calc.mesActualStr()),
    diaPago: c.diaPago || 1,
    mora: String(mora)
  };
  RN.whatsapp.enviar(c.telefono, RN.waTemplates.rellenar(tpl, ctx));
};

/** Envía comprobante de pago por WhatsApp tras registrar un cobro. */
RN.whatsapp.enviarComprobante = function (cobroId) {
  const h = RN.state.history.find(x => x.id === cobroId);
  if (!h) return;
  const c = RN.state.clients.find(x => x.id === h.clienteId);
  if (!c || !c.telefono) { RN.notifyUI.toast('El cliente no tiene teléfono', 'warn'); return; }
  const tpls = RN.waTemplates.cargar();
  const total = (h.monto || 0) + (h.montoEquipo || 0);
  const ctx = {
    nombre: c.nombre,
    precioNeto: RN.calc.formatCUP(total),
    reciboNum: h.reciboNum || '',
    mes: h.mes || ''
  };
  RN.whatsapp.enviar(c.telefono, RN.waTemplates.rellenar(tpls.comprobante, ctx));
};

/** Envía recordatorios masivos a todos los que aún no han pagado. */
RN.whatsapp.enviarMasivo = function () {
  const pendientes = RN.calc.clientesActivos().filter(c => RN.calc.getStatus(c) !== 'paid' && c.telefono);
  if (!pendientes.length) { RN.notifyUI.toast('No hay clientes pendientes con teléfono', 'warn'); return; }
  RN.uiComponents.confirm(
    'Recordatorio masivo',
    `Se abrirán ${pendientes.length} pestañas de WhatsApp. ¿Continuar?`,
    () => {
      pendientes.forEach((c, i) => {
        setTimeout(() => RN.whatsapp.enviarRecordatorio(c.id), i * 800);
      });
      RN.notifyUI.toast(`Enviando ${pendientes.length} recordatorios...`, 'info');
    }
  );
};
