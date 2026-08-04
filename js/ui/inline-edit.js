// inline-edit.js
// Edición inline de campos de cliente en la tabla.
// Depende de: state.js (clients), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════
//  EDICIÓN INLINE
// ═══════════════════════════════════════════════════════════
function updateField(id,field,value) {
  if(!value||value<1){notify('Valor inválido',true);render();return;}
  const c=clients.find(x=>x.id===id); if(!c) return;
  if(field==='megas'){
    const disponible=megasDisponiblesParaVenta(id);
    if(value>disponible){
      const faltan=value-disponible;
      const sugerido=config.megas+faltan;
      const sobreTxt=(config.sobreventaMegas||0)>0?` y sobreventa de ${config.sobreventaMegas} Mb`:'';
      notify(`Sin banda suficiente (te faltan ${faltan} Mb, considerando tu margen de ${config.margenMegas||0} Mb${sobreTxt}). Sugerencia: contrata al menos ${sugerido} Mb o aumenta la sobreventa permitida.`,true);
      render();return;
    }
  }
  c[field]=value; save(); render();
}
