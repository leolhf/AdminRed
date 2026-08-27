/**
 * reportes/reporte-mensual.js — Reporte ejecutivo mensual con KPIs
 * y comparación contra el snapshot del mes anterior.
 */
RN.reporteMensual = RN.reporteMensual || {};

RN.reporteMensual.generar = function () {
  const sel = document.getElementById('select-mes-reporte');
  const mes = sel ? sel.value : RN.calc.mesActualStr();
  const out = document.getElementById('reporte-mensual-out');
  if (!out) return;

  const snapActual = RN.state.snapshots.find(s => s.mes === mes) || RN.calc.generarSnapshot(mes);
  const mesAnt = RN.calc.mesAnterior(mes);
  const snapAnt = RN.state.snapshots.find(s => s.mes === mesAnt);
  const ingresos = RN.calc.ingresosMes(mes);
  const gastos = RN.calc.gastosMes(mes);
  const utilidad = ingresos - gastos;
  const cob = RN.calc.cobranzaMes(mes);

  const cmp = (act, ant, fmt) => {
    if (ant === undefined || ant === null) return '';
    const diff = act - ant;
    const pct = ant ? Math.round(diff / ant * 100) : 0;
    const sign = diff >= 0 ? '+' : '';
    const cls = diff >= 0 ? 'ok' : 'due';
    return ` <span class="badge ${cls}">${sign}${fmt ? fmt(diff) : diff} (${sign}${pct}%)</span>`;
  };

  out.innerHTML = `
    <div class="card" style="margin:0">
      <h3>📋 Reporte ejecutivo — ${RN.calc.mesTexto(mes)}</h3>
      <div class="kpi-grid">
        <div class="kpi green"><div class="label">Ingresos</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(ingresos)}</div>${snapAnt ? cmp(ingresos, snapAnt.ingresos, RN.calc.formatCUP) : ''}</div>
        <div class="kpi red"><div class="label">Gastos</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(gastos)}</div>${snapAnt ? cmp(gastos, snapAnt.gastos, RN.calc.formatCUP) : ''}</div>
        <div class="kpi blue"><div class="label">Utilidad</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(utilidad)}</div>${snapAnt ? cmp(utilidad, snapAnt.utilidad, RN.calc.formatCUP) : ''}</div>
        <div class="kpi amber"><div class="label">Cobranza</div><div class="value" style="font-size:18px">${cob.pagaron}/${cob.total}</div></div>
        <div class="kpi blue"><div class="label">Tasa cobranza</div><div class="value" style="font-size:18px">${cob.total ? Math.round(cob.pagaron / cob.total * 100) : 0}%</div></div>
        <div class="kpi green"><div class="label">Ingreso esperado</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(RN.calc.ingresoEsperadoMes(mes))}</div></div>
      </div>
      ${snapAnt ? `<p class="mt-16 muted">Comparado con ${RN.calc.mesTexto(mesAnt)} (snapshot).</p>` : '<p class="mt-16 muted">No hay snapshot del mes anterior para comparar.</p>'}
      <button class="btn mt-16" onclick="RN.export.descargar('reporte-${mes}.txt', document.getElementById('reporte-mensual-out').innerText, 'text/plain')">⬇️ Exportar</button>
    </div>`;
};
