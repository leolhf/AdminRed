// inline-edit.js
// Edicion inline de campos de cliente en la tabla.
// Depende de: state.js (clients, planes), storage-local.js (save), render.js (render),
//             calculations.js (getPrecioCliente, getPlanCliente)

// ═══════════════════════════════════════════════════════════════════════════════
//  EDICION INLINE
// ═══════════════════════════════════════════════════════════════════════════════
function updateField(id,field,value) {
  if(field==='planId'){
    const c=clients.find(x=>x.id===id); if(!c) return;
    c.planId=value?parseInt(value):null;
    // Si se asigna un plan, auto-rellenar megas y precio del plan
    if(c.planId){
      const plan=planes.find(p=>p.id===c.planId);
      if(plan){ c.megas=plan.megas; c.precio=plan.precio; }
    }
    save(); render();
    notify(c.planId?'Plan asignado':'Plan quitado (usa precio manual)');
    return;
  }
  if(field==='descuento'||field==='descuentoTipo'){
    const c=clients.find(x=>x.id===id); if(!c) return;
    if(field==='descuento'){
      value=parseInt(value)||0;
      if(value<0){notify('El descuento no puede ser negativo',true);render();return;}
      c.descuento=value;
    } else {
      c.descuentoTipo=value||'monto';
    }
    save(); render();
    return;
  }
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
  // F5: aviso temprano de sobreventa al editar megas inline.
  // Si tras asignar estos megas quedan pocos megas libres (menos del 20%
  // del paquete o menos de 10 Mb), avisa sin bloquear.
  if(field==='megas' && value>0){
    const dispAhora=megasDisponiblesParaVenta(id);
    if(dispAhora<=Math.min(Math.ceil(config.megas*0.2),10) && dispAhora>=0){
      notify(`⚠ Banda casi al limite: quedan ${dispAhora} Mb libres tras ${c.nombre}.`);
    }
  }
}

// F4: suspender / reactivar la conexión de un cliente.
// Los clientes suspendidos se excluyen del ancho de banda vendido y se
// muestran diferenciados en las tablas (badge "Suspendido" + fila atenuada).
function toggleSuspendido(id){
  const c=clients.find(x=>x.id===id); if(!c) return;
  c.suspendido=!c.suspendido;
  save(); render();
  notify(c.suspendido?`🔌 ${c.nombre} suspendido`:`✅ ${c.nombre} reactivado`);
}
