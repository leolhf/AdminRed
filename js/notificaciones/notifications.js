// notifications.js
// Notificaciones del navegador (permiso y programación de avisos).
// Depende de: state.js (clients), calculations.js (getStatus)

// ═══════════════════════════════════════════════════════════
//  NOTIFICACIONES WEB
// ═══════════════════════════════════════════════════════════
async function requestNotifPermission() {
  if(!('Notification' in window)){notify('Tu navegador no soporta notificaciones',true);return;}
  const p=await Notification.requestPermission();
  if(p==='granted'){notify('🔔 Notificaciones activadas');scheduleNotifications();}
  else{notify('Permiso denegado',true);}
}

function scheduleNotifications() {
  if(Notification.permission!=='granted') return;
  const hoy=new Date();
  clients.forEach(c=>{
    const s=getStatus(c);
    if(s==='warn'){
      new Notification(`RedNet — Cobrar a ${c.nombre}`,{
        body:`${c.megas} Mb · ${fmt(c.megas*c.precio)} · día ${c.diaPago||config.diaInicio}`,
        icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="80">📡</text></svg>'
      });
    } else if(s==='due'){
      new Notification(`RedNet — ⚠ VENCIDO: ${c.nombre}`,{
        body:`${fmt(c.megas*c.precio)} sin cobrar`,
        icon:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="80">⚠️</text></svg>'
      });
    }
  });
}
