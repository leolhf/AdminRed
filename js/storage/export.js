// export.js
// Exportar respaldo (JSON) y CSV de clientes.
// Depende de: state.js (clients), storage-local.js (dataToJson)

// ═══════════════════════════════════════════════════════════
//  EXPORTAR
// ═══════════════════════════════════════════════════════════
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

function exportCSV() {
  if(!history.length){notify('Sin historial para exportar',true);return;}
  const rows=[['Cliente','Monto','Fecha','Nota'],...history.map(h=>[h.nombre,h.monto,h.fecha,h.nota||''])];
  const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`rednet_cobros_${fechaLocalISO()}.csv`;
  a.click(); notify('CSV exportado');
}
