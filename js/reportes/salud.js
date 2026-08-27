/**
 * reportes/salud.js — Dashboard de salud del negocio con KPIs tipo semáforo.
 */
RN.salud = RN.salud || {};

RN.salud.render = function () {
  const out = document.getElementById('salud-out');
  if (!out) return;

  const mes = RN.calc.mesActualStr();
  const cob = RN.calc.cobranzaMes(mes);
  const tasaCob = cob.total ? Math.round(cob.pagaron / cob.total * 100) : 0;
  const utilidad = RN.calc.utilidadMes(mes);
  const esperado = RN.calc.ingresoEsperadoMes(mes);
  const ingresos = RN.calc.ingresosMes(mes);
  const morosos = RN.calc.clientesActivos().filter(c => RN.calc.getStatus(c) === 'due').length;
  const pctMorosos = cob.total ? Math.round(morosos / cob.total * 100) : 0;
  const recInv = RN.investment.porcentajeRecuperacion();

  const semaforo = (valor, okMax, warnMax, invertir) => {
    // invertir: cuando menor es mejor (ej. mora)
    let cls = 'green', txt = 'Saludable';
    if (invertir) {
      if (valor > warnMax) { cls = 'amber'; txt = 'Atención'; }
      if (valor > okMax) { cls = 'red'; txt = 'Crítico'; }
    } else {
      if (valor < warnMax) { cls = 'amber'; txt = 'Atención'; }
      if (valor < okMax) { cls = 'red'; txt = 'Crítico'; }
    }
    return { cls, txt };
  };

  const s1 = semaforo(tasaCob, 50, 70, false);
  const s2 = semaforo(utilidad, 0, 0, false); // utilidad negativa = crítico
  const s3 = semaforo(pctMorosos, 30, 15, true);
  const s4 = semaforo(recInv, 30, 60, false);

  const card = (titulo, valor, s, desc) => `
    <div class="card">
      <div class="flex" style="justify-content:space-between;align-items:center">
        <h3 style="margin:0">${titulo}</h3>
        <span class="badge ${s.cls === 'green' ? 'ok' : (s.cls === 'amber' ? 'warn' : 'due')}">${s.txt}</span>
      </div>
      <div class="value" style="font-size:28px;font-weight:800;color:var(--${s.cls === 'green' ? 'success' : (s.cls === 'amber' ? 'warn' : 'danger')});margin-top:8px">${valor}</div>
      <p class="muted" style="font-size:13px;margin-top:4px">${desc}</p>
    </div>`;

  const saludGeneral = (() => {
    const puntos = [s1.cls, s2.cls, s3.cls, s4.cls];
    if (puntos.includes('red')) return { cls: 'due', txt: 'Crítico — requiere acción inmediata' };
    if (puntos.includes('amber')) return { cls: 'warn', txt: 'Atención — hay puntos a mejorar' };
    return { cls: 'ok', txt: 'Saludable — el negocio marcha bien' };
  })();

  out.innerHTML = `
    <div class="card" style="text-align:center">
      <h3>Estado general del negocio</h3>
      <div style="font-size:36px;margin:10px 0">${saludGeneral.cls === 'ok' ? '🟢' : (saludGeneral.cls === 'warn' ? '🟡' : '🔴')}</div>
      <p style="font-weight:700">${saludGeneral.txt}</p>
    </div>
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr))">
      ${card('Tasa de cobranza', tasaCob + '%', s1, `${cob.pagaron} de ${cob.total} clientes han pagado este mes`)}
      ${card('Utilidad del mes', RN.calc.formatCUP(utilidad), s2, 'Ingresos − gastos del mes')}
      ${card('% Clientes morosos', pctMorosos + '%', s3, `${morosos} cliente(s) atrasado(s) de ${cob.total}`)}
      ${card('Recuperación de inversión', recInv + '%', s4, 'Cuánto se ha recuperado de lo invertido')}
    </div>`;
};
