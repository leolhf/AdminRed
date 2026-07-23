// investment.js
// Proyección de recuperación de inversiones PERSONALES en equipo/infraestructura.
// Los clientes vinculados NO tienen deuda — solo contribuyen con su ingreso de servicio
// para calcular en cuántos meses el ISP recupera la inversión.
// Depende de: state.js (investments, clients, gastos), calculations.js (fmt)

// ═══════════════════════════════════════════════════════════
//  MODELO DE INVERSIÓN PERSONAL
// ═══════════════════════════════════════════════════════════
function createInvestment(nombre, costoTotal, fecha) {
  return {
    id: 'inv_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    nombre: nombre || 'Equipo sin nombre',
    costoTotal: costoTotal || 0,
    fecha: fecha || new Date().toISOString().split('T')[0],
    clientesVinculados: [],  // IDs de clientes — solo para proyección, NO generan deuda
    activo: true
  };
}

// ═══════════════════════════════════════════════════════════
//  PROYECCIÓN DE RECUPERACIÓN (solo cálculo, sin billing)
// ═══════════════════════════════════════════════════════════
function proyeccionInversion(inv) {
  const vinculados = (inv.clientesVinculados || [])
    .map(id => clients.find(c => c.id === id))
    .filter(Boolean);

  // AJUSTE: de lo que paga un cliente, una parte es reinversión en el paquete que
  // tú contratas (config.costoPorMega × sus megas) — esa parte no es ganancia
  // disponible para recuperar el equipo, es el costo de darle servicio.
  // Ej: cliente de 4 Mb a 2500/Mb = 10000/mes, pero cada Mb te cuesta 1500 →
  // costo 6000, ganancia neta real 4000. Solo esos 4000 cuentan para la recuperación.
  const costoPorMega  = config.costoPorMega || 0;
  const ingresoMensual = vinculados.reduce((s, c) =>
    s + Math.max(0, (c.megas || 0) * ((c.precio || 0) - costoPorMega)), 0);

  const hoy      = new Date();
  const fechaStr = inv.fecha || inv.fechaCompra || hoy.toISOString().split('T')[0];
  const compra   = new Date(fechaStr + 'T00:00:00');
  const mesesTranscurridos = Math.max(0, Math.floor((hoy - compra) / (1000 * 60 * 60 * 24 * 30.44)));

  // BUG FIX: antes "recuperadoEstimado" era una PROYECCIÓN teórica (meses × ingreso)
  // que no dependía en absoluto de si el cliente pagaba o no — por eso la barra se
  // quedaba en 0 aunque registraras un cobro (solo avanzaba al cumplirse un mes
  // calendario desde la fecha de compra).
  // Ahora se suma la ganancia NETA de lo REALMENTE cobrado (history) a los clientes
  // vinculados desde la fecha de la inversión — restando la parte que es costo del
  // paquete — así la barra avanza en cuanto registras el cobro, con el monto real.
  const idsVinculados = new Set(inv.clientesVinculados || []);
  const recuperadoReal = history
    .filter(h => idsVinculados.has(h.id) && h.fecha >= fechaStr)
    .reduce((s, h) => {
      const c = clients.find(x => x.id === h.id);
      const netFactor = (c && c.precio > 0) ? Math.max(0, (c.precio - costoPorMega) / c.precio) : 1;
      return s + (h.monto || 0) * netFactor;
    }, 0);

  const recuperadoEstimado = Math.min(inv.costoTotal, Math.round(recuperadoReal));
  const pendiente      = Math.max(0, inv.costoTotal - recuperadoEstimado);
  const pct            = inv.costoTotal > 0 ? Math.min(100, Math.round(recuperadoEstimado / inv.costoTotal * 100)) : 0;
  const mesesRestantes = ingresoMensual > 0 ? Math.ceil(pendiente / ingresoMensual) : null;

  return { vinculados, ingresoMensual, mesesTranscurridos, recuperadoEstimado, pendiente, pct, mesesRestantes };
}

