/**
 * red/equipos-red.js — Equipos de red asociados a clientes.
 */
RN.equiposRed = RN.equiposRed || {};

RN.equiposRed.porCliente = function (clienteId) {
  return RN.state.equiposRed.filter(e => e.clienteId === clienteId);
};

RN.equiposRed.abrir = function (clienteId) {
  const c = RN.state.clients.find(x => x.id === clienteId);
  if (!c) return;
  const eqs = RN.equiposRed.porCliente(clienteId);
  const rows = eqs.length ? eqs.map(e => `<tr>
    <td>${RN.render.esc(e.tipo)}</td><td>${RN.render.esc(e.modelo || '')}</td>
    <td>${RN.render.esc(e.serial || '')}</td><td>${RN.render.esc(e.ubicacion || '')}</td>
    <td><button class="btn sm danger" onclick="RN.equiposRed.eliminar('${e.id}')">🗑</button></td>
  </tr>`).join('') : '<tr><td colspan="5" class="muted center">Sin equipos registrados</td></tr>';

  const html = `
    <div class="modal-header"><h3>Equipos de red — ${RN.render.esc(c.nombre)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="table-wrap mb-16"><table><thead><tr><th>Tipo</th><th>Modelo</th><th>Serial</th><th>Ubicación</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <h3 style="font-size:13px;text-transform:uppercase;color:var(--text-muted)">Agregar equipo</h3>
      <div class="form-row cols-2">
        <div><label>Tipo *</label><select id="eq-tipo"><option>Router</option><option>ONT</option><option>Switch</option><option>Antena</option><option>Cable</option><option>Otro</option></select></div>
        <div><label>Modelo</label><input id="eq-modelo"></div>
      </div>
      <div class="form-row cols-2">
        <div><label>Serial/MAC</label><input id="eq-serial"></div>
        <div><label>Ubicación</label><input id="eq-ubicacion" placeholder="dirección de instalación"></div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
      <button class="btn primary" onclick="RN.equiposRed.guardar('${clienteId}')">Agregar equipo</button>
    </div>`;
  RN.uiComponents.modal(html, { lg: true });
};

RN.equiposRed.guardar = function (clienteId) {
  const tipo = document.getElementById('eq-tipo').value;
  RN.state.equiposRed.push({
    id: RN.calc.uid('eq'),
    clienteId,
    tipo,
    modelo: document.getElementById('eq-modelo').value.trim(),
    serial: document.getElementById('eq-serial').value.trim(),
    ubicacion: document.getElementById('eq-ubicacion').value.trim(),
    fecha: new Date().toISOString()
  });
  RN.storageLocal.guardar();
  RN.uiComponents.cerrarModal();
  RN.notifyUI.toast('Equipo agregado', 'success');
};

RN.equiposRed.eliminar = function (id) {
  RN.state.equiposRed = RN.state.equiposRed.filter(e => e.id !== id);
  RN.storageLocal.guardar();
  RN.notifyUI.toast('Equipo eliminado', 'warn');
};
