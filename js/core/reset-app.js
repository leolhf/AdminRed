// reset-app.js
// Reinicio total de la app: borra todos los datos y deja todo en cero.
// Requiere confirmación escribiendo un código fijo (1990) para evitar borrados accidentales.
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
    err.textContent = 'Código incorrecto. La app NO fue reiniciada.';
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
  config = { megas:20, costoPorMega:1250, diaInicio:10, mesActual:'' };

  // Desvincular archivo conectado (si lo hay), sin borrar el archivo físico
  if (typeof unlinkFile === 'function') unlinkFile();

  // Limpiar marcas de respaldo (no toca el PIN ni el tema, son ajustes del dispositivo, no datos del negocio)
  localStorage.removeItem(STORAGE_KEYS.LAST_BACKUP);
  localStorage.removeItem(STORAGE_KEYS.BACKUP_DISMISSED);

  await save();     // persiste el estado vacío (localStorage y/o archivo vinculado)
  render();
  closeResetAppModal();
  notify('✅ App reiniciada: todos los datos fueron borrados');
}
