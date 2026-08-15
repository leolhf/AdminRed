// inventario-core.js
// Lógica de cálculo y datos del inventario (core business logic)
// Depende de: state.js (gastos, inventario, asignacionesInventario, clients),
//             calculations.js (fmt), storage-local.js (save)

// Escapa un string para incrustarlo de forma segura dentro de un literal JS
// entre comillas simples (atributos onclick, etc.). Sustituye las comillas
// simples y las barras invertidas por sus secuencias de escape, de modo que
// una descripción de lote como "Cable UTP 5e (caja de 305')" no rompa el
// atributo onclick ni permita inyectar código (XSS por escape de comilla).
// Es independiente del escapado HTML, que se hace con escapeHtml donde toque.
function escapeForJsSingle(str) {
  return String(str == null ? '' : str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'");
}

// Escapa un string para incrustarlo de forma segura dentro de HTML (contenido
// de texto entre etiquetas). Evita que una descripción con caracteres como
// '<', '>', '&' o '"' se interprete como marcado (HTML injection / XSS).
// NOTA: este archivo se carga como módulo global; si ya existiera una función
// escapeHtml global (definida por otro módulo) se respeta y no se redefine.
if (typeof window !== 'undefined' && typeof window.escapeHtml !== 'function') {
  window.escapeHtml = function(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };
}
const escapeHtml = (typeof window !== 'undefined' && window.escapeHtml) ? window.escapeHtml : function(str){
  return String(str == null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
};

// ═══════════════════════════════════════════════════════════
//  COMPRA DE UN LOTE (gasto real a costo, una sola vez)
// ═══════════════════════════════════════════════════════════
function comprarInventario(desc, unidad, cantidadTotal, costoPorUnidad, margenObjetivo) {
  const montoTotal = cantidadTotal * costoPorUnidad;
  const invId = Date.now();
  gastos.push({
    desc: `📦 ${desc} (${cantidadTotal} ${unidad==='m'?'m':'u'} × ${fmt(costoPorUnidad)})`,
    monto: montoTotal,
    fecha: fechaLocalISO(),
    categoria: 'inversion',
    loteId: invId
    // sin clienteId: es un gasto compartido, no de un cliente específico
  });
  inventario.push({
    id: invId, desc, unidad,
    cantidadTotal, costoPorUnidad, montoTotal,
    margenObjetivo: (margenObjetivo||10)/100,   // se guarda como fracción (0.10)
    cantidadAsignada: 0, montoAsignado: 0, gananciaAcumulada: 0,
    fecha: fechaLocalISO()
  });
  save(); renderGastos(); renderInventario();
  return invId;
}

// reabastecerLote(): compra más unidades de un lote EXISTENTE en lugar de crear
// uno nuevo. El costo por unidad se PROMEDIA (ponderado por las unidades que
// quedan en stock + las nuevas), de modo que el costo del lote refleje la mezcla
// de la compra original y la reposición. Se registra un gasto de inversión
// adicional vinculado al mismo lote (loteId), para trazabilidad.
//
// Fórmula del promedio ponderado:
//   costoProm = (costoStockActual + costoCompraNueva) / (unidadesStockActual + unidadesNuevas)
// donde costoStockActual = unidadesDisponibles * costoPorUnidad (viejo).
//
// La ganancia acumulada NO se toca (ya se ganó con las ventas previas). El
// margenObjetivo se conserva (es una decisión del usuario, no del costo).
function reabastecerLote(invId, cantidadNueva, costoPorUnidadNuevo) {
  const inv = inventario.find(i => i.id === invId);
  if(!inv) return notify('Lote no encontrado', true);
  if(!cantidadNueva || cantidadNueva <= 0) return notify('Ingresa una cantidad válida', true);
  if(!costoPorUnidadNuevo || costoPorUnidadNuevo <= 0) return notify('Ingresa un costo por unidad válido', true);

  const dispActual   = unidadesDisponibles(invId);
  const costoViejo   = dispActual * inv.costoPorUnidad;     // valor del stock que queda
  const costoNuevo   = cantidadNueva * costoPorUnidadNuevo;  // valor de lo que se compra ahora
  const totalUnidades = dispActual + cantidadNueva;          // stock físico después de reabastecer

  // Promedio ponderado del costo por unidad (solo sobre el stock disponible + nuevo)
  const costoProm = totalUnidades > 0 ? (costoViejo + costoNuevo) / totalUnidades : costoPorUnidadNuevo;

  // Actualizar el lote
  inv.costoPorUnidad = Math.round(costoProm * 100) / 100;  // redondear a 2 decimales
  inv.cantidadTotal += cantidadNueva;
  inv.montoTotal    += costoNuevo;  // el monto total del lote crece con la nueva compra

  // Registrar el gasto de inversión adicional, vinculado al mismo lote.
  // Se marca con reabastecimiento:true para que deleteGasto sepa que NO debe
  // borrar el lote entero, solo restar las unidades añadidas y re-promediar.
  gastos.push({
    desc: `📦 Reabastecimiento: ${inv.desc} (+${cantidadNueva} ${inv.unidad==='m'?'m':'u'} × ${fmt(costoPorUnidadNuevo)})`,
    monto: costoNuevo,
    fecha: fechaLocalISO(),
    categoria: 'inversion',
    loteId: invId,
    reabastecimiento: true,
    cantidadReab: cantidadNueva,
    costoUnitReab: costoPorUnidadNuevo
  });

  save(); renderGastos(); renderInventario();
  notify(`Lote reabastecido: +${cantidadNueva} ${inv.unidad==='m'?'m':'u'} · costo promediado a ${fmt(inv.costoPorUnidad)}/${inv.unidad==='m'?'m':'u'}`);
  return invId;
}

// unidadesDisponibles(): unidades que aún pueden venderse o rebajarse del lote.
// Se descuentan TANTO las vendidas (cantidadAsignada) como las rebajadas
// (cantidadRebajada) — una rebaja es material que salió del lote por pérdida,
// deterioro o robo, y por tanto ya NO está disponible. Antes las rebajas se
// sumaban a cantidadAsignada (como si fueran ventas), lo que inflaba la métrica
// de "vendido", corrompía el precio sugerido y mezclaba conceptos.
const unidadesDisponibles = (invId) => {
  const inv = inventario.find(i => i.id === invId);
  if(!inv) return 0;
  const rebajada = inv.cantidadRebajada || 0; // compatibilidad con lotes viejos
  return inv.cantidadTotal - inv.cantidadAsignada - rebajada;
};

// Precio sugerido para las unidades QUE QUEDAN de este lote: reparte la ganancia
// objetivo restante (10% del costo total del lote, menos lo ya ganado) entre las
// unidades que faltan por vender. Nunca sugiere menos que el costo (para no perder).
function precioSugerido(invId) {
  const inv = inventario.find(i => i.id === invId);
  if(!inv) return 0;
  const restante = inv.cantidadTotal - inv.cantidadAsignada;
  if(restante <= 0) return inv.costoPorUnidad;
  const gananciaObjetivoTotal = inv.montoTotal * inv.margenObjetivo;
  const gananciaFaltante = gananciaObjetivoTotal - inv.gananciaAcumulada;
  let precio = inv.costoPorUnidad + (gananciaFaltante / restante);
  if(precio < inv.costoPorUnidad) precio = inv.costoPorUnidad; // piso: jamás sugerir vender con pérdida
  return Math.round(precio);
}

// ═══════════════════════════════════════════════════════════
//  ASIGNAR / VENDER CONSUMO A UN CLIENTE (no crea gasto nuevo — ya se pagó al comprar)
// ═══════════════════════════════════════════════════════════
function asignarConsumoInventario(invId, clienteId, cantidad, precioUnidad, modoPago) {
  const inv = inventario.find(i => i.id === invId);
  const c   = clients.find(x => x.id === clienteId);
  if(!inv || !c) return notify('Inventario o cliente no encontrado', true);
  if(!cantidad || cantidad <= 0) return notify('Ingresa una cantidad válida', true);
  const disponible = unidadesDisponibles(invId);
  if(cantidad > disponible) return notify(`Solo hay ${disponible} ${inv.unidad==='m'?'m':'u'} disponibles`, true);

  const montoTotal = cantidad * precioUnidad;
  const costoTotal = cantidad * inv.costoPorUnidad;
  const gananciaVenta = montoTotal - costoTotal;

  // Actualizar lote
  inv.cantidadAsignada += cantidad;
  inv.montoAsignado += montoTotal;
  inv.gananciaAcumulada += gananciaVenta;

  // Registrar venta
  const ventaId = Date.now();
  asignacionesInventario.push({
    id: ventaId,
    loteId: invId,
    clienteId: clienteId,
    clienteNombre: c.nombre,
    cantidad: cantidad,
    precioUnidad: precioUnidad,
    montoTotal: montoTotal,
    costoUnidad: inv.costoPorUnidad,
    costoTotal: costoTotal,
    ganancia: gananciaVenta,
    fecha: fechaLocalISO(),
    modoPago: modoPago
  });

  // Si el cliente tenía deuda de equipo, se abona a esa deuda
  if(c.deudaEquipo > 0) {
    const abono = Math.min(c.deudaEquipo, montoTotal);
    c.deudaEquipo -= abono;
    // Registrar en history como abono a deuda de equipo
    history.push({
      id: Date.now(),
      clienteId: clienteId,
      clienteNombre: c.nombre,
      fecha: fechaLocalISO(),
      monto: abono,
      montoEquipo: abono,
      tipo: 'abono-equipo',
      desc: `Abono a deuda de equipo desde venta de inventario: ${inv.desc}`
    });
  }

  save(); renderInventario(); render(); // render() para actualizar tarjetas de cliente (deudaEquipo)
  notify(`Asignado: ${cantidad} ${inv.unidad==='m'?'m':'u'} de ${inv.desc} a ${c.nombre}`);
  return ventaId;
}

// eliminarVentaInventario(): elimina una venta de inventario y revierte sus efectos
// sobre el lote (cantidadAsignada, montoAsignado, gananciaAcumulada) y sobre la
// deuda de equipo del cliente (si se abonó a esa deuda).
function eliminarVentaInventario(ventaId) {
  const idx = asignacionesInventario.findIndex(v => v.id === ventaId);
  if(idx === -1) return notify('Venta no encontrada', true);

  const venta = asignacionesInventario[idx];
  const inv = inventario.find(i => i.id === venta.loteId);
  const c = clients.find(x => x.id === venta.clienteId);

  if(!inv || !c) return notify('Lote o cliente no encontrado', true);

  // Revertir lote
  inv.cantidadAsignada -= venta.cantidad;
  inv.montoAsignado -= venta.montoTotal;
  inv.gananciaAcumulada -= venta.ganancia;

  // Si se abonó a deuda de equipo, revertir ese abono
  if(venta.montoEquipo > 0) {
    c.deudaEquipo += venta.montoEquipo;
    // Eliminar el registro de history correspondiente
    const histIdx = history.findIndex(h => h.id === venta.id && h.tipo === 'abono-equipo');
    if(histIdx !== -1) history.splice(histIdx, 1);
  }

  // Eliminar venta
  asignacionesInventario.splice(idx, 1);

  save(); renderInventario(); render();
  notify('Venta eliminada correctamente');
}