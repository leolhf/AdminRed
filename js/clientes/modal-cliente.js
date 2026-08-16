// modal-cliente.js
// Modal de alta/edicion de cliente.
// Depende de: state.js (clients, planes), storage-local.js (save), render.js (render), notify-ui.js (notify)
//             calculations.js (getPrecioCliente, megasDisponiblesParaVenta, etc.)

// ═══════════════════════════════════════════════════════════════════════════════
//  MODAL CLIENTE
// ═══════════════════════════════════════════════════════════════════════════════
// Rangos de dias habiles de pago (dias incluidos en cada "corte").
const PAGO_CAL_RANGOS = [[1,5],[10,15],[20,25]];
// Limite de navegacion hacia atras/adelante (meses).
const PAGO_CAL_MAX_ATRAS = -12;
const PAGO_CAL_MAX_ADELANTE = 12;

// Estado interno del mini-calendario del modal.
let pagoCalOffset = 0;      // 0 = mes actual, -1 = mes anterior, +1 = proximo...
let pagoCalSeleccion = null; // { dia, anio, mes } del dia seleccionado, o null

// ¿Un numero de dia cae dentro de algun rango habil?
function pagoCalEsHabil(dia) {
  return PAGO_CAL_RANGOS.some(function(r){ return dia >= r[0] && dia <= r[1]; });
}

// Nombres cortos de dias de la semana (L-D). El calendario arranca en lunes.
const PAGO_CAL_DOW = ['L','M','X','J','V','S','D'];

// Renderiza la cabecera de dias de la semana (fija, L-D).
function pagoCalRenderDow() {
  const el = document.getElementById('pago-cal-dow');
  if (!el) return;
  el.innerHTML = PAGO_CAL_DOW.map(function(d){ return '<span>'+d+'</span>'; }).join('');
}

// Devuelve la fecha base del mes que se esta mostrando (dia 1).
function pagoCalFechaBase() {
  const ahora = new Date();
  return new Date(ahora.getFullYear(), ahora.getMonth() + pagoCalOffset, 1);
}

// Renderiza el grid del mes actual del mini-calendario.
function pagoCalRender() {
  const grid = document.getElementById('pago-cal-grid');
  const titulo = document.getElementById('pago-cal-titulo');
  if (!grid || !titulo) return;

  const base = pagoCalFechaBase();
  const anio = base.getFullYear();
  const mes = base.getMonth(); // 0-11
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  // Dia de la semana del dia 1 (0=domingo...6=sabado). Convertir a base Lunes=0.
  let dow0 = new Date(anio, mes, 1).getDay();
  dow0 = dow0 === 0 ? 6 : dow0 - 1; // lunes=0 ... domingo=6

  titulo.textContent = base.toLocaleDateString('es-CU', { month: 'long', year: 'numeric' });

  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const hoyMs = hoy.getTime();

  let html = '';
  for (let i = 0; i < dow0; i++) html += '<div class="pago-cal-cell empty"></div>';
  for (let d = 1; d <= diasEnMes; d++) {
    const fechaDia = new Date(anio, mes, d); fechaDia.setHours(0,0,0,0);
    const esHoy = fechaDia.getTime() === hoyMs;
    const esPasado = fechaDia < hoy;
    const habil = pagoCalEsHabil(d);
    let cls = 'pago-cal-cell';
    if (habil) cls += ' habil';
    if (esPasado) cls += ' pasado';
    if (esHoy) cls += ' hoy';
    if (pagoCalSeleccion && pagoCalSeleccion.dia === d &&
        pagoCalSeleccion.mes === mes && pagoCalSeleccion.anio === anio) {
      cls += ' selected';
    }
    const onclick = habil ? 'onclick="pagoCalSeleccionar('+d+','+mes+','+anio+')"' : '';
    html += '<div class="'+cls+'" '+onclick+'>'+d+'</div>';
  }
  grid.innerHTML = html;

  const prev = document.getElementById('pago-cal-prev');
  const next = document.getElementById('pago-cal-next');
  if (prev) prev.disabled = (pagoCalOffset <= PAGO_CAL_MAX_ATRAS);
  if (next) next.disabled = (pagoCalOffset >= PAGO_CAL_MAX_ADELANTE);

  pagoCalActualizarResumen();
}

