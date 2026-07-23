// storage-file.js
// Persistencia mediante File System Access API + IndexedDB (vincular archivo, guardar, leer, cifrar).
// Depende de: state.js, crypto.js, storage-local.js (dataToJson/applyJson)
// Usa también (llamadas diferidas, no deben existir al cargar sino al ejecutarse): notify() [notify-ui.js], render() [render.js], showConfirm() [historial.js], scheduleNotifications() [notifications.js]

// ═══════════════════════════════════════════════════════════
//  PERSISTENCIA — File System Access API
// ═══════════════════════════════════════════════════════════
const IDB_STORE = IDB.STORE, IDB_KEY = IDB.KEY;

function openIDB() {
  return new Promise((res,rej)=>{
    const r=indexedDB.open('RedNetDB',1);
    r.onupgradeneeded=e=>e.target.result.createObjectStore(IDB_STORE);
    r.onsuccess=e=>res(e.target.result);
    r.onerror=e=>rej(e);
  });
}
async function persistHandle(h){try{const db=await openIDB();const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).put(h,IDB_KEY);}catch(e){}}
async function restoreHandle(){try{const db=await openIDB();return await new Promise((res)=>{const tx=db.transaction(IDB_STORE,'readonly');const r=tx.objectStore(IDB_STORE).get(IDB_KEY);r.onsuccess=e=>res(e.target.result||null);r.onerror=()=>res(null);});}catch(e){return null;}}
async function clearHandle(){try{const db=await openIDB();const tx=db.transaction(IDB_STORE,'readwrite');tx.objectStore(IDB_STORE).delete(IDB_KEY);}catch(e){}}

async function saveToFile() {
  if(!fileHandle) return;
  try{
    const jsonData = dataToJson();
    let dataToWrite = jsonData;
    
    // Si hay PIN configurado, cifrar los datos
    const pin = getPIN();
    if(pin && fileIsEncrypted) {
      dataToWrite = await encryptData(jsonData, pin);
    }
    
    const w=await fileHandle.createWritable();
    await w.write(dataToWrite);
    await w.close();
    isDirty=false; updateFileBar();
  }catch(e){ setFileStatus('error',`Error al guardar: ${e.message}`); }
}

async function readFromFile(h){ 
  const f=await h.getFile(); 
  const content = await f.text();
  
  // Verificar si está cifrado
  if(isEncryptedData(content)) {
    fileIsEncrypted = true;
    const pin = getPIN();
    if(!pin) {
      throw new Error('El archivo está cifrado. Configura un PIN para acceder.');
    }
    try {
      const decrypted = await decryptData(content, pin);
      applyJson(decrypted);
    } catch(e) {
      throw new Error('PIN incorrecto. No se puede descifrar el archivo.');
    }
  } else {
    fileIsEncrypted = false;
    applyJson(content);
  }
}

async function save() {
  saveLocalStorage();
  if(fileHandle){ isDirty=true; updateFileBar(); await saveToFile(); }
}

function setFileStatus(type,msg){ const el=document.getElementById('file-status'); el.className=type; el.textContent=msg; }

function updateFileBar() {
  const linked=!!fileHandle;
  document.getElementById('btn-save-file').style.display=linked?'':'none';
  document.getElementById('btn-unlink').style.display=linked?'':'none';
  
  // Mostrar botón de cifrar solo si hay archivo vinculado sin cifrar
  const encryptBtn = document.getElementById('btn-encrypt');
  if(encryptBtn) {
    encryptBtn.style.display = (linked && !fileIsEncrypted) ? '' : 'none';
  }
  
  if(!linked){setFileStatus('','Sin archivo vinculado · datos guardados en el navegador');return;}
  if(isDirty){setFileStatus('dirty',`✎ ${fileHandle.name} — guardando...`);}
  else{
    const encryptionStatus = fileIsEncrypted ? '🔒 Cifrado' : '⚠️ Sin cifrar';
    setFileStatus('linked',`✓ Vinculado: ${fileHandle.name} (${encryptionStatus})`);
  }
}

async function linkNewFile() {
  // Requerir PIN configurado para proteger el archivo
  const pin = getPIN();
  if(!pin) {
    notify('⚠️ Configura un PIN primero para proteger tus datos', true);
    openPinSettings();
    return;
  }
  
  if(!window.showSaveFilePicker){notify('Tu navegador no soporta File System Access API',true);return;}
  try{
    const h=await window.showSaveFilePicker({suggestedName:'rednet_datos.json',types:[{description:'RedNet JSON',accept:{'application/json':['.json']}}]});
    fileHandle=h; 
    fileIsEncrypted = true; // Marcar como cifrado por defecto
    await persistHandle(h); 
    await saveToFile(); 
    updateFileBar();
    notify(`📄 Archivo cifrado creado: ${h.name}`);
  }catch(e){if(e.name!=='AbortError')notify('No se pudo crear el archivo',true);}
}

