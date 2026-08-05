// reset-app.js
// Reinicio total de la app: borra todos los datos y deja todo en cero.
// Requiere confirmacion escribiendo un codigo fijo (1990) para evitar borrados accidentales.
// Depende de: state.js, keys.js, storage-file.js (unlinkFile, save), notify-ui.js (notify), render.js (render)

const RESET_APP_CODE = '1990';

function openResetAppModal() {
  const input = document.getElementById('reset-code-input');
  const err   = document.getElementById('reset-code-error');
  input.value = '';
  err.style.display = 'none';
  document.getElementById('modal-reset-app').classList.add('open');
  setTimeout(() => input.focus(), 50);
}

function closeResetAppModal() {
  document.getElementById('modal-reset-app').classList.remove('open');
}

async function confirmResetApp() {
  const input = document.getElementById('reset-code-input');
  const err   = document.getElementById('reset-code-error');
  const code  = input.value.trim();

  if (code !== RESET_APP_CODE) {
    err.textContent = 'Codigo incorrecto. La app NO fue reiniciada.';
    err.style.display = 'block';
    input.value = '';
    input.focus();
    return;
  }

  // ── Borrar todo el estado en memoria ──
  clients = [];
  history = [];
  gastos  = [];
  inventario = [];
  asignacionesInventario = [];
  equiposRed = [];
  planes = [];
  snapshots = [];
  reciboCounter = 0;
  if(typeof calendarioMesOffset!=='undefined') calendarioMesOffset = 0;
  // BUG FIX: faltaban margenMegas y paquetePagadoMes — tras el reset,
  // megasDisponiblesParaVenta() usaba config.margenMegas=undefined
  // (tratado como NaN) y el estado del paquete quedaba indefinido.
  config = { megas:20, costoPorMega:1250, diaInicio:10, mesActual:'', margenMegas:4, sobreventaMegas:0, toleranciaMoraDias:5, paquetePagadoMes:'' };

  // Desvincular archivo conectado (si lo hay), sin borrar el archivo fisico
  if (typeof unlinkFile === 'function') unlinkFile();

  // Limpiar marcas de respaldo (no toca el tema, es un ajuste del dispositivo, no un dato del negocio)
  localStorage.removeItem(STORAGE_KEYS.LAST_BACKUP);
  localStorage.removeItem(STORAGE_KEYS.BACKUP_DISMISSED);

  await save();     // persiste el estado vacio (localStorage y/o archivo vinculado)
  render();
  closeResetAppModal();
  notify('✅ App reiniciada: todos los datos fueron borrados');
}
