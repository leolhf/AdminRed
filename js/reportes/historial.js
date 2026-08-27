/**
 * reportes/historial.js — Historial general de cobros.
 * (El render de la tabla vive en render.js; aquí helpers de filtrado/export.)
 */
RN.historial = RN.historial || {};

RN.historial.filtrar = function (filtro) {
  filtro = filtro || {};
  return RN.state.history.filter(h => {
    if (filtro.clienteId && h.clienteId !== filtro.clienteId) return false;
    if (filtro.mes && h.mes !== filtro.mes) return false;
    if (filtro.tipo && h.tipo !== filtro.tipo) return false;
    return true;
  }).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
};

RN.historial.exportCSV = function () {
  const rows = [['fecha', 'cliente', 'tipo', 'mes', 'monto', 'montoEquipo', 'total', 'reciboNum']];
  RN.state.history.forEach(h => {
    const c = RN.state.clients.find(x => x.id === h.clienteId);
    rows.push([
      (h.fecha || '').slice(0, 10),
      c ? c.nombre : (h.ventaInventario ? 'Venta inventario' : ''),
      h.tipo, h.mes || '', h.monto || 0, h.montoEquipo || 0,
      (h.monto || 0) + (h.montoEquipo || 0), h.reciboNum || ''
    ]);
  });
  const csv = rows.map(r => r.map(f => `"${String(f).replace(/"/g, '""')}"`).join(',')).join('\n');
  RN.export.descargar('historial-cobros.csv', csv, 'text/csv');
  RN.notifyUI.toast('Historial exportado', 'success');
};
