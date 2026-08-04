// state.js
// Estado global de la aplicación (clients, history, gastos, config, fileHandle, isDirty).
// No depende de ningún otro archivo. DEBE cargarse primero: todos los demás módulos leen/escriben estas variables.

// ═══════════════════════════════════════════════════════════
//  ESTADO GLOBAL
// ═══════════════════════════════════════════════════════════
let clients = [];
let history = [];
let gastos  = [];
let inventario = [];              // lotes de material compartido (cable, conectores...): [{id,desc,montoTotal,montoAsignado,fecha}]
let asignacionesInventario = [];  // consumo de inventario asignado a cada cliente: [{id,inventarioId,clienteId,monto,fecha}]
let investments = [];             // inversiones en equipo a recuperar: [{id,nombre,costoTotal,fechaCompra,clientesVinculados,recuperado,activo}]
let equiposRed = [];               // equipos de enlace (nanos, routers...): [{id,nombre,usuario,password,ip,enlazaA}]
let config  = { megas:20, costoPorMega:1250, diaInicio:10, mesActual:'', margenMegas:4, sobreventaMegas:0, paquetePagadoMes:'' };
let fileHandle = null;
let isDirty    = false;

// ═══════════════════════════════════════════════════════════
//  HELPER: Agregar timestamp local para sincronización
// ═══════════════════════════════════════════════════════════
function addTimestamp(data) {
  if (!data) return data;
  if (Array.isArray(data)) {
    return data.map(item => addTimestamp(item));
  }
  if (typeof data === 'object' && data !== null) {
    return {
      ...data,
      _localUpdatedAt: new Date().toISOString()
    };
  }
  return data;
}
