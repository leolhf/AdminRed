// moneda.js
// v5.6.0 — Soporte de doble moneda USD/CUP (Variante B híbrida).
// CUP es la moneda principal (todo se guarda y calcula en CUP). El USD se
// muestra como equivalencia informativa usando una tasa que el admin puede
// actualizar automáticamente o a mano.
//
// FUENTE DE LA TASA: mdiv.pro/api/rates expone las medianas del mercado
// informal cubano (USD, EUR, MLC) en un JSON público y limpio. No requiere
// token. Como ese endpoint NO envía cabecera CORS, no se puede llamar directo
// desde el navegador del PWA; se usa el proxy CORS proxy.cors.sh como puente
// (devuelve access-control-allow-origin: *). Si ese proxy falla, se intenta
// allorigins como respaldo. Si todo falla, se conserva el valor manual.
//
// ElTOQUE.com (la fuente original que pediste) está protegida por Cloudflare
// anti-bot, así que no es scrapeable de forma fiable. mdiv.pro usa la misma
// canasta de ofertas del mercado informal cubano, por lo que sus valores son
// equivalentes a los de elTOQUE.
//
// Depende de: state.js (config), storage-local.js (save), notify-ui.js (notify),
// render.js (render). Carga después de calculations.js (usa fmt).

// ─────────────────────────────────────────────────────────────────────────────
//  TASA DE CAMBIO
// ─────────────────────────────────────────────────────────────────────────────

// Tasa USD→CUP activa. Si no se ha configurado nada, devuelve null para que
// la UI sepa que no hay tasa disponible (y no muestre equivalencias falsas).
function tasaUsd() {
  const t = config.tasaUsd;
  if (!t || t <= 0) return null;
  return t;
}

// Fecha de la última actualización de la tasa (ISO string) o null.
function tasaUsdFecha() {
  return config.tasaUsdFecha || null;
}

