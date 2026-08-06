// notifications.js
// Notificaciones del navegador (permiso y programación de avisos).
// Depende de: state.js (clients), calculations.js (getStatus)

// ═══════════════════════════════════════════════════════════
//  NOTIFICACIONES WEB
// ═══════════════════════════════════════════════════════════
async function requestNotifPermission() {
  if(!('Notification' in window)){notify('Tu navegador no soporta notificaciones',true);return;}
  const p=await Notification.requestPermission();
  if(p==='granted'){
    notify('🔔 Notificaciones activadas');
    scheduleNotifications();
    iniciarChequeoLocalCadaHora();
    // Además del chequeo inmediato de arriba (que solo revisa el estado justo
    // ahora), registramos este dispositivo en Firebase para poder recibir
    // recordatorios reales por push aunque la app esté cerrada.
    if(window.FirebaseSync){
      const token = await window.FirebaseSync.solicitarTokenPush();
      if(token) notify('📡 Este dispositivo quedó registrado para recordatorios push');
    }
  }
  else{notify('Permiso denegado',true);}
}

// ═══════════════════════════════════════════════════════════
//  CHEQUEO LOCAL RECURRENTE (respaldo mientras la app está abierta)
//  El envío "real" con la app cerrada lo hace el cron de GitHub Actions
//  (scripts/enviar-recordatorios.js) vía Firebase Cloud Messaging, cada
//  hora. Este intervalo es solo un respaldo adicional para cuando el
//  usuario tiene la app abierta y no quiere esperar al push del servidor.
// ═══════════════════════════════════════════════════════════
let _intervaloNotificaciones = null;

function iniciarChequeoLocalCadaHora() {
  if(_intervaloNotificaciones) return; // ya está corriendo, no duplicar
  if(Notification.permission!=='granted') return;
  _intervaloNotificaciones = setInterval(scheduleNotifications, 60*60*1000);
}

// Si el usuario ya había dado permiso en una sesión anterior, arrancamos
// el chequeo recurrente apenas carga la app (sin esperar a que vuelva a
// tocar la campanita 🔔).
if('Notification' in window && Notification.permission==='granted') {
  iniciarChequeoLocalCadaHora();
}

function scheduleNotifications() {
  if(Notification.permission!=='granted') return;
  const hoy=new Date();
  // BUG FIX: Chrome en Android NO permite crear notificaciones con
  // `new Notification(...)` directamente — solo soporta mostrar
  // notificaciones a través del Service Worker
  // (`registration.showNotification()`). Con `new Notification()`, en
  // Android esto fallaba de forma silenciosa (a veces sin ni siquiera un
  // error visible), así que el botón 🔔 nunca mostraba nada en el celular
  // aunque sí funcionara en el navegador de escritorio.
  // Ahora se usa el Service Worker ya registrado en sw.js, que funciona
  // igual en escritorio y en Android.
  if(!('serviceWorker' in navigator)){
    notify('Este navegador no soporta notificaciones en segundo plano',true);
    return;
  }
  navigator.serviceWorker.ready.then(reg=>{
    // Mismas 3 categorías que renderAlarms() en js/ui/render.js (rojo/vencido,
    // ámbar/por cobrar, morado/moroso). Antes esta función solo cubría las
    // primeras dos, así que un cliente que SÍ aparecía en "⚠ Alertas de cobro"
    // podía no generar ninguna notificación al tocar el icono 🔔.
    clients.forEach(c=>{
      if(c.pagado) return;
      const s=getStatus(c);
      const mora=getMora(c);
      if(s==='warn'){
        reg.showNotification(`RedNet — Cobrar a ${c.nombre}`,{
          body:`${c.megas} Mb · ${fmt(precioNetoCliente(c))} · día ${c.diaPago||config.diaInicio}`,
          icon:'./icons/icon-192.png',
          badge:'./icons/icon-192.png'
        });
      } else if(s==='due'){
        reg.showNotification(`RedNet — ⚠ VENCIDO: ${c.nombre}`,{
          body:`${fmt(precioNetoCliente(c))} sin cobrar`,
          icon:'./icons/icon-192.png',
          badge:'./icons/icon-192.png'
        });
      } else if(mora>0){
        reg.showNotification(`RedNet — Mora: ${c.nombre}`,{
          body:`${mora} mes${mora>1?'es':''} de mora · ${fmt(precioNetoCliente(c))} adeudado`,
          icon:'./icons/icon-192.png',
          badge:'./icons/icon-192.png'
        });
      }
    });
  });
}
