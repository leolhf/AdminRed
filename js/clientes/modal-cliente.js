// modal-cliente.js
// Modal de alta/edición de cliente.
// Depende de: state.js (clients), storage-local.js (save), render.js (render), notify-ui.js (notify)

// ═══════════════════════════════════════════════════════════
//  MODAL CLIENTE
// ═══════════════════════════════════════════════════════════
function openAddModal() {
  document.getElementById('modal-title').textContent='Nuevo cliente';
  document.getElementById('edit-id').value='';
  ['f-nombre','f-megas','f-precio','f-ip','f-telefono'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-dia').value=config.diaInicio;
  document.getElementById('mes-inicio-wrap').style.display='block';
  selectMesInicio('actual');
  document.getElementById('modal').classList.add('open');
  checkMegasDisponibles(null);
}

// Cuántos Mb se permite quedar "en números rojos" (banda vendida por
// encima del paquete contratado) antes de exigir ampliar el paquete sí o sí.
// Ahora es configurable desde Ajustes -> "Sobreventa permitida (Mb)".
// Si el valor no existe (datos antiguos), se mantiene el valor histórico de 5
// para no cambiar el comportamiento de negocios ya configurados.
const MAX_NUMEROS_ROJOS_DEFAULT=5;
const maxNumerosRojos=()=>(config.sobreventaMegas!=null?config.sobreventaMegas:MAX_NUMEROS_ROJOS_DEFAULT);

// Muestra debajo del campo "Megas asignados" cuánto queda libre (respetando el
// margen personal, config.margenMegas e incluyendo la sobreventa permitida,
// config.sobreventaMegas). Si no alcanza, permite quedar hasta el limite de
// sobreventa configurado en números rojos, pero siempre ofrece la opción de
// ampliar el paquete contratado para volver a estar en positivo (o dentro del margen).
function checkMegasDisponibles(editId) {
  const hint=document.getElementById('f-megas-hint');
  if(!hint) return;
  const megas=parseInt(document.getElementById('f-megas').value)||0;
  const disponible=megasDisponiblesParaVenta(editId);
  if(megas<=0){
    hint.className='megas-hint';
    const sobre=config.sobreventaMegas||0;
    const limTotal=config.megas+sobre;
    const sobreTxt=sobre>0?` · límite con sobreventa: ${limTotal} Mb`:'';
    hint.textContent=`Libre para vender: ${disponible} Mb (margen reservado: ${config.margenMegas||0} Mb${sobreTxt})`;
    return;
  }
  const faltan=megas-disponible;
  if(faltan>0){
    const sugerido=Math.ceil((config.megas+faltan)/5)*5;
    const botonAmpliar=`<button type="button" class="btn btn-amber btn-sm" style="margin-top:6px" onclick="ampliarPaquete(${sugerido},${editId===null?'null':editId})">Ampliar paquete a ${sugerido} Mb</button>`;
    if(faltan>maxNumerosRojos()){
      hint.className='megas-hint megas-hint-warn';
      hint.innerHTML=`⚠ Faltan ${faltan} Mb (te quedan ${disponible} Mb libres tras tu margen de ${config.margenMegas||0} Mb). Supera el límite de ${maxNumerosRojos()} Mb en números rojos. Sugerencia: contrata un paquete de al menos ${sugerido} Mb.
        ${botonAmpliar}`;
    } else {
      hint.className='megas-hint megas-hint-warn';
      hint.innerHTML=`🔴 Quedarás en números rojos: -${faltan} Mb (permitido hasta -${maxNumerosRojos()} Mb).
        ${botonAmpliar}`;
    }
  } else {
    hint.className='megas-hint megas-hint-ok';
    hint.textContent=`✓ Alcanza. Quedarán ${disponible-megas} Mb libres tras este cliente.`;
  }
}

// Amplía el paquete de megas contratados (config.megas) directamente desde
// el modal de cliente, cuando la banda no alcanza. El valor ya viene
// redondeado a múltiplo de 5 desde checkMegasDisponibles.
function ampliarPaquete(nuevoValor, editId) {
  config.megas=nuevoValor;
  save();
  render();
  checkMegasDisponibles(editId);
  notify(`Paquete contratado ampliado a ${nuevoValor} Mb`);
  if(window.FirebaseSync) window.FirebaseSync.syncConfig(config);
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
  document.getElementById('f-ip').value=c.ip||'';
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
  const ip    =document.getElementById('f-ip').value.trim();
  const mesInicio=document.getElementById('f-mes-inicio').value||'actual';
  if(!nombre){notify('El nombre es obligatorio',true);return;}
  const existe = clients.find(x=>x.id!==id && x.nombre.toLowerCase()===nombre.toLowerCase());
  if(existe && !confirm(`Ya existe un cliente llamado "${nombre}". ¿Continuar de todos modos?`)) return;
  // Solo verificar banda si se asignan megas. Se permite quedar hasta el limite
  // de sobreventa configurado (config.sobreventaMegas) "en números rojos"
  // (banda vendida de más); más allá de eso, se exige ampliar el paquete antes de guardar.
  let deficitMegas=0;
  if(megas>0){
    const disponible=megasDisponiblesParaVenta(id);
    const faltan=megas-disponible;
    if(faltan>maxNumerosRojos()){
      const sugerido=Math.ceil((config.megas+faltan)/5)*5;
      notify(`Sin banda suficiente (te faltan ${faltan} Mb, supera el límite de ${maxNumerosRojos()} Mb en números rojos). Sugerencia: contrata un paquete de al menos ${sugerido} Mb.`,true);
      return;
    }
    if(faltan>0) deficitMegas=faltan;
  }
  const ahora=new Date();
  let fechaInicio;
  if(!id){
    if(mesInicio==='proximo'){
      const p=new Date(ahora.getFullYear(),ahora.getMonth()+1,dia);
      fechaInicio=fechaLocalISO(p);
    } else {
      // BUG FIX: si el cliente se agrega con "mes actual" pero su día de pago
      // (dia) de ESTE mes ya pasó (ej. se agrega el 28 con día de pago 5),
      // fechaInicio quedaba apuntando a una fecha ya vencida ANTES de que el
      // cliente existiera. Eso lo mostraba "vencido" desde el momento de
      // crearlo, y al iniciar el mes siguiente le sumaba 1 mes de mora por un
      // ciclo que nunca tuvo oportunidad de pagar. Ahora, si el día de pago
      // de este mes ya pasó, arranca en la próxima aparición de ese día
      // (el mes que viene) en lugar de una fecha retroactiva.
      let a=new Date(ahora.getFullYear(),ahora.getMonth(),dia);
      const hoySinHora=new Date(ahora.getFullYear(),ahora.getMonth(),ahora.getDate());
      if(a<hoySinHora) a=new Date(ahora.getFullYear(),ahora.getMonth()+1,dia);
      fechaInicio=fechaLocalISO(a);
    }
  }
  let clienteId = id;
  if(typeof registrarParaDeshacer==='function') registrarParaDeshacer(id?`Editar cliente ${nombre}`:`Añadir cliente ${nombre}`);
  if(id){
    const idx=clients.findIndex(c=>c.id===id);
    if(idx>=0){
      // BUG FIX: fechaInicio (usada solo para mostrar el badge "Desde <día>"
      // cuando un cliente se agregó para empezar a cobrar en el futuro) se
      // guarda una sola vez al CREAR el cliente y nunca se tocaba al editar.
      // Si el usuario agregaba un cliente con el día de pago equivocado (ej.
      // día 10) y luego lo corregía (ej. a día 1), diaPago cambiaba pero
      // fechaInicio seguía apuntando al día viejo, y el badge se quedaba
      // pegado en "Desde 10 ago" para siempre. Ahora, si el día de pago
      // cambia al editar, se descarta fechaInicio para que el estado del
      // cliente se recalcule de forma normal (getStatus) con el día nuevo.
      const diaCambio=dia!==clients[idx].diaPago;
      const fechaInicioActualizada=diaCambio?undefined:clients[idx].fechaInicio;
      clients[idx]={...clients[idx],nombre,megas,precio,diaPago:dia,telefono,ip,fechaInicio:fechaInicioActualizada,ultimaEdicion:ahora.toISOString()};
    }
  } else {
    const newId=clients.length?Math.max(...clients.map(c=>c.id))+1:1;
    clients.push({id:newId,nombre,megas,precio,diaPago:dia,pagado:false,telefono,ip,mesInicio,fechaInicio,mora:0,ultimaEdicion:ahora.toISOString()});
    clienteId=newId;
  }
  save(); render(); closeModal();
  notify(id?`${nombre} actualizado`:`${nombre} añadido${mesInicio==='proximo'?' (desde próximo mes)':''}`+(deficitMegas>0?` — 🔴 en números rojos: -${deficitMegas} Mb`:''));
  // Sincroniza solo los datos mínimos (nombre, día de pago, monto, pagado) con
  // Firebase, para que la Cloud Function programada pueda enviar recordatorios
  // push aunque la app esté cerrada. Si Firebase no cargó (offline, bloqueado
  // por el usuario, etc.), esto simplemente no hace nada — no rompe el guardado local.
  if(window.FirebaseSync){
    const clienteGuardado=clients.find(c=>c.id===clienteId);
    if(clienteGuardado) window.FirebaseSync.syncCliente(clienteGuardado);
  }
}
