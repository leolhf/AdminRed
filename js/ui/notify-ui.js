// notify-ui.js
// Utilidad de notificación visual (toast) en pantalla.
// No depende de otros módulos.

// ═══════════════════════════════════════════════════════════
//  NOTIFICACIÓN UI
// ═══════════════════════════════════════════════════════════
function notify(msg,error=false) {
  const el=document.getElementById('notif');
  el.textContent=msg;
  el.style.borderColor=error?'var(--red)':'var(--green)';
  el.style.color=error?'var(--red)':'var(--green)';
  el.classList.add('show');
  setTimeout(()=>el.classList.remove('show'),3200);
}
