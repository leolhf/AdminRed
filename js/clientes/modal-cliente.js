/**
 * clientes/modal-cliente.js — Alta/edición de clientes, CRUD de planes, descuento recurrente.
 * v5.8.8 — Plan "Personalizado": megas asignados + precio por mega (venta),
 *          el costo para el cliente se calcula automáticamente (megas × precioPorMega).
 */
RN.modalCliente = RN.modalCliente || {};

RN.modalCliente._editId = null;

/**
 * Importa datos desde la lista de contactos del dispositivo (Contact Picker API).
 * Disponible en Chrome Android (Chrome 80+, Android M+). Requiere HTTPS y gesto del usuario.
 * Pide nombre, teléfono y dirección. Llena los campos del modal si están visibles.
 */
RN.modalCliente.importarDeContactos = async function () {
  // Feature detection
  if (!('contacts' in navigator) || !('ContactsManager' in window)) {
    RN.notifyUI.toast('Tu navegador no soporta Contact Picker API. Usa Chrome en Android.', 'warn');
    return;
  }

  try {
    // Verificar qué propiedades soporta el dispositivo
    const propsDisponibles = await navigator.contacts.getProperties();
    const props = [];
    if (propsDisponibles.includes('name')) props.push('name');
    if (propsDisponibles.includes('tel')) props.push('tel');
    if (propsDisponibles.includes('address')) props.push('address');

    if (props.length === 0) {
      RN.notifyUI.toast('El dispositivo no permite compartir datos de contactos.', 'warn');
      return;
    }

    // Mostrar el picker (selección de un solo contacto)
    const contacts = await navigator.contacts.select(props, { multiple: false });

    if (!contacts || contacts.length === 0) {
      // El usuario canceló
      return;
    }

    const contacto = contacts[0];

    // Llenar nombre
    if (contacto.name && contacto.name.length > 0) {
      const nombreInput = document.getElementById('cl-nombre');
      if (nombreInput && !nombreInput.value.trim()) {
        // Solo llenar si está vacío (no sobreescribir si ya tiene datos)
        nombreInput.value = contacto.name[0];
      } else if (nombreInput) {
        // v5.13.5 (ISSUE #19): Usar RN.uiComponents.confirm() en lugar del
        // confirm() nativo para mantener consistencia visual con el tema.
        RN.uiComponents.confirm(
          'Reemplazar nombre',
          '¿Reemplazar el nombre actual ("' + nombreInput.value + '") por "' + contacto.name[0] + '"?',
          function () { nombreInput.value = contacto.name[0]; }
        );
      }
    }

    // Llenar teléfono
    if (contacto.tel && contacto.tel.length > 0) {
      const telInput = document.getElementById('cl-tel');
      if (telInput) {
        if (contacto.tel.length === 1) {
          telInput.value = contacto.tel[0];
        } else {
          // v5.13.5 (ISSUE #19): Múltiples números — usar RN.uiComponents con
          // selección. Antes se usaba prompt() nativo. Como el prompt estilizado
          // es de texto libre, lo mantenemos pero con el componente de la app.
          const opciones = contacto.tel.map((t, i) => (i + 1) + '. ' + t).join('\n');
          RN.uiComponents.prompt(
            'Varios números',
            'El contacto tiene varios números:\n' + opciones + '\n\nEscribe el número de la opción (1-' + contacto.tel.length + '):',
            '1',
            function (valor) {
              var i = parseInt(valor, 10) - 1;
              if (i >= 0 && i < contacto.tel.length) {
                telInput.value = contacto.tel[i];
              } else {
                telInput.value = contacto.tel[0]; // fallback al primero
              }
            },
            { type: 'number', step: '1' }
          );
        }
      }
    } else {
      RN.notifyUI.toast('Este contacto no tiene número de teléfono.', 'warn');
    }

    // Llenar dirección
    if (contacto.address && contacto.address.length > 0) {
      const dirInput = document.getElementById('cl-dir');
      if (dirInput) {
        const addr = contacto.address[0];
        // Construir string de dirección desde los campos disponibles
        let partes = [];
        if (addr.streetAddress) partes.push(addr.streetAddress);
        if (addr.city) partes.push(addr.city);
        if (addr.region) partes.push(addr.region);
        if (addr.postalCode) partes.push(addr.postalCode);
        if (partes.length > 0) {
          dirInput.value = partes.join(', ');
        }
      }
    }

    RN.notifyUI.toast('Datos importados del contacto', 'success');
  } catch (e) {
    if (e.name !== 'AbortError') {
      RN.notifyUI.toast('Error al importar contacto: ' + e.message, 'error');
    }
  }
};

