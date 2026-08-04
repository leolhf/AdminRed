// config.js
// Aplicar configuración general (megas, costos, días de pago).
// Depende de: state.js (config), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════
function applyConfig() {
  const nuevos=parseInt(document.getElementById('cfg-megas').value)||config.megas;
  // Leer la sobreventa antes de validar, para que el limite total
  // (paquete + sobreventa) se respete al bajar el paquete contratado.
  let sobreventa=parseInt(document.getElementById('cfg-sobreventa').value);
  if(isNaN(sobreventa)||sobreventa<0) sobreventa=0;
  const vendidos=totalVendido();
  const warn=document.getElementById('cfg-warn');
  // El limite real de banda vendible es paquete contratado + sobreventa.
  // Solo se bloquea si lo vendido supera ese limite (no solo el paquete).
  if(nuevos+sobreventa<vendidos){
    warn.style.display='block';
    warn.textContent=`⚠ Tienes ${vendidos} Mb vendidos. Con paquete ${nuevos} + sobreventa ${sobreventa} solo llegas a ${nuevos+sobreventa} Mb. Baja los clientes, sube el paquete o aumenta la sobreventa.`;
    document.getElementById('cfg-megas').value=config.megas;
    document.getElementById('cfg-sobreventa').value=config.sobreventaMegas||0;
    return;
  }
  warn.style.display='none';
  config.megas        =nuevos;
  config.margenMegas  =parseInt(document.getElementById('cfg-margen').value);
  if(isNaN(config.margenMegas)||config.margenMegas<0) config.margenMegas=0;
  // Sobreventa permitida: Mb que se pueden vender por encima del paquete
  // contratado (ej. paquete 35 + sobreventa 15 = se permite vender hasta 50).
  config.sobreventaMegas=sobreventa;
  config.costoPorMega =parseInt(document.getElementById('cfg-costo').value)||config.costoPorMega;
  config.diaInicio    =parseInt(document.getElementById('cfg-dia-inicio').value)||config.diaInicio;
  save(); render(); notify('Configuración actualizada');
  // Sincronizar tolerancia con Firestore para que el cron de GitHub Actions
  // use los mismos días de inicio/límite que la app (FIX #2)
  if(window.FirebaseSync) window.FirebaseSync.syncConfig(config);
}