// ═══════════════════════════════════════════════════════════
//  RENDER EN DASHBOARD
// ═══════════════════════════════════════════════════════════
function renderInvestments() {
  const sec  = document.getElementById('investments-section');
  const list = document.getElementById('investments-list');
  if (!sec || !list) return;

  sec.style.display = '';   // siempre visible (tiene botón "Nueva")

  const activos = (investments || []).filter(i => i.activo !== false);
  if (!activos.length) {
    list.innerHTML = '<div class="empty-state" style="padding:12px 0 4px">Sin inversiones registradas</div>';
    return;
  }

  list.innerHTML = activos.map(inv => {
    const p = proyeccionInversion(inv);
    const color = p.pct >= 100 ? 'var(--green)' : p.pct >= 50 ? 'var(--amber)' : 'var(--red)';
    const mesesStr = p.mesesRestantes === null  ? 'sin clientes vinculados'
                   : p.mesesRestantes === 0     ? '✅ ¡Recuperado!'
                   : `~${p.mesesRestantes} mes${p.mesesRestantes !== 1 ? 'es' : ''} restante${p.mesesRestantes !== 1 ? 's' : ''}`;
    const nombresClientes = p.vinculados.map(c => c.nombre).join(', ') || '—';
    const fechaDisplay    = inv.fecha || inv.fechaCompra || '';

    return `
      <div style="margin-bottom:10px;padding:10px;background:var(--bg);border-radius:6px;border-left:3px solid ${color}">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
          <span style="font-weight:600;font-size:0.85rem">${inv.nombre}</span>
          <div style="display:flex;gap:5px">
            <button class="btn btn-ghost btn-sm" onclick="editarInversionPersonal('${inv.id}')" title="Editar">✏</button>
            <button class="btn btn-red btn-sm"   onclick="eliminarInversionPersonal('${inv.id}')" title="Eliminar">🗑</button>
          </div>
        </div>
        <div style="font-size:0.71rem;color:var(--text-muted);margin-bottom:2px">
          📅 ${fechaDisplay} · 💰 <span class="mono">${fmt(inv.costoTotal)}</span>
        </div>
        <div style="font-size:0.71rem;color:var(--text-muted);margin-bottom:6px">
          👥 ${nombresClientes}
          ${p.ingresoMensual > 0 ? ` · <span class="mono">${fmt(p.ingresoMensual)}/mes</span> ganancia neta` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="bw-bar-bg" style="flex:1;height:7px">
            <div class="bw-bar-fill" style="width:${p.pct}%;background:${color};transition:width .3s"></div>
          </div>
          <span style="font-size:0.7rem;color:${color};font-weight:600;min-width:36px;text-align:right">${p.pct}%</span>
        </div>
        <div style="font-size:0.68rem;color:var(--text-muted);margin-top:4px;display:flex;justify-content:space-between">
          <span>Recuperado est.: <strong style="color:var(--green)">${fmt(p.recuperadoEstimado)}</strong></span>
          <span>${mesesStr}</span>
        </div>
      </div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════
//  MODAL — NUEVA / EDITAR INVERSIÓN PERSONAL
// ═══════════════════════════════════════════════════════════
function abrirModalNuevaInversion(editId) {
  const modal = document.getElementById('modal-nueva-inversion');
  modal.dataset.editId = editId || '';

  const inv = editId ? investments.find(i => i.id === editId) : null;
  document.getElementById('modal-nueva-inv-title').textContent =
    inv ? '✏ Editar inversión' : '📦 Nueva inversión personal';

  document.getElementById('inv-p-nombre').value = inv ? inv.nombre : '';
  document.getElementById('inv-p-costo').value  = inv ? inv.costoTotal : '';
  document.getElementById('inv-p-fecha').value  = inv
    ? (inv.fecha || inv.fechaCompra || '')
    : new Date().toISOString().split('T')[0];

  const gastoWrap = document.getElementById('inv-p-gasto-wrap');
  if (gastoWrap) gastoWrap.style.display = inv ? 'none' : '';
  const gastoChk = document.getElementById('inv-p-gasto');
  if (gastoChk) gastoChk.checked = !inv;

  const wrap = document.getElementById('inv-p-clientes');
  if (!clients.length) {
    wrap.innerHTML = '<span style="font-size:0.75rem;color:var(--text-muted)">Aún no hay clientes registrados</span>';
  } else {
    wrap.innerHTML = clients.map(c => {
      const checked  = inv && inv.clientesVinculados.includes(c.id) ? 'checked' : '';
      const ingreso  = (c.megas || 0) * (c.precio || 0);
      const megasPct = (clients.reduce((s,x)=>s+(x.megas||0),0) > 0)
        ? Math.round((c.megas||0) / clients.reduce((s,x)=>s+(x.megas||0),0) * 100)
        : 0;
      return `<label style="display:flex;align-items:center;gap:8px;padding:5px 2px;border-bottom:1px solid var(--border);cursor:pointer">
        <input type="checkbox" value="${c.id}" ${checked} style="width:15px;height:15px;flex-shrink:0">
        <span style="flex:1;font-size:0.79rem">${c.nombre}</span>
        <span class="mono" style="font-size:0.7rem;color:var(--text-muted)">${c.megas}Mb (${megasPct}%) · ${fmt(ingreso)}/mes</span>
      </label>`;
    }).join('');
  }

  modal.classList.add('open');
}

function cerrarModalNuevaInversion() {
  document.getElementById('modal-nueva-inversion').classList.remove('open');
}

function guardarNuevaInversion() {
  const modal    = document.getElementById('modal-nueva-inversion');
  const editId   = modal.dataset.editId;
  const nombre   = document.getElementById('inv-p-nombre').value.trim();
  const costo    = parseInt(document.getElementById('inv-p-costo').value) || 0;
  const fecha    = document.getElementById('inv-p-fecha').value;
  const gastoChk = document.getElementById('inv-p-gasto');
  const regGasto = gastoChk ? gastoChk.checked : false;

  if (!nombre)    { notify('Escribe un nombre para la inversión', true); return; }
  if (costo <= 0) { notify('El costo debe ser mayor a 0', true); return; }

  const vinculados = [...document.querySelectorAll('#inv-p-clientes input[type=checkbox]:checked')]
    .map(el => parseInt(el.value));

  if (editId) {
    const inv = investments.find(i => i.id === editId);
    if (inv) {
      inv.nombre = nombre;
      inv.costoTotal = costo;
      inv.fecha = fecha;
      inv.clientesVinculados = vinculados;
    }
    notify('Inversión actualizada');
  } else {
    const inv = createInvestment(nombre, costo, fecha);
    inv.clientesVinculados = vinculados;
    investments.push(inv);

    if (regGasto) {
      gastos.push({ desc: nombre, monto: costo, fecha, categoria: 'inversion' });
      if (typeof renderGastos === 'function') renderGastos();
    }
    notify(`Inversión registrada: ${nombre}`);
  }

  save();
  renderInvestments();
  if (typeof renderSummary === 'function') renderSummary();
  cerrarModalNuevaInversion();
}

function editarInversionPersonal(id) { abrirModalNuevaInversion(id); }

function eliminarInversionPersonal(id) {
  if (!confirm('¿Eliminar esta inversión personal?\nNo afecta los gastos ni la facturación de los clientes.')) return;
  const idx = investments.findIndex(i => i.id === id);
  if (idx !== -1) investments.splice(idx, 1);
  save(); renderInvestments();
  notify('Inversión eliminada');
}

// ═══════════════════════════════════════════════════════════
//  STUBS DE COMPATIBILIDAD
//  (funciones antiguas referenciadas en modal-cobro.js e inversion.js)
// ═══════════════════════════════════════════════════════════
function actualizarRecuperadoInversion(investmentId, monto) { /* no-op: proyección automática */ }
function getInversionDeCliente(cliente) { return null; }

function getDeudaEquipoCliente(cliente) {
  if (!cliente || !cliente.deudaEquipo) return 0;
  // Modelo antiguo (número simple) — seguimos soportándolo
  if (typeof cliente.deudaEquipo === 'number') return cliente.deudaEquipo;
  // Modelo objeto legado — devolver 0 para no romper nada
  return 0;
}

function getCuotaEquipoCliente(cliente) {
  if (!cliente) return 0;
  if (typeof cliente.deudaEquipo === 'number') return cliente.cuotaEquipo || 0;
  return 0;
}

function vincularClienteAInversion(clienteId, investmentId) { return false; }
function desvincularClienteDeInversion(clienteId, investmentId) {}
function statsInversion(inv) {
  // Redirige al nuevo nombre por si algo externo lo llama
  return proyeccionInversion(inv);
}