/** Verifica si la Contact Picker API está disponible en este navegador. */
RN.modalCliente.soportaContactos = function () {
  return ('contacts' in navigator) && ('ContactsManager' in window);
};

/** Recalcula el precio mensual del cliente personalizado y muestra el desglose. v5.8.8 */
RN.modalCliente.recalcPersonalizado = function () {
  const planVal = (document.getElementById('cl-plan') || {}).value;
  const grupo = document.getElementById('cl-grupo-personalizado');
  if (!grupo) return;
  // Mostrar el bloque solo cuando NO hay plan seleccionado (personalizado)
  grupo.style.display = planVal ? 'none' : '';

  if (planVal) return; // si hay plan, los datos vienen del plan

  const megas = parseFloat((document.getElementById('cl-megas') || {}).value) || 0;
  const precioMega = parseFloat((document.getElementById('cl-precio-mega') || {}).value) || 0;
  const precio = +(megas * precioMega).toFixed(2);

  // Volcar el cálculo en el campo precio (oculto o visible) para que guardar() lo use
  const precioInput = document.getElementById('cl-precio');
  if (precioInput) precioInput.value = precio;

  // Desglose visible
  const desglose = document.getElementById('cl-desglose-personalizado');
  if (desglose) {
    if (megas > 0 && precioMega > 0) {
      desglose.style.display = '';
      desglose.innerHTML = '<strong>' + megas + ' Megas \u00d7 ' + precioMega + ' CUP/Mega = ' + RN.calc.formatCUP(precio) + '</strong>';
    } else {
      desglose.style.display = '';
      desglose.innerHTML = '<span class="muted">Ingresa megas y precio por mega para calcular el costo mensual</span>';
    }
  }
};

