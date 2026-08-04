// equipos-red.js
// Gestión de equipos de enlace (nanos, routers, etc): nombre, usuario,
// contraseña, IP, y a qué otro equipo se enlaza (para armar la cadena del
// backhaul de un vistazo).
// Depende de: state.js (equiposRed), storage-local.js (save), render.js (notify)
//
// NOTA DE PRIVACIDAD: esta lista vive 100% en el almacenamiento local de la
// app (igual que clientes, gastos, etc). NO se sube a Firebase — el módulo
// de Firebase (firebase-init.js) solo sincroniza los datos mínimos de
// clientes para los recordatorios de cobro, nunca equipos ni contraseñas.

// Ids cuya contraseña está momentáneamente visible en la lista (solo en
// memoria, se resetea al recargar la app).
let passwordsVisiblesEquipos = new Set();

function togglePasswordEquipo(id) {
  if (passwordsVisiblesEquipos.has(id)) passwordsVisiblesEquipos.delete(id);
  else passwordsVisiblesEquipos.add(id);
  renderEquiposRed();
}

function renderEquiposRed() {
  const el = document.getElementById('equipos-list');
  if (!el) return;

  if (!equiposRed.length) {
    el.innerHTML = '<div class="empty-state">Sin equipos registrados</div>';
    return;
  }

  el.innerHTML = equiposRed.map(e => {
    const enlazaEquipo = e.enlazaA ? equiposRed.find(x => x.id === e.enlazaA) : null;
    const visible = passwordsVisiblesEquipos.has(e.id);
    return `
    <div class="gasto-item" style="flex-direction:column;align-items:stretch;gap:8px">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <div class="gasto-desc">
          <strong>📡 ${escapeHtml(e.nombre)}</strong>
          ${enlazaEquipo ? `<span style="color:var(--text-muted);font-size:0.7rem;margin-left:6px">→ enlaza a ${escapeHtml(enlazaEquipo.nombre)}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ghost btn-sm" onclick="openEquipoModal(${e.id})" title="Editar">✏</button>
          <button class="btn btn-red btn-sm" onclick="deleteEquipo(${e.id})" title="Eliminar">🗑</button>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:5px 16px;font-family:var(--mono);font-size:0.76rem;color:var(--text-muted)">
        <div>IP: <span style="color:var(--text)">${escapeHtml(e.ip || '—')}</span></div>
        <div>Usuario: <span style="color:var(--text)">${escapeHtml(e.usuario || '—')}</span></div>
        <div style="display:flex;align-items:center;gap:5px">
          Contraseña: <span style="color:var(--text)">${visible ? escapeHtml(e.password || '—') : '••••••••'}</span>
          <button class="btn btn-ghost btn-sm" onclick="togglePasswordEquipo(${e.id})" title="${visible ? 'Ocultar' : 'Mostrar'} contraseña" style="padding:1px 6px">${visible ? '🙈' : '👁'}</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

// Pequeño helper para no inyectar HTML crudo desde nombre/usuario/ip.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function openEquipoModal(id) {
  const editando = id != null;
  document.getElementById('modal-equipo-title').textContent = editando ? 'Editar equipo' : 'Nuevo equipo';
  document.getElementById('equipo-edit-id').value = editando ? id : '';

  const e = editando ? equiposRed.find(x => x.id === id) : null;
  document.getElementById('eq-nombre').value = e ? e.nombre : '';
  document.getElementById('eq-usuario').value = e ? e.usuario : '';
  document.getElementById('eq-password').value = e ? e.password : '';
  document.getElementById('eq-ip').value = e ? e.ip : '';

  // Poblar el select "Se enlaza a" con el resto de equipos (nunca consigo mismo).
  const sel = document.getElementById('eq-enlaza-a');
  sel.innerHTML = '<option value="">— Ninguno —</option>' +
    equiposRed
      .filter(x => x.id !== id)
      .map(x => `<option value="${x.id}">${escapeHtml(x.nombre)}</option>`)
      .join('');
  sel.value = e && e.enlazaA ? e.enlazaA : '';

  document.getElementById('modal-equipo').classList.add('open');
  setTimeout(() => document.getElementById('eq-nombre').focus(), 50);
}

function closeEquipoModal() {
  document.getElementById('modal-equipo').classList.remove('open');
}

function saveEquipo() {
  const idVal = document.getElementById('equipo-edit-id').value;
  const nombre = document.getElementById('eq-nombre').value.trim();
  const usuario = document.getElementById('eq-usuario').value.trim();
  const password = document.getElementById('eq-password').value;
  const ip = document.getElementById('eq-ip').value.trim();
  const enlazaAVal = document.getElementById('eq-enlaza-a').value;
  const enlazaA = enlazaAVal ? Number(enlazaAVal) : null;

  if (!nombre) { notify('Ponle un nombre al equipo', true); return; }

  if (idVal) {
    const id = Number(idVal);
    const idx = equiposRed.findIndex(x => x.id === id);
    if (idx >= 0) equiposRed[idx] = { ...equiposRed[idx], nombre, usuario, password, ip, enlazaA };
  } else {
    const newId = equiposRed.length ? Math.max(...equiposRed.map(x => x.id)) + 1 : 1;
    equiposRed.push({ id: newId, nombre, usuario, password, ip, enlazaA });
  }

  save();
  renderEquiposRed();
  closeEquipoModal();
  notify(idVal ? `${nombre} actualizado` : `${nombre} añadido`);
}

function deleteEquipo(id) {
  const e = equiposRed.find(x => x.id === id);
  if (!e) return;
  showConfirm('¿Eliminar equipo?', `Esto eliminará "${e.nombre}" permanentemente. Esta acción no se puede deshacer.`, () => {
    // Si algún otro equipo se enlazaba a este, se lo dejamos sin enlace en vez
    // de dejar una referencia rota apuntando a un equipo que ya no existe.
    equiposRed.forEach(x => { if (x.enlazaA === id) x.enlazaA = null; });
    equiposRed = equiposRed.filter(x => x.id !== id);
    passwordsVisiblesEquipos.delete(id);
    save();
    renderEquiposRed();
    notify(`${e.nombre} eliminado`);
  });
}
