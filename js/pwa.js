// pwa.js
// Instalación como PWA (evento beforeinstallprompt).
// No depende de otros módulos (usa notify-ui.js opcionalmente).

// ═══════════════════════════════════════════════════════════
//  PWA INSTALL
// ═══════════════════════════════════════════════════════════
let deferredInstall=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault(); deferredInstall=e;
  document.getElementById('btn-install').style.display='';
});
async function installPWA() {
  if(!deferredInstall) return;
  deferredInstall.prompt();
  const r=await deferredInstall.userChoice;
  if(r.outcome==='accepted'){document.getElementById('btn-install').style.display='none';notify('App instalada 📲');}
  deferredInstall=null;
}

// ═══════════════════════════════════════════════════════════
//  DOBLE "ATRÁS" PARA SALIR (comportamiento típico Android)
//  Al presionar atrás la primera vez, se avisa y NO se sale;
//  si se presiona de nuevo dentro de 2s, se deja salir la app.
//  Si un modal está abierto, "atrás" solo lo cierra (no cuenta
//  como intento de salida).
// ═══════════════════════════════════════════════════════════
(function(){
  let waitingConfirm=false, exitTimer=null;
  function pushExitGuard(){
    // BUG FIX: `history` en el scope global es el array de cobros declarado en
    // state.js (let history = []). Como los scripts clásicos comparten el mismo
    // entorno léxico global, `history.pushState` era siempre undefined y la
    // guardia de doble-atrás nunca se instalaba. Se usa window.history
    // explícitamente para acceder al History API del navegador.
    if(window.history && window.history.pushState) {
      window.history.pushState({adminredExitGuard:true},'',location.href);
    }
  }
  pushExitGuard();
  window.addEventListener('popstate',()=>{
    const modalAbierto=document.querySelector('.modal-overlay.open');
    if(modalAbierto){ modalAbierto.classList.remove('open'); pushExitGuard(); return; }
    if(!waitingConfirm){
      waitingConfirm=true;
      notify('Presiona atrás de nuevo para salir');
      if(navigator.vibrate) navigator.vibrate(30);
      exitTimer=setTimeout(()=>{ waitingConfirm=false; pushExitGuard(); },2000);
    } else {
      clearTimeout(exitTimer);
      // No se repone el guard: la siguiente pulsación física de "atrás"
      // ya no tendrá historial propio y el sistema cerrará la app.
    }
  });
})();
