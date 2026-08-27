/**
 * reset-app.js — Reseteo completo de la app.
 */
RN.resetApp = RN.resetApp || {};

RN.resetApp.confirmar = function () {
  RN.uiComponents.confirm(
    '¿Resetear toda la app?',
    'Se borrarán TODOS los clientes, cobros, gastos, inventario e inversiones. Esta acción no se puede deshacer.',
    () => {
      RN.state.clients = [];
      RN.state.history = [];
      RN.state.gastos = [];
      RN.state.inventario = [];
      RN.state.asignacionesInventario = [];
      RN.state.investments = [];
      RN.state.planes = [];
      RN.state.equiposRed = [];
      RN.state.descuentos = [];
      RN.state.snapshots = [];
      RN.state.reciboCounter = 0;
      RN.state.mesActual = RN.calc.mesActualStr();
      RN.state.checkpoints = [];
      RN.state.undoIndex = -1;
      localStorage.removeItem(STORAGE_KEYS.DATA);
      RN.render.todo();
      RN.notifyUI.toast('App reseteada', 'warn');
    },
    { danger: true }
  );
};
