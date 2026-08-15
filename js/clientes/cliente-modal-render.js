// cliente-modal-render.js
// Renderizado del modal de cliente y gestión de planes
// Depende de: state.js (clients, planes, config), 
//             cliente-modal-calendar.js (pagoCalInit),
//             calculations-clientes.js (megasDisponiblesParaVenta)

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

// ═══════════════════════════════════════════════════════════════════════════════
//  MODAL DE PLANES
// ═══════════════════════════════════════════════════════════════════════════════
function openPlanesModal() {
  document.getElementById('modal-planes').classList.add('open');
  renderPlanesList();
}

function closePlanesModal() {
  document.getElementById('modal-planes').classList.remove('open');
}

function renderPlanesList() {
  const container = document.getElementById('planes-list');
  if(!container) return;
  
  if(!planes || planes.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay planes definidos. Crea el primero para empezar.</div>';
    return;
  }
  
  let html = '';
  planes.forEach(p => {
    html += `
      <div class="plan-card" data-id="${p.id}">
        <div class="plan-info">
          <strong>${escapeHtml(p.nombre)}</strong>
          <span class="plan-meta">${p.megas} Mb · ${p.precio.toLocaleString()} CUP/Mb</span>
        </div>
        <div class="plan-actions">
          <button class="btn btn-sm btn-secondary" onclick="editarPlan(${p.id})">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="eliminarPlan(${p.id})">Eliminar</button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function editarPlan(id) {
  const plan = planes.find(p => p.id === id);
  if(!plan) return;
  
  document.getElementById('plan-edit-id').value = id;
  document.getElementById('plan-nombre').value = plan.nombre;
  document.getElementById('plan-megas').value = plan.megas;
  document.getElementById('plan-precio').value = plan.precio;
  document.getElementById('plan-modal-title').textContent = 'Editar plan';
}

function guardarPlan() {
  const id = parseInt(document.getElementById('plan-edit-id').value);
  const nombre = document.getElementById('plan-nombre').value.trim();
  const megas = parseInt(document.getElementById('plan-megas').value);
  const precio = parseInt(document.getElementById('plan-precio').value);
  
  if(!nombre) return notify('El nombre del plan es obligatorio', true);
  if(!megas || megas <= 0) return notify('Los megas deben ser mayores a 0', true);
  if(!precio || precio <= 0) return notify('El precio debe ser mayor a 0', true);
  
  if(id) {
    // Editar plan existente
    const plan = plans.find(p => p.id === id);
    if(plan) {
      plan.nombre = nombre;
      plan.megas = megas;
      plan.precio = precio;
    }
  } else {
    // Crear nuevo plan
    planes.push({
      id: Date.now(),
      nombre: nombre,
      megas: megas,
      precio: precio
    });
  }
  
  save(); renderPlanesList(); render();
  notify('Plan guardado correctamente');
  
  // Limpiar formulario
  document.getElementById('plan-edit-id').value = '';
  document.getElementById('plan-nombre').value = '';
  document.getElementById('plan-megas').value = '';
  document.getElementById('plan-precio').value = '';
  document.getElementById('plan-modal-title').textContent = 'Nuevo plan';
}

function eliminarPlan(id) {
  if(!confirm('¿Eliminar este plan? Los clientes asignados a este plan pasarán a precio manual.')) return;
  
  const idx = plans.findIndex(p => p.id === id);
  if(idx !== -1) {
    plans.splice(idx, 1);
    // Eliminar asignación de plan de los clientes
    clients.forEach(c => {
      if(c.planId === id) c.planId = null;
    });
    save(); renderPlanesList(); render();
    notify('Plan eliminado correctamente');
  }
}