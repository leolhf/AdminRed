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
