// reporte-mensual.js
// Reporte ejecutivo mensual automatico con comparacion contra el mes anterior.
// Feature #6: Resumen ejecutivo del mes (ingresos, costos, ganancia, cobranza,
//              mora, gastos por categoria) + comparacion con el snapshot del mes
//              anterior (deltas con flechas verde/rojo).
// Feature #14: Integra con snapshots — puede guardar un snapshot del mes actual
//              al generar el reporte, para que quede registrado para comparaciones
//              futuras.
// Depende de: state.js (config, snapshots, clients, gastos), calculations.js
//             (ingresosMes, costoMes, totalGastos, ganancia, pendienteTotal,
//              totalVendido, generarSnapshot, guardarSnapshot, getSnapshotAnterior,
//              labelMes, mesActualHoy, fmt)

function renderReporteMensual() {
  const el=document.getElementById('reporte-mensual-content');
  if(!el) return; // No estamos en la pestana de reportes

  const mesKey=config.mesActual||mesActualHoy();
  const snapActual=getSnapshotMes(mesKey);
  const snapAnterior=getSnapshotAnterior(mesKey);

  // Datos en vivo del mes actual (no dependen de snapshot guardado)
  const ing=ingresosMes();
  const costo=costoMes();
  const gastosTotal=totalGastos();
  const gan=ganancia();
  const cobradoAhora=cobrado();
  const pend=pendienteTotal();
  const nClientes=clients.length;
  const nPagados=clients.filter(c=>c.pagado).length;
  const nConMora=clients.filter(c=>getMora(c)>0).length;
  const tasaCobro=ing>0?Math.round(cobradoAhora/ing*100):0;
  const margen=ing>0?Math.round(gan/ing*100):0;

  // Gastos por categoria
  const gastosPorCat={};
  gastosDelMes().forEach(g=>{
    const cat=g.categoria||'operativo';
    gastosPorCat[cat]=(gastosPorCat[cat]||0)+(g.monto||0);
  });

  // Funcion helper: delta con flecha y color
  function delta(actual, anterior, invertir) {
    if(anterior==null||anterior===0) return '';
    const diff=actual-anterior;
    if(diff===0) return '<span style="color:var(--text-muted)">= sin cambio</span>';
    const pct=Math.round(Math.abs(diff)/anterior*100);
    const esBueno=invertir?diff<0:diff>0;
    const flecha=diff>0?'▲':'▼';
    const color=esBueno?'var(--green)':'var(--red)';
    return `<span style="color:${color}">${flecha} ${pct}% (${diff>0?'+':''}${fmt(diff)})</span>`;
  }

  let html=`
    <div class="reporte-mensual-wrap">
      <div class="reporte-header">
        <h3>📋 Reporte Ejecutivo — ${labelMes(mesKey)}</h3>
        <div class="reporte-actions">
          <button class="btn btn-blue btn-sm" onclick="guardarSnapshotYNotificar()">📸 Guardar snapshot de este mes</button>
          <button class="btn btn-ghost btn-sm" onclick="exportReporteMensual()">⬇ Exportar reporte</button>
        </div>
      </div>
  `;

  if(!snapAnterior){
    html+=`<div class="reporte-note">ℹ️ No hay snapshot del mes anterior para comparar. Genera un snapshot al cierre de cada mes para habilitar las comparaciones históricas.</div>`;
  } else {
    html+=`<div class="reporte-note">📊 Comparando con: ${labelMes(snapAnterior.mes)}</div>`;
  }

  // KPIs principales en grid
  html+=`
    <div class="reporte-kpis">
      <div class="reporte-kpi">
        <div class="kpi-label">Ingresos esperados</div>
        <div class="kpi-value green">${fmt(ing)}</div>
        <div class="kpi-delta">${snapAnterior?delta(ing,snapAnterior.ingresos):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Costo del paquete</div>
        <div class="kpi-value red">${fmt(costo)}</div>
        <div class="kpi-delta">${snapAnterior?delta(costo,snapAnterior.costoPaquete):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Gastos del mes</div>
        <div class="kpi-value amber">${fmt(gastosTotal)}</div>
        <div class="kpi-delta">${snapAnterior?delta(gastosTotal,snapAnterior.gastos,true):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Ganancia neta</div>
        <div class="kpi-value ${gan>=0?'green':'red'}">${fmt(gan)}</div>
        <div class="kpi-delta">${snapAnterior?delta(gan,snapAnterior.ganancia):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Margen</div>
        <div class="kpi-value">${margen}%</div>
        <div class="kpi-delta">${snapAnterior?delta(margen,snapAnterior.margen):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Cobrado</div>
        <div class="kpi-value blue">${fmt(cobradoAhora)}</div>
        <div class="kpi-delta">${snapAnterior?delta(cobradoAhora,snapAnterior.cobrado):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Tasa de cobro</div>
        <div class="kpi-value">${tasaCobro}%</div>
        <div class="kpi-delta">${snapAnterior?delta(tasaCobro,snapAnterior.tasaCobro):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Pendiente</div>
        <div class="kpi-value amber">${fmt(pend)}</div>
        <div class="kpi-delta">${snapAnterior?delta(pend,snapAnterior.pendiente,true):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Clientes</div>
        <div class="kpi-value">${nClientes}</div>
        <div class="kpi-delta">${snapAnterior?delta(nClientes,snapAnterior.nClientes):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Con mora</div>
        <div class="kpi-value ${nConMora>0?'red':''}">${nConMora}</div>
        <div class="kpi-delta">${snapAnterior?delta(nConMora,snapAnterior.nConMora,true):''}</div>
      </div>
      <div class="reporte-kpi">
        <div class="kpi-label">Megas vendidos</div>
        <div class="kpi-value">${totalVendido()} Mb</div>
        <div class="kpi-delta">${snapAnterior?delta(totalVendido(),snapAnterior.megasVendidos):''}</div>
      </div>
    </div>
  `;

  // Gastos por categoria
  if(Object.keys(gastosPorCat).length>0){
    html+=`<h4 style="margin-top:20px">Gastos por categoría</h4><div class="reporte-gastos">`;
    Object.entries(gastosPorCat).sort((a,b)=>b[1]-a[1]).forEach(([cat,monto])=>{
      const pct=gastosTotal>0?Math.round(monto/gastosTotal*100):0;
      html+=`
        <div class="gasto-cat-row">
          <span class="gasto-cat-nombre">${cat}</span>
          <div class="gasto-cat-bar"><div style="width:${pct}%;background:var(--amber)"></div></div>
          <span class="gasto-cat-monto mono">${fmt(monto)} (${pct}%)</span>
        </div>`;
    });
    html+=`</div>`;
  }

  // Snapshot guardado info
  if(snapActual){
    html+=`<div class="reporte-snapshot-info">📸 Snapshot guardado el ${new Date(snapActual.timestamp).toLocaleString('es-CU')}</div>`;
  } else {
    html+=`<div class="reporte-snapshot-info" style="color:var(--text-muted)">No hay snapshot guardado para este mes. Usa "Guardar snapshot" para registrar el estado actual.</div>`;
  }

  // Historial de snapshots
  if(snapshots.length>0){
    html+=`<h4 style="margin-top:20px">Histórico de snapshots</h4><div class="snapshots-list">`;
    snapshots.forEach(s=>{
      html+=`
        <div class="snapshot-row">
          <span class="snapshot-mes">${labelMes(s.mes)}</span>
          <span class="snapshot-ganancia mono ${s.ganancia>=0?'text-green':'text-red'}">${fmt(s.ganancia)}</span>
          <span class="snapshot-tasa">${s.tasaCobro}% cobro</span>
          <span class="snapshot-meta mono">${s.nClientes} clientes · ${s.megasVendidos} Mb</span>
        </div>`;
    });
    html+=`</div>`;
  }

  html+=`</div>`;
  el.innerHTML=html;
}

