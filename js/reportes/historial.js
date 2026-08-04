// historial.js
// Limpieza de historial y utilidad de diálogo de confirmación genérico (showConfirm).
// Depende de: state.js (history, clients), storage-local.js (save), render.js (render), notify-ui.js (notify)

// ═══════════════════════════════════════════════════════════
//  HISTORIAL
// ═══════════════════════════════════════════════════════════
function clearHistory() {
  showConfirm('¿Limpiar historial?','Se borrarán todos los cobros del historial. ¿Continuar?',()=>{
    history=[];
    showConfirm('¿Nuevo mes?','¿Marcar todos los clientes como pendientes de pago?',()=>{
      clients.forEach(c=>c.pagado=false);
      save(); render(); notify('Listo para nuevo mes');
    },()=>{ save(); render(); notify('Historial limpiado'); });
  });
}

function showConfirm(title,msg,onOk,onCancel) {
  document.getElementById('confirm-title').textContent=title;
  document.getElementById('confirm-msg').textContent=msg;
  const btn=document.getElementById('confirm-ok-btn');
  btn.onclick=()=>{
    document.getElementById('modal-confirm').classList.remove('open');
    onOk&&onOk();
  };
  // Override cancel
  document.querySelector('#modal-confirm .btn-ghost').onclick=()=>{
    document.getElementById('modal-confirm').classList.remove('open');
    onCancel&&onCancel();
  };
  document.getElementById('modal-confirm').classList.add('open');
}
