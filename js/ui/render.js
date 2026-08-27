/**
 * ui/render.js — Render principal de tablas/tarjetas de clientes y vistas.
 * Depende de calculations.js (usa funciones de cálculo).
 */
RN.render = RN.render || {};

/** Escape HTML. */
RN.render.esc = function (s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
};

/** Badge de estado de cliente. */
RN.render.badgeEstado = function (estado) {
  const map = { ok: ['ok', 'Al día'], warn: ['warn', 'Por vencer'], due: ['due', 'Atrasado'], paid: ['paid', 'Pagado'], parcial: ['parcial', 'Pago parcial'], 'por-iniciar': ['por-iniciar', 'Por iniciar'] };
  const [cls, txt] = map[estado] || ['muted', estado];
  return `<span class="badge ${cls}">${txt}</span>`;
};

/** Busca plan por id. v5.8.8: el personalizado muestra sus megas si los tiene. */
RN.render.nombrePlan = function (cliente) {
  if (cliente.planId) {
    const p = RN.state.planes.find(pl => pl.id === cliente.planId);
    if (p) return `${RN.render.esc(p.nombre)} · ${p.megas || '?'}M`;
  }
  const m = RN.calc.getMegasCliente(cliente);
  return m > 0 ? `Personalizado · ${m}M` : 'Personalizado';
};

/** Alterna la expansión de una tarjeta accordion (cintilla colapsable). */
RN.render.toggleCard = function (cardId) {
  var el = document.getElementById(cardId);
  if (!el) return;
  el.classList.toggle('open');
};

/**
 * v5.12.6 — Compara dos direcciones IP (IPv4) en orden natural numérico.
 * Convierte cada octeto a número para que 10.10.10.2 vaya antes que
 * 10.10.10.10 (a diferencia del orden alfabético de strings).
 * Soporta IPs parciales (1, 2 o 3 octetos) comparando octeto a octeto;
 * los octetos ausentes se tratan como 0.
 * @returns {number} -1, 0, 1 (estilo sort)
 */
RN.render.compararIP = function (a, b) {
  var pa = String(a || '').split('.');
  var pb = String(b || '').split('.');
  var len = Math.max(pa.length, pb.length);
  for (var i = 0; i < len; i++) {
    var na = parseInt(pa[i], 10);
    var nb = parseInt(pb[i], 10);
    if (isNaN(na)) na = 0;
    if (isNaN(nb)) nb = 0;
    if (na !== nb) return na - nb;
  }
  return 0;
};

/**
 * v5.12.6 — Compara dos clientes por IP (orden natural de IP).
 * Los clientes SIN ip van al final. Entre los que no tienen ip, se
 * ordenan por nombre (ascendente) como criterio secundario estable.
 * @returns {number} -1, 0, 1 (estilo sort)
 */
RN.render.compararClientePorIP = function (a, b) {
  var aIp = a && a.ip ? String(a.ip).trim() : '';
  var bIp = b && b.ip ? String(b.ip).trim() : '';
  if (!aIp && !bIp) {
    // Sin IP ambos: orden por nombre
    return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
  }
  if (!aIp) return 1;   // a sin IP → va al final
  if (!bIp) return -1;  // b sin IP → va al final
  return RN.render.compararIP(aIp, bIp);
};

/** Render completo: refresca todas las vistas. */
RN.render.todo = function () {
  ['dashboard', 'clientes', 'cobros', 'realizados', 'inversion', 'inventario', 'gastos', 'reportes', 'calendario', 'descuentos', 'salud'].forEach(v => {
    RN.render.vista(v);
  });
  RN.config.rellenarForm();
  // v5.12.7: refrescar el indicador visual de estado de la tasa en Ajustes
  if (RN.tasaAviso) RN.tasaAviso.actualizarIndicador();
  RN.storageFile.actualizarStatus();
};

/** Render de una vista específica. */
RN.render.vista = function (view) {
  switch (view) {
    case 'dashboard': RN.render.dashboard(); break;
    case 'clientes': RN.render.clientes(); break;
    case 'cobros': RN.render.cobros(); break;
    case 'realizados': RN.render.realizados(); break;
    case 'inversion': RN.render.inversion(); break;
    case 'inventario': RN.render.inventario(); break;
    case 'gastos': RN.render.gastos(); break;
    case 'reportes': RN.render.reportes(); break;
    case 'calendario': RN.calendario && RN.calendario.render(); break;
    case 'descuentos': RN.descuentosView && RN.descuentosView.render(); break;
    case 'salud': RN.salud && RN.salud.render(); break;
  }
};

// ---------- DASHBOARD ----------

/**
 * v5.12.6 — Construye el texto "sub" de una tarjeta KPI con el equivalente
 * en USD (en letras pequeñas) cuando hay tasa configurada. Si ya hay un sub
 * textual, lo antepone. Si no hay tasa, devuelve el sub original.
 * @param {number} cup - monto en CUP
 * @param {string} subTxt - texto descriptivo original (opcional)
 * @returns {string} HTML para el div .sub
 */
RN.render.subUSD = function (cup, subTxt) {
  var usd = RN.moneda.aUSD(cup);
  var parts = [];
  if (subTxt) parts.push(RN.render.esc(subTxt));
  if (usd) parts.push(usd + ' USD');
  return parts.join(' · ');
};

/**
 * v5.12.6 — Genera el HTML de la barra horizontal animada de recuperación
 * de la inversión, con los datos resumidos (invertido, recuperado, %, faltante).
 * Reutiliza los estilos .recup-* definidos en styles.css.
 * @returns {string} HTML del bloque
 */
RN.render.barraRecuperacion = function () {
  var invertido = RN.investment.totalInvertido();
  var recuperado = RN.investment.totalRecuperado();
  var pct = RN.investment.porcentajeRecuperacion();
  // Limitar el ancho visual a 100% aunque el % supere 100 (recuperada)
  var pctVisual = Math.min(100, Math.max(0, pct));
  var faltante = Math.max(0, +(invertido - recuperado).toFixed(2));

  // Color de la barra según progreso
  var cls = 'recup-green';
  if (pct >= 100) cls = 'recup-green';
  else if (pct >= 60) cls = 'recup-green';
  else if (pct >= 30) cls = 'recup-amber';
  else cls = 'recup-red';

  var estadoTxt;
  if (invertido <= 0) estadoTxt = '<span class="muted">Sin inversiones registradas</span>';
  else if (pct >= 100) estadoTxt = '<span style="color:var(--green)">✓ Inversión recuperada</span>';
  else estadoTxt = '<span class="muted">En proceso de recuperación</span>';

  var html = '';
  html += '<div class="recup-card">';
  html += '  <div class="recup-head">';
  html += '    <div class="recup-titulo"><span class="recup-ico">📈</span> <strong>Recuperación de la inversión</strong></div>';
  html += '    <div class="recup-pct"><strong>' + pct + '%</strong></div>';
  html += '  </div>';
  html += '  <div class="recup-bar"><div class="recup-fill ' + cls + '" data-pct="' + pctVisual + '" style="width:0%"></div></div>';
  html += '  <div class="recup-datos">';
  html += '    <div class="recup-dato"><span class="muted">Invertido</span><strong>' + RN.calc.formatCUP(invertido) + '</strong></div>';
  html += '    <div class="recup-dato"><span class="muted">Recuperado</span><strong style="color:var(--green)">' + RN.calc.formatCUP(recuperado) + '</strong></div>';
  html += '    <div class="recup-dato"><span class="muted">Por recuperar</span><strong style="color:var(--danger)">' + RN.calc.formatCUP(faltante) + '</strong></div>';
  html += '  </div>';
  html += '  <div class="recup-estado">' + estadoTxt + '</div>';
  html += '</div>';
  return html;
};

