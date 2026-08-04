// storage-file.js
// Persistencia mediante File System Access API + IndexedDB (vincular archivo, guardar, leer).
// Depende de: state.js, storage-local.js (dataToJson/applyJson)
// Usa también (llamadas diferidas, no deben existir al cargar sino al ejecutarse): notify() [notify-ui.js], render() [render.js], showConfirm() [historial.js]

// ═══════════════════════════════════════════════════════════
//  PERSISTENCIA — File System Access API
// ═══════════════════════════════════════════════════════════
const IDB_STORE = IDB.STORE, IDB_KEY = IDB.KEY;

function openIDB() {
  return new Promise((res,rej)=>{
    const r=indexedDB.open(IDB.DB_NAME, IDB.VERSION);
    r.onupgradeneeded=e=>{
      const dbase=e.target.result;
      if(!dbase.objectStoreNames.contains(IDB_STORE)) dbase.createObjectStore(IDB_STORE);
      if(!dbase.objectStoreNames.contains(IDB.CHECKPOINTS_STORE)) dbase.createObjectStore(IDB.CHECKPOINTS_STORE);
    };
    r.onsuccess=e=>res(e.target.result);
    r.onerror=e=>rej(e);
  });
}
// BUG FIX: los tres catch vacíos silenciaban errores de IndexedDB
// (ej. el usuario ha bloqueado la API, o el dispositivo tiene el almacenamiento lleno).
// Consecuencia: el handle del archivo parecía haberse guardado/borrado, pero
// en el próximo arranque tryRestoreFileHandle() devolvía null y el usuario
// tenía que re-vincular el archivo sin entender por qué. Ahora se registra
// en consola para facilitar el diagnóstico.
async function persistHandle(h){
  try{
    const db=await openIDB();
    const tx=db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).put(h,IDB_KEY);
  }catch(e){ console.warn('persistHandle: no se pudo guardar el file handle en IndexedDB:', e); }
}

async function restoreHandle(){
  try{
    const db=await openIDB();
    return await new Promise((res)=>{
      const tx=db.transaction(IDB_STORE,'readonly');
      const r=tx.objectStore(IDB_STORE).get(IDB_KEY);
      r.onsuccess=e=>res(e.target.result||null);
      r.onerror=()=>res(null);
    });
  }catch(e){ console.warn('restoreHandle: error al leer IndexedDB:', e); return null; }
}

