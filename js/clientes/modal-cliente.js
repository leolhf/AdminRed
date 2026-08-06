// modal-cliente.js
// Modal de alta/edicion de cliente.
// Depende de: state.js (clients, planes), storage-local.js (save), render.js (render), notify-ui.js (notify)
//             calculations.js (getPrecioCliente, megasDisponiblesParaVenta, etc.)

// ═══════════════════════════════════════════════════════════════════════════════
//  MODAL CLIENTE
// ═══════════════════════════════════════════════════════════════════════════════
function openAddModal() {
  document.getElementById('modal-title').textContent='Nuevo cliente';
  document.getElementById('edit-id').value='';
  ['f-nombre','f-megas','f-precio','f-ip','f-telefono'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('f-dia').value=config.diaInicio;
  document.getElementById('mes-inicio-wrap').style.display='block';
  selectMesInicio('actual');
  // Reset plan selector y descuento
  poblarSelectPlanes(null);
  document.getElementById('f-descuento').value='';
  document.getElementById('f-descuento-tipo').value='monto';
  // F4: reset suspendido checkbox (nuevo cliente siempre activo)
  const suspEl=document.getElementById('f-suspendido');
  if(suspEl) suspEl.checked=false;
  document.getElementById('modal').classList.add('open');
  checkMegasDisponibles(null);
}

// Cuantos Mb se permite quedar "en numeros rojos" (banda vendida por
// encima del paquete contratado) antes de exigir ampliar el paquete si o si.
// Ahora es configurable desde Ajustes -> "Sobreventa permitida (Mb)".
// Si el valor no existe (datos antiguos), se mantiene el valor historico de 5
// para no cambiar el comportamiento de negocios ya configurados.
const MAX_NUMEROS_ROJOS_DEFAULT=5;
const maxNumerosRojos=()=>(config.sobreventaMegas!=null?config.sobreventaMegas:MAX_NUMEROS_ROJOS_DEFAULT);

// Feature #5: poblar el selector de planes en el modal de cliente.
// Si hay planes definidos, muestra un <select> con "Sin plan" + los planes.
// Si no hay planes, oculta el campo (el cliente usa precio manual).
function poblarSelectPlanes(planIdSeleccionado) {
  const wrap=document.getElementById('f-plan-wrap');
  const sel=document.getElementById('f-plan');
  if(!wrap||!sel) return;
  if(!planes || planes.length===0){
    wrap.style.display='none';
    return;
  }
  wrap.style.display='';
  sel.innerHTML='<option value="">Sin plan (precio manual)</option>' +
    planes.map(p=>`<option value="${p.id}">${p.nombre} — ${p.megas} Mb · ${p.precio.toLocaleString()} CUP/Mb</option>`).join('');
  sel.value = planIdSeleccionado || '';
}

// Feature #5: al seleccionar un plan, auto-rellenar megas y precio del plan
// (el usuario puede sobreescribirlos manualmente despues).
function onPlanChange() {
  const sel=document.getElementById('f-plan');
  if(!sel || !sel.value) return;
  const plan=planes.find(p=>p.id==sel.value);
  if(!plan) return;
  document.getElementById('f-megas').value=plan.megas;
  document.getElementById('f-precio').value=plan.precio;
  const editId=parseInt(document.getElementById('edit-id').value)||null;
  checkMegasDisponibles(editId);
}

// Muestra debajo del campo "Megas asignados" cuanto queda libre (respetando el
// margen personal, config.margenMegas e incluyendo la sobreventa permitida,
// config.sobreventaMegas). Si no alcanza, permite quedar hasta el limite de
// sobreventa configurado en numeros rojos, pero siempre ofrece la opcion de
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
    const sobreTxt=sobre>0?` · limite con sobreventa: ${limTotal} Mb`:'';
    hint.textContent=`Libre para vender: ${disponible} Mb (margen reservado: ${config.margenMegas||0} Mb${sobreTxt})`;
    return;
  }
  const faltan=megas-disponible;
  if(faltan>0){
    const sugerido=Math.ceil((config.megas+faltan)/5)*5;
    const botonAmpliar=`<button type="button" class="btn btn-amber btn-sm" style="margin-top:6px" onclick="ampliarPaquete(${sugerido},${editId===null?'null':editId})">Ampliar paquete a ${sugerido} Mb</button>`;
    if(faltan>maxNumerosRojos()){
      hint.className='megas-hint megas-hint-warn';
      hint.innerHTML=`⚠ Faltan ${faltan} Mb (te quedan ${disponible} Mb libres tras tu margen de ${config.margenMegas||0} Mb). Supera el limite de ${maxNumerosRojos()} Mb en numeros rojos. Sugerencia: contrata un paquete de al menos ${sugerido} Mb.
        ${botonAmpliar}`;
    } else {
      hint.className='megas-hint megas-hint-warn';
      hint.innerHTML=`🔴 Quedaras en numeros rojos: -${faltan} Mb (permitido hasta -${maxNumerosRojos()} Mb).
        ${botonAmpliar}`;
    }
  } else {
    const restante=disponible-megas;
    // F5: alerta temprana cuando se acerca al limite de banda.
    // Si tras asignar este cliente quedan pocos megas libres (menos del 20%
    // del paquete contratado o menos de 10 Mb), mostramos aviso ambar en
    // lugar del verde "Alcanza", para que el admin lo tenga en cuenta.
    const umbralPct=Math.ceil(config.megas*0.2);
    const umbralCerca=Math.min(umbralPct, 10);
    if(restante<=umbralCerca){
      hint.className='megas-hint megas-hint-warn';
      hint.innerHTML=`⚠ Alcanza, pero apenas te quedaran ${restante} Mb libres tras este cliente. Considera ampliar el paquete pronto.`;
    } else {
      hint.className='megas-hint megas-hint-ok';
      hint.textContent=`✓ Alcanza. Quedaran ${restante} Mb libres tras este cliente.`;
    }
  }
}

