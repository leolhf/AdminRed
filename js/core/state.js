// state.js
// Estado global de la aplicación (clients, history, gastos, config, fileHandle, isDirty, fileIsEncrypted).
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
let config  = { megas:20, costoPorMega:1250, diaInicio:10, mesActual:'', margenMegas:4 };
let fileHandle = null;
let isDirty    = false;
let fileIsEncrypted = false; // Indica si el archivo vinculado está cifrado
