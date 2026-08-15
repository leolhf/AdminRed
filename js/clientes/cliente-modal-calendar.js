// cliente-modal-calendar.js
// Mini-calendario para selección de fecha de pago en el modal de cliente
// Depende de: state.js (config), calculations-utils.js (fechaLocalISO)

// ═══════════════════════════════════════════════════════════════════════════════
//  MINI-CALENDARIO DE FECHA DE PAGO
// ═══════════════════════════════════════════════════════════════════════════════
// Rangos de dias habiles de pago (dias incluidos en cada "corte").
const PAGO_CAL_RANGOS = [[1,5],[10,15],[20,25]];
// Limite de navegacion hacia atras/adelante (meses).
const PAGO_CAL_MAX_ATRAS = -12;
const PAGO_CAL_MAX_ADELANTE = 12;

// Estado interno del mini-calendario del modal.
let pagoCalOffset = 0;      // 0 = mes actual, -1 = mes anterior, +1 = proximo...
let pagoCalSeleccion = null; // { dia, anio, mes } del dia seleccionado, o null

// ¿Un numero de dia cae dentro de algun rango habil?
function pagoCalEsHabil(dia) {
  return PAGO_CAL_RANGOS.some(function(r){ return dia >= r[0] && dia <= r[1]; });
}

// Nombres cortos de dias de la semana (L-D). El calendario arranca en lunes.
const PAGO_CAL_DOW = ['L','M','X','J','V','S','D'];

// Renderiza la cabecera de dias de la semana (fija, L-D).
function pagoCalRenderDow() {
  const el = document.getElementById('pago-cal-dow');
  if (!el) return;
  el.innerHTML = PAGO_CAL_DOW.map(function(d){ return '<span>'+d+'</span>'; }).join('');
}

// Devuelve la fecha base del mes que se esta mostrando (dia 1).
function pagoCalFechaBase() {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth() + pagoCalOffset, 1);
}

// Renderiza el grid del mes actual del mini-calendario.
function pagoCalRender() {
  const grid = document.getElementById('pago-cal-grid');
  const titulo = document.getElementById('pago-cal-titulo');
  if (!grid || !titulo) return;

  const base = pagoCalFechaBase();
  const anio = base.getFullYear();
  const mes = base.getMonth(); // 0-11
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  // Dia de la semana del dia 1 (0=domingo...6=sabado). Convertir a base Lunes=0.
  let dow0 = new Date(anio, mes, 1).getDay();
  dow0 = dow0 === 0 ? 6 : dow0 - 1; // lunes=0 ... domingo=6

  titulo.textContent = base.toLocaleDateString('es-CU', { month: 'long', year: 'numeric' });

  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const hoyMs = hoy.getTime();

  let html = '';
  for (let i = 0; i < dow0; i++) html += '<div class="pago-cal-cell empty"></div>';
  for (let d = 1; d <= diasEnMes; d++) {
    const fechaDia = new Date(anio, mes, d); fechaDia.setHours(0,0,0,0);
    const esHoy = fechaDia.getTime() === hoyMs;
    const esPasado = fechaDia < hoy;
    const habil = pagoCalEsHabil(d);
    let cls = 'pago-cal-cell';
    if (habil) cls += ' habil';
    if (esPasado) cls += ' pasado';
    if (esHoy) cls += ' hoy';
    if (pagoCalSeleccion && pagoCalSeleccion.dia === d &&
        pagoCalSeleccion.mes === mes && pagoCalSeleccion.anio === anio) {
      cls += ' selected';
    }
    const onclick = habil ? 'onclick="pagoCalSeleccionar('+d+','+mes+','+anio+')"' : '';
    html += '<div class="'+cls+'" '+onclick+'>'+d+'</div>';
  }
  grid.innerHTML = html;

  const prev = document.getElementById('pago-cal-prev');
  const next = document.getElementById('pago-cal-next');
  if (prev) prev.disabled = (pagoCalOffset <= PAGO_CAL_MAX_ATRAS);
  if (next) next.disabled = (pagoCalOffset >= PAGO_CAL_MAX_ADELANTE);

  pagoCalActualizarResumen();
}