// Navega un mes adelante (+1) o atras (-1).
function pagoCalCambiarMes(delta) {
  const nuevo = pagoCalOffset + delta;
  if (nuevo < PAGO_CAL_MAX_ATRAS || nuevo > PAGO_CAL_MAX_ADELANTE) return;
  pagoCalOffset = nuevo;
  pagoCalRender();
}

// Selecciona un dia habil. Define diaPago + fechaInicio + mesInicio.
function pagoCalSeleccionar(dia, mes, anio) {
  pagoCalSeleccion = { dia: dia, mes: mes, anio: anio };
  document.getElementById('f-dia').value = dia;
  const fecha = new Date(anio, mes, dia);
  document.getElementById('f-fecha-inicio-iso').value = fechaLocalISO(fecha);

  // Determinar mesInicio relativo al mes de hoy (compat con logica existente).
  const ahora = new Date();
  const mesHoy = ahora.getMonth(), anioHoy = ahora.getFullYear();
  let mesInicio = 'actual';
  if (anio < anioHoy || (anio === anioHoy && mes < mesHoy)) mesInicio = 'pasado';
  else if (anio > anioHoy || (anio === anioHoy && mes > mesHoy)) mesInicio = 'proximo';
  document.getElementById('f-mes-inicio').value = mesInicio;

  pagoCalRender();
}

// Actualiza el resumen "Inicio de cobro" y muestra/oculta el checkbox
// "Ya pago este ciclo" cuando la fecha seleccionada ya vencio.
function pagoCalActualizarResumen() {
  const val = document.getElementById('pago-cal-val');
  const box = document.getElementById('pago-pago-ciclo');
  if (!val || !box) return;

  if (!pagoCalSeleccion) {
    val.textContent = 'Sin seleccionar';
    val.classList.remove('pasado');
    box.classList.remove('show');
    const chk = document.getElementById('f-ya-pago');
    if (chk) chk.checked = false;
    return;
  }

  const dia = pagoCalSeleccion.dia, mes = pagoCalSeleccion.mes, anio = pagoCalSeleccion.anio;
  const fecha = new Date(anio, mes, dia); fecha.setHours(0,0,0,0);
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const esPasado = fecha < hoy;
  const label = fecha.toLocaleDateString('es-CU', { day: 'numeric', month: 'short', year: 'numeric' });

  const ahora = new Date();
  const mesHoy = ahora.getMonth(), anioHoy = ahora.getFullYear();
  let rel = '';
  if (anio < anioHoy || (anio === anioHoy && mes < mesHoy)) rel = ' (mes pasado)';
  else if (anio > anioHoy || (anio === anioHoy && mes > mesHoy)) rel = ' (proximo mes)';

  val.textContent = 'Dia ' + dia + ' \u00b7 ' + label + rel;
  val.classList.toggle('pasado', esPasado);

  box.classList.toggle('show', esPasado);
  if (!esPasado) { const chk = document.getElementById('f-ya-pago'); if (chk) chk.checked = false; }
}

// Inicializa el mini-calendario al abrir el modal.
function pagoCalInit(diaPreseleccionado, fechaInicioExistente) {
  pagoCalRenderDow();
  pagoCalOffset = 0;
  pagoCalSeleccion = null;

  if (fechaInicioExistente) {
    const fi = new Date(fechaInicioExistente + 'T00:00:00');
    const ahora = new Date();
    pagoCalOffset = (fi.getFullYear() - ahora.getFullYear()) * 12 +
                    (fi.getMonth() - ahora.getMonth());
    if (pagoCalOffset < PAGO_CAL_MAX_ATRAS) pagoCalOffset = PAGO_CAL_MAX_ATRAS;
    if (pagoCalOffset > PAGO_CAL_MAX_ADELANTE) pagoCalOffset = PAGO_CAL_MAX_ADELANTE;
    pagoCalSeleccionar(fi.getDate(), fi.getMonth(), fi.getFullYear());
  } else {
    const dia = diaPreseleccionado || config.diaInicio;
    const ahora = new Date();
    if (pagoCalEsHabil(dia)) {
      pagoCalSeleccionar(dia, ahora.getMonth(), ahora.getFullYear());
    }
  }
  pagoCalRender();
}

