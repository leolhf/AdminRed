/**
 * reportes/tendencia.js — Tendencias de ingresos (chart de barras simple con divs).
 */
RN.tendencia = RN.tendencia || {};

RN.tendencia.render = function () {
  const cont = document.getElementById('tendencia-chart');
  if (!cont) return;
  const data = RN.calc.tendenciaMensual(6);
  if (!data.length) { cont.innerHTML = '<p class="muted">Sin datos suficientes</p>'; return; }
  const max = Math.max(...data.map(d => Math.max(d.ingresos, d.gastos)), 1);

  cont.innerHTML = `<div class="flex" style="gap:12px;align-items:flex-end;height:160px;justify-content:space-around">` +
    data.map(d => {
      const hIng = Math.max(2, Math.round(d.ingresos / max * 140));
      const hGas = Math.max(2, Math.round(d.gastos / max * 140));
      return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
        <div style="display:flex;gap:3px;align-items:flex-end;height:140px">
          <div title="Ingresos: ${RN.calc.formatCUP(d.ingresos)}" style="width:14px;height:${hIng}px;background:var(--success);border-radius:3px"></div>
          <div title="Gastos: ${RN.calc.formatCUP(d.gastos)}" style="width:14px;height:${hGas}px;background:var(--danger);border-radius:3px"></div>
        </div>
        <span class="muted" style="font-size:11px">${d.mes.slice(5)}</span>
      </div>`;
    }).join('') +
    `</div><div class="flex mt-8" style="gap:16px;font-size:12px;justify-content:center">
      <span class="flex" style="gap:6px"><span style="width:12px;height:12px;background:var(--success);border-radius:3px"></span> Ingresos</span>
      <span class="flex" style="gap:6px"><span style="width:12px;height:12px;background:var(--danger);border-radius:3px"></span> Gastos</span>
    </div>`;
};
