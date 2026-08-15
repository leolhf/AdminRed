// setup.js
// Configuración global para tests

// Mock de variables globales que normalmente vendrían de state.js
global.clients = [];
global.history = [];
global.gastos = [];
global.inventario = [];
global.asignacionesInventario = [];
global.investments = [];
global.equiposRed = [];
global.planes = [];
global.snapshots = {};
global.reciboCounter = {};
global.descuentos = [];
global.config = {
  megas: 100,
  costoPorMega: 50,
  margenMegas: 10,
  sobreventaMegas: 5,
  diaInicio: 1,
  diasBaseMes: 30,
  mesActual: null
};

// Mock de funciones de utilidad
global.fmt = (n) => (typeof n === 'number' ? n : 0).toLocaleString('es-CU') + ' CUP';
global.fechaLocalISO = (d) => {
  if (!d) d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  const local = new Date(d.getTime() - offset);
  return local.toISOString().slice(0, 10);
};
global.mesActualHoy = () => {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;
};

// Mock de funciones de notificación
global.notify = () => {};
global.save = () => {};