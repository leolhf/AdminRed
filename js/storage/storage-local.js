/**
 * storage/storage-local.js — Persistencia en localStorage (respaldo).
 * El archivo real (storage-file.js) es la fuente preferida cuando hay handle;
 * localStorage garantiza que no se pierdan datos al recargar.
 */
RN.storageLocal = RN.storageLocal || {};

/** Serializa todo el estado a JSON. */
RN.storageLocal.serializar = function () {
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

/** Carga desde localStorage, aplica migración y pobla el estado. */
RN.storageLocal.cargar = function () {
  const raw = localStorage.getItem(STORAGE_KEYS.DATA);
  if (!raw) {
    RN.state.mesActual = RN.calc.mesActualStr();
    return false;
  }
  try {
    let data = JSON.parse(raw);
    data = RN.migration.migrar(data);
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
    if (data.config) Object.assign(RN.state.config, data.config);
    RN.state.reciboCounter = data.reciboCounter || 0;
    RN.state.mesActual = data.mesActual || RN.calc.mesActualStr();
    return true;
  } catch (e) {
    console.error('storage-local: error al cargar', e);
    RN.notifyUI.toast('Datos locales corruptos', 'error');
    return false;
  }
};

/** Persiste el estado en localStorage. */
RN.storageLocal.persistir = function () {
  try {
    localStorage.setItem(STORAGE_KEYS.DATA, RN.storageLocal.serializar());
    RN.validacion.marcarLimpio();
    return true;
  } catch (e) {
    RN.notifyUI.toast('No se pudo guardar en localStorage', 'error');
    return false;
  }
};

/** Aplica un objeto data al estado (usado por storage-file y export al importar). */
RN.storageLocal._aplicarData = function (data) {
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
  if (data.config) Object.assign(RN.state.config, data.config);
  RN.state.reciboCounter = data.reciboCounter || 0;
  RN.state.mesActual = data.mesActual || RN.calc.mesActualStr();
};

/** Guarda estado + crea checkpoint. Helper usado por toda la app. */
RN.storageLocal.guardar = function () {
  RN.checkpoint.crear();
  RN.storageLocal.persistir();
  // Si hay archivo vinculado, guardar también ahí (best-effort)
  if (RN.state.fileHandle && window.showSaveFilePicker) {
    RN.storageFile.guardarAhora().catch(() => {});
  }
  // v5.11.2: respaldo automático en IndexedDB (best-effort, no bloquea)
  if (RN.autoBackup && RN.autoBackup.guardar) {
    RN.autoBackup.guardar().catch(() => {});
  }
};
