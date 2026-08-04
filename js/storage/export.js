// export.js
// Exportar respaldo (JSON), CSV de cobros, CSV de clientes, e importar respaldo.
// Depende de: state.js (clients, history, gastos, config, planes, snapshots),
//             storage-local.js (dataToJson, applyJson, save),
//             crypto.js (decryptData - para respaldos encriptados),
//             render.js (render)

// ═══════════════════════════════════════════════════════════════════════════════
//  EXPORTAR
// ═══════════════════════════════════════════════════════════════════════════════
function exportBackup() {
  const blob=new Blob([dataToJson()],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`rednet_backup_${fechaLocalISO()}.json`;
  a.click(); notify('Respaldo exportado');
  localStorage.setItem(STORAGE_KEYS.LAST_BACKUP, Date.now());
  checkBackupReminder();
}

function checkBackupReminder() {
  const lastBackup = localStorage.getItem(STORAGE_KEYS.LAST_BACKUP);
  const dismissed = localStorage.getItem(STORAGE_KEYS.BACKUP_DISMISSED);
  
  if (dismissed) {
    const dismissedTime = parseInt(dismissed);
    const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24);
    if (daysSinceDismissed < 7) return;
  }
  
  if (!lastBackup) {
    showBackupBanner(0);
    return;
  }
  
  const daysSinceBackup = (Date.now() - parseInt(lastBackup)) / (1000 * 60 * 60 * 24);
  if (daysSinceBackup >= 7) {
    showBackupBanner(Math.floor(daysSinceBackup));
  }
}

function showBackupBanner(days) {
  if(typeof showNotification === 'function') {
    showNotification('warning', `💾 Han pasado ${days} días sin respaldo — Exporta tus datos`, 'Exportar', exportBackup);
  }
}

function dismissBackupBanner() {
  localStorage.setItem(STORAGE_KEYS.BACKUP_DISMISSED, Date.now());
  // Las notificaciones se descartan individualmente
}

// Exportar historial de cobros a CSV (funcion original)
function exportCSV() {
  if(!history.length){notify('Sin historial para exportar',true);return;}
  const rows=[['Cliente','Monto','Fecha','Nota'],...history.map(h=>[h.nombre,h.monto,h.fecha,h.nota||''])];
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`rednet_cobros_${fechaLocalISO()}.csv`;
  a.click(); notify('CSV exportado');
}

// Feature #2: Exportar la lista de clientes a CSV con todos sus datos.
function exportClientesCSV() {
  if(!clients.length){notify('Sin clientes para exportar',true);return;}
  const headers=['Nombre','Megas','Precio/Mega','Total Mes','Dia Pago','Telefono','IP','Mora','Pagado','Descuento','Plan','Deuda Equipo','Cuota Equipo'];
  const rows=clients.map(c=>{
    const plan = getPlanCliente ? getPlanCliente(c) : null;
    return [
      c.nombre||'',
      c.megas||0,
      getPrecioCliente ? getPrecioCliente(c) : c.precio||0,
      (c.megas||0)*(getPrecioCliente ? getPrecioCliente(c) : c.precio||0),
      c.diaPago||'',
      c.telefono||'',
      c.ip||'',
      getMora(c),
      c.pagado?'Si':'No',
      c.descuento||0,
      plan ? plan.nombre : '',
      (typeof getDeudaEquipoCliente==='function' ? getDeudaEquipoCliente(c) : (c.deudaEquipo||0)),
      (typeof getCuotaEquipoCliente==='function' ? getCuotaEquipoCliente(c) : (c.cuotaEquipo||0))
    ];
  });
  const csv=[headers,...rows].map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}); // BOM para Excel
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`rednet_clientes_${fechaLocalISO()}.csv`;
  a.click(); notify(`CSV de ${clients.length} cliente(s) exportado`);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  FEATURE #3: IMPORTAR RESPALDO DESDE JSON
//  Lee un archivo .json (encriptado o plano), lo desencripta si es necesario
//  (pidiendo el PIN), y restaura todos los datos: clients, history, gastos,
//  inventario, investments, equiposRed, planes, snapshots, config.
// ═══════════════════════════════════════════════════════════════════════════════
async function importBackup() {
  const input=document.createElement('input');
  input.type='file';
  input.accept='.json,application/json';
  input.onchange=async(e)=>{
    const file=e.target.files[0];
    if(!file) return;
    try {
      let text=await file.text();
      let data;
      // Intentar parsear como JSON plano primero
      try {
        data=JSON.parse(text);
      } catch(parseErr) {
        // No es JSON plano → probablemente esta encriptado.
        // Pedir el PIN e intentar desencriptar.
        const pin=prompt('🔑 Este respaldo está encriptado. Ingresa el PIN para desencriptarlo:');
        if(!pin){notify('Importación cancelada',true);return;}
        if(typeof decryptData!=='function'){
          notify('Error: el módulo de cifrado no está disponible',true);
          return;
        }
        try {
          const decrypted=await decryptData(text, pin);
          data=JSON.parse(decrypted);
        } catch(decErr) {
          notify('PIN incorrecto o archivo corrupto',true);
          return;
        }
      }
      // Validar que tenga la estructura esperada
      if(!data || typeof data!=='object' || (!data.clients && !data.config)){
        notify('El archivo no parece ser un respaldo válido de RedNet',true);
        return;
      }
      // Confirmar antes de sobreescribir
      if(!confirm(`⚠ Esto reemplazará TODOS los datos actuales con los del respaldo.\n\nEl respaldo contiene:\n• ${data.clients?data.clients.length:0} cliente(s)\n• ${data.history?data.history.length:0} cobro(s) en historial\n• ${data.gastos?data.gastos.length:0} gasto(s)\n\n¿Continuar?`)) return;

      // Aplicar los datos importados
      if(typeof applyJson==='function'){
        applyJson(JSON.stringify(data));
      } else {
        // Fallback manual si applyJson no esta disponible
        clients=data.clients||[];
        history=data.history||[];
        gastos=data.gastos||[];
        inventario=data.inventario||[];
        asignacionesInventario=data.asignacionesInventario||[];
        investments=data.investments||[];
        equiposRed=data.equiposRed||[];
        planes=data.planes||[];
        snapshots=data.snapshots||[];
        reciboCounter=data.reciboCounter||0;
        config={...config,...(data.config||{})};
      }
      if(typeof save==='function') save();
      if(typeof render==='function') render();
      notify(`✅ Respaldo importado: ${clients.length} cliente(s), ${history.length} cobro(s)`);
    } catch(err) {
      console.error('Error al importar respaldo:',err);
      notify('Error al leer el archivo: '+err.message,true);
    }
  };
  input.click();
}