RN.modalCliente.abrir = function (id) {
  RN.modalCliente._editId = id || null;
  const c = id ? RN.state.clients.find(x => x.id === id) : null;
  const planesOpts = RN.state.planes.map(p => `<option value="${p.id}" ${c && c.planId === p.id ? 'selected' : ''}>${RN.render.esc(p.nombre)} \u00b7 ${p.megas}M \u00b7 ${RN.calc.formatCUP(p.precio)}</option>`).join('');

  const html = `
    <div class="modal-header"><h3>${c ? 'Editar cliente' : 'Nuevo cliente'}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">\u00d7</button></div>
    <div class="modal-body">
      <div class="form-row"><div><label>Nombre *</label><input id="cl-nombre" value="${RN.render.esc(c ? c.nombre : '')}"></div></div>
      <div class="form-row cols-2">
        <div><label>Tel\u00e9fono</label>
          <div style="display:flex;gap:6px;align-items:flex-end">
            <input id="cl-tel" value="${RN.render.esc(c ? c.telefono : '')}" placeholder="+53..." style="flex:1">
            ${RN.modalCliente.soportaContactos() ? '<button type="button" class="btn" style="white-space:nowrap;padding:8px 10px" onclick="RN.modalCliente.importarDeContactos()" title="Importar desde contactos del tel\u00e9fono">\ud83d\udccd Contactos</button>' : ''}
          </div>
        </div>
        <div><label>Direcci\u00f3n</label><input id="cl-dir" value="${RN.render.esc(c ? c.direccion : '')}"></div>
        <div><label>IP / Direcci\u00f3n de red <span class="muted" style="font-size:11px">(ej: 192.168.1.10)</span></label><input id="cl-ip" inputmode="decimal" pattern="[0-9.]*" maxlength="15" value="${RN.render.esc(c ? c.ip : '')}" placeholder="Ej: 192.168.1.10" oninput="this.value=this.value.replace(/[^0-9.]/g,'')"></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Plan de servicio</label>
          <select id="cl-plan" onchange="RN.modalCliente.recalcPersonalizado()"><option value="">\u2014 Personalizado \u2014</option>${planesOpts}</select>
        </div>
        <div><label>Precio mensual (CUP) *</label><input id="cl-precio" type="number" step="0.01" value="${c ? (c.precio || 0) : ''}" oninput="RN.modalCliente.recalcPersonalizado()"></div>
      </div>

      <div id="cl-grupo-personalizado" class="form-row cols-2" style="${c && c.planId ? 'display:none' : ''}">
        <div><label>Megas asignados (Mbps)</label><input id="cl-megas" type="number" step="1" min="0" value="${c ? (c.megas || 0) : 0}" placeholder="Ej: 30" oninput="RN.modalCliente.recalcPersonalizado()"></div>
        <div><label>Precio por mega (CUP/Mbps) \u2014 lo que cobras</label><input id="cl-precio-mega" type="number" step="0.01" min="0" value="${c ? (c.precioMega || 0) : 0}" placeholder="Ej: 40" oninput="RN.modalCliente.recalcPersonalizado()"></div>
      </div>
      <div id="cl-desglose-personalizado" class="cobro-desglose" style="background:var(--bg-alt);padding:10px 12px;border-radius:8px;margin-bottom:12px"></div>

      <div class="form-row cols-2">
        <div><label>D\u00eda de pago (corte) *</label><select id="cl-dia">${
          (function () {
            var cortes = [5, 15, 25];
            var actual = c ? (c.diaPago || 5) : 5;
            if (cortes.indexOf(actual) === -1) {
              // Redondear al corte más cercano; en empate, al corte mayor
              actual = cortes.reduce(function (best, cut) {
                return Math.abs(cut - actual) <= Math.abs(best - actual) ? cut : best;
              }, cortes[0]);
            }
            return cortes.map(function (cut) {
              return '<option value="' + cut + '"' + (cut === actual ? ' selected' : '') + '>' + cut + '</option>';
            }).join('');
          })()
        }</select></div>
        <div><label>Descuento recurrente (CUP)</label><input id="cl-desc-rec" type="number" step="0.01" value="${c ? (c.descuentoRecurrente || 0) : 0}"></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Mes de inicio de cobro</label>
          <select id="cl-mes-inicio">${(function () {
            var meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
            var hoy = new Date();
            var actual = c && c.mesInicio ? c.mesInicio : (RN.calc.mesActualStr ? RN.calc.mesActualStr() : hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0'));
            var opts = '';
            // 6 meses hacia atras + 12 hacia adelante desde el mes actual
            for (var i = -6; i <= 12; i++) {
              var d = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);
              var val = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
              var txt = meses[d.getMonth()] + ' ' + d.getFullYear();
              opts += '<option value="' + val + '"' + (val === actual ? ' selected' : '') + '>' + txt + '</option>';
            }
            return opts;
          })()}</select>
          <small class="muted" style="display:block;margin-top:4px">A partir de este mes se le empieza a esperar pago. Por defecto, el mes actual.</small>
        </div>
      </div>
      <div class="divider"></div>
      <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted);margin-bottom:8px">Equipo vendido a plazos (opcional)</h3>
      <div class="form-row cols-3">
        <div><label>Deuda equipo (CUP)</label><input id="cl-deuda-eq" type="number" step="0.01" value="${c ? (c.deudaEquipo || 0) : 0}"></div>
        <div><label>Deuda original</label><input id="cl-deuda-orig" type="number" step="0.01" value="${c ? (c.deudaEquipoOriginal || c.deudaEquipo || 0) : 0}"></div>
        <div><label>Cuota mensual equipo</label><input id="cl-cuota-eq" type="number" step="0.01" value="${c ? (c.cuotaEquipo || 0) : 0}"></div>
      </div>
      <div class="form-row"><label><input type="checkbox" id="cl-activo" ${(!c || c.activo !== false) ? 'checked' : ''}> Cliente activo</label></div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cancelar</button>
      <button class="btn primary" onclick="RN.modalCliente.guardar()">Guardar</button>
    </div>`;
  RN.uiComponents.modal(html, { lg: true });

  // Al elegir plan, autocompletar precio y recalcular visibilidad del bloque personalizado
  const selPlan = document.getElementById('cl-plan');
  selPlan.addEventListener('change', () => {
    const p = RN.state.planes.find(x => x.id === selPlan.value);
    if (p) {
      document.getElementById('cl-precio').value = p.precio;
      // Al usar un plan, limpiar los campos personalizados
      const m = document.getElementById('cl-megas'); if (m) m.value = 0;
      const pm = document.getElementById('cl-precio-mega'); if (pm) pm.value = 0;
    }
    RN.modalCliente.recalcPersonalizado();
  });

  // Cálculo inicial del desglose
  RN.modalCliente.recalcPersonalizado();
};

