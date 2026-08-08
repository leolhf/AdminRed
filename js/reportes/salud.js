// salud.js
// Dashboard de salud del negocio con indicadores tipo semaforo (verde/amarillo/rojo).
// Feature #13: KPIs con luces de semaforo que indican rapidamente el estado
//              de salud del negocio:
//              - Rentabilidad (margen)
//              - Cobranza (tasa de cobro)
//              - Mora (clientes con mora)
//              - Ocupacion de banda (megas vendidos vs contratados)
//              - Crecimiento (clientes nuevos vs mes anterior, via snapshots)
//              - Liquidez (cobrado vs gastos del mes)
// Depende de: state.js (clients, config, snapshots), calculations.js
//             (ingresosMes, costoMes, totalGastos, ganancia, cobrado, pendienteTotal,
//              totalVendido, getMora, getSnapshotAnterior, labelMes, fmt)

function renderSalud() {
  const el=document.getElementById('salud-content');
  if(!el) return;

  // Calcular metricas
  const ing=ingresosMes();
  const costo=costoMes();
  const gastosTotal=totalGastos();
  const gan=ganancia();
  const cobradoAhora=cobrado();
  const pend=pendienteTotal();
  const nClientes=clients.length;
  const nConMora=clients.filter(c=>getMora(c)>0).length;
  const margen=ing>0?Math.round(gan/ing*100):0;
  const pctMora=nClientes>0?Math.round(nConMora/nClientes*100):0;
  const sold=totalVendido();
  const pctBanda=config.megas>0?Math.round(sold/config.megas*100):0;
  // v5.7: liquidez = caja real del mes (cobrado real - pagado real).
  // Antes usaba cobradoAhora - gastosTotal - costo, donde costo (costoMes) se
  // restaba SIEMPRE aunque el paquete no se hubiera pagado al proveedor. Ahora
  // se usa el modelo de caja real: lo cobrado este mes menos lo pagado (paquete
  // solo si se marco pagado + gastos del mes).
  const liquidez=gananciaReal();

  // ── COBRANZA POR CORTES (v5.5.1) ──────────────────────────────────
  // La tasa de cobro ya no divide entre todos los clientes del mes, sino
  // solo entre los clientes cuyo día de pago ya llegó o pasó (su "corte"
  // ya estaba activo a la fecha de hoy). Los clientes de cortes futuros
  // (día de pago todavía no llega) no se cuentan — no es justo penalizar
  // la cobranza por clientes que todavía no tenían que pagar.
  const esperados=clientesEsperadosCobro();
  const nEsperados=esperados.length;
  const nPagadosCorte=esperados.filter(c=>c.pagado).length;
  const ingEsperadosHoy=ingresosEsperadosHoy();
  const cobradoCorte=cobradoAlCorte();
  const tasaCobro=ingEsperadosHoy>0?Math.round(cobradoCorte/ingEsperadosHoy*100):0;

  // Snapshot anterior para crecimiento
  const mesKey=config.mesActual||mesActualHoy();
  const snapAnt=getSnapshotAnterior(mesKey);
  const deltaClientes=snapAnt?(nClientes-snapAnt.nClientes):null;
  const deltaGanancia=snapAnt?(gan-snapAnt.ganancia):null;

  // Funcion semaforo: devuelve {color, label, icon, detail}
  function semaforo(nivel, label, valor, detalle, recomendacion) {
    const colores={
      verde:{cls:'sem-verde',icon:'✓',text:'Saludable'},
      amarillo:{cls:'sem-amarillo',icon:'⚠',text:'Atención'},
      rojo:{cls:'sem-rojo',icon:'✗',text:'Crítico'}
    };
    const c=colores[nivel]||colores.amarillo;
    return `
      <div class="salud-card ${c.cls}">
        <div class="salud-luz">${c.icon}</div>
        <div class="salud-info">
          <div class="salud-label">${label}</div>
          <div class="salud-valor">${valor}</div>
          <div class="salud-estado">${c.text}</div>
          ${detalle?`<div class="salud-detalle">${detalle}</div>`:''}
          ${recomendacion?`<div class="salud-recomendacion">${recomendacion}</div>`:''}
        </div>
      </div>`;
  }

  // Determinar niveles de cada KPI
  // 1. Rentabilidad (margen)
  let nivelMargen, recMargen;
  if(margen>=40){nivelMargen='verde';recMargen='';}
  else if(margen>=20){nivelMargen='amarillo';recMargen='El margen es aceptable pero podría mejorar reduciendo costos o aumentando precios.';}
  else if(margen>=0){nivelMargen='rojo';recMargen='Margen bajo. Revisa costos del paquete y gastos operativos.';}
  else {nivelMargen='rojo';recMargen='Estás perdiendo dinero. Necesitas aumentar ingresos o reducir costos urgentemente.';}
  const detalleMargen=deltaGanancia!=null?
    (deltaGanancia>0?`▲ +${fmt(deltaGanancia)} vs mes anterior`:`▼ ${fmt(deltaGanancia)} vs mes anterior`):'';

  // 2. Cobranza (tasa al corte actual)
  // Nota: la tasa se calcula solo sobre los clientes cuyo día de pago ya
  // llegó (su corte está activo), no sobre todos los del mes. Si hay
  // clientes de cortes futuros, se menciona en la recomendación para que
  // quede claro que el % es del corte, no del mes completo.
  const nFuturos = nClientes - nEsperados;
  let nivelCobro, recCobro;
  if(tasaCobro>=85){nivelCobro='verde';recCobro=nFuturos>0?`Cobranza al corriente. ${nFuturos} cliente(s) en cortes futuros aún.`:'';}
  else if(tasaCobro>=60){nivelCobro='amarillo';recCobro='Hay cobranza pendiente en el corte actual. Envía recordatorios a clientes morosos.';}
  else {nivelCobro='rojo';recCobro='Cobranza baja en el corte actual. Prioriza el cobro a clientes pendientes y morosos.';}

  // 3. Mora
  let nivelMora, recMora;
  if(pctMora<=10){nivelMora='verde';recMora='';}
  else if(pctMora<=25){nivelMora='amarillo';recMora='Varios clientes en mora. Contacta para regularizar pagos.';}
  else {nivelMora='rojo';recMora='Mucha mora. Considera cortes de servicio o planes de pago.';}

  // 4. Ocupacion de banda
  let nivelBanda, recBanda;
  if(pctBanda<=80){nivelBanda='verde';recBanda='';}
  else if(pctBanda<=100){nivelBanda='amarillo';recBanda='Cerca del límite de banda. Planea ampliar el paquete pronto.';}
  else {nivelBanda='rojo';recBanda='Sobreventa activa. Debes ampliar el paquete contratado.';}

  // 5. Crecimiento de clientes
  let nivelCrec, recCrec;
  if(deltaClientes!=null){
    if(deltaClientes>0){nivelCrec='verde';recCrec=`+${deltaClientes} cliente(s) nuevo(s) este mes`;}
    else if(deltaClientes===0){nivelCrec='amarillo';recCrec='Sin crecimiento. Considera estrategias de captación.';}
    else {nivelCrec='rojo';recCrec=`Perdiste ${Math.abs(deltaClientes)} cliente(s). Investiga causas de churn.`;}
  } else {
    nivelCrec='amarillo';recCrec='Sin snapshot anterior para comparar. Guarda snapshots mensuales.';
  }

  // 6. Liquidez (caja operativa real del mes)
  // v5.7.1: liquidez = gananciaReal() (caja operativa del mes: cobrado real −
  // paquete pagado − gastos operativos). Antes el desglose textual mostraba
  // "Cobrado {cobrado()} − Gastos {totalGastos+costoMes}", que mezclaba la
  // PROYECCIÓN de cobrados (clientes marcados pagados) con un gasto que volvía
  // a sumar costoMes() (reintroduciendo el paquete que liquidez ya NO resta).
  // El número mostrado y su desglose no coincidían. Ahora el desglose usa las
  // mismas magnitudes de caja real que gananciaReal(), para que sean coherentes.
  const cobTotMes = cobradoTotalMes();
  const pagoPaq   = pagoPaqueteMes();
  const paqPag    = paquetePagadoEsteMes();
  const gastosOpReales = gastosRealesMes();
  let nivelLiq, recLiq;
  if(liquidez>0){nivelLiq='verde';recLiq=`Flujo positivo: ${fmt(liquidez)} CUP disponibles este mes`;}
  else if(liquidez>-costoMes()){nivelLiq='amarillo';recLiq='Flujo ajustado. Lo cobrado apenas cubre lo pagado este mes.';}
  else {nivelLiq='rojo';recLiq='Flujo negativo. Gastas más de lo que cobras este mes.';}

  // Score general (promedio de niveles)
  const niveles=[nivelMargen,nivelCobro,nivelMora,nivelBanda,nivelCrec,nivelLiq];
  const score=niveles.reduce((s,n)=>s+(n==='verde'?2:n==='amarillo'?1:0),0);
  const maxScore=niveles.length*2;
  const pctScore=Math.round(score/maxScore*100);
  let scoreLabel, scoreColor;
  if(pctScore>=75){scoreLabel='Saludable';scoreColor='var(--green)';}
  else if(pctScore>=50){scoreLabel='Regular';scoreColor='var(--amber)';}
  else {scoreLabel='Crítico';scoreColor='var(--red)';}

  let html=`
    <div class="salud-wrap">
      <div class="salud-score-bar">
        <div class="salud-score-label">Salud general del negocio</div>
        <div class="salud-score-value" style="color:${scoreColor}">${scoreLabel} (${pctScore}%)</div>
        <div class="salud-score-track"><div class="salud-score-fill" style="width:${pctScore}%;background:${scoreColor}"></div></div>
      </div>
      <div class="salud-grid">
        ${semaforo(nivelMargen,'Rentabilidad (margen)',margen+'%',detalleMargen,recMargen)}
        ${semaforo(nivelCobro,'Cobranza',tasaCobro+'%',`${nPagadosCorte}/${nEsperados} al corte${nEsperados<nClientes?` de ${nClientes}`:''}`,recCobro)}
        ${semaforo(nivelMora,'Mora',nConMora+' clientes',`${pctMora}% del total`,recMora)}
        ${semaforo(nivelBanda,'Ocupación de banda',pctBanda+'%',`${sold}/${config.megas} Mb vendidos`,recBanda)}
        ${semaforo(nivelCrec,'Crecimiento',deltaClientes!=null?(deltaClientes>=0?'+'+deltaClientes:deltaClientes)+' clientes':'—',snapAnt?`vs ${labelMes(snapAnt.mes)}`:'',recCrec)}
        ${semaforo(nivelLiq,'Liquidez del mes',fmt(liquidez),`Cobrado ${fmt(cobTotMes)} − Paquete ${paqPag?fmt(pagoPaq):'0 (pendiente)'} − Operativos ${fmt(gastosOpReales)}`,recLiq)}
      </div>
    </div>
  `;
  el.innerHTML=html;
}
