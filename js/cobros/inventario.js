// inventario.js
// Inventario compartido de material (cable, conectores/puntas de red, etc.), medido
// en metros o unidades. Se compra el lote una vez (gasto de inversión a costo), y se
// va vendiendo/asignando a clientes a un precio de venta que TÚ decides por cada venta.
// El sistema sugiere un precio que garantiza no perder dinero, y que — sin importar si
// vendiste una parte más cara o más barata — reajusta el precio sugerido para las
// unidades restantes de forma que el lote completo mantenga el margen objetivo (10% por
// defecto) una vez vendido todo.
//
// Depende de: state.js (gastos, inventario, asignacionesInventario, clients),
//             calculations.js (fmt), storage-local.js (save), ui/render.js (render)

// Recuerda qué lotes tienen su lista de "Ventas de este lote" expandida (colapsada por defecto)
let ventasLoteAbiertas = {};

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
  if(cantidad > disponible) return notify(`Solo quedan ${disponible} ${inv.unidad==='m'?'metros':'unidades'} de ese lote`, true);
  if(!precioUnidad || precioUnidad <= 0) precioUnidad = precioSugerido(invId);
  modoPago = modoPago === 'momento' ? 'momento' : 'plazo'; // por defecto, a plazo (compatibilidad)

  const monto = Math.round(cantidad * precioUnidad);
  const costoAsignado = cantidad * inv.costoPorUnidad;
  const ganancia = monto - costoAsignado;

  // La venta en sí se registra igual sin importar el modo de pago: misma cantidad,
  // mismo monto, misma ganancia. Lo único que cambia es cómo entra el dinero.
  inv.cantidadAsignada += cantidad;
  inv.montoAsignado += monto;
  inv.gananciaAcumulada += ganancia;

  const venta = {
    id: Date.now()+'-'+Math.floor(Math.random()*1000),
    inventarioId: invId, clienteId,
    cantidad, precioUnidad, monto, costoAsignado, ganancia,
    fecha: fechaLocalISO(),
    modoPago
  };

  if(modoPago === 'momento'){
    // Pagado al momento: se registra como un cobro ya recibido (no toca deudaEquipo).
    // Cuenta de inmediato en "Recuperación de inversión" (history.montoEquipo) y en la ganancia.
    const hid = Date.now()+'-'+Math.floor(Math.random()*1000)+'h';
    history.push({
      hid, id: clienteId, nombre: c.nombre, monto, montoEquipo: monto,
      fecha: venta.fecha,
      nota: `📦 Venta inventario: ${cantidad}${inv.unidad==='m'?'m':'u'} de ${inv.desc}`,
      parcial: false,
      tipo: 'inventario',
      prevState: {pagado:c.pagado, mora:c.mora||0, abono:c.abono||0, deudaEquipo:c.deudaEquipo||0}
    });
    venta.hid = hid; // enlaza la venta con su cobro, para poder revertir ambos juntos
  } else {
    // A plazo: se registra como una deuda de equipo simple del cliente (modelo
    // numérico), SEPARADA de "Inversiones personales" — vender material de
    // inventario a plazo no es una inversión de capital tuya, es una cuenta por
    // cobrar puntual a ese cliente. No crea una tarjeta nueva en Inversiones
    // Personales ni un gasto adicional (el costo del lote ya se contabilizó una
    // sola vez, completo, al comprarlo en comprarInventario()).
    venta.prevCliente = {deudaEquipo: c.deudaEquipo||0, cuotaEquipo: c.cuotaEquipo||0};

    const deudaPrevia = (typeof c.deudaEquipo === 'number') ? c.deudaEquipo : 0;
    c.deudaEquipo = deudaPrevia + monto;
    // Si ya tenía una cuota mensual activa, se conserva (seguirá pagando lo mismo
    // cada mes hasta cubrir la deuda ampliada); si no tenía, se sugiere liquidar
    // esta venta completa en la próxima cuota.
    if (!c.cuotaEquipo || c.cuotaEquipo <= 0) c.cuotaEquipo = monto;
  }

  asignacionesInventario.push(venta);

  save(); render(); renderGastos(); renderInventario();
  notify(`${cantidad} ${inv.unidad==='m'?'m':'u'} a ${c.nombre} — ${fmt(monto)} (ganancia ${fmt(ganancia)}) · ${modoPago==='momento'?'💵 pagado al momento':'📅 a plazo'}`);
}

