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

// ═══════════════════════════════════════════════════════════
//  COMPRA DE UN LOTE (gasto real a costo, una sola vez)
// ═══════════════════════════════════════════════════════════
function comprarInventario(desc, unidad, cantidadTotal, costoPorUnidad, margenObjetivo) {
  const montoTotal = cantidadTotal * costoPorUnidad;
  const invId = Date.now();
  gastos.push({
    desc: `📦 ${desc} (${cantidadTotal} ${unidad==='m'?'m':'u'} × ${fmt(costoPorUnidad)})`,
    monto: montoTotal,
    fecha: new Date().toISOString().split('T')[0],
    categoria: 'inversion',
    loteId: invId
    // sin clienteId: es un gasto compartido, no de un cliente específico
  });
  inventario.push({
    id: invId, desc, unidad,
    cantidadTotal, costoPorUnidad, montoTotal,
    margenObjetivo: (margenObjetivo||10)/100,   // se guarda como fracción (0.10)
    cantidadAsignada: 0, montoAsignado: 0, gananciaAcumulada: 0,
    fecha: new Date().toISOString().split('T')[0]
  });
  save(); renderGastos(); renderInventario();
  return invId;
}

const unidadesDisponibles = (invId) => {
  const inv = inventario.find(i => i.id === invId);
  return inv ? inv.cantidadTotal - inv.cantidadAsignada : 0;
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
    fecha: new Date().toISOString().split('T')[0],
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
  asignarConsumoInventario(invId, clienteId, cantidad, precio, modoPago);
}

function toggleVentasLote(invId) {
  ventasLoteAbiertas[invId] = !ventasLoteAbiertas[invId];
  renderInventario();
}

function renderInventario() {
  const el = document.getElementById('inventario-list');
  if(!el) return;
  if(!inventario.length){ el.innerHTML='<div class="empty-state">Sin lotes registrados</div>'; return; }
  const opcionesClientes = clients.map(c=>`<option value="${c.id}">${c.nombre}</option>`).join('');

  el.innerHTML = [...inventario].reverse().map(inv=>{
    // Compatibilidad con lotes viejos creados antes de este cambio (solo tenían monto, sin cantidad)
    if(inv.cantidadTotal==null){
      return `
        <div class="gasto-item">
          <div style="flex:1">
            <div class="gasto-desc">📦 ${inv.desc}</div>
            <div style="font-size:0.62rem;color:var(--text-muted)">${inv.fecha} · lote antiguo, sin control por cantidad</div>
          </div>
          <span class="gasto-monto">${fmt(inv.montoTotal||0)}</span>
        </div>`;
    }

    const uTxt = inv.unidad==='m' ? 'm' : 'u';
    const disponible = unidadesDisponibles(inv.id);
    const sugerido = precioSugerido(inv.id);
    const gananciaObjetivo = inv.montoTotal * inv.margenObjetivo;
    const pctGanancia = gananciaObjetivo>0 ? Math.round(inv.gananciaAcumulada/gananciaObjetivo*100) : 0;
    const ventasLote = asignacionesInventario.filter(v => v.inventarioId === inv.id);

    return `
      <div class="gasto-item" style="flex-direction:column;align-items:stretch;gap:8px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div class="gasto-desc">📦 ${inv.desc}</div>
            <div style="font-size:0.62rem;color:var(--text-muted);font-family:var(--mono)">
              ${inv.fecha} · costo ${fmt(inv.costoPorUnidad)}/${uTxt} · margen objetivo ${Math.round(inv.margenObjetivo*100)}%
            </div>
          </div>
          <div style="text-align:right">
            <div class="mono ${disponible>0?'text-amber':'text-muted'}" style="font-size:0.8rem">${disponible} ${uTxt} disp.</div>
            <div style="font-size:0.62rem;color:var(--text-muted)">de ${inv.cantidadTotal} ${uTxt}</div>
          </div>
        </div>

        <div style="display:flex;justify-content:space-between;font-size:0.7rem;background:var(--bg);border-radius:6px;padding:6px 8px">
          <span>Ganancia: <strong class="${inv.gananciaAcumulada>=0?'text-green':'text-red'}">${fmt(inv.gananciaAcumulada)}</strong> / objetivo ${fmt(Math.round(gananciaObjetivo))}</span>
          <span class="text-muted">${pctGanancia}%</span>
        </div>

        ${disponible>0?`
        <div>
          <div style="font-size:0.68rem;color:var(--amber);margin-bottom:4px">💡 Precio sugerido: ${fmt(sugerido)}/${uTxt} (para no perder y mantener el ${Math.round(inv.margenObjetivo*100)}% de ganancia del lote)</div>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            <select id="asig-cliente-${inv.id}" style="flex:1;min-width:90px;font-size:0.72rem">${opcionesClientes}</select>
            <input type="number" id="asig-cantidad-${inv.id}" placeholder="Cant." min="1" max="${disponible}" style="width:64px;font-size:0.72rem">
            <input type="number" id="asig-precio-${inv.id}" placeholder="${sugerido}" style="width:70px;font-size:0.72rem">
            <button class="btn btn-amber btn-sm" onclick="asignarDesdeModal(${inv.id})">Vender</button>
          </div>
          <div style="display:flex;gap:12px;font-size:0.68rem;margin-top:5px">
            <label style="display:flex;align-items:center;gap:3px;cursor:pointer">
              <input type="radio" name="modo-pago-${inv.id}" value="plazo" checked style="width:auto;margin:0"> 📅 A plazo
            </label>
            <label style="display:flex;align-items:center;gap:3px;cursor:pointer">
              <input type="radio" name="modo-pago-${inv.id}" value="momento" style="width:auto;margin:0"> 💵 Pagado al momento
            </label>
          </div>
        </div>` : `<div style="font-size:0.66rem;color:var(--text-muted)">Lote agotado</div>`}

        ${ventasLote.length?`
        <div style="margin-top:2px">
          <div onclick="toggleVentasLote(${inv.id})" style="cursor:pointer;user-select:none;font-size:0.6rem;text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);margin-bottom:4px">
            ${ventasLoteAbiertas[inv.id]?'▾':'▸'} Ventas de este lote (${ventasLote.length})
          </div>
          ${ventasLoteAbiertas[inv.id]?[...ventasLote].reverse().map(v=>{
            const cli = clients.find(x=>x.id===v.clienteId);
            return `
            <div class="gasto-item" style="font-size:0.72rem">
              <div style="flex:1">
                <div class="gasto-desc">${v.modoPago==='momento'?'💵':'📅'} ${cli?cli.nombre:'(cliente eliminado)'} — ${v.cantidad}${uTxt} × ${fmt(v.precioUnidad)}</div>
                <div style="font-size:0.6rem;color:var(--text-muted)">${v.fecha} · ganancia ${fmt(v.ganancia)}</div>
              </div>
              <span class="gasto-monto" style="margin-right:4px">${fmt(v.monto)}</span>
              <button class="btn btn-red btn-sm" onclick="eliminarVentaInventario('${v.id}')" title="Eliminar venta">🗑</button>
            </div>`;
          }).join(''):''}
        </div>` : ''}
      </div>`;
  }).join('');
}