// Descripción legible de cuándo se actualizó la tasa: "hace 3 días", "hace 2 h",
// "hace 5 min", o la fecha si fue hace más de 7 días.
function tasaUsdHace() {
  const f = tasaUsdFecha();
  if (!f) return 'sin actualizar';
  const entonces = new Date(f).getTime();
  if (isNaN(entonces)) return 'sin actualizar';
  const diffMs = Date.now() - entonces;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'actualizada ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} día${d > 1 ? 's' : ''}`;
  return new Date(f).toLocaleDateString('es-CU', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ¿La tasa está "desactualizada" (más de 3 días)? Se usa para avisar al admin.
function tasaUsdDesactualizada() {
  const f = tasaUsdFecha();
  if (!f) return true;
  const entonces = new Date(f).getTime();
  if (isNaN(entonces)) return true;
  return (Date.now() - entonces) > 3 * 24 * 60 * 60 * 1000; // >3 días
}

// ¿La tasa no se ha actualizado hace más de 5 horas? Se usa en el modal de cobro
// para sugerir al admin que actualice antes de registrar un pago en USD.
function tasaUsdStale5h() {
  const f = tasaUsdFecha();
  if (!f) return true;
  const entonces = new Date(f).getTime();
  if (isNaN(entonces)) return true;
  return (Date.now() - entonces) > 5 * 60 * 60 * 1000; // >5 horas
}

// ─────────────────────────────────────────────────────────────────────────────
//  TASA AJUSTADA PARA COBRO EN USD
// ─────────────────────────────────────────────────────────────────────────────
// Cuando un cliente paga en USD, no se usa la tasa del día tal cual. Se le resta
// 5 CUP y luego se redondea al múltiplo de 5 más cercano. Ejemplo:
//   tasa del día 678 → 678 − 5 = 673 → múltiplo de 5 más cercano = 675
// Esta es la tasa que se aplica para convertir los USD que entrega el cliente
// a CUP y calcular el vuelto a devolver.
// Devuelve null si no hay tasa configurada.
function tasaAjustadaUsd() {
  const t = tasaUsd();
  if (t === null) return null;
  const rebajada = t - 5;
  // Redondear al múltiplo de 5 más cercano.
  const ajustada = Math.round(rebajada / 5) * 5;
  return Math.max(5, ajustada); // nunca menor que 5
}

// ─────────────────────────────────────────────────────────────────────────────
//  CONVERSIONES Y FORMATO
// ─────────────────────────────────────────────────────────────────────────────

// Convierte un monto en CUP a USD usando la tasa activa. Devuelve null si no
// hay tasa configurada (la UI decide qué mostrar en ese caso).
function cupToUsd(montoCup) {
  const t = tasaUsd();
  if (t === null) return null;
  return montoCup / t;
}

// Convierte un monto en USD a CUP.
function usdToCup(montoUsd) {
  const t = tasaUsd();
  if (t === null) return null;
  return montoUsd * t;
}

// Formatea un monto en CUP (moneda principal). Ej: "1,500 CUP".
function fmtCup(n) {
  return (n || 0).toLocaleString('es-CU') + ' CUP';
}

// Formatea un monto en USD con 2 decimales. Ej: "$2.22".
function fmtUsd(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  return '$' + Number(n).toFixed(2);
}

// Devuelve una línea de equivalencia USD para un monto CUP, o '' si no hay tasa.
// Ej: "≈ $2.22 USD". Pensada para mostrarse debajo de los montos en CUP.
function equivUsd(montoCup) {
  const usd = cupToUsd(montoCup);
  if (usd === null) return '';
  return `≈ ${fmtUsd(usd)} USD`;
}

// ─────────────────────────────────────────────────────────────────────────────
//  ACTUALIZACIÓN AUTOMÁTICA DE LA TASA (con proxy CORS + respaldo manual)
// ─────────────────────────────────────────────────────────────────────────────

// Lista de proxies CORS a intentar, en orden. Cada uno "envuelve" la URL
// original de forma distinta, por eso se indica con una función.
// Se intentan en secuencia: el primero que responda con un JSON válido gana.
const _PROXIES_TASA = [
  // proxy.cors.sh: prepende la URL original. Verificado 7-ago-2026, devuelve
  // access-control-allow-origin: * y el JSON de mdiv intacto.
  url => `https://proxy.cors.sh/${url}`,
  // allorigins raw: pasa la URL codificada como query param. Devuelve el
  // contenido crudo (no envuelto en JSON). Puede ser inestable.
  url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
];

// Extrae la tasa USD de la respuesta de mdiv.pro/api/rates, que puede llegar
// como JSON directo (proxy.cors.sh) o igual (allorigins raw). Devuelve
// { tasa, fecha, fuente } o null si no se pudo parsear.
function _parseTasaMdiv(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    // Estructura esperada: { success:true, data:{ rates:{ avgUsdOverallRate:"677.37..." }, timestamp:"..." } }
    const rates = data && data.data && data.data.rates;
    if (!rates || !rates.avgUsdOverallRate) return null;
    const tasa = parseFloat(rates.avgUsdOverallRate);
    if (!tasa || tasa <= 0) return null;
    const ts = data.data.timestamp || new Date().toISOString();
    return { tasa: Math.round(tasa), fecha: ts, fuente: 'mdiv.pro (mercado informal)' };
  } catch (e) {
    return null;
  }
}

// Intenta actualizar la tasa USD→CUP automáticamente consultando mdiv.pro
// a través de proxies CORS. Devuelve una Promise que resuelve a true si se
// actualizó, false si falló todo (el valor manual se conserva).
// `onStatus` es un callback opcional para reportar progreso a la UI.
async function actualizarTasaUsd(onStatus) {
  const report = (msg) => { if (typeof onStatus === 'function') onStatus(msg); };
  const urlApi = 'https://mdiv.pro/api/rates';

  for (let i = 0; i < _PROXIES_TASA.length; i++) {
    const proxyUrl = _PROXIES_TASA[i](urlApi);
    report(i === 0 ? 'Consultando tasa…' : 'Reintentando con otro servidor…');
    try {
      const resp = await fetch(proxyUrl, { method: 'GET', signal: AbortSignal.timeout(12000) });
      if (!resp.ok) { report(`Servidor respondió ${resp.status}`); continue; }
      const texto = await resp.text();
      const parsed = _parseTasaMdiv(texto);
      if (!parsed) { report('Respuesta no válida'); continue; }
      // ¡Éxito! Guardar la tasa.
      config.tasaUsd = parsed.tasa;
      config.tasaUsdFecha = parsed.fecha;
      config.tasaUsdFuente = parsed.fuente;
      save();
      report(`Tasa actualizada: 1 USD = ${parsed.tasa} CUP`);
      if (typeof render === 'function') render();
      return true;
    } catch (e) {
      report('Sin conexión o servidor no disponible');
      // continuar al siguiente proxy
    }
  }
  // Todos los proxies fallaron.
  report('No se pudo actualizar automáticamente. Puedes ingresar la tasa a mano.');
  return false;
}

// Guarda una tasa ingresada manualmente por el admin (Ajustes).
function guardarTasaUsdManual(valor) {
  const tasa = parseFloat(valor);
  if (!tasa || tasa <= 0) {
    notify('Ingresa una tasa válida (ej. 675)');
    return false;
  }
  config.tasaUsd = Math.round(tasa);
  config.tasaUsdFecha = new Date().toISOString();
  config.tasaUsdFuente = 'manual';
  save();
  if (typeof render === 'function') render();
  notify(`Tasa guardada: 1 USD = ${Math.round(tasa)} CUP`);
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
//  UI: editor de tasa en la pestaña Ajustes
// ─────────────────────────────────────────────────────────────────────────────

function renderMonedaEditor() {
  const wrap = document.getElementById('moneda-editor');
  if (!wrap) return;
  const tasa = tasaUsd();
  const hace = tasaUsdHace();
  const desactualizada = tasaUsdDesactualizada();
  const fuente = config.tasaUsdFuente || (tasa ? 'manual' : '');
  const valorCampo = tasa || '';

  // Aviso si la tasa tiene más de 3 días sin actualizar.
  const avisoStale = (tasa && desactualizada)
    ? `<div style="font-size:0.72rem;color:var(--amber);margin-top:6px">⚠ La tasa no se ha actualizado hace más de 3 días. Considera pulsar «Actualizar».</div>`
    : '';

  wrap.innerHTML = `
    <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:10px;line-height:1.5">
      CUP es tu moneda principal. El valor en USD se muestra como equivalencia
      informativa en el dashboard y los recibos usando la tasa del mercado
      informal cubano (fuente: mdiv.pro, equivalente a elTOQUE).
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:flex-end">
      <div style="flex:1;min-width:160px">
        <label style="font-size:0.75rem;color:var(--text-muted)">Tasa USD → CUP (1 USD = ? CUP)</label>
        <input type="number" id="cfg-tasa-usd" value="${valorCampo}" placeholder="ej. 675" min="1" step="1"
          style="width:100%;margin-top:4px" onchange="onTasaUsdManualChange()">
      </div>
      <button class="btn btn-blue btn-sm" id="btn-actualizar-tasa" onclick="clickActualizarTasaUsd()">
        🔄 Actualizar
      </button>
      <a href="https://eltoque.com/tasas-de-cambio-cuba" target="_blank" rel="noopener"
        class="btn btn-sm" style="background:var(--surface);border:1px solid var(--border)">
        🔗 Consultar elTOQUE
      </a>
    </div>
    <div id="tasa-status" style="font-size:0.75rem;color:var(--text-muted);margin-top:8px">
      ${tasa
        ? `Tasa actual: <span class="mono" style="color:var(--green)">1 USD = ${tasa} CUP</span> · ${hace}${fuente ? ` · ${fuente}` : ''}`
        : 'Sin tasa configurada. Pulsa «Actualizar» o ingresa el valor a mano.'}
    </div>
    ${avisoStale}
    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:10px;line-height:1.45">
      <strong>Actualizar</strong> consulta automáticamente la tasa del mercado informal.
      Si no hay internet o el servicio no responde, ingresa el valor manualmente.
    </div>
  `;
}

// Handler del cambio manual en el campo de tasa.
function onTasaUsdManualChange() {
  const inp = document.getElementById('cfg-tasa-usd');
  if (!inp) return;
  guardarTasaUsdManual(inp.value);
  renderMonedaEditor();
}

// Handler del botón "Actualizar" (auto). Muestra progreso en el div de status.
async function clickActualizarTasaUsd() {
  const btn = document.getElementById('btn-actualizar-tasa');
  const status = document.getElementById('tasa-status');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Actualizando…'; }
  const ok = await actualizarTasaUsd((msg) => {
    if (status) status.textContent = msg;
  });
  if (btn) { btn.disabled = false; btn.textContent = '🔄 Actualizar'; }
  renderMonedaEditor();
  if (ok) notify('Tasa USD actualizada automáticamente');
  else notify('No se pudo actualizar automáticamente — usa el valor manual', 'warn');
}
