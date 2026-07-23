// confirm-delete.js
// Confirmación y eliminación de cliente.
// Depende de: state.js (clients), historial.js (showConfirm), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════
//  CONFIRMAR ELIMINAR
// ═══════════════════════════════════════════════════════════
function confirmDelete(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  document.getElementById('confirm-title').textContent='¿Eliminar cliente?';
  document.getElementById('confirm-msg').textContent=`Esto eliminará a ${c.nombre} permanentemente. Esta acción no se puede deshacer.`;
  const btn=document.getElementById('confirm-ok-btn');
  btn.onclick=()=>{
    clients=clients.filter(x=>x.id!==id);
    history=history.filter(h=>h.id!==id);
    save(); render();
    document.getElementById('modal-confirm').classList.remove('open');
    notify(`${c.nombre} eliminado`);
  };
  document.getElementById('modal-confirm').classList.add('open');
}
