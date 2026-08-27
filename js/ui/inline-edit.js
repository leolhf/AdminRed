/**
 * ui/inline-edit.js — Edición de datos directamente en la tabla.
 * (Edición inline de precio/día de pago en la tabla de clientes.)
 */
RN.inlineEdit = RN.inlineEdit || {};

RN.inlineEdit.activar = function (clienteId, campo, valorActual, callback) {
  const cell = event.target;
  const input = document.createElement('input');
  input.type = 'number';
  input.value = valorActual;
  input.style.width = '80px';
  cell.innerHTML = '';
  cell.appendChild(input);
  input.focus();
  input.select();
  const guardar = () => {
    const val = parseFloat(input.value);
    if (!isNaN(val)) callback(clienteId, campo, val);
    RN.render.clientes();
  };
  input.addEventListener('blur', guardar);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') guardar(); if (e.key === 'Escape') RN.render.clientes(); });
};
