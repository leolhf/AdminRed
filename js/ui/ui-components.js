/**
 * ui/ui-components.js — Componentes de interfaz reutilizables (modal, confirm).
 */
RN.uiComponents = RN.uiComponents || {};

/** Abre un modal con contenido HTML. */
RN.uiComponents.modal = function (html, opts) {
  opts = opts || {};
  const box = document.getElementById('modal-box');
  const overlay = document.getElementById('modal-overlay');
  box.className = 'modal' + (opts.lg ? ' lg' : '');
  box.innerHTML = html;
  overlay.classList.add('open');
  // cerrar al click fuera
  overlay.onclick = (e) => { if (e.target === overlay) RN.uiComponents.cerrarModal(); };
};

/** Cierra el modal. */
RN.uiComponents.cerrarModal = function () {
  document.getElementById('modal-overlay').classList.remove('open');
};

/** Diálogo de confirmación reutilizable. */
RN.uiComponents.confirm = function (titulo, mensaje, onConfirm, opts) {
  opts = opts || {};
  const html = `
    <div class="modal-header"><h3>${RN.render.esc(titulo)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body"><p>${RN.render.esc(mensaje)}</p></div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn ${opts.danger ? 'danger' : 'primary'}" id="confirm-ok">Confirmar</button>
    </div>`;
  RN.uiComponents.modal(html);
  document.getElementById('confirm-ok').onclick = () => { RN.uiComponents.cerrarModal(); onConfirm(); };
};

/** Prompt reutilizable (input de texto/numero). */
RN.uiComponents.prompt = function (titulo, label, defaultValue, onOk, opts) {
  opts = opts || {};
  const html = `
    <div class="modal-header"><h3>${RN.render.esc(titulo)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body"><label>${RN.render.esc(label)}</label>
      <input id="prompt-input" type="${opts.type || 'text'}" value="${RN.render.esc(defaultValue || '')}" ${opts.step ? 'step="' + opts.step + '"' : ''}>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" id="prompt-ok">Aceptar</button>
    </div>`;
  RN.uiComponents.modal(html);
  const inp = document.getElementById('prompt-input');
  inp.focus(); inp.select();
  const ok = () => { const v = inp.value; RN.uiComponents.cerrarModal(); onOk(opts.type === 'number' ? parseFloat(v) : v); };
  document.getElementById('prompt-ok').onclick = ok;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
};