// ═══════════════════════════════════════════════════════════
//  ELIMINAR VENTA (patrón eliminar-y-rehacer, igual que eliminarCobro)
// ═══════════════════════════════════════════════════════════
function eliminarVentaInventario(ventaId) {
  const idx = asignacionesInventario.findIndex(v => v.id === ventaId);
  if(idx === -1) return;
  if(!confirm('¿Eliminar esta venta? El material vuelve al inventario disponible y se revierte el cobro/deuda que generó.')) return;

  const venta = asignacionesInventario[idx];
  const inv = inventario.find(i => i.id === venta.inventarioId);
  const c   = clients.find(x => x.id === venta.clienteId);

  if(inv){
    inv.cantidadAsignada  = Math.max(0, inv.cantidadAsignada - venta.cantidad);
    inv.montoAsignado     = Math.max(0, inv.montoAsignado    - venta.monto);
    // BUG FIX #5: gananciaAcumulada puede ser negativa si se vendió con pérdida,
    // pero no debe bajar más allá de lo que realmente se acumuló (evitar underflow).
    inv.gananciaAcumulada = inv.gananciaAcumulada - venta.ganancia;
  }

  if(venta.modoPago === 'momento'){
    const hIdx = history.findIndex(h => h.hid === venta.hid);
    if(hIdx !== -1) history.splice(hIdx, 1);
  } else if(c && venta.prevCliente){
    c.deudaEquipo = venta.prevCliente.deudaEquipo;
    c.cuotaEquipo = venta.prevCliente.cuotaEquipo;
  }

  asignacionesInventario.splice(idx, 1);
  save(); render(); renderGastos(); renderInventario();
  notify(`Venta de ${venta.cantidad}${inv?(inv.unidad==='m'?'m':'u'):''} eliminada — material devuelto al inventario`);
}

// ═══════════════════════════════════════════════════════════
//  UI — modal de compra
// ═══════════════════════════════════════════════════════════
function openInventarioModal() {
  document.getElementById('inv-lote-desc').value='';
  document.getElementById('inv-lote-unidad').value='m';
  document.getElementById('inv-lote-cantidad').value='';
  document.getElementById('inv-lote-costo').value='';
  document.getElementById('inv-lote-margen').value='10';
  actualizarTotalLote();
  document.getElementById('modal-inventario').classList.add('open');
}

function closeInventarioModal(){ document.getElementById('modal-inventario').classList.remove('open'); }

// ── Modal de REABASTECIMIENTO (comprar más de un lote existente) ──────────────
function openReabastecerModal(invId) {
  const inv = inventario.find(i => i.id === invId);
  if(!inv) return notify('Lote no encontrado', true);
  const disp = unidadesDisponibles(invId);
  document.getElementById('reab-id').value = invId;
  document.getElementById('reab-desc').value = inv.desc;
  const uEl = document.getElementById('reab-unidad');
  if(uEl) uEl.textContent = inv.unidad==='m' ? 'metros' : 'unidades';
  document.getElementById('reab-disp').textContent = `${disp} ${inv.unidad==='m'?'m':'u'}`;
  document.getElementById('reab-costo-actual').textContent = `${fmt(inv.costoPorUnidad)}/${inv.unidad==='m'?'m':'u'}`;
  document.getElementById('reab-cantidad').value = '';
  document.getElementById('reab-costo').value = inv.costoPorUnidad; // pre-llenar con el costo actual
  document.getElementById('reab-promedio').style.display = 'none';
  actualizarTotalReabastecer();
  document.getElementById('modal-reabastecer').classList.add('open');
}

function closeReabastecerModal(){ document.getElementById('modal-reabastecer').classList.remove('open'); }

