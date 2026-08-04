// checkpoint.js
// Copias de seguridad automáticas guardadas en IndexedDB, independientes
// del archivo vinculado y de localStorage. Se guardan al iniciar un mes
// nuevo y una vez cada 24h de uso, para poder recuperar los datos si el
// archivo vinculado se pierde, se corrompe o lo borras sin querer.
// Depende de: state.js, storage-local.js (dataToJson/applyJson),
//             storage-file.js (openIDB, debe cargarse antes)

const CHECKPOINT_MAX = 8; // cuántas copias conservar (las más viejas se descartan)

async function guardarCheckpoint(motivo='auto') {
  try{
    const db = await openIDB();
    const tx = db.transaction(IDB.CHECKPOINTS_STORE,'readwrite');
    const store = tx.objectStore(IDB.CHECKPOINTS_STORE);
    const id = Date.now();
    store.put({ id, motivo, fecha:new Date().toISOString(), data: dataToJson() }, id);
    await new Promise((res)=>{ tx.oncomplete=res; tx.onerror=res; });
    await limpiarCheckpointsViejos();
  }catch(e){ console.warn('No se pudo guardar el checkpoint automático:', e); }
}

async function limpiarCheckpointsViejos() {
  try{
    const db = await openIDB();
    const tx = db.transaction(IDB.CHECKPOINTS_STORE,'readwrite');
    const store = tx.objectStore(IDB.CHECKPOINTS_STORE);
    const keys = await new Promise((res)=>{ const r=store.getAllKeys(); r.onsuccess=e=>res(e.target.result||[]); r.onerror=()=>res([]); });
    if(keys.length > CHECKPOINT_MAX){
      keys.sort((a,b)=>a-b);
      keys.slice(0, keys.length-CHECKPOINT_MAX).forEach(k=>store.delete(k));
    }
  }catch(e){}
}

async function listarCheckpoints() {
  try{
    const db = await openIDB();
    return await new Promise((res)=>{
      const tx=db.transaction(IDB.CHECKPOINTS_STORE,'readonly');
      const r=tx.objectStore(IDB.CHECKPOINTS_STORE).getAll();
      r.onsuccess=e=>res((e.target.result||[]).sort((a,b)=>b.id-a.id));
      r.onerror=()=>res([]);
    });
  }catch(e){ return []; }
}

async function restaurarCheckpoint(id) {
  const lista = await listarCheckpoints();
  const cp = lista.find(c=>c.id===id);
  if(!cp){ notify('No se encontró esa copia',true); return; }
  const fechaTexto = new Date(cp.fecha).toLocaleString('es-CU');
  if(!confirm(`¿Restaurar la copia del ${fechaTexto}? Esto reemplaza TODOS los datos actuales (clientes, gastos, historial).`)) return;
  applyJson(cp.data);
  saveLocalStorage();
  if(fileHandle) await saveToFile(false,true);
  render();
  closeCheckpointsModal();
  notify('✅ Datos restaurados desde la copia automática');
}

function verificarCheckpointDiario() {
  try{
    const ultimo = parseInt(localStorage.getItem('rn_last_checkpoint')||'0');
    const ahora = Date.now();
    if(ahora - ultimo > 24*60*60*1000){
      guardarCheckpoint('24h');
      localStorage.setItem('rn_last_checkpoint', String(ahora));
    }
  }catch(e){}
}

const MOTIVO_LABEL = { 'auto':'Manual','24h':'Automática (24h)','mes-nuevo':'Antes de iniciar mes' };

async function openCheckpointsModal() {
  const lista = await listarCheckpoints();
  const cont = document.getElementById('checkpoints-list');
  if(!cont) return;
  if(!lista.length){
    cont.innerHTML = `<div style="color:var(--text-muted);font-size:0.82rem;padding:8px 0">Todavía no hay copias automáticas. Se crean solas al iniciar un mes nuevo o cada 24h de uso.</div>`;
  } else {
    cont.innerHTML = lista.map(cp=>{
      const fechaTexto = new Date(cp.fecha).toLocaleString('es-CU',{dateStyle:'medium',timeStyle:'short'});
      const label = MOTIVO_LABEL[cp.motivo]||cp.motivo;
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);font-size:0.82rem">
        <div>
          <div>${fechaTexto}</div>
          <div style="font-size:0.72rem;color:var(--text-muted)">${label}</div>
        </div>
        <button class="btn btn-ghost btn-sm" onclick="restaurarCheckpoint(${cp.id})">Restaurar</button>
      </div>`;
    }).join('');
  }
  document.getElementById('modal-checkpoints').classList.add('open');
}

function closeCheckpointsModal() {
  document.getElementById('modal-checkpoints').classList.remove('open');
}
