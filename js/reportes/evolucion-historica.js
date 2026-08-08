// evolucion-historica.js
// Panel "Evolución Histórica" — estadísticas a lo largo del tiempo.
// Muestra la evolución mes a mes de ganancias, ingresos cobrados, deudas
// pendientes, tasa de cobro y crecimiento de clientes, combinando:
//   1) Snapshots guardados (guardarSnapshot) — datos confiables del cierre.
//   2) Datos reconstruidos del historial (history) y gastos para meses sin
//      snapshot, así la vista funciona desde el primer uso aunque el admin
//      nunca haya guardado snapshots.
// Depende de: state.js (snapshots, history, gastos, clients, config),
//             calculations.js (fmt, labelMes, mesActualHoy, getMora,
//             precioNetoCliente, facturacionIniciada)

// Rango de meses visible por defecto (selector 6/12/24).
let _evoRangoMeses = 12;

// =============================================================================
//  CONSTRUCCIÓN DE LA SERIE TEMPORAL
// =============================================================================

// Reconstruye los datos de un mes específico ('YYYY-MM') a partir del
// historial y gastos cuando NO existe un snapshot guardado para ese mes.
// Devuelve un objeto con la misma forma que un snapshot, marcando
// _reconstruido: true para distinguirlo en la UI.
function _evoReconstruirMes(mesKey) {
  const cobrosMes = history.filter(h => (h.fecha || '').startsWith(mesKey));
  const totalCobradoServ = cobrosMes
    .filter(h => !h.tipo || h.tipo === 'servicio')
    .reduce((s, h) => s + Math.max(0, (h.monto || 0) - (h.montoEquipo || 0)), 0);
  const totalCobradoEquipo = cobrosMes.reduce((s, h) => s + (h.montoEquipo || 0), 0);
  const cobradoReal = totalCobradoServ + totalCobradoEquipo;

  const gastosMes = gastos.filter(g => (g.fecha || '').startsWith(mesKey));
  const pagoPaq = gastosMes.filter(g => g.categoria === 'paquete').reduce((s, g) => s + (g.monto || 0), 0);
  const gastosOp = gastosMes
    .filter(g => g.categoria !== 'paquete' && g.categoria !== 'inversion' && g.categoria !== 'rebaja')
    .reduce((s, g) => s + (g.monto || 0), 0);
  const inversionCap = gastosMes
    .filter(g => g.categoria === 'inversion' || g.categoria === 'rebaja')
    .reduce((s, g) => s + (g.monto || 0), 0);

  // Costo del paquete: si se pagó, usar el monto real; si no, estimar con
  // config actual (aproximación — el costo por mega pudo cambiar, pero es
  // lo mejor que podemos hacer sin snapshot).
  const costoPaquete = pagoPaq > 0 ? pagoPaq : (config.megas * config.costoPorMega);

  // Ingresos esperados del mes: no podemos saberlo con exactitud sin snapshot
  // (los clientes y precios cambiaron), así que usamos el cobrado + una
  // estimación de pendiente basada en los clientes que existen hoy.
  // Para la serie temporal, lo más útil y confiable es el cobrado real y la
  // ganancia real (caja). Los ingresos "esperados" se marcan como estimados.
  const gananciaReal = cobradoReal - pagoPaq - gastosOp;

  // Nº de cobros del mes como proxy de clientes activos que pagaron.
  const nCobros = cobrosMes.length;

  return {
    mes: mesKey,
    ingresos: 0,           // no reconstruible con precisión sin snapshot
    costoPaquete: costoPaquete,
    gastos: gastosOp,
    ganancia: gananciaReal, // usamos ganancia real como ganancia para reconstruidos
    margen: 0,
    cobrado: cobradoReal,
    cobradoEquipo: totalCobradoEquipo,
    pendiente: 0,           // no reconstruible sin el estado de clients en ese mes
    pagoPaquete: pagoPaq,
    gananciaReal: gananciaReal,
    inversionCapitalMes: inversionCap,
    nClientes: 0,           // no reconstruible
    nPagados: nCobros,
    nConMora: 0,            // no reconstruible
    tasaCobro: 0,
    megasVendidos: 0,       // no reconstruible
    _reconstruido: true
  };
}

