/**
 * reportes/historial-mensual.js — Historial mensual de cobros (agrupado por mes).
 */
RN.historialMensual = RN.historialMensual || {};

/** Agrupa cobros por mes. */
RN.historialMensual.agrupar = function () {
  const map = {};
  RN.state.history.forEach(h => {
    const m = h.mes || (h.fecha || '').slice(0, 7);
    if (!map[m]) map[m] = { mes: m, ingresos: 0, count: 0 };
    map[m].ingresos += (h.monto || 0) + (h.montoEquipo || 0);
    map[m].count++;
  });
  return Object.values(map).sort((a, b) => b.mes.localeCompare(a.mes));
};

RN.historialMensual.ver = function () {
  const data = RN.historialMensual.agrupar();
  const rows = data.length ? data.map(m => `<tr>
    <td><strong>${RN.calc.mesTexto(m.mes)}</strong></td>
    <td>${m.count}</td>
    <td>${RN.calc.formatCUP(m.ingresos)}</td>
  </tr>`).join('') : '<tr><td colspan="3"><div class="empty">Sin datos</div></td></tr>';
  const html = `
    <div class="modal-header"><h3>Historial mensual</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body"><div class="table-wrap"><table><thead><tr><th>Mes</th><th>Cobros</th><th>Ingresos</th></tr></thead><tbody>${rows}</tbody></table></div></div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>`;
  RN.uiComponents.modal(html, { lg: true });
};
