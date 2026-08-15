// inventario-forms.js
// Formularios y modales para la gestión de inventario
// Depende de: state.js (inventario, gastos),
//             inventario-core.js (comprarInventario, reabastecerLote, asignarConsumoInventario),
//             calculations.js (fmt)

// ═══════════════════════════════════════════════════════════
//  MODAL DE COMPRA DE LOTE
// ═══════════════════════════════════════════════════════════
function openInventarioModal() {
  document.getElementById('modal-inventario').classList.add('open');
  // Reset form
  document.getElementById('inv-desc').value = '';
  document.getElementById('inv-unidad').value = 'm';
  document.getElementById('inv-cantidad').value = '';
  document.getElementById('inv-costo').value = '';
  document.getElementById('inv-margen').value = '10';
  actualizarTotalLote();
}

function closeInventarioModal(){ document.getElementById('modal-inventario').classList.remove('open'); }

function actualizarTotalLote() {
  const cantidad = parseFloat(document.getElementById('inv-cantidad').value) || 0;
  const costo = parseFloat(document.getElementById('inv-costo').value) || 0;
  const total = cantidad * costo;
  document.getElementById('inv-total').textContent = fmt(total);
}

function registrarCompraInventario() {
  const desc = document.getElementById('inv-desc').value.trim();
  const unidad = document.getElementById('inv-unidad').value;
  const cantidad = parseFloat(document.getElementById('inv-cantidad').value);
  const costo = parseFloat(document.getElementById('inv-costo').value);
  const margen = parseFloat(document.getElementById('inv-margen').value);

  if(!desc) return notify('Ingresa una descripción', true);
  if(!cantidad || cantidad <= 0) return notify('Ingresa una cantidad válida', true);
  if(!costo || costo <= 0) return notify('Ingresa un costo por unidad válido', true);

  comprarInventario(desc, unidad, cantidad, costo, margen);
  closeInventarioModal();
}

// ═══════════════════════════════════════════════════════════
//  MODAL DE REABASTECIMIENTO
// ═══════════════════════════════════════════════════════════
function openReabastecerModal(invId) {
  const inv = inventario.find(i => i.id === invId);
  if(!inv) return notify('Lote no encontrado', true);

  document.getElementById('modal-reabastecer').classList.add('open');
  document.getElementById('reab-lote-id').value = invId;
  document.getElementById('reab-desc').textContent = inv.desc;
  document.getElementById('reab-unidad').textContent = inv.unidad === 'm' ? 'metros' : 'unidades';
  document.getElementById('reab-costo-actual').textContent = fmt(inv.costoPorUnidad);
  document.getElementById('reab-disponible').textContent = unidadesDisponibles(invId);
  document.getElementById('reab-cantidad').value = '';
  document.getElementById('reab-costo').value = '';
  actualizarTotalReabastecer();
}

function closeReabastecerModal(){ document.getElementById('modal-reabastecer').classList.remove('open'); }

function actualizarTotalReabastecer() {
  const cantidad = parseFloat(document.getElementById('reab-cantidad').value) || 0;
  const costo = parseFloat(document.getElementById('reab-costo').value) || 0;
  const total = cantidad * costo;
  document.getElementById('reab-total').textContent = fmt(total);
}

function registrarReabastecimiento() {
  const invId = parseInt(document.getElementById('reab-lote-id').value);
  const cantidad = parseFloat(document.getElementById('reab-cantidad').value);
  const costo = parseFloat(document.getElementById('reab-costo').value);

  if(!cantidad || cantidad <= 0) return notify('Ingresa una cantidad válida', true);
  if(!costo || costo <= 0) return notify('Ingresa un costo por unidad válido', true);

  reabastecerLote(invId, cantidad, costo);
  closeReabastecerModal();
}

// ═══════════════════════════════════════════════════════════
//  MODAL DE ASIGNACIÓN A CLIENTE
// ═══════════════════════════════════════════════════════════
function asignarDesdeModal(invId) {
  const inv = inventario.find(i => i.id === invId);
  if(!inv) return notify('Lote no encontrado', true);

  const disponible = unidadesDisponibles(invId);
  if(disponible <= 0) return notify('No hay unidades disponibles en este lote', true);

  document.getElementById('modal-asignar-inv').classList.add('open');
  document.getElementById('asig-lote-id').value = invId;
  document.getElementById('asig-desc').textContent = inv.desc;
  document.getElementById('asig-unidad').textContent = inv.unidad === 'm' ? 'metros' : 'unidades';
  document.getElementById('asig-disponible').textContent = disponible;
  document.getElementById('asig-cantidad').value = '';
  document.getElementById('asig-precio').value = precioSugerido(invId);
  document.getElementById('asig-cliente').value = '';

  // Populate client select
  const select = document.getElementById('asig-cliente');
  select.innerHTML = '<option value="">Seleccionar cliente...</option>';
  clients.forEach(c => {
    select.innerHTML += `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`;
  });
}

function closeAsignarModal(){ document.getElementById('modal-asignar-inv').classList.remove('open'); }

function registrarAsignacion() {
  const invId = parseInt(document.getElementById('asig-lote-id').value);
  const clienteId = parseInt(document.getElementById('asig-cliente').value);
  const cantidad = parseFloat(document.getElementById('asig-cantidad').value);
  const precio = parseFloat(document.getElementById('asig-precio').value);
  const modoPago = document.getElementById('asig-modo-pago').value;

  if(!clienteId) return notify('Selecciona un cliente', true);
  if(!cantidad || cantidad <= 0) return notify('Ingresa una cantidad válida', true);
  if(!precio || precio <= 0) return notify('Ingresa un precio por unidad válido', true);

  asignarConsumoInventario(invId, clienteId, cantidad, precio, modoPago);
  closeAsignarModal();
}