function actualizarTotalReabastecer() {
  const invId = parseInt(document.getElementById('reab-id').value);
  const inv = inventario.find(i => i.id === invId);
  if(!inv) return;
  const cantidad = parseFloat(document.getElementById('reab-cantidad').value) || 0;
  const costo    = parseFloat(document.getElementById('reab-costo').value) || 0;
  const disp     = unidadesDisponibles(invId);
  const uTxt     = inv.unidad==='m' ? 'm' : 'u';

  // Total a pagar por la nueva compra
  document.getElementById('reab-total').textContent = `−${fmt(cantidad * costo)}`;

  // Calcular y mostrar el costo promedio resultante
  const promedioEl = document.getElementById('reab-promedio');
  if(cantidad > 0 && costo > 0){
    const costoViejo    = disp * inv.costoPorUnidad;
    const costoNuevo    = cantidad * costo;
    const totalUnidades = disp + cantidad;
    const costoProm     = totalUnidades > 0 ? (costoViejo + costoNuevo) / totalUnidades : costo;
    const diferencia    = costoProm - inv.costoPorUnidad;
    const signo         = diferencia >= 0 ? '+' : '';
    promedioEl.style.display = 'flex';
    promedioEl.innerHTML = `📊 Costo promediado: <strong>${fmt(Math.round(costoProm*100)/100)}/${uTxt}</strong> ` +
      `<span class="text-muted">(era ${fmt(inv.costoPorUnidad)} → ${signo}${fmt(Math.round(diferencia*100)/100)})</span>`;
  } else {
    promedioEl.style.display = 'none';
  }
}

function registrarReabastecimiento() {
  const invId    = parseInt(document.getElementById('reab-id').value);
  const cantidad = parseFloat(document.getElementById('reab-cantidad').value);
  const costo    = parseFloat(document.getElementById('reab-costo').value);
  if(!cantidad || cantidad <= 0){ notify('Ingresa una cantidad válida', true); return; }
  if(!costo || costo <= 0){ notify('Ingresa un costo por unidad válido', true); return; }
  reabastecerLote(invId, cantidad, costo);
  closeReabastecerModal();
}

function actualizarTotalLote() {
  const cantidad=parseFloat(document.getElementById('inv-lote-cantidad').value)||0;
  const costo=parseFloat(document.getElementById('inv-lote-costo').value)||0;
  document.getElementById('inv-lote-total').textContent = `−${fmt(cantidad*costo)}`;
}

function registrarCompraInventario() {
  const desc      = document.getElementById('inv-lote-desc').value.trim();
  const unidad    = document.getElementById('inv-lote-unidad').value;
  const cantidad  = parseFloat(document.getElementById('inv-lote-cantidad').value);
  const costo     = parseFloat(document.getElementById('inv-lote-costo').value);
  const margen    = parseFloat(document.getElementById('inv-lote-margen').value);
  if(!desc || !cantidad || cantidad<=0 || !costo || costo<=0){ notify('Completa descripción, cantidad y costo', true); return; }
  comprarInventario(desc, unidad, cantidad, costo, margen);
  closeInventarioModal();
}

// ═══════════════════════════════════════════════════════════
//  UI — lista de lotes + asignación a clientes (tab Inventario)
// ═══════════════════════════════════════════════════════════
function asignarDesdeModal(invId) {
  const clienteId  = parseInt(document.getElementById(`asig-cliente-${invId}`).value);
  const cantidad   = parseFloat(document.getElementById(`asig-cantidad-${invId}`).value);
  const precioInput= document.getElementById(`asig-precio-${invId}`).value;
  const precio     = precioInput ? parseFloat(precioInput) : precioSugerido(invId);
  const radioChecked = document.querySelector(`input[name="modo-pago-${invId}"]:checked`);
  const modoPago   = radioChecked ? radioChecked.value : 'plazo';
  if(!clienteId || isNaN(clienteId)) return notify('Selecciona un cliente', true);
  if(!cantidad || cantidad <= 0) return notify('Ingresa una cantidad válida', true);
  asignarConsumoInventario(invId, clienteId, cantidad, precio, modoPago);
}

function toggleVentasLote(invId) {
  ventasLoteAbiertas[invId] = !ventasLoteAbiertas[invId];
  renderInventario();
}

