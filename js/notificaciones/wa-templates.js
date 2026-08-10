// wa-templates.js
// Feature F6: plantillas de mensaje de WhatsApp personalizables desde Ajustes.
// Permite al admin editar el texto de los recordatorios (vencido, por vencer,
// al día) en vez de tenerlo fijo en el código. Las plantillas usan marcadores:
//   {nombre}       → nombre del cliente
//   {monto}        → monto total a cobrar (servicio + mora + equipo − abono), con " CUP"
//   {megas}        → megas contratados + " Mb"
//   {diaPago}      → día de pago del cliente
//   {fechaLimite}  → día límite de pago del ciclo (número de día)
//   {mora}         → meses de mora (texto "N mes/es de mora. " o vacío si no hay)
//   {deudaLinea}   → línea de deuda de equipo (texto o vacío si no hay)
// v5.8.0 — descuentos puntuales:
//   {descuentoLinea}   → texto con el detalle de descuentos (recurrente + puntuales) o vacío
//   {descuentoTotal}   → monto total descontado (número con " CUP") o "0 CUP"
//   {precioBase}       → precio base del servicio antes de descuentos (con " CUP")
//   {precioNeto}       → precio neto tras descuentos (con " CUP")
//   {motivoDescuento}  → motivo del primer descuento puntual (texto) o vacío si no hay
//   {montoRecibido}    → monto recibido en el cobro (solo plantilla receipt)
//   {reciboNum}        → número de recibo (solo plantilla receipt)
// Depende de: state.js (config), storage-local.js (save), notify-ui.js (notify),
// render.js (render). Carga después de whatsapp.js.

// Plantillas por defecto (idénticas al texto que ya existía en whatsapp.js).
const WA_TEMPLATES_DEFAULT = {
  due: 'Hola {nombre}, te recordamos que tu pago de internet está VENCIDO. Monto: {monto} ({megas}). Servicio Suspendido.{deudaLinea} {mora}{descuentoLinea} Por favor realiza el pago lo antes posible. Gracias - Admin Local',
  warn: 'Hola {nombre}, te recordamos que tu pago de internet vence el día {fechaLimite}. Monto: {monto} ({megas}).{deudaLinea}{descuentoLinea} Gracias por tu preferencia - Admin Local',
  ok: 'Hola {nombre}, te recordamos tu pago de internet de {monto} ({megas}).{deudaLinea}{descuentoLinea} Día de pago: {diaPago}. Gracias - Admin Local',
  // v5.8.0: comprobante de pago enviado tras registrar un cobro.
  receipt: '✅ Hola {nombre}, confirmamos la recepción de tu pago de {montoRecibido} correspondiente al servicio de internet ({megas}).{descuentoLinea} Recibo: {reciboNum}. Gracias por tu pago - Admin Local'
};

// Devuelve las plantillas activas (las del config si existen, si no las por defecto).
function getWaTemplates() {
  if(!config.waTemplates || typeof config.waTemplates !== 'object') return {...WA_TEMPLATES_DEFAULT};
  return {
    due:     config.waTemplates.due     || WA_TEMPLATES_DEFAULT.due,
    warn:    config.waTemplates.warn    || WA_TEMPLATES_DEFAULT.warn,
    ok:      config.waTemplates.ok      || WA_TEMPLATES_DEFAULT.ok,
    receipt: config.waTemplates.receipt || WA_TEMPLATES_DEFAULT.receipt
  };
}