async function openExistingFile() {
  if(!window.showOpenFilePicker){notify('Tu navegador no soporta File System Access API',true);return;}
  try{
    const [h]=await window.showOpenFilePicker({types:[{description:'RedNet JSON',accept:{'application/json':['.json']}}]});
    
    // Leer contenido para verificar si está cifrado
    const f = await h.getFile();
    const content = await f.text();
    
    if(isEncryptedData(content)) {
      // Archivo cifrado - requerir PIN
      const pin = getPIN();
      if(!pin) {
        notify('⚠️ Este archivo está cifrado. Configura un PIN para acceder.', true);
        openPinSettings();
        return;
      }
      
      try {
        await readFromFile(h);
        fileHandle=h; 
        await persistHandle(h);
        isDirty=false; 
        saveLocalStorage(); 
        updateFileBar(); 
        render();
        notify(`📂 Archivo cifrado cargado: ${h.name}`);
      } catch(e) {
        notify('❌ PIN incorrecto. No se pudo descifrar el archivo.', true);
        return;
      }
    } else {
      // Archivo sin cifrar - advertir y ofrecer opción de cifrar
      if(!confirm('⚠️ Este archivo NO está cifrado. ¿Deseas cargarlo de todos modos?')) {
        return;
      }
      
      await readFromFile(h);
      fileHandle=h; 
      fileIsEncrypted = false;
      await persistHandle(h);
      isDirty=false; 
      saveLocalStorage(); 
      updateFileBar(); 
      render();
      notify(`📂 Archivo cargado (sin cifrar): ${h.name}`);
    }
  }catch(e){if(e.name!=='AbortError')notify('No se pudo abrir el archivo',true);}
}

function unlinkFile(){ 
  fileHandle=null; 
  fileIsEncrypted = false;
  isDirty=false; 
  clearHandle(); 
  updateFileBar(); 
  notify('Archivo desvinculado'); 
}

// Cifrar archivo existente sin protección
async function encryptExistingFile() {
  if(!fileHandle) {
    notify('No hay archivo vinculado', true);
    return;
  }
  
  if(fileIsEncrypted) {
    notify('El archivo ya está cifrado', true);
    return;
  }
  
  const pin = getPIN();
  if(!pin) {
    notify('Configura un PIN primero para cifrar el archivo', true);
    openPinSettings();
    return;
  }
  
  if(!confirm('¿Cifrar este archivo? Después de cifrado, solo se podrá abrir con el PIN correcto.')) {
    return;
  }
  
  try {
    fileIsEncrypted = true;
    await saveToFile();
    notify('🔒 Archivo cifrado exitosamente');
  } catch(e) {
    fileIsEncrypted = false;
    notify('Error al cifrar archivo: ' + e.message, true);
  }
}

let pendingRestoreHandle=null;

async function tryRestoreFileHandle() {
  const h=await restoreHandle(); if(!h) return;
  try{
    const p=await h.queryPermission({mode:'readwrite'});
    if(p==='granted'){
      // Verificar si el archivo está cifrado
      const f = await h.getFile();
      const content = await f.text();
      
      if(isEncryptedData(content)) {
        const pin = getPIN();
        if(!pin) {
          notify('⚠️ Archivo cifrado detectado. Configura un PIN para acceder.', true);
          pendingRestoreHandle = h;
          document.getElementById('restore-filename').textContent = h.name + ' (🔒 Cifrado)';
          document.getElementById('modal-restore').classList.add('open');
          return;
        }
        
        try {
          await readFromFile(h);
          fileHandle=h; 
          saveLocalStorage(); 
          isDirty=false; 
          updateFileBar(); 
          render();
          notify(`🔗 Archivo cifrado reconectado: ${h.name}`);
        } catch(e) {
          notify('❌ PIN incorrecto. No se pudo descifrar el archivo.', true);
          clearHandle();
        }
      } else {
        fileHandle=h; 
        fileIsEncrypted = false;
        await readFromFile(h);
        saveLocalStorage(); 
        isDirty=false; 
        updateFileBar(); 
        render();
        notify(`🔗 Reconectado: ${h.name} (⚠️ Sin cifrar)`);
      }
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
      // Verificar si está cifrado
      const f = await pendingRestoreHandle.getFile();
      const content = await f.text();
      
      if(isEncryptedData(content)) {
        const pin = getPIN();
        if(!pin) {
          notify('⚠️ Configura un PIN para acceder al archivo cifrado.', true);
          openPinSettings();
          return;
        }
        
        try {
          await readFromFile(pendingRestoreHandle);
          fileHandle=pendingRestoreHandle;
          saveLocalStorage(); 
          isDirty=false; 
          updateFileBar(); 
          render();
          notify(`🔗 Archivo cifrado reconectado: ${fileHandle.name}`);
        } catch(e) {
          notify('❌ PIN incorrecto. No se pudo descifrar el archivo.', true);
          clearHandle();
          return;
        }
      } else {
        fileHandle=pendingRestoreHandle;
        fileIsEncrypted = false;
        await readFromFile(fileHandle);
        saveLocalStorage(); 
        isDirty=false; 
        updateFileBar(); 
        render();
        notify(`🔗 Reconectado: ${fileHandle.name}`);
      }
    } else { notify('Permiso denegado',true); }
  }catch(e){notify('No se pudo restaurar el archivo',true);}
  pendingRestoreHandle=null;
}

function declineRestore() {
  document.getElementById('modal-restore').classList.remove('open');
  pendingRestoreHandle=null;
}