// ═══════════════════════════════════════════════════════════
//  REBAJAS DE INVENTARIO
//  Permite registrar bajas de inventario que se suman como gasto
// ═══════════════════════════════════════════════════════════
function openRebajaModal(loteId, loteDesc, costoPorUnidad, unidad) {
  const inv = inventario.find(i => i.id === loteId);
  const disponible = inv ? unidadesDisponibles(loteId) : 0;
  document.getElementById('rebaja-lote-id').value = loteId;
  document.getElementById('rebaja-lote-desc').value = loteDesc;
  document.getElementById('rebaja-valor').value = costoPorUnidad;
  document.getElementById('rebaja-cantidad').value = '';
  // Tope dinámico: no permitir rebajar más de lo disponible
  const cantInput = document.getElementById('rebaja-cantidad');
  cantInput.max = disponible;
  cantInput.placeholder = `Máx. ${disponible} ${unidad==='m'?'m':'u'}`;
  document.getElementById('rebaja-motivo').value = 'deterioro';
  document.getElementById('rebaja-nota').value = '';
  // Badge de disponible dentro del modal
  const dispEl = document.getElementById('rebaja-disponible');
  if(dispEl) dispEl.textContent = `${disponible} ${unidad==='m'?'metros':'unidades'} disponibles`;
  actualizarTotalRebaja();
  document.getElementById('modal-rebaja').classList.add('open');
}

function closeRebajaModal() {
  document.getElementById('modal-rebaja').classList.remove('open');
}

// actualizarTotalRebaja(): recalcula en tiempo real el gasto que se va a
// registrar. IMPORTANTE: ahora se llama tanto al cambiar la CANTIDAD como el
// VALOR (antes solo respondía al valor, así que escribir la cantidad no
// actualizaba el total — bug R4).
function actualizarTotalRebaja() {
  const cantidad = parseFloat(document.getElementById('rebaja-cantidad').value) || 0;
  const valor = parseFloat(document.getElementById('rebaja-valor').value) || 0;
  const total = cantidad * valor;
  const totalEl = document.getElementById('rebaja-total');
  if(totalEl) totalEl.textContent = `−${fmt(total)}`;
  // Aviso visual si la cantidad excede el disponible
  const loteId = Number(document.getElementById('rebaja-lote-id').value);
  const inv = inventario.find(i => i.id === loteId);
  const disp = inv ? unidadesDisponibles(loteId) : 0;
  const avisoEl = document.getElementById('rebaja-aviso');
  if(avisoEl){
    if(cantidad > disp){
      avisoEl.textContent = `⚠ Solo hay ${disp} ${inv?(inv.unidad==='m'?'m':'u'):''} disponibles`;
      avisoEl.style.display = '';
    } else {
      avisoEl.style.display = 'none';
    }
  }
}

// Mapa de etiquetas legibles para los motivos de rebaja (se usa al construir
// la descripción del gasto y al mostrar el historial de rebajas del lote).
const REBAJA_MOTIVOS = {
  'deterioro':   { label: 'Deterioro',   icon: '🔧' },
  'perdida':     { label: 'Pérdida',     icon: '❓' },
  'robo':        { label: 'Robo',        icon: '🚨' },
  'vencimiento': { label: 'Vencimiento', icon: '📅' },
  'otro':        { label: 'Otro',        icon: '📝' }
};

