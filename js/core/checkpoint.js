/**
 * checkpoint.js — Checkpoints automáticos del estado.
 * Debe cargar antes de undo.js (undo depende de los checkpoints).
 */

RN.checkpoint = RN.checkpoint || {};

const MAX_CHECKPOINTS = 30;

/** Serializa el estado actual (solo datos de negocio, no handles). */
RN.checkpoint.serializar = function () {
  return JSON.stringify({
    clients: RN.state.clients,
    history: RN.state.history,
    gastos: RN.state.gastos,
    inventario: RN.state.inventario,
    asignacionesInventario: RN.state.asignacionesInventario,
    investments: RN.state.investments,
    planes: RN.state.planes,
    equiposRed: RN.state.equiposRed,
    descuentos: RN.state.descuentos,
    snapshots: RN.state.snapshots,
    config: RN.state.config,
    reciboCounter: RN.state.reciboCounter,
    mesActual: RN.state.mesActual,
    esquema: RN.migration.VERSION_ESQUEMA
  });
};

/** Crea un checkpoint y lo empuja al stack. */
RN.checkpoint.crear = function () {
  const snap = RN.checkpoint.serializar();
  const stack = RN.state.checkpoints;
  // Si estamos en medio del stack (se hizo undo), truncar el futuro
  if (RN.state.undoIndex < stack.length - 1) {
    stack.splice(RN.state.undoIndex + 1);
  }
  stack.push(snap);
  if (stack.length > MAX_CHECKPOINTS) stack.shift();
  RN.state.undoIndex = stack.length - 1;
};

/** Restaura un checkpoint por índice. */
RN.checkpoint.restaurar = function (idx) {
  const snap = RN.state.checkpoints[idx];
  if (!snap) return false;
  const data = JSON.parse(snap);
  RN.state.clients = data.clients || [];
  RN.state.history = data.history || [];
  RN.state.gastos = data.gastos || [];
  RN.state.inventario = data.inventario || [];
  RN.state.asignacionesInventario = data.asignacionesInventario || [];
  RN.state.investments = data.investments || [];
  RN.state.planes = data.planes || [];
  RN.state.equiposRed = data.equiposRed || [];
  RN.state.descuentos = data.descuentos || [];
  RN.state.snapshots = data.snapshots || [];
  RN.state.config = data.config || RN.state.config;
  RN.state.reciboCounter = data.reciboCounter || 0;
  RN.state.mesActual = data.mesActual || RN.calc.mesActualStr();
  RN.state.undoIndex = idx;
  return true;
};
