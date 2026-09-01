/**
 * reportes/descuentos-view.js — Vista de gestión de descuentos puntuales,
 * con filtros por mes/tipo/estado y exportación a CSV.
 */
RN.descuentosView = RN.descuentosView || {};

RN.descuentosView.render = function () {
  // Rellenar filtro de meses
  const selMes = document.getElementById('filter-desc-mes');
  if (selMes && !selMes.dataset.filled) {
    // v5.14.2 (Auditoría Reportes — DUP-4): helper compartido con render.js.
    const meses = RN.calc.mesesConDatos(RN.state.descuentos, 'mes');
    selMes.innerHTML = '<option value="">Todos los meses</option>' + meses.map(m => `<option value="${m}">${RN.calc.mesTexto(m)}</option>`).join('');
    selMes.addEventListener('change', () => RN.descuentosView.render());
    selMes.dataset.filled = '1';
  }
  const selTipo = document.getElementById('filter-desc-tipo');
  const selEst = document.getElementById('filter-desc-estado');
  if (selTipo && !selTipo.dataset.filled) { selTipo.addEventListener('change', () => RN.descuentosView.render()); selTipo.dataset.filled = '1'; }
  if (selEst && !selEst.dataset.filled) { selEst.addEventListener('change', () => RN.descuentosView.render()); selEst.dataset.filled = '1'; }

  const tbody = document.querySelector('#tabla-descuentos tbody');
  if (!tbody) return;

  const fMes = selMes ? selMes.value : '';
  const fTipo = selTipo ? selTipo.value : '';
  const fEst = selEst ? selEst.value : '';

  let lista = RN.state.descuentos.slice().reverse().filter(d => {
    if (fMes && d.mes !== fMes) return false;
    if (fTipo && d.tipo !== fTipo) return false;
    if (fEst && d.estado !== fEst) return false;
    return true;
  });

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty"><div class="icon">🏷️</div>No hay descuentos puntuales. Agrégalos desde el modal de cobro o con "Descuento por lote".</div></td></tr>`;
    return;
  }

  const estadoBadge = { aplicado: ['paid', 'Aplicado'], pendiente: ['warn', 'Pendiente'], anulado: ['muted', 'Anulado'] };
  tbody.innerHTML = lista.map(d => {
    // v5.14.2 (Auditoría Reportes — DUP-3): usar el helper centralizado.
    const c = RN.calc.clientePorId(d.clienteId);
    const [ecls, etxt] = estadoBadge[d.estado] || ['muted', d.estado];
    return `<tr>
      <td data-label="Cliente">${RN.render.esc(c ? c.nombre : '—')}</td>
      <td data-label="Tipo">${d.tipo}${d.soloPago ? ' <span class="badge warn" style="font-size:10px">1 solo pago</span>' : ''}</td>
      <td data-label="Motivo">${RN.render.esc(d.motivo)}</td>
      <td data-label="Modo">${d.modo}</td>
      <td data-label="Valor">${d.modo === 'porcentaje' ? d.valor + '%' : (d.modo === 'dias' ? d.valor + ' días' : RN.calc.formatCUP(d.valor))}</td>
      <td data-label="Mes">${d.soloPago && d.estado === 'pendiente' ? '<span class="badge warn" style="font-size:10px">Próx. pago</span>' : RN.calc.mesTexto(d.mes)}</td>
      <td data-label="Estado"><span class="badge ${ecls}">${etxt}</span></td>
      <td data-label="Acciones">${d.estado !== 'anulado' ? `<button class="btn sm danger" onclick="RN.descuentos.eliminar('${d.id}')">🗑</button>` : ''}</td>
    </tr>`;
  }).join('');
};

RN.descuentosView.exportCSV = function () {
  const rows = [['cliente', 'tipo', 'motivo', 'modo', 'valor', 'mes', 'estado', 'fecha']];
  RN.state.descuentos.forEach(d => {
    // v5.14.2 (DUP-3): usar el helper centralizado.
    const c = RN.calc.clientePorId(d.clienteId);
    rows.push([c ? c.nombre : '', d.tipo, d.motivo, d.modo, d.valor, d.mes, d.estado, (d.fecha || '').slice(0, 10)]);
  });
  // v5.14.2 (DUP-2): escape CSV centralizado en RN.export.toCSV.
  const csv = RN.export.toCSV(rows);
  RN.export.descargar('descuentos.csv', csv, 'text/csv');
  RN.notifyUI.toast('Descuentos exportados', 'success');
};
