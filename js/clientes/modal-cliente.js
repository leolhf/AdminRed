// modal-cliente.js
// Modal de alta/edición de cliente.
// Depende de: state.js (clients), storage-local.js (save), render.js (render), notify-ui.js (notify)

// ═══════════════════════════════════════════════════════════
//  MODAL CLIENTE
// ═══════════════════════════════════════════════════════════
function openAddModal() {
  document.getElementById('modal-title').textContent='Nuevo cliente';
  document.getElementById('edit-id').value='';
  ['f-nombre','f-megas','f-precio','f-notas','f-telefono'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-dia').value=config.diaInicio;
  document.getElementById('mes-inicio-wrap').style.display='block';
  selectMesInicio('actual');
  document.getElementById('modal').classList.add('open');
  checkMegasDisponibles(null);
}

// Muestra debajo del campo "Megas asignados" cuánto queda libre (respetando el
// margen personal, config.margenMegas) y, si no alcanza, sugiere de cuánto
// debería ser el próximo paquete a contratar.
function checkMegasDisponibles(editId) {
  const hint=document.getElementById('f-megas-hint');
  if(!hint) return;
  const megas=parseInt(document.getElementById('f-megas').value)||0;
  const disponible=megasDisponiblesParaVenta(editId);
  if(megas<=0){
    hint.className='megas-hint';
    hint.textContent=`Libre para vender: ${disponible} Mb (margen reservado: ${config.margenMegas||0} Mb)`;
    return;
  }
  const faltan=megas-disponible;
  if(faltan>0){
    const sugerido=config.megas+faltan;
    hint.className='megas-hint megas-hint-warn';
    hint.textContent=`⚠ Faltan ${faltan} Mb (te quedan ${disponible} Mb libres tras tu margen de ${config.margenMegas||0} Mb). Sugerencia: contrata un paquete de al menos ${sugerido} Mb.`;
  } else {
    hint.className='megas-hint megas-hint-ok';
    hint.textContent=`✓ Alcanza. Quedarán ${disponible-megas} Mb libres tras este cliente.`;
  }
}

function selectMesInicio(val) {
  document.getElementById('f-mes-inicio').value=val;
  document.getElementById('mes-btn-actual').classList.toggle('active',val==='actual');
  document.getElementById('mes-btn-proximo').classList.toggle('active',val==='proximo');
}

function editClient(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  document.getElementById('modal-title').textContent='Editar cliente';
  document.getElementById('edit-id').value=id;
  document.getElementById('f-nombre').value=c.nombre;
  document.getElementById('f-megas').value=c.megas;
  document.getElementById('f-precio').value=c.precio;
  document.getElementById('f-dia').value=c.diaPago;
  document.getElementById('f-telefono').value=c.telefono||'';
  document.getElementById('f-notas').value=c.notas||'';
  document.getElementById('mes-inicio-wrap').style.display='none';
  document.getElementById('modal').classList.add('open');
  checkMegasDisponibles(id);
}

function closeModal(){ document.getElementById('modal').classList.remove('open'); }

function saveClient() {
  const id    =parseInt(document.getElementById('edit-id').value);
  const nombre=document.getElementById('f-nombre').value.trim();
  const megas =parseInt(document.getElementById('f-megas').value);
  const precio=parseInt(document.getElementById('f-precio').value);
  const dia   =parseInt(document.getElementById('f-dia').value)||config.diaInicio;
  const telefono=document.getElementById('f-telefono').value.trim();
  const notas =document.getElementById('f-notas').value.trim();
  const mesInicio=document.getElementById('f-mes-inicio').value||'actual';
  if(!nombre){notify('El nombre es obligatorio',true);return;}
  const existe = clients.find(x=>x.id!==id && x.nombre.toLowerCase()===nombre.toLowerCase());
  if(existe && !confirm(`Ya existe un cliente llamado "${nombre}". ¿Continuar de todos modos?`)) return;
  // Solo verificar banda si se asignan megas
  if(megas>0){
    const disponible=megasDisponiblesParaVenta(id);
    if(megas>disponible){
      const faltan=megas-disponible;
      const sugerido=config.megas+faltan;
      notify(`Sin banda suficiente (te faltan ${faltan} Mb, considerando tu margen de ${config.margenMegas||0} Mb). Sugerencia: contrata un paquete de al menos ${sugerido} Mb.`,true);
      return;
    }
  }
  const ahora=new Date();
  let fechaInicio;
  if(!id){
    if(mesInicio==='proximo'){
      const p=new Date(ahora.getFullYear(),ahora.getMonth()+1,dia);
      fechaInicio=p.toISOString().split('T')[0];
    } else {
      const a=new Date(ahora.getFullYear(),ahora.getMonth(),dia);
      fechaInicio=a.toISOString().split('T')[0];
    }
  }
  let clienteId = id;
  if(id){
    const idx=clients.findIndex(c=>c.id===id);
    if(idx>=0) clients[idx]={...clients[idx],nombre,megas,precio,diaPago:dia,telefono,notas};
  } else {
    const newId=clients.length?Math.max(...clients.map(c=>c.id))+1:1;
    clients.push({id:newId,nombre,megas,precio,diaPago:dia,pagado:false,telefono,notas,mesInicio,fechaInicio,mora:0});
    clienteId=newId;
  }
  save(); render(); closeModal();
  notify(id?`${nombre} actualizado`:`${nombre} añadido${mesInicio==='proximo'?' (desde próximo mes)':''}`);
  // Sincroniza solo los datos mínimos (nombre, día de pago, monto, pagado) con
  // Firebase, para que la Cloud Function programada pueda enviar recordatorios
  // push aunque la app esté cerrada. Si Firebase no cargó (offline, bloqueado
  // por el usuario, etc.), esto simplemente no hace nada — no rompe el guardado local.
  if(window.FirebaseSync){
    const clienteGuardado=clients.find(c=>c.id===clienteId);
    if(clienteGuardado) window.FirebaseSync.syncCliente(clienteGuardado);
  }
}