// Devuelve la lista de meses (YYYY-MM) que tienen datos, ordenados asc.
// Incluye: meses con snapshot + meses que aparecen en history o gastos.
function _evoMesesConDatos() {
  const set = new Set();
  snapshots.forEach(s => set.add(s.mes));
  history.forEach(h => { if (h.fecha) set.add(h.fecha.substring(0, 7)); });
  gastos.forEach(g => { if (g.fecha) set.add(g.fecha.substring(0, 7)); });
  // Incluir siempre el mes actual.
  set.add(mesActualHoy());
  return Array.from(set).sort();
}

// Construye la serie temporal completa (array de puntos mensuales) para el
// rango seleccionado. Cada punto es un snapshot o un mes reconstruido.
function _evoConstruirSerie() {
  const todos = _evoMesesConDatos();
  if (!todos.length) return [];
  // Tomar los últimos N meses con datos.
  const recortado = todos.slice(-_evoRangoMeses);
  return recortado.map(mesKey => {
    const snap = getSnapshotMes(mesKey);
    if (snap) return snap;
    return _evoReconstruirMes(mesKey);
  });
}

// =============================================================================
//  KPIs DE TENDENCIA
// =============================================================================
function _evoKPIs(serie) {
  const conGan = serie.filter(s => s.gananciaReal != null);
  const ganancias = conGan.map(s => s.gananciaReal);
  const cobrados = serie.filter(s => s.cobrado > 0).map(s => s.cobrado);

  if (!ganancias.length) {
    return { mejor: null, peor: null, promedio: 0, totalCobrado: 0, tendencia: 0, nMeses: serie.length };
  }

  let mejor = conGan[0], peor = conGan[0];
  conGan.forEach(s => {
    if (s.gananciaReal > mejor.gananciaReal) mejor = s;
    if (s.gananciaReal < peor.gananciaReal) peor = s;
  });

  const promedio = Math.round(ganancias.reduce((s, v) => s + v, 0) / ganancias.length);
  const totalCobrado = cobrados.reduce((s, v) => s + v, 0);

  // Tendencia: comparar promedio de la primera mitad vs. segunda mitad.
  let tendencia = 0;
  if (ganancias.length >= 2) {
    const mid = Math.floor(ganancias.length / 2);
    const prim = ganancias.slice(0, mid);
    const seg = ganancias.slice(mid);
    const promPrim = prim.length ? prim.reduce((s, v) => s + v, 0) / prim.length : 0;
    const promSeg = seg.length ? seg.reduce((s, v) => s + v, 0) / seg.length : 0;
    tendencia = Math.round(promSeg - promPrim);
  }

  return { mejor, peor, promedio, totalCobrado, tendencia, nMeses: serie.length };
}