// registrarRebaja(): da de baja una cantidad de material del lote y la
// contabiliza como gasto de capital (categoría 'rebaja'). Correcciones frente
// a la versión anterior:
//  • NO toca cantidadAsignada/montoAsignado (eso era tratar la rebaja como
//    venta — bug R1). Usa campos propios cantidadRebajada/montoRebajado.
//  • Valida valor > 0 (bug R3): una rebaja con valor 0 no tiene sentido
//    contable y generaba un gasto fantasma de 0 CUP.
//  • Guarda loteId en el gasto para trazabilidad y reversión (bug R5).
//  • Genera un id de rebaja para poder eliminarla luego.
function registrarRebaja() {
  const loteId = Number(document.getElementById('rebaja-lote-id').value);
  const cantidad = parseFloat(document.getElementById('rebaja-cantidad').value);
  const valor = parseFloat(document.getElementById('rebaja-valor').value);
  const motivo = document.getElementById('rebaja-motivo').value;
  const nota = document.getElementById('rebaja-nota').value.trim();

  if(!cantidad || cantidad <= 0 || !isFinite(cantidad)) {
    notify('La cantidad debe ser mayor a 0', true);
    return;
  }
  // Bug R3: el valor unitario debe ser > 0 (antes se permitía 0).
  if(!valor || valor <= 0 || !isFinite(valor)) {
    notify('El valor unitario debe ser mayor a 0', true);
    return;
  }

  const inv = inventario.find(i => i.id === loteId);
  if(!inv) {
    notify('Lote no encontrado', true);
    return;
  }

  const disponible = unidadesDisponibles(loteId);
  if(cantidad > disponible) {
    notify(`Solo hay ${disponible} ${inv.unidad==='m'?'m':'u'} disponibles`, true);
    return;
  }

  const montoGasto = Math.round(cantidad * valor);
  const motivoInfo = REBAJA_MOTIVOS[motivo] || REBAJA_MOTIVOS['otro'];

  // Descuenta del stock disponible usando el contador propio de rebajas
  // (NO del de ventas). Compatibilidad: si el lote no tenía el campo, se inicia.
  inv.cantidadRebajada = (inv.cantidadRebajada || 0) + cantidad;
  inv.montoRebajado    = (inv.montoRebajado || 0) + montoGasto;

  const rebajaId = Date.now()+'-'+Math.floor(Math.random()*1000)+'r';
  const uTxt = inv.unidad==='m' ? 'm' : 'u';
  let descGasto = `${motivoInfo.icon} Rebaja: ${inv.desc} (${cantidad} ${uTxt}) — ${motivoInfo.label}`;
  if(nota) descGasto += ` · ${nota}`;

  // El gasto lleva loteId + rebajaId para poder revertirlo desde el lote.
  gastos.push({
    desc: descGasto,
    categoria: 'rebaja',
    monto: montoGasto,
    fecha: fechaLocalISO(),
    loteId: loteId,
    rebajaId: rebajaId,
    motivo: motivo,
    cantidad: cantidad,
    valorUnidad: valor
  });

  save(); renderInventario(); renderGastos(); renderProfit(); renderSummary();
  closeRebajaModal();
  notify(`Rebaja registrada: ${cantidad} ${uTxt} de ${inv.desc} — Gasto: ${fmt(montoGasto)}`);
}

// eliminarRebaja(): revierte una rebaja registrada. Devuelve el material al
// stock disponible del lote (restando de cantidadRebajada) y elimina el gasto
// de capital asociado. Es el espejo de registrarRebaja() y permite corregir
// errores sin tocar las ventas.
function eliminarRebaja(rebajaId) {
  const gIdx = gastos.findIndex(g => g.rebajaId === rebajaId);
  if(gIdx === -1) { notify('Rebaja no encontrada', true); return; }
  const g = gastos[gIdx];
  const inv = inventario.find(i => i.id === g.loteId);
  if(!confirm(`¿Revertir esta rebaja?\nEl material (${g.cantidad} ${inv?(inv.unidad==='m'?'m':'u'):''}) vuelve al stock disponible y se elimina el gasto de ${fmt(g.monto)}.`)) return;

  if(inv){
    inv.cantidadRebajada = Math.max(0, (inv.cantidadRebajada||0) - (g.cantidad||0));
    inv.montoRebajado    = Math.max(0, (inv.montoRebajado||0) - (g.monto||0));
  }
  gastos.splice(gIdx, 1);
  save(); renderInventario(); renderGastos(); renderProfit(); renderSummary();
  notify(`Rebaja revertida — material devuelto al inventario`);
}

