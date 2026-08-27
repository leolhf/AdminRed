/**
 * validacion.js — Validación de integridad de datos antes/después de guardar.
 */
RN.validacion = RN.validacion || {};

/** Valida la integridad del estado. Devuelve { ok, errores: [] }. */
RN.validacion.validar = function () {
  const errores = [];
  const ids = new Set();

  // Clientes
  RN.state.clients.forEach((c, i) => {
    if (!c.id) { errores.push(`Cliente #${i} sin id`); return; }
    if (ids.has(c.id)) errores.push(`Cliente con id duplicado: ${c.id}`);
    ids.add(c.id);
    if (!c.nombre) errores.push(`Cliente ${c.id} sin nombre`);
    if (typeof c.precio !== 'number' && !c.planId) errores.push(`Cliente ${c.id} sin precio ni plan`);
  });

  // Historial
  RN.state.history.forEach((h, i) => {
    if (!h.id) errores.push(`Historial #${i} sin id`);
    if (h.clienteId && !RN.state.clients.find(c => c.id === h.clienteId) && !h.ventaInventario) {
      errores.push(`Historial ${h.id} referencia cliente inexistente ${h.clienteId}`);
    }
  });

  // Descuentos puntuales
  RN.state.descuentos.forEach(d => {
    if (!['afectacion', 'bonificacion', 'ajuste'].includes(d.tipo)) {
      errores.push(`Descuento ${d.id} con tipo inválido: ${d.tipo}`);
    }
    if (!['fijo', 'porcentaje', 'dias'].includes(d.modo)) {
      errores.push(`Descuento ${d.id} con modo inválido: ${d.modo}`);
    }
  });

  return { ok: errores.length === 0, errores };
};

// v5.11.2: indicador visual de "cambios sin guardar" (punto rojo en header + beforeunload).
// Evita pérdidas accidentales al cerrar la pestaña con cambios sin guardar.
RN.validacion._beforeunloadInstalado = false;

/** Actualiza el punto rojo de "sin guardar" en el header. */
RN.validacion._actualizarPunto = function (sucio) {
  var punto = document.getElementById('dirty-dot');
  if (!punto) {
    // Crear el punto dinámicamente si no existe en el DOM
    var header = document.querySelector('header');
    if (!header) return;
    punto = document.createElement('span');
    punto.id = 'dirty-dot';
    punto.title = 'Tienes cambios sin guardar';
    punto.style.cssText = 'display:none;width:10px;height:10px;border-radius:50%;background:#e53935;margin-left:8px;align-self:center;box-shadow:0 0 6px #e53935;animation:rnpulse 1.4s infinite;';
    header.appendChild(punto);
  }
  punto.style.display = sucio ? 'inline-block' : 'none';
};

/** Instala el aviso beforeunload (una sola vez). */
RN.validacion._instalarBeforeUnload = function () {
  if (RN.validacion._beforeunloadInstalado) return;
  RN.validacion._beforeunloadInstalado = true;
  window.addEventListener('beforeunload', function (e) {
    if (RN.state && RN.state.isDirty) {
      e.preventDefault();
      e.returnValue = 'Tienes cambios sin guardar. ¿Seguro que quieres salir?';
      return e.returnValue;
    }
  });
};

/** Marca el estado como sucio (cambios sin guardar). */
RN.validacion.marcarSucio = function () {
  RN.state.isDirty = true;
  const btn = document.getElementById('btn-save');
  if (btn) btn.style.background = 'var(--warn)';
  RN.validacion._instalarBeforeUnload();
  RN.validacion._actualizarPunto(true);
};

/** Marca como limpio. */
RN.validacion.marcarLimpio = function () {
  RN.state.isDirty = false;
  const btn = document.getElementById('btn-save');
  if (btn) btn.style.background = '';
  RN.validacion._actualizarPunto(false);
};