// =============================================================================
//  RENDER DEL GRÁFICO SVG (líneas múltiples)
// =============================================================================
function _evoRenderGrafico(serie) {
  const el = document.getElementById('evo-chart');
  if (!el) return;

  // Filtrar meses que tengan al menos un dato significativo.
  const datos = serie.filter(s => s.cobrado > 0 || s.gananciaReal !== 0 || s.pendiente > 0 || !s._reconstruido);

  if (!datos.length) {
    el.innerHTML = '<div class="empty-state" style="padding:30px 0">Aún no hay datos históricos. Registra cobros o guarda snapshots mensuales para ver la evolución.</div>';
    return;
  }

  // Series a graficar: gananciaReal, cobrado, pendiente (deuda).
  const series = [
    { key: 'gananciaReal', label: 'Ganancia', color: 'var(--green)', val: s => s.gananciaReal || 0 },
    { key: 'cobrado', label: 'Cobrado', color: 'var(--blue)', val: s => s.cobrado || 0 },
    { key: 'pendiente', label: 'Deuda pend.', color: 'var(--red)', val: s => s.pendiente || 0 }
  ];

  // Calcular máx absoluto para escalar (incluyendo negativos para ganancias).
  let maxVal = 1, minVal = 0;
  series.forEach(sr => {
    datos.forEach(s => {
      const v = sr.val(s);
      if (v > maxVal) maxVal = v;
      if (v < minVal) minVal = v;
    });
  });
  // Padding del 10%.
  const rango = maxVal - minVal || 1;
  maxVal += rango * 0.1;
  minVal -= rango * 0.1;

  const w = 720, h = 200, padX = 44, padTop = 28, padBottom = 32;
  const innerW = w - padX * 2;
  const innerH = h - padTop - padBottom;
  const stepX = datos.length > 1 ? innerW / (datos.length - 1) : 0;
  const curMes = mesActualHoy();

  // Función para mapear valor -> Y.
  function valY(v) {
    return padTop + innerH * (1 - (v - minVal) / (maxVal - minVal));
  }
  // Línea de cero (si el rango cruza cero).
  const hayCero = minVal < 0 && maxVal > 0;
  const ceroY = hayCero ? valY(0) : null;

  // Construir paths por serie.
  const paths = series.map(sr => {
    const pts = datos.map((s, i) => ({
      x: padX + i * stepX,
      y: valY(sr.val(s)),
      s: s
    }));
    const line = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' ');
    const area = line + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (h - padBottom) + ' L' + pts[0].x.toFixed(1) + ',' + (h - padBottom) + ' Z';
    return { sr, pts, line, area };
  });

  // Etiquetas de meses en eje X.
  const xLabels = datos.map((s, i) => {
    const x = padX + i * stepX;
    const esCur = s.mes === curMes;
    // Etiqueta corta: "ago" o "ago 25"
    const [y, m] = s.mes.split('-');
    const d = new Date(parseInt(y), parseInt(m) - 1, 15);
    const lbl = d.toLocaleDateString('es-CU', { month: 'short' });
    const anioCorto = y.substring(2);
    const mostrarAnio = i === 0 || m === '01';
    return '<text x="' + x.toFixed(1) + '" y="' + (h - 10) + '" text-anchor="middle" class="evo-x-label' + (esCur ? ' cur' : '') + '">' + (mostrarAnio ? lbl + " '" + anioCorto : lbl) + '</text>';
  }).join('');

  // Puntos y tooltips por serie.
  const puntos = paths.map(p => {
    return p.pts.map(pt => {
      const v = p.sr.val(pt.s);
      const vLbl = (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'K' : String(v));
      return '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="3" fill="' + p.sr.color + '"><title>' + p.sr.label + ' ' + labelMes(pt.s.mes) + ': ' + fmt(v) + '</title></circle>';
    }).join('');
  }).join('');

  // Grid lines horizontales (4 líneas).
  const grid = [];
  for (let i = 0; i <= 4; i++) {
    const v = minVal + (maxVal - minVal) * (1 - i / 4);
    const y = padTop + (innerH * i / 4);
    const vLbl = (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'K' : Math.round(v));
    grid.push('<line x1="' + padX + '" y1="' + y.toFixed(1) + '" x2="' + (w - padX) + '" y2="' + y.toFixed(1) + '" class="evo-grid"/>');
    grid.push('<text x="' + (padX - 6) + '" y="' + (y + 3).toFixed(1) + '" text-anchor="end" class="evo-y-label">' + vLbl + '</text>');
  }

  // Línea de cero destacada si cruza.
  let ceroLine = '';
  if (ceroY != null) {
    ceroLine = '<line x1="' + padX + '" y1="' + ceroY.toFixed(1) + '" x2="' + (w - padX) + '" y2="' + ceroY.toFixed(1) + '" class="evo-zero"/>';
  }

  // Definiciones de gradientes para áreas.
  const grads = series.map(sr =>
    '<linearGradient id="evoGrad-' + sr.key + '" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0%" stop-color="' + sr.color + '" stop-opacity="0.18"/>' +
    '<stop offset="100%" stop-color="' + sr.color + '" stop-opacity="0"/>' +
    '</linearGradient>'
  ).join('');

  // Paths SVG: áreas (semi-transparente) + líneas.
  const areasSvg = paths.map(p => '<path d="' + p.area + '" fill="url(#evoGrad-' + p.sr.key + ')" stroke="none"/>').join('');
  const linesSvg = paths.map(p => '<path d="' + p.line + '" fill="none" stroke="' + p.sr.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>').join('');

  // Leyenda.
  const leyenda = series.map(sr =>
    '<span class="evo-leyenda-item"><i style="background:' + sr.color + '"></i>' + sr.label + '</span>'
  ).join('');

  el.innerHTML =
    '<div class="evo-leyenda">' + leyenda + '</div>' +
    '<svg viewBox="0 0 ' + w + ' ' + h + '" class="evo-svg" preserveAspectRatio="xMidYMid meet">' +
    '<defs>' + grads + '</defs>' +
    grid.join('') +
    ceroLine +
    areasSvg +
    linesSvg +
    puntos +
    xLabels +
    '</svg>';
}