function renderInventario() {
  const el = document.getElementById('inventario-list');
  if(!el) return;
  if(!inventario.length){ el.innerHTML='<div class="empty-state">Sin lotes registrados. Usa <strong>+ Comprar lote</strong> para registrar material (cable, conectores...).</div>'; return; }
  // Filtro de búsqueda por descripción o fecha
  const qEl = document.getElementById('inventario-search');
  const q = (qEl && qEl.value || '').toLowerCase().trim();
  const lista = q
    ? inventario.filter(inv => {
        const desc  = (inv.desc||'').toLowerCase();
        const fecha = (inv.fecha||'').toLowerCase();
        return desc.includes(q) || fecha.includes(q);
      })
    : inventario;
  if(!lista.length){ el.innerHTML='<div class="empty-state">Sin lotes que coincidan con «'+q+'»</div>'; return; }
  const opcionesClientes = clients.length
    ? clients.map(c=>`<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')
    : '<option value="">(sin clientes)</option>';

  el.innerHTML = [...lista].reverse().map(inv=>{
    // Compatibilidad con lotes viejos creados antes de este cambio (solo tenían monto, sin cantidad)
    if(inv.cantidadTotal==null){
      return `
        <div class="inv-card inv-card-old">
          <div style="flex:1">
            <div class="gasto-desc">📦 ${escapeHtml(inv.desc)}</div>
            <div style="font-size:0.62rem;color:var(--text-muted)">${inv.fecha} · lote antiguo, sin control por cantidad</div>
          </div>
          <span class="gasto-monto">${fmt(inv.montoTotal||0)}</span>
        </div>`;
    }

    const uTxt = inv.unidad==='m' ? 'm' : 'u';
    const uTxtLargo = inv.unidad==='m' ? 'metros' : 'unidades';
    const disponible = unidadesDisponibles(inv.id);
    const sugerido = precioSugerido(inv.id);
    const margenObj = inv.margenObjetivo!=null ? inv.margenObjetivo : 0.35;
    const gananciaAcum = inv.gananciaAcumulada || 0;
    const gananciaObjetivo = (inv.montoTotal||inv.costoTotal||0) * margenObj;
    const pctGanancia = gananciaObjetivo>0 ? Math.round(gananciaAcum/gananciaObjetivo*100) : 0;
    const ventasLote = asignacionesInventario.filter(v => v.inventarioId === inv.id);
    const rebajasLote = gastos.filter(g => g.categoria==='rebaja' && g.loteId === inv.id);
    const cantRebajada = inv.cantidadRebajada || 0;
    const cantVendida = inv.cantidadAsignada || 0;
    const total = inv.cantidadTotal || 0;
    const pctVendido  = total>0 ? (cantVendida/total*100) : 0;
    const pctRebajado = total>0 ? (cantRebajada/total*100) : 0;
    const agotado = disponible <= 0;
    const tieneRebajas = rebajasLote.length > 0;

    return `
      <div class="inv-card ${agotado?'inv-card-agotado':''}">
        <div class="inv-card-head">
          <div class="inv-card-title">
            <div class="gasto-desc">📦 ${escapeHtml(inv.desc)}</div>
            <div class="inv-card-meta">
              ${inv.fecha} · costo ${fmt(inv.costoPorUnidad)}/${uTxt} · margen objetivo ${Math.round(inv.margenObjetivo*100)}%
            </div>
          </div>
          <div class="inv-card-avail">
            <div class="inv-avail-num ${disponible>0?'text-amber':'text-muted'}">${disponible}</div>
            <div class="inv-avail-unit">${uTxt} disp.</div>
            <div class="inv-avail-sub">de ${total} ${uTxt}</div>
            <div class="inv-reabastecer-btns">
              <button class="btn btn-ghost btn-sm inv-reab-btn" onclick="openReabastecerModal(${inv.id})" title="Comprar más unidades de este lote (el costo se promedia)">📦 Reabastecer</button>
              ${disponible>0 ? `<button class="btn btn-red btn-sm inv-rebaja-btn" onclick="openRebajaModal(${inv.id}, '${escapeForJsSingle(inv.desc)}', ${inv.costoPorUnidad}, '${inv.unidad}')" title="Registrar baja de inventario (deterioro, pérdida, robo...)">📉 Rebaja</button>` : (cantRebajada>0 ? `<span class="inv-badge inv-badge-rebaja" title="Material dado de baja">📉 ${cantRebajada}${uTxt} rebajados</span>` : '')}
            </div>
          </div>
        </div>

        <div class="inv-progress-wrap" title="Vendido ${cantVendida}${uTxt} · Rebajado ${cantRebajada}${uTxt} · Disponible ${disponible}${uTxt}">
          <div class="inv-progress">
            <div class="inv-progress-sold"  style="width:${pctVendido}%"></div>
            <div class="inv-progress-rebaja" style="width:${pctRebajado}%"></div>
          </div>
          <div class="inv-progress-legend">
            <span class="inv-legend-sold">vendido ${cantVendida}${uTxt}</span>
            ${cantRebajada>0?`<span class="inv-legend-rebaja">rebajado ${cantRebajada}${uTxt}</span>`:''}
            <span class="inv-legend-disp">disponible ${disponible}${uTxt}</span>
          </div>
        </div>

        <div class="inv-ganancia-row">
          <span>Ganancia: <strong class="${gananciaAcum>=0?'text-green':'text-red'}">${fmt(gananciaAcum)}</strong> / objetivo ${fmt(Math.round(gananciaObjetivo))}</span>
          <span class="text-muted">${pctGanancia}%</span>
        </div>

        ${disponible>0?`
        <div class="inv-sell-block">
          <div class="inv-sugerido">💡 Precio sugerido: <strong>${fmt(sugerido)}</strong>/${uTxt} <span class="text-muted">(mantiene el ${Math.round(margenObj*100)}% del lote sin perder)</span></div>
          <div class="inv-sell-row">
            <select id="asig-cliente-${inv.id}" class="inv-sell-cliente">${opcionesClientes}</select>
            <input type="number" id="asig-cantidad-${inv.id}" class="inv-sell-cant" placeholder="Cant." min="1" max="${disponible}">
            <input type="number" id="asig-precio-${inv.id}" class="inv-sell-precio" placeholder="${sugerido}">
            <button class="btn btn-amber btn-sm" onclick="asignarDesdeModal(${inv.id})">Vender</button>
          </div>
          <div class="inv-modo-pago">
            <label><input type="radio" name="modo-pago-${inv.id}" value="plazo" checked> 📅 A plazo</label>
            <label><input type="radio" name="modo-pago-${inv.id}" value="momento"> 💵 Pagado al momento</label>
          </div>
        </div>` : `<div class="inv-agotado-tag">✓ Lote agotado</div>`}

        ${ventasLote.length?`
        <div class="inv-subsection">
          <div class="inv-subheader" onclick="toggleVentasLote(${inv.id})">
            ${ventasLoteAbiertas[inv.id]?'▾':'▸'} Ventas de este lote (${ventasLote.length})
          </div>
          ${ventasLoteAbiertas[inv.id]?[...ventasLote].reverse().map(v=>{
            const cli = clients.find(x=>x.id===v.clienteId);
            return `
            <div class="gasto-item inv-venta-item">
              <div style="flex:1">
                <div class="gasto-desc">${v.modoPago==='momento'?'💵':'📅'} ${cli?escapeHtml(cli.nombre):'(cliente eliminado)'} — ${v.cantidad}${uTxt} × ${fmt(v.precioUnidad)}</div>
                <div style="font-size:0.6rem;color:var(--text-muted)">${v.fecha} · ganancia ${fmt(v.ganancia)}</div>
              </div>
              <span class="gasto-monto" style="margin-right:4px">${fmt(v.monto)}</span>
              <button class="btn btn-red btn-sm" onclick="eliminarVentaInventario('${escapeForJsSingle(v.id)}')" title="Eliminar venta">🗑</button>
            </div>`;
          }).join(''):''}
        </div>` : ''}

        ${tieneRebajas?`
        <div class="inv-subsection">
          <div class="inv-subheader inv-subheader-rebaja" onclick="toggleRebajasLote(${inv.id})">
            ${rebajasLoteAbiertas[inv.id]?'▾':'▸'} Rebajas de este lote (${rebajasLote.length})
          </div>
          ${rebajasLoteAbiertas[inv.id]?[...rebajasLote].reverse().map(g=>{
            const mInfo = REBAJA_MOTIVOS[g.motivo] || REBAJA_MOTIVOS['otro'];
            return `
            <div class="gasto-item inv-rebaja-item">
              <div style="flex:1">
                <div class="gasto-desc">${mInfo.icon} ${mInfo.label} — ${g.cantidad}${uTxt} × ${fmt(g.valorUnidad)}</div>
                <div style="font-size:0.6rem;color:var(--text-muted)">${g.fecha}${g.desc&&g.desc.includes('·')?' · '+escapeHtml(g.desc.split('·')[1].trim()):''}</div>
              </div>
              <span class="gasto-monto text-red" style="margin-right:4px">−${fmt(g.monto)}</span>
              <button class="btn btn-ghost btn-sm" onclick="eliminarRebaja('${escapeForJsSingle(g.rebajaId)}')" title="Revertir rebaja (devuelve el material al stock)">↩</button>
            </div>`;
          }).join(''):''}
        </div>` : ''}
      </div>`;
  }).join('') || '<div class="empty-state">Sin lotes registrados</div>';
}

// rebajasLoteAbiertas: igual que ventasLoteAbiertas, pero para la sección de
// rebajas de cada lote (colapsada por defecto).
let rebajasLoteAbiertas = {};

function toggleRebajasLote(invId) {
  rebajasLoteAbiertas[invId] = !rebajasLoteAbiertas[invId];
  renderInventario();
}
