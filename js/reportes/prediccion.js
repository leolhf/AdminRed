/**
 * reportes/prediccion.js — Predicción de ingresos (media móvil simple).
 */
RN.prediccion = RN.prediccion || {};

RN.prediccion.calcular = function () {
  return RN.calc.prediccionIngresos();
};

RN.prediccion.ver = function () {
  const pred = RN.prediccion.calcular();
  const tendencia = RN.calc.tendenciaMensual(6);
  const max = Math.max(...tendencia.map(t => t.ingresos), 1);
  const html = `
    <div class="modal-header"><h3>Predicción de ingresos</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="kpi-grid mb-16"><div class="kpi amber"><div class="label">Próximo mes (estimado)</div><div class="value">${RN.calc.formatCUP(pred)}</div></div></div>
      <p class="muted">Estimación basada en la media móvil de los ingresos de los últimos 3 meses.</p>
      <div class="flex mt-16" style="gap:12px;align-items:flex-end;height:120px;justify-content:space-around">
        ${tendencia.map(t => {
          const h = Math.max(2, Math.round(t.ingresos / max * 100));
          return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
            <div style="width:24px;height:${h}px;background:var(--primary);border-radius:3px"></div>
            <span class="muted" style="font-size:11px">${t.mes.slice(5)}</span></div>`;
        }).join('')}
        <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
          <div style="width:24px;height:${Math.max(2, Math.round(pred / max * 100))}px;background:var(--warn);border-radius:3px;opacity:.7;border:2px dashed var(--warn)"></div>
          <span style="font-size:11px;font-weight:700">→ pred</span></div>
      </div>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>`;
  RN.uiComponents.modal(html, { lg: true });
};
