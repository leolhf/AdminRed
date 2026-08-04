// macrodroid-export.js
// Exporta un resumen en texto plano (separado por ';') con los clientes que
// tienen algo pendiente de cobro, para que apps de automatización como
// MacroDroid lo lean sin tener que entender el JSON completo de AdminRed.
// Formato de cada línea: nombre;telefono;tipo;monto;detalle;mensaje
// tipo: VENCIDO | POR_VENCER | MORA | LIQUIDAR
// El campo "mensaje" (último de la línea) es el texto listo para enviar por
// WhatsApp desde MacroDroid al tocar la notificación; no contiene saltos de
// línea, así que en MacroDroid conviene separar por ';' pero tomar TODO lo
// que quede después del 5to ';' como mensaje (por si el texto llegara a
// incluir un ';').
// Depende de: state.js, calculations.js (getStatus, getMora, montoTotalACobrar,
// mesesRestantesDeuda), models/investment.js (getCuotaEquipoCliente,
// getDeudaEquipoCliente), notificaciones/whatsapp.js (generateReminderMessage)
// — debe cargarse antes de llamar a resumenMacroDroidTexto(), aunque el
// <script> esté después en index.html, ya que la función solo se invoca en
// tiempo de ejecución.
// Reutiliza openIDB/IDB_STORE de storage-file.js (debe cargarse después)

let macrodroidHandle = null;

// Mensaje para clientes con mora acumulada pero que aún no están en estado
// "due"/"warn" (ej. ya pagó el mes en curso pero arrastra meses anteriores).
// Si además tiene deuda de equipo, se agrega esa info igual que en whatsapp.js.
function generateMoraMessage(client, mora, monto) {
  const cuotaEquipo = getCuotaEquipoCliente(client);
  const deudaLinea = cuotaEquipo > 0
    ? ` Además tienes ${fmt(cuotaEquipo)} de deuda de equipo (restan ${fmt(getDeudaEquipoCliente(client))}, ~${mesesRestantesDeuda(client)} mes${mesesRestantesDeuda(client)===1?'':'es'} si se mantiene así).`
    : '';
  return `Hola ${client.nombre}, tienes ${mora} mes${mora > 1 ? 'es' : ''} de mora pendiente${mora > 1 ? 's' : ''} de tu servicio de internet. Monto pendiente: ${fmt(monto)}.${deudaLinea} Por favor ponte al día. Gracias - Admin Local`;
}

// Mensaje para clientes que quieren liquidar su deuda de equipo.
function generateLiquidarMessage(client) {
  const cuotaEquipo = getCuotaEquipoCliente(client);
  const meses = mesesRestantesDeuda(client);
  const ritmoLinea = cuotaEquipo > 0
    ? ` A la cuota actual de ${fmt(cuotaEquipo)}/mes, te quedan ~${meses} mes${meses===1?'':'es'} si se mantiene así.`
    : '';
  return `Hola ${client.nombre}, quedamos en coordinar la liquidación de tu deuda de equipo por ${fmt(client.deudaEquipo)}.${ritmoLinea} Avísame cuándo puedes realizar el pago. Gracias - Admin Local`;
}

function resumenMacroDroidTexto() {
  const lineas = [];
  clients.forEach(c => {
    const tel = (c.telefono || '').replace(/[^0-9]/g,'');
    if(!c.pagado) {
      const s = getStatus(c);
      const mora = getMora(c);
      const monto = montoTotalACobrar(c);
      if(s==='due')       lineas.push(`${c.nombre};${tel};VENCIDO;${monto};día límite ${c.diaPago};${generateReminderMessage(c)}`);
      else if(s==='warn') lineas.push(`${c.nombre};${tel};POR_VENCER;${monto};día ${c.diaPago};${generateReminderMessage(c)}`);
      else if(mora>0)     lineas.push(`${c.nombre};${tel};MORA;${monto};${mora} mes${mora>1?'es':''};${generateMoraMessage(c, mora, monto)}`);
    }
    if(c.quiereLiquidar && c.deudaEquipo>0) {
      lineas.push(`${c.nombre};${tel};LIQUIDAR;${c.deudaEquipo};quiere saldar deuda de equipo;${generateLiquidarMessage(c)}`);
    }
  });
  return lineas.length ? lineas.join('\n') : 'Sin pendientes hoy';
}

async function linkMacrodroidFile() {
  if(!window.showSaveFilePicker){notify('Tu navegador no soporta File System Access API',true);return;}
  try{
    const h=await window.showSaveFilePicker({suggestedName:'rednet_macrodroid.txt',types:[{description:'Texto',accept:{'text/plain':['.txt']}}]});
    macrodroidHandle=h;
    await persistMacrodroidHandle(h);
    await writeMacrodroidFile();
    notify(`🤖 Resumen vinculado: ${h.name}`);
  }catch(e){ if(e.name!=='AbortError') notify('No se pudo crear el archivo',true); }
}

async function writeMacrodroidFile() {
  if(!macrodroidHandle) return;
  try{
    const w=await macrodroidHandle.createWritable();
    await w.write(resumenMacroDroidTexto());
    await w.close();
  }catch(e){ console.warn('No se pudo escribir el resumen de MacroDroid:', e); }
}

function unlinkMacrodroidFile() {
  macrodroidHandle=null;
  clearMacrodroidHandle();
  notify('Resumen MacroDroid desvinculado');
}

async function persistMacrodroidHandle(h){try{const db=await openIDB();const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(h,'macrodroidFileHandle');}catch(e){}}
async function restoreMacrodroidHandle(){try{const db=await openIDB();return await new Promise((res)=>{const tx=db.transaction(IDB_STORE,'readonly');const r=tx.objectStore(IDB_STORE).get('macrodroidFileHandle');r.onsuccess=e=>res(e.target.result||null);r.onerror=()=>res(null);});}catch(e){return null;}}
async function clearMacrodroidHandle(){try{const db=await openIDB();const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).delete('macrodroidFileHandle');}catch(e){}}

async function tryRestoreMacrodroidHandle() {
  const h=await restoreMacrodroidHandle(); if(!h) return;
  try{
    const p=await h.queryPermission({mode:'readwrite'});
    if(p==='granted'){ macrodroidHandle=h; await writeMacrodroidFile(); }
  }catch(e){}
}
