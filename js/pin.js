// pin.js
// Bloqueo por PIN de acceso a la aplicación.
// Depende de: crypto.js (para archivos cifrados relacionados), notify-ui.js (notify)

// ═══════════════════════════════════════════════════════════
//  PIN DE ACCESO
// ═══════════════════════════════════════════════════════════
let pinBuffer='';
let pinMode='unlock'; // 'unlock' | 'setup1' | 'setup2'
let pinSetupFirst='';

function getPIN() { return localStorage.getItem(STORAGE_KEYS.PIN)||''; }
function setPIN(p) { if(p) localStorage.setItem(STORAGE_KEYS.PIN,p); else localStorage.removeItem(STORAGE_KEYS.PIN); }

function showPinScreen(mode='unlock') {
  pinMode=mode; pinBuffer='';
  if(mode!=='setup2') pinSetupFirst=''; // preserve first PIN when transitioning to confirmation
  const el=document.getElementById('pin-screen');
  el.classList.remove('hidden');
  const sub=document.getElementById('pin-subtitle');
  const tip=document.getElementById('pin-tip');
  if(mode==='unlock'){sub.textContent='Ingresa tu PIN';tip.textContent='';}
  else if(mode==='setup1'){sub.textContent='Nuevo PIN — elige 4 dígitos';tip.textContent='El PIN protege el acceso a tus datos financieros.';}
  else if(mode==='setup2'){sub.textContent='Confirma el nuevo PIN';tip.textContent='';}
  updatePinDots();
}

function hidePinScreen() { document.getElementById('pin-screen').classList.add('hidden'); }

function updatePinDots() {
  for(let i=0;i<4;i++){
    const d=document.getElementById('pd'+i);
    d.classList.toggle('filled',i<pinBuffer.length);
    d.classList.remove('error');
  }
  document.getElementById('pin-error').textContent='';
}

function pinKey(k) {
  if(pinBuffer.length>=4) return;
  pinBuffer+=k;
  updatePinDots();
  if(pinBuffer.length===4) setTimeout(()=>pinSubmit(),120);
}

function pinDel() {
  if(pinBuffer.length>0) pinBuffer=pinBuffer.slice(0,-1);
  updatePinDots();
}

function pinSubmit() {
  if(pinMode==='unlock'){
    if(pinBuffer===getPIN()){ hidePinScreen(); }
    else { pinError(); }
  } else if(pinMode==='setup1'){
    pinSetupFirst=pinBuffer; pinBuffer=''; showPinScreen('setup2');
  } else if(pinMode==='setup2'){
    if(pinBuffer===pinSetupFirst){
      setPIN(pinBuffer); hidePinScreen();
      notify('🔐 PIN activado');
      document.getElementById('modal-pin-settings').classList.remove('open');
    } else {
      pinSetupFirst=''; pinError('PINs no coinciden');
      setTimeout(()=>showPinScreen('setup1'),900);
    }
  }
}

function pinError(msg='PIN incorrecto') {
  pinBuffer='';
  document.getElementById('pin-error').textContent=msg;
  for(let i=0;i<4;i++) document.getElementById('pd'+i).classList.add('error');
  setTimeout(updatePinDots,600);
}

function openPinSettings() {
  const hasPIN=!!getPIN();
  const el=document.getElementById('pin-settings-content');
  if(hasPIN){
    el.innerHTML=`
      <p>El PIN de acceso está <strong style="color:var(--green)">activado</strong>.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost" onclick="document.getElementById('modal-pin-settings').classList.remove('open');showPinScreen('setup1')">Cambiar PIN</button>
        <button class="btn btn-red" style="font-size:0.76rem" onclick="removePIN()">Desactivar PIN</button>
      </div>`;
  } else {
    el.innerHTML=`
      <p>Sin PIN configurado. Cualquiera que tome tu teléfono puede ver tus datos.</p>
      <button class="btn btn-green" onclick="document.getElementById('modal-pin-settings').classList.remove('open');showPinScreen('setup1')">Configurar PIN</button>`;
  }
  document.getElementById('modal-pin-settings').classList.add('open');
}

function removePIN() {
  setPIN('');
  notify('PIN desactivado');
  document.getElementById('modal-pin-settings').classList.remove('open');
}
