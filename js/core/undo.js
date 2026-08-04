// undo.js
// Deshacer genérico: antes de cualquier cambio importante (cobro, gasto,
// editar/borrar cliente, liquidar deuda), se guarda una foto completa de
// los datos en memoria. Con "↩ Deshacer" se restaura la última foto.
// Es una pila corta que vive solo en esta sesión (no se guarda en disco)
// — cubre errores recientes, no reemplaza el historial de cobros.
// Depende de: state.js, storage-local.js (dataToJson/applyJson),
//             storage-file.js (save/saveToFile, debe cargarse antes)

const UNDO_MAX = 5;
let undoStack = [];

function registrarParaDeshacer(descripcion) {
  try{
    undoStack.push({ descripcion, momento: Date.now(), data: dataToJson() });
    if(undoStack.length > UNDO_MAX) undoStack.shift();
    actualizarBotonDeshacer();
  }catch(e){}
}

async function deshacerUltimoCambio() {
  const ultimo = undoStack.pop();
  actualizarBotonDeshacer();
  if(!ultimo){ notify('No hay nada que deshacer',true); return; }
  applyJson(ultimo.data);
  saveLocalStorage();
  if(fileHandle) await saveToFile(false,true);
  render();
  notify(`↩ Deshecho: ${ultimo.descripcion}`);
}

function actualizarBotonDeshacer() {
  const btn=document.getElementById('btn-deshacer');
  if(btn) btn.style.display = undoStack.length ? '' : 'none';
  const btnMenu=document.getElementById('btn-deshacer-menu');
  if(btnMenu) btnMenu.style.display = undoStack.length ? '' : 'none';
}