/**
 * v5.12.6 — Dispara la animación de las barras de recuperación presentes
 * en el DOM. Busca todos los .recup-fill con data-pct y anima el ancho
 * desde 0% hasta el valor objetivo usando requestAnimationFrame.
 */
RN.render.animarBarrasRecuperacion = function () {
  var barras = document.querySelectorAll('.recup-fill[data-pct]');
  barras.forEach(function (barra) {
    var objetivo = parseFloat(barra.getAttribute('data-pct')) || 0;
    if (objetivo <= 0) { barra.style.width = '0%'; return; }
    var inicio = null;
    var duracion = 900; // ms
    function paso(ts) {
      if (!inicio) inicio = ts;
      var progreso = Math.min(1, (ts - inicio) / duracion);
      // ease-out cubic
      var eased = 1 - Math.pow(1 - progreso, 3);
      barra.style.width = (objetivo * eased) + '%';
      if (progreso < 1) requestAnimationFrame(paso);
      else barra.style.width = objetivo + '%';
    }
    requestAnimationFrame(paso);
  });
};

RN.render.dashboard = function () {
  const cont = document.getElementById('kpi-dashboard');
  if (!cont) return;
  const cob = RN.calc.cobranzaMes();
  const ingresos = RN.calc.ingresosMes();
  const gastos = RN.calc.gastosMes();
  const utilidad = ingresos - gastos;
  const esperado = RN.calc.ingresoEsperadoMes();
  const tasaCob = esperado ? Math.round(ingresos / esperado * 100) : 0;
  // v5.10.5: mora real = clientes con meses de atraso (getMora > 0).
  const morosos = RN.calc.clientesActivos().filter(c => RN.calc.getMora(c) > 0).length;

  const parciales = cob.parciales || 0;
  const fondoCaja = RN.calc.fondoCaja();
  // v5.12.3: costo del paquete del proveedor y ganancia bruta del mes
  const costoPaquete = RN.calc.montoPaqueteProveedor();
  const gananciaBruta = ingresos - costoPaquete;
  // v5.12.6: ganancia proyectada del mes = ingreso esperado (lo que deberían
  // pagar todos los clientes activos) − costo del paquete del proveedor.
  const gananciaProyectada = esperado - costoPaquete;
  // v5.10.4: KPIs clicables. Cobranza, Clientes morosos y Fondo de caja
  // abren ventanas superpuestas al hacer click. Las demas no son clicables.
  // v5.12.6 (propuesta A): orden lógico — esperado antes que real.
  //   Ingresos del mes → Costo del paquete → Ganancia proyectada
  //   → Ganancia del mes (real cobrada) → Utilidad neta → ...
  // v5.12.6: todas las tarjetas con monto CUP muestran su equivalente en USD
  // (en letras pequeñas) cuando hay tasa configurada.
  const kpis = [
    { label: 'Ingresos del mes', value: RN.calc.formatCUP(ingresos), sub: RN.render.subUSD(ingresos), cls: 'green' },
    { label: 'Costo del paquete', value: RN.calc.formatCUP(costoPaquete), sub: costoPaquete > 0 ? RN.render.subUSD(costoPaquete, (RN.state.config.proveedorMegas || 0) + 'M × ' + (RN.state.config.proveedorPrecioMega || 0) + ' CUP/M') : 'Sin paquete configurado', cls: 'amber' },
    { label: 'Ganancia proyectada del mes', value: RN.calc.formatCUP(gananciaProyectada), sub: RN.render.subUSD(gananciaProyectada, 'Ingreso esperado − Costo del paquete'), cls: gananciaProyectada >= 0 ? 'green' : 'red' },
    { label: 'Ganancia del mes', value: RN.calc.formatCUP(gananciaBruta), sub: RN.render.subUSD(gananciaBruta, 'Cobrado − Costo del paquete'), cls: gananciaBruta >= 0 ? 'blue' : 'red' },
    { label: 'Utilidad neta', value: RN.calc.formatCUP(utilidad), sub: RN.render.subUSD(utilidad, 'Ingresos − Gastos'), cls: utilidad >= 0 ? 'blue' : 'red' },
    { label: 'Cobranza', value: cob.pagaron + '/' + cob.total, sub: 'Faltan ' + cob.faltan + ' clientes' + (parciales ? ' · ' + parciales + ' parcial' : '') + ' — toca para ver corte vigente', cls: 'blue', click: 'RN.cobranza.abrir()' },
    { label: 'Tasa de cobro', value: tasaCob + '%', sub: 'Sobre lo esperado', cls: tasaCob >= 70 ? 'green' : (tasaCob >= 40 ? 'amber' : 'red') },
    { label: 'Clientes morosos', value: morosos, sub: morosos ? 'Atrasados — toca para ver detalles' : 'Ninguno atrasado', cls: morosos ? 'red' : 'green', click: 'RN.mora.abrir()' },
    { label: 'Fondo de caja', value: RN.calc.formatCUP(fondoCaja), sub: RN.render.subUSD(fondoCaja, 'Ganancia acumulada — toca para retirar'), cls: fondoCaja > 0 ? 'green' : (fondoCaja < 0 ? 'red' : 'muted'), click: 'RN.caja.extraer()' }
  ];
  cont.innerHTML = kpis.map(k => {
    const attr = k.click ? ` role="button" tabindex="0" onclick="${k.click}" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();${k.click}}" class="kpi ${k.cls} kpi-click"` : ` class="kpi ${k.cls}"`;
    return `<div${attr}><div class="label">${k.label}</div><div class="value">${k.value}</div><div class="sub">${k.sub}</div></div>`;
  }).join('');
  const res = document.getElementById('dashboard-resumen');
  if (res) {
    const totalInv = RN.investment.totalInvertido();
    const recInv = RN.investment.totalRecuperado();
    res.innerHTML = `
      <div class="flex wrap" style="gap:24px">
        <div><strong>Clientes activos:</strong> ${RN.calc.clientesActivos().length}</div>
        <div><strong>Planes:</strong> ${RN.state.planes.length}</div>
        <div><strong>Inversión recuperada:</strong> ${RN.investment.porcentajeRecuperacion()}%</div>
        <div><strong>Predicción próximo mes:</strong> ${RN.calc.formatCUP(RN.calc.prediccionIngresos())}</div>
      </div>`;
  }

  // v5.12.6: Barra animada de recuperación de la inversión.
  // Se oculta la card completa si no hay inversiones registradas.
  const recupEl = document.getElementById('dashboard-recuperacion');
  const recupCard = document.getElementById('card-recuperacion');
  if (recupEl && recupCard) {
    if (RN.investment.totalInvertido() > 0) {
      recupCard.style.display = '';
      recupEl.innerHTML = RN.render.barraRecuperacion();
    } else {
      recupCard.style.display = 'none';
    }
  }

  // Widget: Pago del servicio de internet al proveedor (v5.8.6)
  const prov = document.getElementById('dashboard-proveedor');
  if (prov) {
    const cfg = RN.state.config;
    const montoPaquete = RN.calc.montoPaqueteProveedor();
    const pagoMes = RN.calc.pagoProveedorMes();
    const tieneConfig = montoPaquete > 0 || cfg.proveedorInternet;
    let html = '<div class="prov-widget-head">📡 <strong>Servicio de internet</strong> <span class="muted" style="font-size:11px;font-weight:400">(gestiona y paga aquí)</span></div>';
    if (cfg.proveedorInternet) {
      html += '<div class="prov-widget-row"><span class="muted">Proveedor:</span> <strong>' + RN.render.esc(cfg.proveedorInternet) + '</strong></div>';
    }
    if (cfg.proveedorMegas > 0 || cfg.proveedorPrecioMega > 0) {
      html += '<div class="prov-widget-row"><span class="muted">Paquete:</span> <strong>' + (cfg.proveedorMegas || 0) + ' Megas × ' + (cfg.proveedorPrecioMega || 0) + ' CUP/M = ' + RN.calc.formatCUP(montoPaquete) + '</strong></div>';
    }
    if (pagoMes) {
      const fecha = pagoMes.fecha ? new Date(pagoMes.fecha).toLocaleDateString('es-CU') : '';
      // v5.12.3: Detectar si el paquete config cambio desde el ultimo pago.
      // Mostrar el paquete actual (config) claramente y senalar la diferencia.
      const megasPagados = +pagoMes.megas || 0;
      const precioPagado = +pagoMes.precioMega || 0;
      const paqueteCambio = (megasPagados !== (+cfg.proveedorMegas || 0)) || (precioPagado !== (+cfg.proveedorPrecioMega || 0));
      html += '<div class="prov-widget-row prov-paid"><span class="badge paid">✓ Pagado este mes</span> <span class="muted">' + RN.calc.formatCUP(pagoMes.monto) + ' · ' + fecha + '</span></div>';
      if (paqueteCambio) {
        html += '<div class="prov-widget-row" style="color:#e6a700"><span class="badge warn" style="margin-right:6px">Paquete actualizado</span> <span class="muted">Pagaste ' + megasPagados + 'M × ' + precioPagado + ' CUP/M. El paquete actual es ' + (cfg.proveedorMegas || 0) + 'M × ' + (cfg.proveedorPrecioMega || 0) + ' CUP/M = ' + RN.calc.formatCUP(montoPaquete) + '.</span></div>';
        html += '<div class="prov-widget-actions"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">Gestionar y pagar</button></div>';
      } else {
        html += '<div class="prov-widget-actions"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">Gestionar servicio</button></div>';
      }
    } else if (tieneConfig) {
      html += '<div class="prov-widget-row prov-due"><span class="badge due">Pendiente este mes</span> <span class="muted">' + (montoPaquete > 0 ? 'A pagar: ' + RN.calc.formatCUP(montoPaquete) : 'Configura megas y precio') + '</span></div>';
      html += '<div class="prov-widget-actions"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">📡 Gestionar servicio</button></div>';
    } else {
      html += '<div class="prov-widget-row"><span class="muted">Aún no has registrado el servicio de tu proveedor.</span></div>';
      html += '<div class="prov-widget-actions"><button class="btn sm primary" onclick="RN.paqueteProveedor.abrir()">📡 Registrar mi servicio</button></div>';
    }

    // Indicador de capacidad vendida vs tope (v5.8.7)
    if (cfg.proveedorMegas > 0) {
      const cap = RN.calc.estadoCapacidad();
      const cls = cap.excedido ? 'bar-red' : (cap.pct >= 80 ? 'bar-amber' : 'bar-green');
      const estadoTxt = cap.excedido
        ? '<span style="color:#c62828">⚠ Excedido</span>'
        : (cap.pct >= 80 ? '<span style="color:#e6a700">Cerca del tope</span>' : '<span style="color:#2e7d32">✓ Capacidad ok</span>');
      html += '<div class="prov-cap">';
      html += '<div class="prov-cap-label"><span class="muted">Capacidad de red</span> <strong>' + cap.vendidos + 'M vendidos / ' + cap.tope + 'M</strong> (' + cap.pct + '%) ' + estadoTxt + '</div>';
      html += '<div class="prov-cap-bar"><div class="prov-cap-fill ' + cls + '" style="width:' + (cap.pct || 1) + '%"></div></div>';
      html += '<div class="prov-cap-sub muted">' + cap.paquete + 'M paquete + ' + cap.sobreventa + 'M sobreventa = ' + cap.tope + 'M tope vendible</div>';
      html += '</div>';
    }

    // v5.12.4: Aviso de paquete pendiente para el próximo mes
    if (cfg.paquetePendiente) {
      const pp = cfg.paquetePendiente;
      const mesProx = RN.calc.mesSiguiente(RN.calc.mesActualStr());
      html += '<div class="prov-widget-row" style="color:#1565c0;border-top:1px solid var(--border);padding-top:8px;margin-top:4px">';
      html += '<span class="badge" style="background:#e3f2fd;color:#1565c0;margin-right:6px">⏳ Pendiente para ' + RN.calc.mesTexto(mesProx) + '</span>';
      html += '<span class="muted">Próximo paquete: ' + (pp.megas || 0) + 'M × ' + (pp.precioMega || 0) + ' CUP/M';
      if (pp.sobreventa !== undefined) html += ' · sobreventa ' + pp.sobreventa + 'M';
      html += '. Se aplicará al cerrar el mes.</span></div>';
    }
    prov.innerHTML = html;
  }

  // v5.10.4: El widget grande "💵 Fondo de caja" se elimina del panel principal.
  // El acceso al fondo de caja (retiros) ahora se hace desde la KPI clicable.

  // v5.12.6: disparar la animación de las barras de recuperación tras pintarlas.
  // requestAnimationFrame asegura que el DOM ya tenga width:0% antes de animar.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(RN.render.animarBarrasRecuperacion);
  } else {
    RN.render.animarBarrasRecuperacion();
  }
};

