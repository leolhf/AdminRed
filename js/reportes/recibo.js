// recibo.js
// Generacion de recibos de pago imprimibles / exportables a PDF.
// Feature #4: Recibo de pago con numero auto-incremental, datos del cliente,
//              desglose de servicio/equipo, descuento aplicado, y plantilla
//              de impresion (window.print con CSS @media print).
// Depende de: state.js (clients, history, config), calculations.js
//             (getPrecioCliente, getMora, calcularDescuento, getDeudaEquipoCliente,
//              getCuotaEquipo, fmt, fechaLocalISO, formatoRecibo)

function generarRecibo(h) {
  // h = entrada del historial {hid, id, nombre, monto, montoEquipo, fecha, nota, numRecibo, descuentoAplicado}
  if(!h){notify('No se pudo generar el recibo: falta la entrada de cobro',true);return;}
  const c=clients.find(x=>x.id===h.id);
  const numRecibo=h.numRecibo||'R-S/N';
  const fecha=h.fecha||fechaLocalISO();
  const montoServicio=h.monto-(h.montoEquipo||0);
  const montoEquipo=h.montoEquipo||0;

  // Datos del cliente
  const precioMega=c?getPrecioCliente(c):0;
  const megas=c?c.megas:0;
  const precioPorMes=megas*precioMega;
  const descuento=h.descuentoAplicado||0;
  const precioNeto=Math.max(0,precioPorMes-descuento);
  const mora=getMora(c);

  // Rellenar la plantilla de recibo
  const tpl=document.getElementById('recibo-print-template');
  if(!tpl){notify('Plantilla de recibo no encontrada',true);return;}
  const clone=tpl.cloneNode(true);
  clone.id='recibo-print-active';
  clone.style.display='block';

  // Llenar campos
  const setVal=(id,val)=>{const el=clone.querySelector('#'+id);if(el)el.textContent=val;};
  setVal('recibo-numero',numRecibo);
  setVal('recibo-fecha',formatearFecha(fecha));
  setVal('recibo-cliente',h.nombre);
  setVal('recibo-megas',megas?megas+' Mb':'—');
  setVal('recibo-precio-mega',precioMega?precioMega.toLocaleString()+' CUP/Mb':'—');

  // Desglose de servicio
  const servicioRow=clone.querySelector('#recibo-servicio-row');
  if(servicioRow){
    if(montoServicio>0){
      servicioRow.style.display='';
      setVal('recibo-servicio-base',fmt(precioPorMes));
      if(descuento>0){
        setVal('recibo-descuento','−'+fmt(descuento));
        clone.querySelector('#recibo-descuento-row').style.display='';
      }
      if(mora>0){
        setVal('recibo-mora',`${mora} mes(es) × ${fmt(precioNeto)}`);
        clone.querySelector('#recibo-mora-row').style.display='';
      }
      setVal('recibo-servicio-total',fmt(montoServicio));
    } else {
      servicioRow.style.display='none';
    }
  }

  // Desglose de equipo
  const equipoRow=clone.querySelector('#recibo-equipo-row');
  if(equipoRow){
    if(montoEquipo>0){
      equipoRow.style.display='';
      setVal('recibo-equipo-total',fmt(montoEquipo));
    } else {
      equipoRow.style.display='none';
    }
  }

  // Total
  setVal('recibo-total',fmt(h.monto));
  setVal('recibo-nota',h.nota||'');

  // Equivalencia USD del total (solo si hay tasa configurada)
  const equivRow=clone.querySelector('#recibo-total-equiv-row');
  const equivCell=clone.querySelector('#recibo-total-equiv');
  if(equivRow&&equivCell){
    const equiv=typeof equivUsd==='function'?equivUsd(h.monto):'';
    if(equiv){
      equivCell.textContent=equiv;
      equivRow.style.display='';
    } else {
      equivRow.style.display='none';
    }
  }

  // Mostrar el recibo en un overlay y disparar print
  const overlay=document.createElement('div');
  overlay.id='recibo-overlay';
  overlay.className='recibo-overlay';
  overlay.appendChild(clone);

  // Botones de accion
  const actions=document.createElement('div');
  actions.className='recibo-actions';
  actions.innerHTML=`
    <button class="btn btn-blue" onclick="window.print()">🖨 Imprimir / Guardar PDF</button>
    <button class="btn btn-ghost" onclick="cerrarRecibo()">✕ Cerrar</button>
  `;
  overlay.appendChild(actions);

  document.body.appendChild(overlay);

  // Nota: el CSS @media print oculta todo excepto #recibo-overlay
}

function cerrarRecibo() {
  const overlay=document.getElementById('recibo-overlay');
  if(overlay) overlay.remove();
}

function formatearFecha(iso) {
  if(!iso) return '';
  try {
    const d=new Date(iso+'T00:00:00');
    return d.toLocaleDateString('es-CU',{day:'numeric',month:'long',year:'numeric'});
  } catch(e){ return iso; }
}

// Permitir regenerar un recibo desde el historial de cobros
function regenerarRecibo(hid) {
  const h=history.find(x=>x.hid===hid);
  if(!h){notify('Cobro no encontrado',true);return;}
  generarRecibo(h);
}