async function clearHandle(){
  try{
    const db=await openIDB();
    const tx=db.transaction(IDB_STORE,'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
  }catch(e){ console.warn('clearHandle: no se pudo borrar el file handle de IndexedDB:', e); }
}

let saveErrorCount = 0;
let lastFileModified = null; // marca de tiempo del archivo la última vez que lo leímos

async function saveToFile(reintentando=false, forzar=false) {
  if(!fileHandle) return;
  try{
    if(!forzar && lastFileModified){
      const actual = await fileHandle.getFile();
      if(actual.lastModified !== lastFileModified){
        mostrarConflictoArchivo();
        return; // no sobrescribe hasta que el usuario decida
      }
    }
    const w=await fileHandle.createWritable();
    await w.write(dataToJson());
    await w.close();
    const nuevo = await fileHandle.getFile();
    lastFileModified = nuevo.lastModified;
    isDirty=false; updateFileBar();
    saveErrorCount=0;
    ocultarBannerErrorGuardado();
  }catch(e){
    setFileStatus('error',`Error al guardar: ${e.message}`);
    if(!reintentando){
      // Podría ser un fallo momentáneo (permiso, dispositivo ocupado) — reintenta una vez antes de avisar.
      setTimeout(()=>saveToFile(true), 1500);
      return;
    }
    saveErrorCount++;
    mostrarBannerErrorGuardado(`No se pudo guardar en "${fileHandle.name}" (${e.message}). Tus datos quedaron solo en este navegador.`);
  }
}

function mostrarConflictoArchivo() {
  const banner=document.getElementById('save-conflict-banner');
  if(banner) banner.style.display='flex';
}
function ocultarConflictoArchivo() {
  const banner=document.getElementById('save-conflict-banner');
  if(banner) banner.style.display='none';
}
async function sobrescribirArchivoDeTodosModos() {
  ocultarConflictoArchivo();
  await saveToFile(false, true);
  notify('✎ Se sobrescribió el archivo con los datos de esta app');
}
async function recargarArchivoExterno() {
  ocultarConflictoArchivo();
  await readFromFile(fileHandle);
  saveLocalStorage();
  isDirty=false; updateFileBar();
  render();
  notify('📂 Se cargaron los cambios que había en el archivo');
}

async function readFromFile(h){
  const f=await h.getFile();
  applyJson(await f.text());
  lastFileModified = f.lastModified;
}

async function save() {
  if(typeof validarYCorregirDatos === 'function') validarYCorregirDatos();
  try{
    saveLocalStorage();
  }catch(e){
    console.error('Error guardando en localStorage:', e);
    mostrarBannerErrorGuardado(`No se pudo guardar (${e.message}). Es posible que falte espacio de almacenamiento en el dispositivo.`);
    return; // si ni el guardado local funcionó, no seguir con el resto
  }
  if(fileHandle){ isDirty=true; updateFileBar(); await saveToFile(); }
  if(typeof writeMacrodroidFile === 'function') await writeMacrodroidFile();
}

function mostrarBannerErrorGuardado(msg) {
  if(typeof showNotification === 'function') {
    showNotification('error', msg, 'Reintentar', reintentarGuardado);
  }
  if(typeof notify==='function') notify(msg,true);
}

function ocultarBannerErrorGuardado() {
  // Ya no se necesita, las notificaciones se descartan individualmente
}

async function reintentarGuardado() {
  ocultarBannerErrorGuardado();
  await save();
}

function setFileStatus(type,msg){ const el=document.getElementById('file-status'); el.className=type; el.textContent=msg; }

function updateFileBar() {
  const linked=!!fileHandle;
  // Los botones btn-save-file y btn-unlink ya no existen, fueron reemplazados por el menú de archivo
  // document.getElementById('btn-save-file').style.display=linked?'':'none';
  // document.getElementById('btn-unlink').style.display=linked?'':'none';

  if(!linked){setFileStatus('','Sin archivo vinculado · datos guardados en el navegador');return;}
  if(isDirty){setFileStatus('dirty',`✎ ${fileHandle.name} — guardando...`);}
  else{setFileStatus('linked',`✓ Vinculado: ${fileHandle.name}`);}
}

async function linkNewFile() {
  if(!window.showSaveFilePicker){notify('Tu navegador no soporta File System Access API',true);return;}
  try{
    const h=await window.showSaveFilePicker({suggestedName:'rednet_datos.json',types:[{description:'RedNet JSON',accept:{'application/json':['.json']}}]});
    fileHandle=h;
    await persistHandle(h);
    await saveToFile();
    updateFileBar();
    notify(`📄 Archivo creado: ${h.name}`);
  }catch(e){if(e.name!=='AbortError')notify('No se pudo crear el archivo',true);}
}

async function openExistingFile() {
  if(!window.showOpenFilePicker){notify('Tu navegador no soporta File System Access API',true);return;}
  try{
    const [h]=await window.showOpenFilePicker({types:[{description:'RedNet JSON',accept:{'application/json':['.json']}}]});
    await readFromFile(h);
    fileHandle=h;
    await persistHandle(h);
    isDirty=false;
    saveLocalStorage();
    updateFileBar();
    render();
    notify(`📂 Archivo cargado: ${h.name}`);
  }catch(e){if(e.name!=='AbortError')notify('No se pudo abrir el archivo',true);}
}

function unlinkFile(){
  fileHandle=null;
  isDirty=false;
  clearHandle();
  updateFileBar();
  notify('Archivo desvinculado');
}

let pendingRestoreHandle=null;

async function tryRestoreFileHandle() {
  const h=await restoreHandle(); if(!h) return;
  try{
    const p=await h.queryPermission({mode:'readwrite'});
    if(p==='granted'){
      fileHandle=h;
      await readFromFile(h);
      saveLocalStorage();
      isDirty=false;
      updateFileBar();
      render();
      notify(`🔗 Reconectado: ${h.name}`);
    } else {
      pendingRestoreHandle=h;
      document.getElementById('restore-filename').textContent=h.name;
      document.getElementById('modal-restore').classList.add('open');
    }
  }catch(e){clearHandle();}
}

async function confirmRestore() {
  document.getElementById('modal-restore').classList.remove('open');
  if(!pendingRestoreHandle) return;
  try{
    const p=await pendingRestoreHandle.requestPermission({mode:'readwrite'});
    if(p==='granted'){
      fileHandle=pendingRestoreHandle;
      await readFromFile(fileHandle);
      saveLocalStorage();
      isDirty=false;
      updateFileBar();
      render();
      notify(`🔗 Reconectado: ${fileHandle.name}`);
    } else { notify('Permiso denegado',true); }
  }catch(e){notify('No se pudo restaurar el archivo',true);}
  pendingRestoreHandle=null;
}

function declineRestore() {
  document.getElementById('modal-restore').classList.remove('open');
  pendingRestoreHandle=null;
}