// ---------- CLIENTES ----------
RN.render.clientes = function () {
  const cont = document.getElementById('lista-clientes');
  if (!cont) return;
  const q = (document.getElementById('search-clientes') || {}).value || '';
  const fe = (document.getElementById('filter-estado') || {}).value || '';
  let lista = RN.state.clients.filter(c => {
    if (q) {
      const s = (c.nombre + ' ' + (c.telefono || '') + ' ' + (c.direccion || '') + ' ' + (c.ip || '')).toLowerCase();
      if (!s.includes(q.toLowerCase())) return false;
    }
    if (fe && RN.calc.getStatus(c) !== fe) return false;
    return true;
  });

  // v5.12.6: ordenar siempre por IP (orden natural numérico).
  // Los clientes sin IP van al final, ordenados por nombre entre sí.
  lista.sort(RN.render.compararClientePorIP);

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">👥</div>No hay clientes. Crea el primero con "+ Nuevo cliente".</div>';
    return;
  }

  cont.innerHTML = lista.map(c => {
    const estado = RN.calc.getStatus(c);
    const deuda = RN.investment.getDeudaEquipoCliente(c);
    const neto = RN.calc.getPrecioNeto(c);
    const cuotaEq = RN.investment.getCuotaEquipoCliente(c);
    const total = neto + cuotaEq;
    const ipHtml = c.ip ? '<span class="acc-ip">' + RN.render.esc(c.ip) + '</span>' : '';
    const telHtml = c.telefono ? RN.render.esc(c.telefono) : '';
    const subParts = [];
    if (telHtml) subParts.push(telHtml);
    if (ipHtml) subParts.push(ipHtml);
    if (!subParts.length) subParts.push('<span class="muted">Sin datos</span>');

    return '<div class="acc-card" id="acc-cli-' + c.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cli-' + c.id + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre) + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join('') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt">' + RN.calc.formatCUP(total) + '</div>' +
          '<div class="lbl">Total</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan</span><span class="acc-value">' + RN.render.nombrePlan(c) + '<br><span class="muted" style="font-size:12px">' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Dirección</span><span class="acc-value">' + (c.direccion ? RN.render.esc(c.direccion) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Pago día</span><span class="acc-value">Día ' + (c.diaPago || 1) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-actions">' +
          '<button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + c.id + '\')">Cobrar</button>' +
          '<button class="btn sm" onclick="RN.clientHistory.abrir(\'' + c.id + '\')">Historial</button>' +
          '<button class="btn sm" onclick="RN.whatsapp.enviarRecordatorio(\'' + c.id + '\')">WhatsApp</button>' +
          '<button class="btn sm" onclick="RN.equiposRed.abrir(\'' + c.id + '\')">Equipos</button>' +
          '<button class="btn sm" onclick="RN.modalCliente.editar(\'' + c.id + '\')">Editar</button>' +
          '<button class="btn sm danger" onclick="RN.confirmDelete.cliente(\'' + c.id + '\')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
// ---------- COBROS ----------
RN.render.cobros = function () {
  const cont = document.getElementById('lista-cobros');
  if (!cont) return;
  const q = (document.getElementById('search-cobros') || {}).value || '';
  let lista = RN.calc.clientesActivos();
  if (q) lista = lista.filter(c => c.nombre.toLowerCase().includes(q.toLowerCase()));

  if (!lista.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💳</div>No hay clientes activos.</div>';
    return;
  }
  // ordenar: morosos primero
  lista.sort((a, b) => {
    const oa = { due: 0, warn: 1, parcial: 2, ok: 3, paid: 4, 'por-iniciar': 5 }[RN.calc.getStatus(a)];
    const ob = { due: 0, warn: 1, parcial: 2, ok: 3, paid: 4, 'por-iniciar': 5 }[RN.calc.getStatus(b)];
    return oa - ob;
  });

  cont.innerHTML = lista.map(c => {
    const estado = RN.calc.getStatus(c);
    const neto = RN.calc.getPrecioNeto(c);
    const cuotaEq = RN.investment.getCuotaEquipoCliente(c);
    const total = neto + cuotaEq;
    const deuda = RN.investment.getDeudaEquipoCliente(c);
    const ipHtml = c.ip ? '<span class="acc-ip">' + RN.render.esc(c.ip) + '</span>' : '';
    const planSub = RN.render.nombrePlan(c) + ' · ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c));
    const subParts = [planSub];
    if (ipHtml) subParts.push(ipHtml);

    var accBtn;
    if (estado === 'paid') {
      accBtn = '<span class="badge paid">Pagado</span>';
    } else if (estado === 'parcial') {
      accBtn = '<span class="badge parcial">Pago parcial</span> <button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + c.id + '\')">Completar pago</button>';
    } else {
      accBtn = '<button class="btn sm primary" onclick="RN.modalCobro.abrir(\'' + c.id + '\')">Cobrar ' + RN.calc.formatCUP(total) + '</button>';
    }

    return '<div class="acc-card" id="acc-cob-' + c.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-cob-' + c.id + '\')">' +
        '<span class="acc-dot ' + estado + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(c.nombre) + '</div>' +
          '<div class="acc-summary-sub">' + subParts.join('') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt ' + (estado === 'paid' ? 'paid' : '') + '">' + (estado === 'paid' ? 'Pagado' : RN.calc.formatCUP(total)) + '</div>' +
          '<div class="lbl">' + (cuotaEq > 0 ? 'Total (+equipo)' : 'A cobrar') + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Plan / Precio</span><span class="acc-value">' + RN.render.nombrePlan(c) + '<br><span class="muted" style="font-size:12px">Base: ' + RN.calc.formatCUP(RN.calc.getPrecioBase(c)) + '</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Teléfono</span><span class="acc-value">' + (c.telefono ? RN.render.esc(c.telefono) : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">IP / Red</span><span class="acc-value">' + (c.ip ? '<span style="font-family:monospace">' + RN.render.esc(c.ip) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Día de pago</span><span class="acc-value">Día ' + (c.diaPago || 1) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Estado</span><span class="acc-value">' + RN.render.badgeEstado(estado) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Neto a cobrar</span><span class="acc-value">' + RN.calc.formatCUP(neto) + (cuotaEq > 0 ? ' <span class="pill">+ equipo ' + RN.calc.formatCUP(cuotaEq) + '</span>' : '') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Saldo equipo</span><span class="acc-value">' + (deuda > 0 ? '<span class="badge due">' + RN.calc.formatCUP(deuda) + '</span>' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-actions">' + accBtn + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
// ---------- REALIZADOS (Historial de cobros) ----------
// v5.12.3: Historial agrupado por mes en cintillas colapsables.
RN.render.realizados = function () {
  var cont = document.getElementById('kpi-realizados');
  var listEl = document.getElementById('lista-realizados');
  if (!listEl) return;

  if (cont) {
    var total = RN.state.history.reduce(function (s, h) { return s + (h.totalCUP || ((h.monto || 0) + (h.montoEquipo || 0))); }, 0);
    var count = RN.state.history.length;
    var completos = RN.state.history.filter(function (h) { return h.tipoPago === 'completo'; }).length;
    var parciales = RN.state.history.filter(function (h) { return h.tipoPago === 'parcial'; }).length;
    var excedentes = RN.state.history.filter(function (h) { return h.tipoPago === 'excedente'; }).length;
    cont.innerHTML = [
      { label: 'Total cobrado', value: RN.calc.formatCUP(total), cls: 'green' },
      { label: 'Cobros realizados', value: count, cls: 'blue' },
      { label: 'Completos', value: completos, cls: 'green' },
      { label: 'Parciales', value: parciales, cls: 'amber' },
      { label: 'Con excedente', value: excedentes, cls: 'blue' }
    ].map(function (k) { return '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>'; }).join('');
  }

  var selMes = document.getElementById('filtro-realizados-mes');
  if (selMes && selMes.children.length <= 1) {
    var meses = {};
    RN.state.history.forEach(function (h) { var m = (h.fecha || '').slice(0, 7); if (m) meses[m] = true; });
    Object.keys(meses).sort().reverse().forEach(function (m) {
      var opt = document.createElement('option');
      opt.value = m;
      opt.textContent = RN.calc.mesTexto(m);
      selMes.appendChild(opt);
    });
  }
  var q = (document.getElementById('search-realizados') || {}).value || '';
  var mesSel = selMes ? selMes.value : '';

  var lista = RN.state.history.slice().sort(function (a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
  if (mesSel) lista = lista.filter(function (h) { return (h.fecha || '').slice(0, 7) === mesSel; });
  if (q) {
    var ql = q.toLowerCase();
    lista = lista.filter(function (h) {
      var cli = RN.state.clients.find(function (c) { return c.id === h.clienteId; });
      var nombre = cli ? cli.nombre : '';
      return nombre.toLowerCase().indexOf(ql) >= 0 || (h.recibo || '').toLowerCase().indexOf(ql) >= 0;
    });
  }

  if (!lista.length) {
    listEl.innerHTML = '<div class="acc-empty"><div class="icon">\u{1F4B0}</div>No hay cobros registrados.</div>';
    return;
  }

  // v5.12.3: Agrupar por mes (YYYY-MM) en cintillas colapsables.
  // Cada cintilla es un mes con su total; dentro van los cobros de ese mes.
  var grupos = {};
  var ordenMeses = [];
  lista.forEach(function (h) {
    var mesKey = (h.fecha || '').slice(0, 7) || 'sin-fecha';
    if (!grupos[mesKey]) { grupos[mesKey] = []; ordenMeses.push(mesKey); }
    grupos[mesKey].push(h);
  });
  // ordenMeses ya viene ordenado descendente porque lista esta ordenada por fecha desc
  // y solo anadimos la clave la primera vez que aparece.
  ordenMeses.sort().reverse();

  // Helper para renderizar un cobro individual (acc-card dentro de la cintilla)
  function renderCobro(h) {
    var cli = RN.state.clients.find(function (c) { return c.id === h.clienteId; });
    var nombre = cli ? RN.render.esc(cli.nombre) : '<span class="muted">Cliente eliminado</span>';
    var total = h.totalCUP || ((h.monto || 0) + (h.montoEquipo || 0));
    var concepto = h.tipo === 'equipo' ? 'Pago de equipo' : 'Servicio mensual';
    if (h.montoEquipo > 0 && h.tipo === 'servicio') concepto += ' + equipo';

    var tipoBadge;
    if (h.tipoPago === 'completo') tipoBadge = '<span class="badge paid">Completo</span>';
    else if (h.tipoPago === 'parcial') tipoBadge = '<span class="badge parcial">Parcial</span>';
    else if (h.tipoPago === 'excedente') tipoBadge = '<span class="badge paid">Con vuelto</span>';
    else tipoBadge = '<span class="badge paid">Completo</span>';

    var monedaTxt = h.moneda || 'CUP';
    var reciboTxt = h.recibo ? '<span class="pill">#' + RN.render.esc(h.recibo) + '</span>' : '<span class="muted">—</span>';

    return '<div class="acc-card" id="acc-real-' + h.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-real-' + h.id + '\')">' +
        '<span class="acc-dot paid"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + nombre + '</div>' +
          '<div class="acc-summary-sub">' + RN.render.esc((h.fecha || '').slice(0, 16)) + ' · ' + concepto + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt">' + RN.calc.formatCUP(total) + '</div>' +
          '<div class="lbl">' + monedaTxt + '</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Fecha</span><span class="acc-value">' + RN.render.esc((h.fecha || '').slice(0, 16)) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Cliente</span><span class="acc-value">' + nombre + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Concepto</span><span class="acc-value">' + concepto + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Monto</span><span class="acc-value">' + RN.calc.formatCUP(total) + (h.excedente ? ' <span class="muted" style="font-size:11px">(vuelto ' + RN.calc.formatCUP(h.excedente) + ')</span>' : '') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Moneda</span><span class="acc-value">' + monedaTxt + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Tipo</span><span class="acc-value">' + tipoBadge + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Recibo</span><span class="acc-value">' + reciboTxt + '</span></div>' +
      '</div>' +
    '</div>';
  }

  // Construir las cintillas (una por mes)
  var htmlCintillas = ordenMeses.map(function (mesKey) {
    var cobrosMes = grupos[mesKey];
    var totalMes = cobrosMes.reduce(function (s, h) { return s + (h.totalCUP || ((h.monto || 0) + (h.montoEquipo || 0))); }, 0);
    var nombreMes = mesKey === 'sin-fecha' ? 'Sin fecha' : RN.calc.mesTexto(mesKey);
    var cintillaId = 'cintilla-mes-' + mesKey;
    // La cintilla del mes mas reciente empieza abierta
    var abierta = (mesKey === ordenMeses[0]) ? ' cintilla-mes-open' : '';
    var chevron = abierta ? ' ▲' : ' ▼';

    var cobrosHtml = cobrosMes.map(renderCobro).join('');

    return '<div class="cintilla-mes' + abierta + '" id="' + cintillaId + '">' +
      '<div class="cintilla-mes-head" onclick="RN.render.toggleCintillaMes(\'' + cintillaId + '\')">' +
        '<span class="cintilla-mes-icon">\u{1F4C5}</span>' +
        '<div class="cintilla-mes-titulo">' +
          '<div class="cintilla-mes-nombre">' + RN.render.esc(nombreMes) + '</div>' +
          '<div class="cintilla-mes-sub">' + cobrosMes.length + ' cobro' + (cobrosMes.length !== 1 ? 's' : '') + ' · ' + RN.calc.formatCUP(totalMes) + '</div>' +
        '</div>' +
        '<span class="cintilla-mes-chevron">' + chevron + '</span>' +
      '</div>' +
      '<div class="cintilla-mes-body">' + cobrosHtml + '</div>' +
    '</div>';
  }).join('');

  listEl.innerHTML = htmlCintillas;
};

// v5.12.3: Alterna la expansion de una cintilla de mes en el historial de cobros.
RN.render.toggleCintillaMes = function (cintillaId) {
  var el = document.getElementById(cintillaId);
  if (!el) return;
  var isOpen = el.classList.toggle('cintilla-mes-open');
  var chev = el.querySelector('.cintilla-mes-chevron');
  if (chev) chev.textContent = isOpen ? ' ▲' : ' ▼';
};

// ---------- INVERSION ----------
RN.render.inversion = function () {
  const kpi = document.getElementById('kpi-inversion');
  const pctPersonal = RN.investment.pctPersonal();
  if (kpi) {
    kpi.innerHTML = [
      { label: 'Total invertido', value: RN.calc.formatCUP(RN.investment.totalInvertido()), cls: 'blue' },
      { label: 'Recuperado (neto)', value: RN.calc.formatCUP(RN.investment.totalRecuperado()), cls: 'green' },
      { label: '% recuperación', value: RN.investment.porcentajeRecuperacion() + '%', cls: 'amber' },
      { label: 'Por recuperar', value: RN.calc.formatCUP(Math.max(0, RN.investment.totalInvertido() - RN.investment.totalRecuperado())), cls: 'red' }
    ].map(k => '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>').join('');
  }

  // v5.12.6 (propuesta B): barra animada de recuperación global de la inversión.
  // Se muestra solo si hay inversiones registradas (la card viene oculta por defecto).
  const recupInvEl = document.getElementById('inversion-recuperacion');
  const recupInvCard = document.getElementById('card-recuperacion-inv');
  if (recupInvEl && recupInvCard) {
    if (RN.investment.totalInvertido() > 0) {
      recupInvCard.style.display = '';
      recupInvEl.innerHTML = RN.render.barraRecuperacion();
    } else {
      recupInvCard.style.display = 'none';
    }
  }

  const cont = document.getElementById('lista-inversion');
  if (!cont) return;
  if (!RN.state.investments.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">📈</div>No hay inversiones registradas.</div>';
    return;
  }
  cont.innerHTML = RN.state.investments.map(inv => {
    const recuperado = RN.investment.recuperadoRealInv(inv);
    const pct = inv.monto ? Math.round(recuperado / inv.monto * 100) : 0;
    const dotCls = pct >= 100 ? 'ok' : 'warn';
    const fechaC = RN.investment.fechaCompra(inv);
    const fechaTxt = fechaC ? new Date(fechaC).toLocaleDateString('es-CU') : '<span class="muted">—</span>';
    const dias = RN.investment.diasDesdeCompra(inv);
    const aportes = RN.investment.aportesPorCliente(inv);
    const totalAporteBruto = RN.investment.totalAporteClientes(inv);
    const totalMargenNeto = RN.investment.totalMargenNetoClientes(inv);
    const totalRecuperacion = RN.investment.totalRecuperacionClientes(inv);
    const aporteMesNeto = RN.investment.aporteMensualNeto(inv);
    const acumRetenido = RN.investment.acumuladoRetenido(inv);
    const retiroMes = RN.investment.retiroMensualEstimado(inv);
    const margenMesBruto = RN.investment.margenMensualBruto(inv);
    // v5.12.9: nuevo modelo de origen del capital + devoluciones + aporte extra de ganancia del mes
    const origenCap = RN.investment.origenCapital(inv);
    const origenTxt = RN.investment.origenCapitalTxt(inv);
    const esPrestamo = origenCap === 'prestado_externo';
    const totalDevuelto = RN.investment.totalDevuelto(inv);
    const saldoDevolver = RN.investment.saldoADevolver(inv);
    const recuperadoNeto = RN.investment.recuperadoNetoInv(inv);
    const pctGananciaMes = RN.investment.pctGananciaMes();
    const aporteExtraMes = RN.investment.aporteExtraMes(inv);
    const aporteExtraAcum = RN.investment.aporteExtraAcumulado(inv);
    const recuperadoEfectivo = RN.investment.recuperadoEfectivo(inv);
    const pctEfectivo = inv.monto ? Math.round(recuperadoEfectivo / inv.monto * 100) : 0;
    const aportesHtml = aportes.length ? aportes.map(a => {
      const nom = a.cliente ? RN.render.esc(a.cliente.nombre) : '<span class="muted">— eliminado —</span>';
      const pctCli = inv.monto ? Math.round(a.recuperacion / inv.monto * 100) : 0;
      const signoMargen = a.margenNeto >= 0 ? '' : '<span style="color:#c62828">';
      const cierreSigno = a.margenNeto >= 0 ? '' : '</span>';
      return '<div class="acc-row"><span class="acc-label">' + nom + '<br><span class="muted" style="font-size:11px">Bruto: ' + RN.calc.formatCUP(a.aporte) + ' · Margen neto: ' + signoMargen + RN.calc.formatCUP(a.margenNeto) + cierreSigno + '</span></span><span class="acc-value"><strong>' + RN.calc.formatCUP(a.recuperacion) + '</strong> <span class="muted" style="font-size:11px">(' + pctCli + '%)</span></span></div>';
    }).join('') : '<div class="acc-row"><span class="acc-value muted">Sin clientes vinculados</span></div>';
    return '<div class="acc-card" id="acc-inv-' + inv.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-inv-' + inv.id + '\')">' +
        '<span class="acc-dot ' + dotCls + '"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(inv.concepto) + '</div>' +
          '<div class="acc-summary-sub">' + (esPrestamo ? '💨 Préstamo · debe ' + RN.calc.formatCUP(saldoDevolver) + ' · ' : '') + (inv.clienteIds || []).length + ' clientes vinculados · ' + pct + '% recuperado' + (fechaC ? ' · ' + dias + ' días' : '') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt">' + RN.calc.formatCUP(inv.monto) + '</div>' +
          '<div class="lbl">Invertido</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Fecha de compra</span><span class="acc-value">' + fechaTxt + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Días transcurridos</span><span class="acc-value">' + (fechaC ? dias + ' días' : '<span class="muted">—</span>') + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Monto invertido</span><span class="acc-value">' + RN.calc.formatCUP(inv.monto) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Origen del capital</span><span class="acc-value"><span class="badge ' + (esPrestamo ? 'warn' : 'ok') + '">' + RN.render.esc(origenTxt) + '</span></span></div>' +
        (esPrestamo ? '<div class="acc-row"><span class="acc-label">Saldo a devolver</span><span class="acc-value"><strong style="color:var(--warn)">' + RN.calc.formatCUP(saldoDevolver) + '</strong></span></div>' : '') +
        (esPrestamo ? '<div class="acc-row"><span class="acc-label">Ya devuelto</span><span class="acc-value">' + RN.calc.formatCUP(totalDevuelto) + '</span></div>' : '') +
        (esPrestamo ? '<div class="acc-row"><span class="acc-label">Recuperado neto (− devoluciones)</span><span class="acc-value">' + RN.calc.formatCUP(recuperadoNeto) + '</span></div>' : '') +
        (inv.monedaPago ? '<div class="acc-row"><span class="acc-label">Pago de la compra (' + inv.monedaPago + ')</span><span class="acc-value">' + RN.moneda.desglosePagoHTML({ moneda: inv.monedaPago, montoUSD: inv.montoPagoUSD, montoCUP: inv.montoPagoCUP, montoCUPDesdeUSD: inv.montoPagoCUPDesdeUSD, totalRecibidoCUP: inv.totalPagoCUP, tasaUsd: inv.tasaUsdCompra }) + '</span></div>' : '') +
        '<div class="acc-row"><span class="acc-label">Ingreso bruto de clientes</span><span class="acc-value">' + RN.calc.formatCUP(totalAporteBruto) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Margen neto (− costo del mega)</span><span class="acc-value">' + (totalMargenNeto >= 0 ? '' : '<span style="color:#c62828">') + RN.calc.formatCUP(totalMargenNeto) + (totalMargenNeto >= 0 ? '' : '</span>') + '</span></div>' +
        (pctPersonal > 0 ? '<div class="acc-row"><span class="acc-label">Ganancia personal retenida acumulada (' + pctPersonal + '%)</span><span class="acc-value">' + RN.calc.formatCUP(acumRetenido) + '</span></div>' : '') +
        '<div class="acc-row" style="font-weight:600"><span class="acc-label">Recuperado (neto, automático)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(recuperado) + '</strong></span></div>' +
        '<div class="acc-row"><span class="acc-label">% recuperación</span><span class="acc-value"><span class="badge ' + (pct >= 100 ? 'ok' : 'warn') + '">' + pct + '%</span></span></div>' +
        '<div class="acc-row"><span class="acc-label">Margen neto mensual (bruto)</span><span class="acc-value">' + RN.calc.formatCUP(margenMesBruto) + '</span></div>' +
        (pctPersonal > 0 ? '<div class="acc-row"><span class="acc-label">Disponible para retirar/mes (' + pctPersonal + '% del margen)</span><span class="acc-value"><strong style="color:var(--green)">' + RN.calc.formatCUP(retiroMes) + '</strong></span></div>' : '') +
        '<div class="acc-row"><span class="acc-label">Aporte neto mensual a recuperación</span><span class="acc-value">' + RN.calc.formatCUP(aporteMesNeto) + '</span></div>' +
        (pctGananciaMes > 0 ? '<div class="acc-row"><span class="acc-label">Aporte extra del mes (' + pctGananciaMes + '% de la ganancia neta)</span><span class="acc-value"><strong style="color:var(--green)">+' + RN.calc.formatCUP(aporteExtraMes) + '</strong></span></div>' : '') +
        (pctGananciaMes > 0 ? '<div class="acc-row"><span class="acc-label">Aporte extra acumulado</span><span class="acc-value">' + RN.calc.formatCUP(aporteExtraAcum) + '</span></div>' : '') +
        (pctGananciaMes > 0 ? '<div class="acc-row" style="font-weight:600"><span class="acc-label">Recuperado efectivo (cobrado + aporte extra)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(recuperadoEfectivo) + '</strong> <span class="badge ' + (pctEfectivo >= 100 ? 'ok' : 'warn') + '">' + pctEfectivo + '%</span></span></div>' : '') +
        '<div class="acc-row" style="font-weight:600"><span class="acc-label">Tiempo restante para recuperar</span><span class="acc-value"><strong>' + RN.render.esc(RN.investment.proyectarRecuperacion(inv)) + '</strong></span></div>' +
        '<div class="acc-row"><span class="acc-label">Clientes vinculados</span><span class="acc-value">' + (inv.clienteIds || []).length + '</span></div>' +
        '<div class="divider" style="margin:8px 0"></div>' +
        '<div class="acc-row" style="font-weight:600"><span class="acc-label">Ganancia real por cliente (recupera el capital)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(totalRecuperacion) + '</strong></span></div>' +
        aportesHtml +
        '<div class="acc-actions">' +
          (esPrestamo
            ? '<button class="btn sm primary" onclick="RN.caja.devolucionPrestamo(\'' + inv.id + '\')">💨 Devolver préstamo</button>' +
              '<button class="btn sm" onclick="RN.caja.historialDevoluciones(\'' + inv.id + '\')">📋 Devoluciones</button>'
            : '') +
          '<button class="btn sm" onclick="RN.inversion.abrirEditar(\'' + inv.id + '\')">Editar</button>' +
          '<button class="btn sm danger" onclick="RN.inversion.eliminar(\'' + inv.id + '\')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  // v5.12.6: disparar la animación de la barra de recuperación tras pintarla.
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(RN.render.animarBarrasRecuperacion);
  } else {
    RN.render.animarBarrasRecuperacion();
  }
};
// ---------- INVENTARIO ----------
RN.render.inventario = function () {
  const cont = document.getElementById('lista-inventario');
  if (!cont) return;
  // v5.12.0: vista agrupada por producto (material), con lotes FIFO
  var productos = RN.inventarioModel.productosAgrupados();
  if (!productos.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">📦</div>No hay productos en inventario.</div>';
    return;
  }
  // KPI de inventario: valor total del stock, ganancia potencial
  var valorStock = 0, gananciaPotencial = 0;
  productos.forEach(function (p) {
    p.lotes.forEach(function (l) {
      var disp = RN.inventarioModel.stockDisponibleLote(l.id);
      valorStock += disp * (l.costoUnitario || 0);
    });
    var costoVig = p.costoVigente;
    var precioSug = RN.inventarioModel.precioVentaSugerido(costoVig);
    gananciaPotencial += p.stockDisponible * (precioSug - costoVig);
  });
  cont.innerHTML = productos.map(function (p) {
    var dotCls = p.stockDisponible > 0 ? 'ok' : 'due';
    var costoVig = p.costoVigente;
    var precioSug = RN.inventarioModel.precioVentaSugerido(costoVig);
    var pct = RN.inventarioModel.pctGanancia();
    var claveId = 'acc-invprod-' + p.key.replace(/[^a-z0-9]/g, '-');
    // Lotes del producto (ordenados por fecha = FIFO)
    var lotesHtml = p.lotes.map(function (l, idx) {
      var dispLote = RN.inventarioModel.stockDisponibleLote(l.id);
      var esVigente = dispLote > 0 && costoVig === (l.costoUnitario || 0) && idx === p.lotes.findIndex(function (x) { return RN.inventarioModel.stockDisponibleLote(x.id) > 0; });
      var badgeVigente = esVigente ? ' <span class="badge ok">vigente FIFO</span>' : '';
      var badgeAgotado = dispLote === 0 ? ' <span class="badge due">agotado</span>' : '';
      var fechaStr = l.fecha ? new Date(l.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
      // Asignaciones de este lote
      var asigs = RN.state.asignacionesInventario.filter(function (a) { return a.loteId === l.id; });
      var asigsHtml = asigs.length ? asigs.map(function (a) {
        var cli = RN.state.clients.find(function (c) { return c.id === a.clienteId; });
        var cliNom = cli ? RN.render.esc(cli.nombre) : '<span class="muted">— cliente eliminado —</span>';
        var estado = a.vendida ? '<span class="badge ok">vendida</span>' : '<span class="badge warn">asignada</span>';
        return '<div class="acc-row"><span class="acc-label">' + a.cantidad + ' ud. → ' + cliNom + '</span><span class="acc-value">' + estado + ' ' + RN.calc.formatCUP(a.precioTotal || 0) + '</span></div>';
      }).join('') : '<div class="acc-row"><span class="acc-value muted">Sin asignaciones</span></div>';
      // Desglose de pago del lote (si tiene)
      var pagoHtml = '';
      if (l.monedaPago) {
        pagoHtml = '<div class="acc-row"><span class="acc-label">Pago (' + l.monedaPago + ')</span><span class="acc-value">' + RN.moneda.desglosePagoHTML({
          moneda: l.monedaPago,
          montoUSD: l.montoPagoUSD,
          montoCUP: l.montoPagoCUP,
          montoCUPDesdeUSD: l.montoPagoCUPDesdeUSD,
          totalRecibidoCUP: l.totalPagoCUP,
          tasaUsd: l.tasaUsdCompra
        }) + '</span></div>';
      }
      return '<div style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:8px">'
        + '<div class="acc-row"><span class="acc-label">Lote ' + (idx + 1) + ' · ' + fechaStr + badgeVigente + badgeAgotado + '</span><span class="acc-value">' + l.cantidad + ' compradas · ' + dispLote + ' disp.</span></div>'
        + '<div class="acc-row"><span class="acc-label">Costo unitario</span><span class="acc-value">' + RN.calc.formatCUP(l.costoUnitario || 0) + '</span></div>'
        + '<div class="acc-row"><span class="acc-label">Costo total</span><span class="acc-value">' + RN.calc.formatCUP(l.costoTotal || (l.cantidad * (l.costoUnitario || 0))) + '</span></div>'
        + (l.notas ? '<div class="acc-row"><span class="acc-label">Notas</span><span class="acc-value">' + RN.render.esc(l.notas) + '</span></div>' : '')
        + pagoHtml
        + '<div class="divider" style="margin:6px 0"></div>'
        + asigsHtml
        + '<div class="acc-actions" style="margin-top:8px">'
        +   '<button class="btn sm" onclick="RN.inventario.eliminarLote(\'' + l.id + '\')">🗑 Eliminar lote</button>'
        + '</div>'
        + '</div>';
    }).join('');
    return '<div class="acc-card" id="' + claveId + '">'
      + '<div class="acc-summary" onclick="RN.render.toggleCard(\'' + claveId + '\')">'
      +   '<span class="acc-dot ' + dotCls + '"></span>'
      +   '<div class="acc-summary-main">'
      +     '<div class="acc-summary-name">' + RN.render.esc(p.nombre) + '</div>'
      +     '<div class="acc-summary-sub">' + p.lotes.length + ' lote' + (p.lotes.length > 1 ? 's' : '') + ' · ' + p.stockDisponible + ' disp. · costo vigente ' + RN.calc.formatCUP(costoVig) + '/ud · venta sug. ' + RN.calc.formatCUP(precioSug) + '</div>'
      +   '</div>'
      +   '<div class="acc-summary-total">'
      +     '<div class="amt">' + p.stockDisponible + '</div>'
      +     '<div class="lbl">Disponible</div>'
      +   '</div>'
      +   '<span class="acc-chevron">▼</span>'
      + '</div>'
      + '<div class="acc-details">'
      +   '<div class="acc-row"><span class="acc-label">Producto</span><span class="acc-value">' + RN.render.esc(p.nombre) + '</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Stock total comprado</span><span class="acc-value">' + p.stockTotal + ' ud.</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Stock disponible</span><span class="acc-value"><span class="badge ' + (p.stockDisponible > 0 ? 'ok' : 'due') + '">' + p.stockDisponible + '</span></span></div>'
      +   '<div class="acc-row"><span class="acc-label">Costo vigente (FIFO)</span><span class="acc-value">' + RN.calc.formatCUP(costoVig) + '/ud</span></div>'
      +   '<div class="acc-row"><span class="acc-label">Precio de venta sugerido (' + pct + '%)</span><span class="acc-value"><strong>' + RN.calc.formatCUP(precioSug) + '/ud</strong></span></div>'
      +   '<div class="acc-row"><span class="acc-label">Ganancia potencial</span><span class="acc-value" style="color:var(--green)">' + RN.calc.formatCUP(p.stockDisponible * (precioSug - costoVig)) + '</span></div>'
      +   '<div class="divider" style="margin:8px 0"></div>'
      +   '<div class="acc-row" style="font-weight:600"><span class="acc-label">Lotes (' + p.lotes.length + ') — FIFO (más antiguo primero)</span></div>'
      +   lotesHtml
      +   '<div class="acc-actions">'
      +     '<button class="btn sm primary" onclick="RN.inventario.asignar(\'' + p.nombre.replace(/'/g, "\\'") + '\')">Asignar / vender</button>'
      +     '<button class="btn sm" onclick="RN.inventario.abrirNuevoLote(\'' + p.nombre.replace(/'/g, "\\'") + '\')">📋 Comprar más</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }).join('');
};
// ---------- GASTOS ----------
RN.render.gastos = function () {
  const kpi = document.getElementById('kpi-gastos');
  if (kpi) {
    const total = RN.calc.gastosTotales();
    kpi.innerHTML = [
      { label: 'Gastos totales', value: RN.calc.formatCUP(total), cls: 'red' },
      { label: 'Gastos del mes', value: RN.calc.formatCUP(RN.calc.gastosMes()), cls: 'amber' }
    ].map(k => '<div class="kpi ' + k.cls + '"><div class="label">' + k.label + '</div><div class="value">' + k.value + '</div></div>').join('');
  }
  const cont = document.getElementById('lista-gastos');
  if (!cont) return;
  if (!RN.state.gastos.length) {
    cont.innerHTML = '<div class="acc-empty"><div class="icon">💸</div>No hay gastos registrados.</div>';
    return;
  }
  const gastos = [...RN.state.gastos].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  cont.innerHTML = gastos.map(g => {
    var catBadge = '<span class="pill">' + RN.render.esc(g.categoria || 'General') + '</span>';
    var provIcon = g.esPagoProveedor ? ' 📡' : '';
    var retiroIcon = g.esRetiroCaja ? ' 💵' : '';
    var retiroBadge = g.esRetiroCaja ? '<span class="badge warn" style="margin-left:4px">Retiro de caja</span>' : '';
    return '<div class="acc-card" id="acc-gas-' + g.id + '">' +
      '<div class="acc-summary" onclick="RN.render.toggleCard(\'acc-gas-' + g.id + '\')">' +
        '<span class="acc-dot due"></span>' +
        '<div class="acc-summary-main">' +
          '<div class="acc-summary-name">' + RN.render.esc(g.concepto) + provIcon + retiroIcon + '</div>' +
          '<div class="acc-summary-sub">' + RN.render.esc((g.fecha || '').slice(0, 10)) + ' · ' + RN.render.esc(g.categoria || 'General') + '</div>' +
        '</div>' +
        '<div class="acc-summary-total">' +
          '<div class="amt">' + RN.calc.formatCUP(g.monto) + '</div>' +
          '<div class="lbl">Gasto</div>' +
        '</div>' +
        '<span class="acc-chevron">▼</span>' +
      '</div>' +
      '<div class="acc-details">' +
        '<div class="acc-row"><span class="acc-label">Fecha</span><span class="acc-value">' + RN.render.esc((g.fecha || '').slice(0, 10)) + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Concepto</span><span class="acc-value">' + RN.render.esc(g.concepto) + provIcon + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Categoría</span><span class="acc-value">' + catBadge + retiroBadge + '</span></div>' +
        '<div class="acc-row"><span class="acc-label">Monto</span><span class="acc-value">' + RN.calc.formatCUP(g.monto) + '</span></div>' +
        '<div class="acc-actions">' +
          '<button class="btn sm danger" onclick="RN.gastos.eliminar(\'' + g.id + '\')">🗑</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  }).join('');
};
// ---------- REPORTES ----------
RN.render.reportes = function () {
  const kpi = document.getElementById('kpi-reportes');
  if (kpi) {
    kpi.innerHTML = [
      { label: 'Ingresos totales', value: RN.calc.formatCUP(RN.calc.ingresosTotales()), cls: 'green' },
      { label: 'Gastos totales', value: RN.calc.formatCUP(RN.calc.gastosTotales()), cls: 'red' },
      { label: 'Utilidad acumulada', value: RN.calc.formatCUP(RN.calc.ingresosTotales() - RN.calc.gastosTotales()), cls: 'blue' },
      { label: 'Predicción próximo mes', value: RN.calc.formatCUP(RN.calc.prediccionIngresos()), cls: 'amber' }
    ].map(k => `<div class="kpi ${k.cls}"><div class="label">${k.label}</div><div class="value">${k.value}</div></div>`).join('');
  }

  // Historial
  const tbody = document.querySelector('#tabla-historial tbody');
  if (tbody) {
    if (!RN.state.history.length) {
      tbody.innerHTML = `<tr><td colspan="5"><div class="empty">Sin cobros registrados todavía.</div></td></tr>`;
    } else {
      const hist = [...RN.state.history].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')).slice(0, 50);
      tbody.innerHTML = hist.map(h => {
        const cli = RN.state.clients.find(c => c.id === h.clienteId);
        const total = h.totalCUP || ((h.monto || 0) + (h.montoEquipo || 0));
        var monedaBadge = '';
        if (h.moneda === 'MIXTO' && h.montoPagadoUSD > 0 && h.montoPagadoCUP > 0) {
          monedaBadge = ` <span class="pill" style="background:#e8f5e9;color:#2e7d32">USD ${h.montoPagadoUSD} + CUP ${h.montoPagadoCUP}</span>`;
        } else if (h.moneda === 'USD' && h.montoPagadoUSD > 0) {
          monedaBadge = ` <span class="pill" style="background:#e8f5e9;color:#2e7d32">USD ${h.montoPagadoUSD}</span>`;
        } else if (h.montoPagadoUSD > 0 && h.montoPagadoCUP > 0) {
          monedaBadge = ` <span class="pill" style="background:#e8f5e9;color:#2e7d32">USD ${h.montoPagadoUSD} + CUP ${h.montoPagadoCUP}</span>`;
        }
        const tipoBadge = h.tipoPago === 'parcial'
          ? ` <span class="pill" style="background:#fff3cd;color:#856404">Parcial · Falta ${RN.calc.formatCUP(h.falta || 0)}</span>`
          : h.tipoPago === 'excedente'
          ? ` <span class="pill" style="background:#fee;color:#c62828">Vuelto ${RN.calc.formatCUP(h.excedente || 0)}</span>`
          : '';
        return `<tr>
          <td data-label="Fecha">${RN.render.esc((h.fecha || '').slice(0, 10))}</td>
          <td data-label="Cliente">${RN.render.esc(cli ? cli.nombre : (h.ventaInventario ? 'Venta inventario' : '—'))}</td>
          <td data-label="Concepto">${h.tipo === 'servicio' ? 'Servicio ' + (h.mes || '') : (h.tipo === 'equipo' ? 'Cuota equipo' : RN.render.esc(h.concepto || h.tipo))}</td>
          <td data-label="Monto">${RN.calc.formatCUP(total)}${monedaBadge}${tipoBadge}</td>
          <td data-label="Recibo">${h.reciboNum ? `<button class="btn sm" onclick="RN.recibo.ver('${h.id}')">${h.reciboNum}</button>` : '—'}</td>
        </tr>`;
      }).join('');
    }
  }

  // Tendencia (chart simple con barras div)
  RN.tendencia && RN.tendencia.render();

  // Selector de mes para reporte mensual
  const sel = document.getElementById('select-mes-reporte');
  if (sel) {
    const meses = [];
    let m = RN.calc.mesActualStr();
    for (let i = 0; i < 12; i++) { meses.push(m); m = RN.calc.mesAnterior(m); }
    sel.innerHTML = meses.map(m => `<option value="${m}">${RN.calc.mesTexto(m)}</option>`).join('');
  }
};