// Amplia el paquete de megas contratados (config.megas) directamente desde
// el modal de cliente, cuando la banda no alcanza. El valor ya viene
// redondeado a multiplo de 5 desde checkMegasDisponibles.
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
  // Feature #5: plan asignado
  poblarSelectPlanes(c.planId||null);
  // Feature #10: descuento
  document.getElementById('f-descuento').value=c.descuento||'';
  document.getElementById('f-descuento-tipo').value=c.descuentoTipo||'monto';
  // F4: estado de conexión suspendido
  const suspEditEl=document.getElementById('f-suspendido');
  if(suspEditEl) suspEditEl.checked=!!c.suspendido;
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
  // Feature #5: plan asignado (opcional)
  const planIdEl=document.getElementById('f-plan');
  const planId=planIdEl&&planIdEl.value?parseInt(planIdEl.value):null;
  // Feature #10: descuento (opcional)
  const descuento=parseInt(document.getElementById('f-descuento').value)||0;
  const descuentoTipo=document.getElementById('f-descuento-tipo').value||'monto';
  // F4: estado de conexión suspendido
  const suspendidoEl=document.getElementById('f-suspendido');
  const suspendido=suspendidoEl?suspendidoEl.checked:false;
  if(!nombre){notify('El nombre es obligatorio',true);return;}
  const existe = clients.find(x=>x.id!==id && x.nombre.toLowerCase()===nombre.toLowerCase());
  if(existe && !confirm(`Ya existe un cliente llamado "${nombre}". ¿Continuar de todos modos?`)) return;
  // Solo verificar banda si se asignan megas. Se permite quedar hasta el limite
  // de sobreventa configurado (config.sobreventaMegas) "en numeros rojos"
  // (banda vendida de mas); mas alla de eso, se exige ampliar el paquete antes de guardar.
  let deficitMegas=0;
  if(megas>0){
    const disponible=megasDisponiblesParaVenta(id);
    const faltan=megas-disponible;
    if(faltan>maxNumerosRojos()){
      const sugerido=Math.ceil((config.megas+faltan)/5)*5;
      notify(`Sin banda suficiente (te faltan ${faltan} Mb, supera el limite de ${maxNumerosRojos()} Mb en numeros rojos). Sugerencia: contrata un paquete de al menos ${sugerido} Mb.`,true);
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
      // BUG FIX: si el cliente se agrega con "mes actual" pero su dia de pago
      // (dia) de ESTE mes ya paso (ej. se agrega el 28 con dia de pago 5),
      // fechaInicio quedaba apuntando a una fecha ya vencida ANTES de que el
      // cliente existiera. Eso lo mostraba "vencido" desde el momento de
      // crearlo, y al iniciar el mes siguiente le sumaba 1 mes de mora por un
      // ciclo que nunca tuvo oportunidad de pagar. Ahora, si el dia de pago
      // de este mes ya paso, arranca en la proxima aparicion de ese dia
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
      // BUG FIX: fechaInicio (usada solo para mostrar el badge "Desde <dia>"
      // cuando un cliente se agrego para empezar a cobrar en el futuro) se
      // guarda una sola vez al CREAR el cliente y nunca se tocaba al editar.
      // Si el usuario agregaba un cliente con el dia de pago equivocado (ej.
      // dia 10) y luego lo corregia (ej. a dia 1), diaPago cambiaba pero
      // fechaInicio seguia apuntando al dia viejo, y el badge se quedaba
      // pegado en "Desde 10 ago" para siempre. Ahora, si el dia de pago
      // cambia al editar, se descarta fechaInicio para que el estado del
      // cliente se recalcule de forma normal (getStatus) con el dia nuevo.
      const diaCambio=dia!==clients[idx].diaPago;
      const fechaInicioActualizada=diaCambio?undefined:clients[idx].fechaInicio;
      clients[idx]={...clients[idx],nombre,megas,precio,diaPago:dia,telefono,ip,planId,descuento,descuentoTipo,suspendido,fechaInicio:fechaInicioActualizada,ultimaEdicion:ahora.toISOString()};
    }
  } else {
    const newId=clients.length?Math.max(...clients.map(c=>c.id))+1:1;
    clients.push({id:newId,nombre,megas,precio,diaPago:dia,pagado:false,telefono,ip,planId,descuento:descuento||0,descuentoTipo,mesInicio,fechaInicio,mora:0,suspendido:false,ultimaEdicion:ahora.toISOString()});
    clienteId=newId;
  }
  save(); render(); closeModal();
  notify(id?`${nombre} actualizado`:`${nombre} añadido${mesInicio==='proximo'?' (desde proximo mes)':''}`+(deficitMegas>0?` — 🔴 en numeros rojos: -${deficitMegas} Mb`:''));
  // Sincroniza solo los datos minimos (nombre, dia de pago, monto, pagado) con
  // Firebase, para que la Cloud Function programada pueda enviar recordatorios
  // push aunque la app este cerrada. Si Firebase no cargo (offline, bloqueado
  // por el usuario, etc.), esto simplemente no hace nada — no rompe el guardado local.
  if(window.FirebaseSync){
    const clienteGuardado=clients.find(c=>c.id===clienteId);
    if(clienteGuardado) window.FirebaseSync.syncCliente(clienteGuardado);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FEATURE #5: GESTION DE PLANES
//  CRUD basico de planes de internet. Los planes defieren megas+precio fijos
//  que se pueden asignar a clientes en lugar de setear megas/precio manualmente.
// ═══════════════════════════════════════════════════════════════════════════════
function openPlanesModal() {
  renderPlanesList();
  // Limpiar formulario
  document.getElementById('plan-edit-id').value='';
  document.getElementById('plan-nombre').value='';
  document.getElementById('plan-megas').value='';
  document.getElementById('plan-precio').value='';
  document.getElementById('plan-desc').value='';
  document.getElementById('modal-planes').classList.add('open');
}

function closePlanesModal() {
  document.getElementById('modal-planes').classList.remove('open');
}

function renderPlanesList() {
  const el=document.getElementById('planes-list');
  if(!el) return;
  if(!planes.length){
    el.innerHTML='<div class="empty-state">No hay planes definidos. Crea uno arriba.</div>';
    return;
  }
  el.innerHTML=planes.map(p=>{
    const nClientes=clients.filter(c=>c.planId===p.id).length;
    return `<div class="plan-item">
      <div style="flex:1">
        <strong>${p.nombre}</strong>
        <span class="text-muted mono" style="margin-left:8px">${p.megas} Mb · ${p.precio.toLocaleString()} CUP/Mb</span>
        ${p.descripcion?`<div style="font-size:0.72rem;color:var(--text-muted)">${p.descripcion}</div>`:''}
        <div style="font-size:0.72rem;color:var(--blue)">${nClientes} cliente(s) asignado(s)</div>
      </div>
      <div class="action-group">
        <button class="btn btn-ghost btn-sm" onclick="editarPlan(${p.id})" title="Editar">✏</button>
        <button class="btn btn-red btn-sm" onclick="eliminarPlan(${p.id})" title="Eliminar">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function editarPlan(id) {
  const p=planes.find(x=>x.id===id); if(!p) return;
  document.getElementById('plan-edit-id').value=id;
  document.getElementById('plan-nombre').value=p.nombre;
  document.getElementById('plan-megas').value=p.megas;
  document.getElementById('plan-precio').value=p.precio;
  document.getElementById('plan-desc').value=p.descripcion||'';
}

function guardarPlan() {
  const id=parseInt(document.getElementById('plan-edit-id').value);
  const nombre=document.getElementById('plan-nombre').value.trim();
  const megas=parseInt(document.getElementById('plan-megas').value);
  const precio=parseInt(document.getElementById('plan-precio').value);
  const descripcion=document.getElementById('plan-desc').value.trim();
  if(!nombre||!megas||!precio){notify('Completa nombre, megas y precio',true);return;}
  if(id){
    const idx=planes.findIndex(p=>p.id===id);
    if(idx>=0) planes[idx]={...planes[idx],nombre,megas,precio,descripcion};
  } else {
    const newId=planes.length?Math.max(...planes.map(p=>p.id))+1:1;
    planes.push({id:newId,nombre,megas,precio,descripcion});
  }
  save(); renderPlanesList();
  // Limpiar formulario
  document.getElementById('plan-edit-id').value='';
  document.getElementById('plan-nombre').value='';
  document.getElementById('plan-megas').value='';
  document.getElementById('plan-precio').value='';
  document.getElementById('plan-desc').value='';
  notify(id?'Plan actualizado':'Plan creado');
}

function eliminarPlan(id) {
  const p=planes.find(x=>x.id===id); if(!p) return;
  const nClientes=clients.filter(c=>c.planId===id).length;
  if(nClientes>0){
    if(!confirm(`⚠ ${nClientes} cliente(s) tienen este plan asignado. Si lo eliminas, quedaran sin plan (usaran su precio manual). ¿Continuar?`)) return;
    // Quitar planId de los clientes que lo tenian
    clients.forEach(c=>{ if(c.planId===id) c.planId=null; });
  } else {
    if(!confirm(`¿Eliminar el plan "${p.nombre}"?`)) return;
  }
  planes=planes.filter(x=>x.id!==id);
  save(); renderPlanesList(); render();
  notify('Plan eliminado');
}
