// config.js
// Aplicar configuración general (megas, costos, días de pago).
// Depende de: state.js (config), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════
function applyConfig() {
  const nuevos=parseInt(document.getElementById('cfg-megas').value)||config.megas;
  const vendidos=totalVendido();
  const warn=document.getElementById('cfg-warn');
  if(nuevos<vendidos){warn.style.display='block';warn.textContent=`⚠ Tienes ${vendidos} Mb vendidos.`;document.getElementById('cfg-megas').value=config.megas;return;}
  warn.style.display='none';
  config.megas        =nuevos;
  config.margenMegas  =parseInt(document.getElementById('cfg-margen').value);
  if(isNaN(config.margenMegas)||config.margenMegas<0) config.margenMegas=0;
  config.costoPorMega =parseInt(document.getElementById('cfg-costo').value)||config.costoPorMega;
  config.diaInicio    =parseInt(document.getElementById('cfg-dia-inicio').value)||config.diaInicio;
  save(); render(); notify('Configuración actualizada');
}