// Rellena una plantilla con los datos del cliente.
// `extra` = { mora, deudaLinea, fechaLimite, descuentoLinea, descuentoTotal,
//             precioBase, precioNeto, motivoDescuento, montoRecibido, reciboNum } ya pre-formateados.
function fillWaTemplate(tpl, client, monto, extra) {
  const moraTxt = extra.mora > 0
    ? `Incluye ${extra.mora} mes${extra.mora > 1 ? 'es' : ''} de mora. `
    : '';
  return tpl
    .replace(/\{nombre\}/g, client.nombre)
    .replace(/\{monto\}/g, fmt(monto))
    .replace(/\{megas\}/g, (client.megas||0) + ' Mb')
    .replace(/\{diaPago\}/g, client.diaPago || config.diaInicio)
    .replace(/\{fechaLimite\}/g, extra.fechaLimite)
    .replace(/\{mora\}/g, moraTxt)
    .replace(/\{deudaLinea\}/g, extra.deudaLinea || '')
    // v5.8.0: descuentos puntuales
    .replace(/\{descuentoLinea\}/g, extra.descuentoLinea || '')
    .replace(/\{descuentoTotal\}/g, extra.descuentoTotal || '0 CUP')
    .replace(/\{precioBase\}/g, extra.precioBase || fmt(0))
    .replace(/\{precioNeto\}/g, extra.precioNeto || fmt(monto))
    .replace(/\{motivoDescuento\}/g, extra.motivoDescuento || '')
    .replace(/\{montoRecibido\}/g, extra.montoRecibido || fmt(monto))
    .replace(/\{reciboNum\}/g, extra.reciboNum || 'S/N');
}

// ─────────────────────────────────────────────────────────────────────────────
//  UI: editor de plantillas en la pestaña Ajustes
// ─────────────────────────────────────────────────────────────────────────────
const _waTplMeta = [
  { key:'due',     label:'🔴 Vencido',    hint:'Se envía cuando el pago ya venció' },
  { key:'warn',    label:'🟡 Por vencer', hint:'Se envía durante el plazo de pago' },
  { key:'ok',      label:'🟢 Recordatorio', hint:'Recordatorio general / al día' },
  { key:'receipt', label:'💳 Comprobante',  hint:'Mensaje enviado tras registrar un cobro' }
];

function renderWaTemplatesEditor() {
  const wrap = document.getElementById('wa-templates-editor');
  if(!wrap) return;
  const tpls = getWaTemplates();
  const placeholders = '{nombre} · {monto} · {megas} · {diaPago} · {fechaLimite} · {mora} · {deudaLinea} · {descuentoLinea} · {descuentoTotal} · {precioBase} · {precioNeto}';
  wrap.innerHTML = `
    <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:10px;line-height:1.45">
      Personaliza los mensajes de WhatsApp que se envían a tus clientes. Usa estos marcadores:
      <span class="mono" style="color:var(--blue)">${placeholders}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${_waTplMeta.map(m=>`
        <div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px">
            <label style="font-family:var(--mono);font-size:0.66rem;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted)">${m.label}</label>
            <span style="font-size:0.6rem;color:var(--text-muted)">${m.hint}</span>
          </div>
          <textarea id="wa-tpl-${m.key}" rows="3" style="width:100%;font-family:var(--sans);font-size:0.78rem;background:var(--bg);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px;color:var(--text);resize:vertical;outline:none;transition:border-color .15s" onfocus="this.style.borderColor='var(--green)'" onblur="this.style.borderColor='var(--border)'">${(tpls[m.key]||'').replace(/</g,'&lt;')}</textarea>
          <button class="btn btn-ghost btn-sm" style="margin-top:4px;font-size:0.62rem" onclick="resetWaTemplate('${m.key}')">↺ Restablecer por defecto</button>
        </div>
      `).join('')}
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-green btn-sm" onclick="saveWaTemplates()">💾 Guardar plantillas</button>
      <button class="btn btn-ghost btn-sm" onclick="resetAllWaTemplates()">↺ Restablecer todas</button>
    </div>
  `;
}

function saveWaTemplates() {
  if(!config.waTemplates) config.waTemplates = {};
  _waTplMeta.forEach(m=>{
    const el = document.getElementById('wa-tpl-'+m.key);
    if(el) config.waTemplates[m.key] = el.value;
  });
  save();
  notify('Plantillas de WhatsApp guardadas');
}

function resetWaTemplate(key) {
  const el = document.getElementById('wa-tpl-'+key);
  if(el) el.value = WA_TEMPLATES_DEFAULT[key] || '';
}

function resetAllWaTemplates() {
  _waTplMeta.forEach(m=>{
    const el = document.getElementById('wa-tpl-'+m.key);
    if(el) el.value = WA_TEMPLATES_DEFAULT[m.key] || '';
  });
  if(config.waTemplates) { delete config.waTemplates; save(); }
  notify('Plantillas restablecidas a valores por defecto');
}