// =============================================================================
//  RENDER DE LA TABLA CRONOLÓGICA
// =============================================================================
function _evoRenderTabla(serie) {
  const el = document.getElementById('evo-tabla');
  if (!el) return;

  if (!serie.length) {
    el.innerHTML = '<div class="empty-state">Sin datos para mostrar</div>';
    return;
  }

  // Render en orden inverso (más reciente arriba).
  const invertida = [...serie].reverse();

  const filas = invertida.map((s, i) => {
    const anterior = invertida[i + 1]; // mes anterior (más viejo)
    const esReconstruido = s._reconstruido;

    function delta(actual, ant) {
      if (ant == null || ant === 0) return '<span class="evo-delta muted">—</span>';
      const diff = actual - ant;
      if (diff === 0) return '<span class="evo-delta muted">=</span>';
      const pct = Math.round(Math.abs(diff) / Math.abs(ant) * 100);
      const flecha = diff > 0 ? '▲' : '▼';
      const color = diff > 0 ? 'var(--green)' : 'var(--red)';
      return '<span class="evo-delta" style="color:' + color + '">' + flecha + ' ' + pct + '%</span>';
    }

    const ganColor = (s.gananciaReal || 0) >= 0 ? 'text-green' : 'text-red';
    const reconBadge = esReconstruido ? '<span class="evo-recon" title="Datos reconstruidos del historial (sin snapshot guardado)">⟳</span>' : '';

    return '<tr>' +
      '<td data-label="Mes"><strong>' + labelMes(s.mes) + '</strong> ' + reconBadge + '</td>' +
      '<td data-label="Cobrado" class="mono text-blue">' + fmt(s.cobrado || 0) + '</td>' +
      '<td data-label="Δ" class="evo-delta-cell">' + (anterior ? delta(s.cobrado || 0, anterior.cobrado || 0) : '<span class="evo-delta muted">—</span>') + '</td>' +
      '<td data-label="Ganancia" class="mono ' + ganColor + '">' + fmt(s.gananciaReal || 0) + '</td>' +
      '<td data-label="Δ" class="evo-delta-cell">' + (anterior ? delta(s.gananciaReal || 0, anterior.gananciaReal || 0) : '<span class="evo-delta muted">—</span>') + '</td>' +
      '<td data-label="Deuda" class="mono ' + ((s.pendiente || 0) > 0 ? 'text-red' : 'text-muted') + '">' + fmt(s.pendiente || 0) + '</td>' +
      '<td data-label="Gastos" class="mono">' + fmt((s.gastos || 0) + (s.pagoPaquete || 0)) + '</td>' +
      '<td data-label="Tasa" class="mono">' + (s.tasaCobro != null ? s.tasaCobro + '%' : '—') + '</td>' +
      '<td data-label="Clientes" class="mono">' + (s.nClientes > 0 ? s.nClientes : '—') + '</td>' +
      '<td data-label="Mora" class="mono">' + (s.nConMora > 0 ? s.nConMora : '—') + '</td>' +
      '</tr>';
  }).join('');

  el.innerHTML =
    '<div class="table-wrap" style="border:none;margin-bottom:0">' +
    '<table class="evo-tabla-table cards-mobile">' +
    '<thead><tr>' +
    '<th>Mes</th><th>Cobrado</th><th>Δ</th><th>Ganancia</th><th>Δ</th>' +
    '<th>Deuda pend.</th><th>Gastos</th><th>Tasa cobro</th><th>Clientes</th><th>Mora</th>' +
    '</tr></thead>' +
    '<tbody>' + filas + '</tbody>' +
    '</table></div>';
}