function openAddModal() {
  document.getElementById('modal-title').textContent='Nuevo cliente';
  document.getElementById('edit-id').value='';
  ['f-nombre','f-megas','f-precio','f-ip','f-telefono'].forEach(id=>document.getElementById(id).value='');
  // Inicializar el mini-calendario de dia de pago (preselecciona config.diaInicio
  // en el mes actual). Reemplaza al input numerico + toggle Este/Proximo mes.
  pagoCalInit(config.diaInicio, null);
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

// selectMesInicio(val): conservado por compatibilidad (algunas llamadas
// antiguas podrian invocarlo). La seleccion de mes ahora se hace con el
// mini-calendario (pagoCalSeleccionar), asi que esta funcion es un no-op.
function selectMesInicio(val) { /* reemplazado por pagoCalInit/pagoCalSeleccionar */ }

function editClient(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  document.getElementById('modal-title').textContent='Editar cliente';
  document.getElementById('edit-id').value=id;
  document.getElementById('f-nombre').value=c.nombre;
  document.getElementById('f-megas').value=c.megas;
  document.getElementById('f-precio').value=c.precio;
  // El dia de pago y la fecha de inicio se gestionan con el mini-calendario.
  // Se inicializa con el diaPago del cliente y, si tiene fechaInicio, se
  // navega a ese mes y se selecciona ese dia. Al editar NO se ofrece el
  // checkbox "ya pago este ciclo" (eso se maneja desde la pantalla de cobros).
  pagoCalInit(c.diaPago||config.diaInicio, c.fechaInicio||null);
  const cicloBox=document.getElementById('pago-pago-ciclo');
  if(cicloBox) cicloBox.classList.remove('show');
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
  // mes-inicio-wrap fue reemplazado por el mini-calendario; nada que ocultar.
  document.getElementById('modal').classList.add('open');
  checkMegasDisponibles(id);
}

function closeModal(){ document.getElementById('modal').classList.remove('open'); }

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
      notify(`Sin banda suficiente (te faltan ${faltan} Mb, supera el limite de ${maxNumerosRojos()} Mb en numeros rojos). Sugerencia: contrata un paquete de al menos ${sugerido} Mb.`,true);
      return;
    }
    if(faltan>0) deficitMegas=faltan;
  }
  const ahora=new Date();
  // fechaInicio ahora proviene del mini-calendario (f-fecha-inicio-iso),
  // que el admin selecciono explicitamente. Esto reemplaza la logica anterior
  // que inferia la fecha a partir del toggle "este mes / proximo mes".
  // - Si el admin selecciono una fecha futura, el cliente arranca ese dia
  //   (badge "Desde <mes>" via clientLabel).
  // - Si selecciono una fecha pasada (alta retroactiva, ej. cliente del mes
  //   pasado) y marco "Ya pago este ciclo", se guarda con pagado=true y mora=0
  //   para que month-reset no le genere mora por un ciclo ya cobrado.
  // - Si selecciono una fecha pasada y NO marco "Ya pago", se guarda con
  //   pagado=false (month-reset le sumara la mora correspondiente al reiniciar).
  let fechaInicio;
  if(!id){
    if(fechaInicioISO){
      fechaInicio=fechaInicioISO;
    } else {
      // Fallback: si por alguna razon el calendario no dejo fecha (ej. dia
      // no habil y no se selecciono nada), usar el dia de pago en el mes
      // actual; si ese dia ya paso, arrancar el mes que viene.
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
    // Si es alta retroactiva (fecha pasada) y el admin marco "Ya pago este
    // ciclo", el cliente arranca con pagado=true y mora=0 para que
    // month-reset no le genere mora por un ciclo ya cobrado manualmente.
    clients.push({id:newId,nombre,megas,precio,diaPago:dia,pagado:yaPago,telefono,ip,planId,descuento:descuento||0,descuentoTipo,mesInicio,fechaInicio,mora:0,suspendido:false,ultimaEdicion:ahora.toISOString()});
    clienteId=newId;
  }
  save(); render(); closeModal();
  notify(id?`${nombre} actualizado`:`${nombre} añadido${mesInicio==='proximo'?' (desde proximo mes)':''}${mesInicio==='pasado'?(yaPago?' — alta retroactiva, ciclo ya pagado':' — alta retroactiva'):''}`+(deficitMegas>0?` — 🔴 en numeros rojos: -${deficitMegas} Mb`:''));
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