// ═══════════════════════════════════════════════════════════
//  MODAL DE REBAJA (pérdida de material)
// ═══════════════════════════════════════════════════════════
const REBAJA_MOTIVOS = {
  'perdida': 'Pérdida',
  'deterioro': 'Deterioro',
  'robo': 'Robo',
  'otro': 'Otro'
};

function openRebajaModal(loteId, loteDesc, costoPorUnidad, unidad) {
  document.getElementById('modal-rebaja').classList.add('open');
  document.getElementById('rebaja-lote-id').value = loteId;
  document.getElementById('rebaja-desc').textContent = loteDesc;
  document.getElementById('rebaja-unidad').textContent = unidad === 'm' ? 'metros' : 'unidades';
  document.getElementById('rebaja-costo-unit').textContent = fmt(costoPorUnidad);
  document.getElementById('rebaja-disponible').textContent = unidadesDisponibles(loteId);
  document.getElementById('rebaja-cantidad').value = '';
  document.getElementById('rebaja-motivo').value = 'perdida';
  actualizarTotalRebaja();

  // Populate motivos select
  const select = document.getElementById('rebaja-motivo');
  select.innerHTML = '';
  Object.entries(REBAJA_MOTIVOS).forEach(([key, label]) => {
    select.innerHTML += `<option value="${key}">${label}</option>`;
  });
}

function closeRebajaModal() {
  document.getElementById('modal-rebaja').classList.remove('open');
}

function actualizarTotalRebaja() {
  const loteId = parseInt(document.getElementById('rebaja-lote-id').value);
  const inv = inventario.find(i => i.id === loteId);
  if(!inv) return;

  const cantidad = parseFloat(document.getElementById('rebaja-cantidad').value) || 0;
  const costoTotal = cantidad * inv.costoPorUnidad;
  document.getElementById('rebaja-total').textContent = fmt(costoTotal);
}

function registrarRebaja() {
  const loteId = parseInt(document.getElementById('rebaja-lote-id').value);
  const inv = inventario.find(i => i.id === loteId);
  if(!inv) return notify('Lote no encontrado', true);

  const cantidad = parseFloat(document.getElementById('rebaja-cantidad').value);
  const motivo = document.getElementById('rebaja-motivo').value;
  const motivoLabel = REBAJA_MOTIVOS[motivo] || motivo;

  if(!cantidad || cantidad <= 0) return notify('Ingresa una cantidad válida', true);

  const disponible = unidadesDisponibles(loteId);
  if(cantidad > disponible) return notify(`Solo hay ${disponible} ${inv.unidad==='m'?'m':'u'} disponibles`, true);

  const costoTotal = cantidad * inv.costoPorUnidad;

  // Actualizar lote
  inv.cantidadRebajada = (inv.cantidadRebajada || 0) + cantidad;

  // Registrar gasto de rebaja (salida de capital, no operativo)
  gastos.push({
    desc: `📉 Rebaja: ${inv.desc} (-${cantidad} ${inv.unidad==='m'?'m':'u'} · ${motivoLabel})`,
    monto: costoTotal,
    fecha: fechaLocalISO(),
    categoria: 'rebaja',
    loteId: loteId
  });

  // Registrar rebaja en asignacionesInventario para trazabilidad
  asignacionesInventario.push({
    id: Date.now(),
    loteId: loteId,
    clienteId: null,
    clienteNombre: null,
    cantidad: cantidad,
    precioUnidad: 0,
    montoTotal: 0,
    costoUnidad: inv.costoPorUnidad,
    costoTotal: costoTotal,
    ganancia: -costoTotal, // pérdida
    fecha: fechaLocalISO(),
    modoPago: 'rebaja',
    motivo: motivo,
    tipo: 'rebaja'
  });

  save(); renderGastos(); renderInventario();
  notify(`Rebaja registrada: ${cantidad} ${inv.unidad==='m'?'m':'u'} de ${inv.desc} (${motivoLabel})`);
  closeRebajaModal();
}

function eliminarRebaja(rebajaId) {
  const idx = asignacionesInventario.findIndex(v => v.id === rebajaId);
  if(idx === -1) return notify('Rebaja no encontrada', true);

  const rebaja = asignacionesInventario[idx];
  if(rebaja.tipo !== 'rebaja') return notify('No es una rebaja', true);

  const inv = inventario.find(i => i.id === rebaja.loteId);
  if(!inv) return notify('Lote no encontrado', true);

  // Revertir cantidadRebajada
  inv.cantidadRebajada = (inv.cantidadRebajada || 0) - rebaja.cantidad;
  if(inv.cantidadRebajada < 0) inv.cantidadRebajada = 0;

  // Eliminar gasto asociado
  const gastoIdx = gastos.findIndex(g => g.loteId === rebaja.loteId && g.categoria === 'rebaja' && Math.abs(g.monto + rebaja.costoTotal) < 0.01);
  if(gastoIdx !== -1) gastos.splice(gastoIdx, 1);

  // Eliminar rebaja
  asignacionesInventario.splice(idx, 1);

  save(); renderGastos(); renderInventario();
  notify('Rebaja eliminada correctamente');
}

function toggleRebajasLote(invId) {
  // Este es un alias para toggleVentasLote, ya que las rebajas se muestran junto con las ventas
  toggleVentasLote(invId);
}