RN.modalCliente.editar = RN.modalCliente.abrir;

RN.modalCliente.guardar = function () {
  const id = RN.modalCliente._editId;
  const nombre = document.getElementById('cl-nombre').value.trim();
  if (!nombre) { RN.notifyUI.toast('El nombre es obligatorio', 'error'); return; }
  const planId = document.getElementById('cl-plan').value || null;
  const precio = parseFloat(document.getElementById('cl-precio').value) || 0;
  const diaRaw = parseInt(document.getElementById('cl-dia').value, 10) || 5;
  const CORTES_PAGO = [5, 15, 25];
  const dia = (CORTES_PAGO.indexOf(diaRaw) !== -1) ? diaRaw : 5;

  // Datos personalizados (solo relevantes si no hay plan)
  const megas = parseFloat((document.getElementById('cl-megas') || {}).value) || 0;
  const precioMega = parseFloat((document.getElementById('cl-precio-mega') || {}).value) || 0;

  // Validación: si es personalizado, debe tener precio > 0 (venga de megas×precio o escrito directo)
  if (!planId && precio <= 0) {
    RN.notifyUI.toast('En personalizado define megas y precio por mega (o un precio manual)', 'error');
    return;
  }
  if (precio <= 0 && planId) {
    RN.notifyUI.toast('El plan no tiene precio definido', 'error'); return;
  }

  // v5.11.2: normalizar telefono y validar IP (avisos no bloqueantes)
  const telRaw = document.getElementById('cl-tel').value.trim();
  const telRes = RN.validateFields.telefono(telRaw);
  const ipRaw = (document.getElementById('cl-ip').value || '').replace(/[^0-9.]/g, '').trim();
  const ipRes = RN.validateFields.ip(ipRaw);
  // Avisos informativos (no bloquean el guardado)
  if (telRes.mensaje) RN.notifyUI.toast(telRes.mensaje, 'warn');
  if (ipRes.mensaje) RN.notifyUI.toast(ipRes.mensaje, 'warn');

  const data = {
    nombre,
    telefono: telRes.valorNormalizado,
    direccion: document.getElementById('cl-dir').value.trim(),
    ip: ipRaw,
    planId,
    precio,
    diaPago: dia,
    descuentoRecurrente: parseFloat(document.getElementById('cl-desc-rec').value) || 0,
    mesInicio: (document.getElementById('cl-mes-inicio') || {}).value || RN.calc.mesActualStr(),

    deudaEquipo: parseFloat(document.getElementById('cl-deuda-eq').value) || 0,
    deudaEquipoOriginal: parseFloat(document.getElementById('cl-deuda-orig').value) || 0,
    cuotaEquipo: parseFloat(document.getElementById('cl-cuota-eq').value) || 0,
    activo: document.getElementById('cl-activo').checked
  };

  // v5.8.8: guardar megas y precioMega del cliente personalizado.
  // Si hay plan, se guardan en 0 (los megas vienen del plan).
  if (planId) {
    data.megas = 0;
    data.precioMega = 0;
  } else {
    data.megas = megas;
    data.precioMega = precioMega;
  }

  if (id) {
    const c = RN.state.clients.find(x => x.id === id);
    Object.assign(c, data);
  } else {
    data.id = RN.calc.uid('cli');
    data.createdAt = new Date().toISOString();
    RN.state.clients.push(data);
  }
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.render.todo();
  RN.notifyUI.toast(id ? 'Cliente actualizado' : 'Cliente creado', 'success');
};