// Navega un mes adelante (+1) o atras (-1).
function pagoCalCambiarMes(delta) {
  const nuevo = pagoCalOffset + delta;
  if (nuevo < PAGO_CAL_MAX_ATRAS || nuevo > PAGO_CAL_MAX_ADELANTE) return;
  pagoCalOffset = nuevo;
  pagoCalRender();
}

// Selecciona un dia habil. Define diaPago + fechaInicio + mesInicio.
function pagoCalSeleccionar(dia, mes, anio) {
  pagoCalSeleccion = { dia: dia, mes: mes, anio: anio };
  document.getElementById('f-dia').value = dia;
  const fecha = new Date(anio, mes, dia);
  document.getElementById('f-fecha-inicio-iso').value = fechaLocalISO(fecha);

  // Determinar mesInicio relativo al mes de hoy (compat con logica existente).
  const ahora = new Date();
  const mesHoy = ahora.getMonth(), anioHoy = ahora.getFullYear();
  let mesInicio = 'actual';
  if (anio < anioHoy || (anio === anioHoy && mes < mesHoy)) mesInicio = 'pasado';
  else if (anio > anioHoy || (anio === anioHoy && mes > mesHoy)) mesInicio = 'proximo';
  document.getElementById('f-mes-inicio').value = mesInicio;

  pagoCalRender();
}

// Actualiza el resumen "Inicio de cobro" y muestra/oculta el checkbox
// "Ya pago este ciclo" cuando la fecha seleccionada ya vencio.
function pagoCalActualizarResumen() {
  const val = document.getElementById('pago-cal-val');
  const box = document.getElementById('pago-pago-ciclo');
  if (!val || !box) return;

  if (!pagoCalSeleccion) {
    val.textContent = 'Sin seleccionar';
    val.classList.remove('pasado');
    box.classList.remove('show');
    const chk = document.getElementById('f-ya-pago');
    if (chk) chk.checked = false;
    return;
  }

  const dia = pagoCalSeleccion.dia, mes = pagoCalSeleccion.mes, anio = pagoCalSeleccion.anio;
  const fecha = new Date(anio, mes, dia); fecha.setHours(0,0,0,0);
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const esPasado = fecha < hoy;
  const label = fecha.toLocaleDateString('es-CU', { day: 'numeric', month: 'short', year: 'numeric' });

  const ahora = new Date();
  const mesHoy = ahora.getMonth(), anioHoy = ahora.getFullYear();
  let rel = '';
  if (anio < anioHoy || (anio === anioHoy && mes < mesHoy)) rel = ' (mes pasado)';
  else if (anio > anioHoy || (anio === anioHoy && mes > mesHoy)) rel = ' (proximo mes)';

  val.textContent = 'Dia ' + dia + ' \u00b7 ' + label + rel;
  val.classList.toggle('pasado', esPasado);

  box.classList.toggle('show', esPasado);
  if (!esPasado) { const chk = document.getElementById('f-ya-pago'); if (chk) chk.checked = false; }
}

// Inicializa el mini-calendario al abrir el modal.
function pagoCalInit(diaPreseleccionado, fechaInicioExistente) {
  pagoCalRenderDow();
  pagoCalOffset = 0;
  pagoCalSeleccion = null;

  if (fechaInicioExistente) {
    const fi = new Date(fechaInicioExistente + 'T00:00:00');
    const ahora = new Date();
    pagoCalOffset = (fi.getFullYear() - ahora.getFullYear()) * 12 +
                    (fi.getMonth() - ahora.getMonth());
    if (pagoCalOffset < PAGO_CAL_MAX_ATRAS) pagoCalOffset = PAGO_CAL_MAX_ATRAS;
    if (pagoCalOffset > PAGO_CAL_MAX_ADELANTE) pagoCalOffset = PAGO_CAL_MAX_ADELANTE;
    pagoCalSeleccionar(fi.getDate(), fi.getMonth(), fi.getFullYear());
  } else {
    const dia = diaPreseleccionado || config.diaInicio;
    const ahora = new Date();
    if (pagoCalEsHabil(dia)) {
      pagoCalSeleccionar(dia, ahora.getMonth(), ahora.getFullYear());
    }
  }
  pagoCalRender();
}