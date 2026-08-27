/**
 * storage/export.js — Exportación/importación de respaldos y export CSV de clientes.
 */
RN.export = RN.export || {};

/** Descarga un blob como archivo. */
RN.export.descargar = function (nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Exporta un respaldo JSON completo. */
RN.export.exportarBackup = function () {
  const json = RN.storageLocal.serializar();
  const fecha = new Date().toISOString().slice(0, 10);
  RN.export.descargar(`adminred-backup-${fecha}.json`, json, 'application/json');
  RN.notifyUI.toast('Respaldo exportado', 'success');
};

/** Importa un respaldo JSON desde archivo. */
RN.export.importarBackup = function () {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const texto = await file.text();
      let data = JSON.parse(texto);
      data = RN.migration.migrar(data);
      RN.storageLocal._aplicarData(data);
      RN.checkpoint.crear();
      RN.storageLocal.persistir();
      RN.render.todo();
      RN.notifyUI.toast('Respaldo importado correctamente', 'success');
    } catch (e) {
      RN.notifyUI.toast('Archivo inválido: ' + e.message, 'error');
    }
  };
  input.click();
};

/** Exporta clientes a CSV. */
RN.export.exportCSVClientes = function () {
  const rows = [['id', 'nombre', 'telefono', 'direccion', 'diaPago', 'planId', 'precio', 'estado', 'deudaEquipo', 'descuentoRecurrente']];
  RN.state.clients.forEach(c => {
    rows.push([
      c.id, c.nombre || '', c.telefono || '', c.direccion || '', c.diaPago || '',
      c.planId || '', c.precio || 0, RN.calc.getStatus(c),
      RN.investment.getDeudaEquipoCliente(c), c.descuentoRecurrente || 0
    ]);
  });
  const csv = rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
  RN.export.descargar('clientes.csv', csv, 'text/csv');
  RN.notifyUI.toast('CSV de clientes exportado', 'success');
};