// =============================================================================
//  RENDER DE KPIs
// =============================================================================
function _evoRenderKPIs(serie, kpis) {
  const el = document.getElementById('evo-kpis');
  if (!el) return;

  if (!serie.length) {
    el.innerHTML = '';
    return;
  }

  const tendColor = kpis.tendencia > 0 ? 'var(--green)' : kpis.tendencia < 0 ? 'var(--red)' : 'var(--text-muted)';
  const tendFlecha = kpis.tendencia > 0 ? '▲' : kpis.tendencia < 0 ? '▼' : '—';
  const tendTxt = kpis.tendencia > 0 ? '+' : '';

  const mejorLbl = kpis.mejor ? labelMes(kpis.mejor.mes) : '—';
  const peorLbl = kpis.peor ? labelMes(kpis.peor.mes) : '—';
  const mejorVal = kpis.mejor ? fmt(kpis.mejor.gananciaReal) : '—';
  const peorVal = kpis.peor ? fmt(kpis.peor.gananciaReal) : '—';

  el.innerHTML =
    '<div class="evo-kpi-card"><div class="evo-kpi-label">Mejor mes</div><div class="evo-kpi-val text-green">' + mejorVal + '</div><div class="evo-kpi-sub">' + mejorLbl + '</div></div>' +
    '<div class="evo-kpi-card"><div class="evo-kpi-label">Peor mes</div><div class="evo-kpi-val text-red">' + peorVal + '</div><div class="evo-kpi-sub">' + peorLbl + '</div></div>' +
    '<div class="evo-kpi-card"><div class="evo-kpi-label">Promedio ganancia</div><div class="evo-kpi-val">' + fmt(kpis.promedio) + '</div><div class="evo-kpi-sub">por mes</div></div>' +
    '<div class="evo-kpi-card"><div class="evo-kpi-label">Tendencia</div><div class="evo-kpi-val" style="color:' + tendColor + '">' + tendFlecha + ' ' + tendTxt + fmt(kpis.tendencia) + '</div><div class="evo-kpi-sub">2ª vs 1ª mitad</div></div>' +
    '<div class="evo-kpi-card"><div class="evo-kpi-label">Total cobrado</div><div class="evo-kpi-val text-blue">' + fmt(kpis.totalCobrado) + '</div><div class="evo-kpi-sub">' + kpis.nMeses + ' meses</div></div>';
}

// =============================================================================
//  RENDER PRINCIPAL
// =============================================================================
function renderEvolucionHistorica() {
  const serie = _evoConstruirSerie();
  const kpis = _evoKPIs(serie);
  _evoRenderKPIs(serie, kpis);
  _evoRenderGrafico(serie);
  _evoRenderTabla(serie);
}

// Cambia el rango de meses visible y re-renderiza.
function evoCambiarRango(n) {
  _evoRangoMeses = n;
  // Actualizar botones activos.
  document.querySelectorAll('.evo-rango-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.rango) === n);
  });
  renderEvolucionHistorica();
}
