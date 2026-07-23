// storage-local.js
// Persistencia en localStorage (serializar/aplicar/cargar/sembrar datos).
// Depende de: state.js (clients, history, gastos, config)

// ═══════════════════════════════════════════════════════════
//  PERSISTENCIA — localStorage
// ═══════════════════════════════════════════════════════════
function dataToJson() { return JSON.stringify({clients,history,gastos,inventario,asignacionesInventario,config},null,2); }

function applyJson(text) {
  const d=JSON.parse(text);
  clients=d.clients||[];
  history=d.history||[];
  gastos =d.gastos||[];
  inventario=d.inventario||[];
  asignacionesInventario=d.asignacionesInventario||[];
  config={...config,...(d.config||{})};
}

function saveLocalStorage() { localStorage.setItem(STORAGE_KEYS.DATA,dataToJson()); }

function loadLocalStorage() {
  try{ const r=localStorage.getItem(STORAGE_KEYS.DATA); if(r) applyJson(r); }catch(e){}
}

function seedIfEmpty() {
  if(clients.length===0) {
    clients=[
      {id:1,nombre:'Roxana',megas:5,precio:2500,diaPago:10,pagado:false,notas:''},
      {id:2,nombre:'Marlon',megas:5,precio:1500,diaPago:10,pagado:false,notas:''},
      {id:3,nombre:'Ronnie',megas:3,precio:2000,diaPago:12,pagado:false,notas:''},
      {id:4,nombre:'Liset', megas:3,precio:2500,diaPago:10,pagado:false,notas:''},
      {id:5,nombre:'Dayron',megas:2,precio:2500,diaPago:13,pagado:false,notas:''},
      {id:6,nombre:'Martín',megas:4,precio:3000,diaPago:11,pagado:false,notas:''},
    ];
  }
}