function guardarSnapshotYNotificar() {
  const snap=guardarSnapshot(config.mesActual||mesActualHoy());
  save();
  renderReporteMensual();
  notify(`📸 Snapshot de ${labelMes(snap.mes)} guardado — Ganancia: ${fmt(snap.ganancia)} · ${snap.tasaCobro}% cobro`);
}

function exportReporteMensual() {
  const mesKey=config.mesActual||mesActualHoy();
  const snapAnterior=getSnapshotAnterior(mesKey);
  const ing=ingresosMes(), costo=costoMes(), gastosTotal=totalGastos(), gan=ganancia();
  const cobradoAhora=cobrado(), pend=pendienteTotal();
  const nClientes=clients.length, nPagados=clients.filter(c=>c.pagado).length;
  const nConMora=clients.filter(c=>getMora(c)>0).length;
  const tasaCobro=ing>0?Math.round(cobradoAhora/ing*100):0;
  // v5.7: caja real del mes
  const ganR=gananciaReal(), cobTotMes=cobradoTotalMes(), pagoPaq=pagoPaqueteMes();

  let txt=`REPORTE EJECUTIVO MENSUAL — ${labelMes(mesKey)}\n`;
  txt+=`Generado: ${new Date().toLocaleString('es-CU')}\n`;
  txt+=`${'='.repeat(50)}\n\n`;
  txt+=`--- CAJA REAL DEL MES (lo que entro/salio) ---\n`;
txt+=`Cobrado este mes:      ${fmt(cobTotMes)} CUP\n`;
txt+=`  - en servicios:      ${fmt(cobradoServiciosMes())} CUP\n`;
txt+=`  - en cuotas equipo:  ${fmt(cobradoEquipoMes())} CUP\n`;
txt+=`Pago paquete proveedor:${pagoPaq>0?'':' (pendiente)'} ${fmt(pagoPaq||costo)} CUP\n`;
txt+=`Gastos del mes:        ${fmt(gastosTotal)} CUP\n`;
txt+=`Ganancia neta real:    ${fmt(ganR)} CUP\n`;
txt+=`\n--- PROYECCION (esperado) ---\n`;
txt+=`Ingresos esperados:    ${fmt(ing)} CUP\n`;
txt+=`Costo del paquete:     ${fmt(costo)} CUP\n`;
txt+=`Ganancia proyectada:   ${fmt(gan)} CUP\n`;
txt+=`Margen proyectado:     ${ing>0?Math.round(gan/ing*100):0}%\n`;
txt+=`Cobrado:               ${fmt(cobradoAhora)} CUP (${tasaCobro}%)\n`;
txt+=`Pendiente:             ${fmt(pend)} CUP\n`;
txt+=`Clientes:              ${nClientes} (${nPagados} pagados, ${nConMora} con mora)\n`;
txt+=`Megas vendidos:        ${totalVendido()} Mb\n`;
  if(snapAnterior){
    txt+=`\n${'='.repeat(50)}\nCOMPARACION vs ${labelMes(snapAnterior.mes)}\n${'='.repeat(50)}\n`;
    txt+=`Ingresos:  ${fmt(ing)} vs ${fmt(snapAnterior.ingresos)} (diff: ${ing-snapAnterior.ingresos>0?'+':''}${fmt(ing-snapAnterior.ingresos)})\n`;
    txt+=`Ganancia:  ${fmt(gan)} vs ${fmt(snapAnterior.ganancia)} (diff: ${gan-snapAnterior.ganancia>0?'+':''}${fmt(gan-snapAnterior.ganancia)})\n`;
    txt+=`Cobrado:   ${fmt(cobradoAhora)} vs ${fmt(snapAnterior.cobrado)} (diff: ${cobradoAhora-snapAnterior.cobrado>0?'+':''}${fmt(cobradoAhora-snapAnterior.cobrado)})\n`;
    txt+=`Clientes:  ${nClientes} vs ${snapAnterior.nClientes}\n`;
  }
  txt+=`\n${'='.repeat(50)}\nGASTOS POR CATEGORIA\n${'='.repeat(50)}\n`;
  const gastosPorCat={};
  gastosDelMes().forEach(g=>{const cat=g.categoria||'operativo';gastosPorCat[cat]=(gastosPorCat[cat]||0)+(g.monto||0);});
  Object.entries(gastosPorCat).sort((a,b)=>b[1]-a[1]).forEach(([cat,monto])=>{
    txt+=`${cat}: ${fmt(monto)} CUP\n`;
  });

  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`reporte_${mesKey}.txt`;
  a.click();
  notify('Reporte mensual exportado');
}
