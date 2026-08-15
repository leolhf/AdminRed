// cliente-modal-forms.js
// Formularios, validación y guardado del modal de cliente
// Depende de: state.js (clients, config), storage-local.js (save),
//             calculations-clientes.js (megasDisponiblesParaVenta),
//             calculations-utils.js (fechaLocalISO)

// Cuantos Mb se permite quedar "en numeros rojos" (banda vendida por
// encima del paquete contratado) antes de exigir ampliar el paquete si o si.
// Ahora es configurable desde Ajustes -> "Sobreventa permitida (Mb)".
// Si el valor no existe (datos antiguos), se mantiene el valor historico de 5
// para no cambiar el comportamiento de negocios ya configurados.
const MAX_NUMEROS_ROJOS_DEFAULT=5;
const maxNumerosRojos=()=>(config.sobreventaMegas!=null?config.sobreventaMegas:MAX_NUMEROS_ROJOS_DEFAULT);

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

// selectMesInicio(val): conservado por compatibilidad (algunas llamadas
// antiguas podrian invocarlo). La seleccion de mes ahora se hace con el
// mini-calendario (pagoCalSeleccionar), asi que esta funcion es un no-op.
function selectMesInicio(val) { /* reemplazado por pagoCalInit/pagoCalSeleccionar */ }

function saveClient() {
  const id    =parseInt(document.getElementById('edit-id').value);
  const nombre=document.getElementById('f-nombre').value.trim();
  const megas =parseInt(document.getElementById('f-megas').value);
  const precio=parseInt(document.getElementById('f-precio').value);
  // dia de pago + fechaInicio ahora vienen del mini-calendario.
  // f-dia y f-fecha-inicio-iso los setea pagoCalSeleccionar().
  // f-mes-inicio se conserva como 'pasado'|'actual'|'proximo' para compat.
  const dia   =parseInt(document.getElementById('f-dia').value)||config.diaInicio;
  const telefono=document.getElementById('f-telefono').value.trim();
  const ip    =document.getElementById('f-ip').value.trim();
  const mesInicio=document.getElementById('f-mes-inicio').value||'actual';
  const fechaInicioISO=document.getElementById('f-fecha-inicio-iso').value||'';
  // Checkbox "Ya pago este ciclo": aparece solo cuando la fecha de inicio
  // seleccionada ya vencio (alta retroactiva). Si se marca, el cliente se
  // crea con pagado=true y mora=0 para que month-reset no le genere mora
  // por un ciclo que el admin confirma que ya se cobro manualmente.
  const yaPagoEl=document.getElementById('f-ya-pago');
  const yaPago=yaPagoEl?yaPagoEl.checked:false;
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
      notify(`Sin banda suficiente. Amplia el paquete a al menos ${sugerido} Mb o reduce los megas asignados.`,true);
      return;
    }
    deficitMegas = Math.max(0, faltan);
  }
  if(id){
    // Editar cliente existente
    const c=clients.find(x=>x.id===id);
    if(!c) return notify('Cliente no encontrado',true);
    c.nombre=nombre;
    c.megas=megas;
    c.precio=precio;
    c.diaPago=dia;
    c.telefono=telefono;
    c.ip=ip;
    c.planId=planId;
    c.descuento=descuento;
    c.descuentoTipo=descuentoTipo;
    c.suspendido=suspendido;
    // Solo actualizar fechaInicio si se seleccionó una nueva en el calendario
    if(fechaInicioISO && c.fechaInicio!==fechaInicioISO){
      c.fechaInicio=fechaInicioISO;
      c.mesInicio=mesInicio;
    }
    notify('Cliente actualizado');
  } else {
    // Nuevo cliente
    const nuevo={
      id:Date.now(),
      nombre,
      megas,
      precio,
      diaPago:dia,
      telefono,
      ip,
      planId,
      descuento,
      descuentoTipo,
      suspendido,
      pagado:yaPago,
      mora:yaPago?0:0,
      fechaInicio:fechaInicioISO||null,
      mesInicio:mesInicio,
      deudaEquipo:0
    };
    clients.push(nuevo);
    notify('Cliente creado');
  }
  save(); render(); closeModal();
  if(window.FirebaseSync) window.FirebaseSync.syncClients(clients);
}