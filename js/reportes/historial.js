/**
 * reportes/historial.js — Historial general de cobros.
 * (El render de la tabla vive en render.js; aqui helpers de filtrado/export.)
 * v5.13.9: filtrar() ahora soporta q (busqueda), tipoPago y concepto.
 */
RN.historial = RN.historial || {};

// v5.13.9 (CODE-1/BUG-5): Filtrado centralizado del historial.
// Soporta: mes (mes de servicio o calendario), tipoPago, q (busqueda por
// nombre cliente, reciboNum, concepto, mes). Ordena por fecha descendente.
RN.historial.filtrar = function (filtro) {
  filtro = filtro || {};
  var q = (filtro.q || '').toLowerCase();
  var mesSel = filtro.mes || '';
  var tipoSel = filtro.tipoPago || '';

  return RN.state.history.filter(function (h) {
    // Filtro por mes: priorizar h.mes (mes de servicio), fallback a fecha
    if (mesSel) {
      var mesCobro = h.mes || (h.fecha || '').slice(0, 7);
      if (mesCobro !== mesSel) return false;
    }
    // Filtro por tipo de pago
    if (tipoSel) {
      var tp = h.tipoPago || 'completo';
      if (tp !== tipoSel) return false;
    }
    // Busqueda por texto
    if (q) {
      var cli = RN.calc.clientePorId(h.clienteId);
      var nombre = cli ? cli.nombre : '';
      var concepto = h.concepto || h.tipo || '';
      var recibo = h.reciboNum || '';
      var mes = h.mes || '';
      if (nombre.toLowerCase().indexOf(q) < 0
        && recibo.toLowerCase().indexOf(q) < 0
        && concepto.toLowerCase().indexOf(q) < 0
        && mes.indexOf(q) < 0) return false;
    }
    return true;
  }).sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
};

// v5.13.9 (CODE-3): exportCSV mejorado — respeta filtro, mas columnas, nombre real.
RN.historial.exportCSV = function (filtro) {
  var lista = filtro ? RN.historial.filtrar(filtro) : RN.state.history;
  var rows = [['fecha', 'cliente', 'tipo', 'mes', 'concepto', 'monto', 'montoEquipo', 'mora', 'total', 'tipoPago', 'falta', 'excedente', 'moneda', 'usd', 'cup', 'reciboNum']];
  lista.forEach(function (h) {
    var c = RN.calc.clientePorId(h.clienteId);
    rows.push([
      (h.fecha || '').slice(0, 10),
      c ? c.nombre : (h.ventaInventario ? 'Venta inventario' : ''),
      h.tipo, h.mes || '', h.concepto || '',
      h.monto || 0, h.montoEquipo || 0, h.montoMora || 0,
      RN.calc.totalCobro(h), h.tipoPago || '', h.falta || 0, h.excedente || 0,
      h.moneda || 'CUP', h.montoPagadoUSD || 0, h.montoPagadoCUP || 0,
      h.reciboNum || ''
    ]);
  });
  var csv = rows.map(function (r) { return r.map(function (f) { return '"' + String(f).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
  RN.export.descargar('historial-cobros.csv', csv, 'text/csv');
  RN.notifyUI.toast('Historial exportado (' + lista.length + ' cobros)', 'success');
};
