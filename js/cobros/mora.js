// mora.js
// Marcar y ajustar mora manualmente en un cliente.
// Depende de: state.js (clients), storage-local.js (save), render.js (render)

// ═══════════════════════════════════════════════════════════
//  MORA
// ═══════════════════════════════════════════════════════════
function marcarMora(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  c.mora=(c.mora||0)+1;
  save(); render(); verHistorialCliente(id);
  notify(`${c.nombre} — mora: ${c.mora} mes${c.mora>1?'es':''}`);
}

function ajustarMora(id) {
  const c=clients.find(x=>x.id===id); if(!c) return;
  document.getElementById('mora-client-id').value=id;
  document.getElementById('mora-client-name').value=c.nombre;
  document.getElementById('mora-valor').value=c.mora||0;
  document.getElementById('modal-mora').classList.add('open');
}

function closeMoraModal() {
  document.getElementById('modal-mora').classList.remove('open');
}

function saveMora() {
  const id = parseInt(document.getElementById('mora-client-id').value);
  const n = parseInt(document.getElementById('mora-valor').value);
  const c = clients.find(x=>x.id===id);
  if(!c) return;
  if(isNaN(n)||n<0){notify('Valor inválido',true);return;}
  c.mora=n; save(); render(); closeMoraModal();
  notify(`Mora de ${c.nombre} actualizada: ${n} mes${n!==1?'es':''}`);
}
