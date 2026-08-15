// inventario-ui.js
// Renderizado de tarjetas y UI del inventario
// Depende de: state.js (inventario, asignacionesInventario, ventasLoteAbiertas),
//             inventario-core.js (unidadesDisponibles, precioSugerido, escapeHtml, escapeForJsSingle),
//             calculations.js (fmt)

// Recuerda qué lotes tienen su lista de "Ventas de este lote" expandida (colapsada por defecto)
let ventasLoteAbiertas = {};

// renderInventario(): renderiza la lista de lotes de inventario en el DOM.
// Cada lote muestra: descripción, unidad, cantidad total/vendida/disponible,
// costo por unidad, precio sugerido actual, ganancia acumulada, y botones para
// acciones (asignar a cliente, reabastecer, rebajar, eliminar lote).
function renderInventario() {
  const container = document.getElementById('inventario-list');
  if(!container) return;

  if(inventario.length === 0) {
    container.innerHTML = '<div class="empty-state">No hay lotes de inventario. Compra un lote para empezar.</div>';
    return;
  }

  let html = '';
  inventario.forEach(inv => {
    const disponible = unidadesDisponibles(inv.id);
    const vendido = inv.cantidadAsignada;
    const sugerido = precioSugerido(inv.id);
    const ventas = asignacionesInventario.filter(v => v.loteId === inv.id);
    const expandido = ventasLoteAbiertas[inv.id];

    html += `
      <div class="inventario-card" data-id="${inv.id}">
        <div class="inv-header">
          <div class="inv-info">
            <strong>${escapeHtml(inv.desc)}</strong>
            <span class="inv-meta">${inv.unidad==='m'?'metros':'unidades'}</span>
          </div>
          <div class="inv-stats">
            <div class="inv-stat">
              <span class="label">Total:</span>
              <span class="value">${inv.cantidadTotal}</span>
            </div>
            <div class="inv-stat">
              <span class="label">Vendido:</span>
              <span class="value">${vendido}</span>
            </div>
            <div class="inv-stat highlight">
              <span class="label">Disponible:</span>
              <span class="value">${disponible}</span>
            </div>
          </div>
        </div>
        <div class="inv-details">
          <div class="inv-cost">
            <span class="label">Costo/u:</span>
            <span class="value">${fmt(inv.costoPorUnidad)}/${inv.unidad}</span>
          </div>
          <div class="inv-price">
            <span class="label">Precio sugerido:</span>
            <span class="value">${fmt(sugerido)}/${inv.unidad}</span>
          </div>
          <div class="inv-profit">
            <span class="label">Ganancia acumulada:</span>
            <span class="value">${fmt(inv.gananciaAcumulada)}</span>
          </div>
        </div>
        <div class="inv-actions">
          <button class="btn btn-sm btn-primary" onclick="asignarDesdeModal(${inv.id})">
            Asignar a cliente
          </button>
          <button class="btn btn-sm btn-secondary" onclick="openReabastecerModal(${inv.id})">
            Reabastecer
          </button>
          <button class="btn btn-sm btn-warning" onclick="openRebajaModal(${inv.id}, '${escapeForJsSingle(inv.desc)}', ${inv.costoPorUnidad}, '${inv.unidad}')">
            Rebajar
          </button>
          <button class="btn btn-sm btn-danger" onclick="eliminarLote(${inv.id})">
            Eliminar lote
          </button>
          <button class="btn btn-sm btn-ghost" onclick="toggleVentasLote(${inv.id})">
            ${expandido ? 'Ocultar ventas' : 'Ver ventas (' + ventas.length + ')'}
          </button>
        </div>
        ${expandido ? renderVentasLote(inv.id, ventas) : ''}
      </div>
    `;
  });

  container.innerHTML = html;
}

// renderVentasLote(): renderiza la lista de ventas de un lote específico.
// Muestra fecha, cliente, cantidad, precio, monto total y ganancia de cada venta.
function renderVentasLote(invId, ventas) {
  if(ventas.length === 0) {
    return '<div class="ventas-lote empty">No hay ventas registradas de este lote.</div>';
  }

  let html = '<div class="ventas-lote">';
  html += '<h4>Ventas de este lote</h4>';
  html += '<table class="ventas-table">';
  html += '<thead><tr><th>Fecha</th><th>Cliente</th><th>Cantidad</th><th>Precio/u</th><th>Total</th><th>Ganancia</th><th>Acciones</th></tr></thead>';
  html += '<tbody>';

  ventas.forEach(v => {
    html += `
      <tr>
        <td>${v.fecha ? v.fecha.slice(0,10) : '-'}</td>
        <td>${escapeHtml(v.clienteNombre)}</td>
        <td>${v.cantidad}</td>
        <td>${fmt(v.precioUnidad)}</td>
        <td>${fmt(v.montoTotal)}</td>
        <td class="${v.ganancia >= 0 ? 'positive' : 'negative'}">${fmt(v.ganancia)}</td>
        <td>
          <button class="btn btn-xs btn-danger" onclick="eliminarVentaInventario(${v.id})">
            Eliminar
          </button>
        </td>
      </tr>
    `;
  });

  html += '</tbody></table></div>';
  return html;
}

// toggleVentasLote(): alterna la visibilidad de la lista de ventas de un lote.
function toggleVentasLote(invId) {
  ventasLoteAbiertas[invId] = !ventasLoteAbiertas[invId];
  renderInventario();
}

// eliminarLote(): elimina un lote de inventario completamente.
// Solo se permite si no hay ventas asignadas a ese lote.
function eliminarLote(invId) {
  const inv = inventario.find(i => i.id === invId);
  if(!inv) return notify('Lote no encontrado', true);

  const ventas = asignacionesInventario.filter(v => v.loteId === invId);
  if(ventas.length > 0) {
    return notify('No se puede eliminar un lote con ventas asignadas. Elimina las ventas primero.', true);
  }

  if(!confirm(`¿Eliminar el lote "${inv.desc}"? Esta acción no se puede deshacer.`)) return;

  // Eliminar el lote
  const idx = inventario.findIndex(i => i.id === invId);
  inventario.splice(idx, 1);

  // Eliminar gastos asociados (gastos de inversión con este loteId)
  const gastosIdx = gastos.filter(g => g.loteId === invId);
  gastosIdx.forEach(g => {
    const gIdx = gastos.indexOf(g);
    gastos.splice(gIdx, 1);
  });

  save(); renderGastos(); renderInventario();
  notify('Lote eliminado correctamente');
}