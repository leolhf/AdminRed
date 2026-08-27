/**
 * tests/tests-calculo.js — Tests básicos de las funciones de cálculo.
 * v5.11.2 — Harness mínimo (sin dependencias externas) para validar el
 * corazón financiero de la app: mora, estado, precio neto, formato moneda,
 * aritmética de meses.
 *
 * Cómo ejecutar: desde la consola del navegador, escribir:
 *     RN.tests.ejecutar()
 * Devuelve { pasaron, fallaron, total, resultados: [...] } y muestra toasts.
 *
 * Diseño:
 *  - No depende del DOM (salvo toasts opcionales).
 *  - Guarda y restaura RN.state y RN.calc.mesActualStr para no alterar la app.
 *  - Cada test recibe un estado mock y, si quiere, una fecha "actual" fija.
 */
RN.tests = RN.tests || {};

RN.tests._resultados = [];

/** Assert helper. */
RN.tests._assert = function (condicion, mensaje) {
  RN.tests._resultados.push({ ok: !!condicion, mensaje: mensaje });
  return !!condicion;
};

RN.tests._assertEq = function (actual, esperado, mensaje) {
  var ok = actual === esperado;
  RN.tests._resultados.push({ ok: ok, mensaje: mensaje + ' (esperado: ' + JSON.stringify(esperado) + ', actual: ' + JSON.stringify(actual) + ')' });
  return ok;
};

/** Crea un estado mock mínimo. */
RN.tests._mockState = function (overrides) {
  var base = {
    clients: [],
    history: [],
    gastos: [],
    inventario: [],
    asignacionesInventario: [],
    investments: [],
    planes: [],
    equiposRed: [],
    descuentos: [],
    snapshots: [],
    config: { graciaDias: 5, diasBaseMes: 30 },
    reciboCounter: 0,
    mesActual: null
  };
  return Object.assign(base, overrides || {});
};

/** Ejecuta todos los tests. Devuelve un resumen. */
RN.tests.ejecutar = function () {
  RN.tests._resultados = [];

  // Guardar estado real y funciones que vamos a mockear
  var stateReal = RN.state;
  var mesActualReal = RN.calc.mesActualStr;

  try {
    RN.tests._testMesesEntre();
    RN.tests._testMesAnteriorSiguiente();
    RN.tests._testFormatCUP();
    RN.tests._testPrecioNeto();
    RN.tests._testMora();
    RN.tests._testGetStatus();
    RN.tests._testPrecioNetoNoNegativo();
  } finally {
    // Restaurar siempre
    RN.state = stateReal;
    RN.calc.mesActualStr = mesActualReal;
  }

  var pasaron = RN.tests._resultados.filter(function (r) { return r.ok; }).length;
  var fallaron = RN.tests._resultados.length - pasaron;
  var resumen = { pasaron: pasaron, fallaron: fallaron, total: RN.tests._resultados.length, resultados: RN.tests._resultados };

  // Mostrar resultado en consola y, si hay UI, con toast.
  console.log('[AdminRed tests]', resumen);
  RN.tests._resultados.forEach(function (r) {
    (r.ok ? console.log : console.error)('  ' + (r.ok ? '✓' : '✗') + ' ' + r.mensaje);
  });
  if (RN.notifyUI && RN.notifyUI.toast) {
    RN.notifyUI.toast('Tests: ' + pasaron + ' OK, ' + fallaron + ' fallidos', fallaron ? 'error' : 'success');
  }
  return resumen;
};

// ---------------- Tests individuales ----------------

RN.tests._testMesesEntre = function () {
  RN.tests._assertEq(RN.calc.mesesEntre('2025-01', '2025-01'), 0, 'mesesEntre mismo mes = 0');
  RN.tests._assertEq(RN.calc.mesesEntre('2025-01', '2025-04'), 3, 'mesesEntre ene->abr = 3');
  RN.tests._assertEq(RN.calc.mesesEntre('2025-01', '2026-01'), 12, 'mesesEntre un año = 12');
  RN.tests._assertEq(RN.calc.mesesEntre('2025-12', '2025-01'), -11, 'mesesEntre negativo (diciembre->enero mismo año) = -11');
  RN.tests._assertEq(RN.calc.mesesEntre('2025-11', '2026-02'), 3, 'mesesEntre cruza año (nov25->feb26) = 3');
};

RN.tests._testMesAnteriorSiguiente = function () {
  RN.tests._assertEq(RN.calc.mesAnterior('2025-03'), '2025-02', 'mesAnterior mar->feb');
  RN.tests._assertEq(RN.calc.mesAnterior('2025-01'), '2024-12', 'mesAnterior eno->dic año previo');
  RN.tests._assertEq(RN.calc.mesSiguiente('2025-11'), '2025-12', 'mesSiguiente nov->dic');
  RN.tests._assertEq(RN.calc.mesSiguiente('2025-12'), '2026-01', 'mesSiguiente dic->eno año sig');
  // Round-trip
  RN.tests._assertEq(RN.calc.mesSiguiente(RN.calc.mesAnterior('2025-06')), '2025-06', 'mesAnterior+mesSiguiente = identidad');
};

RN.tests._testFormatCUP = function () {
  var s = RN.calc.formatCUP(1000);
  RN.tests._assert(s.indexOf('CUP') !== -1, 'formatCUP incluye "CUP"');
  RN.tests._assert(s.indexOf('1.000') !== -1 || s.indexOf('1,000') !== -1, 'formatCUP muestra 1000 con separador de miles');
  var s0 = RN.calc.formatCUP(0);
  RN.tests._assert(/0[.,]00\s*CUP/.test(s0), 'formatCUP(0) = "0,00 CUP" o "0.00 CUP" (depende del locale)');
  // No devuelve NaN
  RN.tests._assert(RN.calc.formatCUP(undefined).indexOf('NaN') === -1, 'formatCUP(undefined) no da NaN');
  RN.tests._assert(RN.calc.formatCUP(null).indexOf('NaN') === -1, 'formatCUP(null) no da NaN');
};

RN.tests._testPrecioNeto = function () {
  RN.state = RN.tests._mockState({
    planes: [{ id: 'p1', nombre: 'Básico', megas: 10, precio: 500 }],
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, descuentoRecurrente: 0, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01' }],
    descuentos: []
  });
  // Sin descuentos: neto = base
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-06'), 500, 'getPrecioNeto sin descuentos = precio base');
  // Con descuento recurrente
  RN.state.clients[0].descuentoRecurrente = 100;
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-06'), 400, 'getPrecioNeto con descuento recurrente 100 = 400');
  // Descuento puntual fijo del mes
  RN.state.descuentos = [{ id: 'd1', clienteId: 'c1', mes: '2025-06', tipo: 'bonificacion', modo: 'fijo', valor: 50, estado: 'aplicado' }];
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-06'), 350, 'getPrecioNeto con recurrente 100 + puntual 50 = 350');
  // Descuento puntual de otro mes no aplica
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-07'), 400, 'getPrecioNeto: descuento puntual de otro mes no aplica');
};

RN.tests._testPrecioNetoNoNegativo = function () {
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 100, descuentoRecurrente: 200, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01' }],
    descuentos: []
  });
  RN.tests._assertEq(RN.calc.getPrecioNeto(RN.state.clients[0], '2025-06'), 0, 'getPrecioNeto nunca negativo (descuento > precio -> 0)');
};

RN.tests._testMora = function () {
  // Fijar mes "actual" en septiembre 2025
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-01' }],
    history: []
  });

  // Caso 1: nunca ha pagado, mesInicio ene-2025, mes actual sep-2025 -> debe 8 meses (feb..sep? excluye sep)
  // Según convención: mesesEntre(2025-01, 2025-09) = 8, diff>0 -> 8
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 8, 'getMora: nunca pagó, inicio ene, actual sep -> 8');

  // Caso 2: pagó hasta junio 2025, actual sep -> debe jul+ago = 2 (excluye sep)
  RN.state.history = [
    { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 }
  ];
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 2, 'getMora: pagó hasta jun, actual sep -> 2');

  // Caso 3: pagó hasta el mes actual -> mora 0
  RN.state.history = [
    { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 }
  ];
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 0, 'getMora: pagó el mes actual -> 0');

  // Caso 4: pagó hasta un mes futuro (raro) -> mora 0
  RN.state.history = [
    { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-12', monto: 500 }
  ];
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 0, 'getMora: último pagado futuro -> 0');

  // Caso 5: mesInicio futuro (alta este mes) -> mora 0
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state.history = [];
  RN.state.clients[0].mesInicio = '2025-09';
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 0, 'getMora: alta este mes -> 0');

  // Caso 6: mesInicio un mes después del actual (futuro) -> mora 0
  RN.state.clients[0].mesInicio = '2025-10';
  RN.tests._assertEq(RN.calc.getMora(RN.state.clients[0]), 0, 'getMora: inicio futuro -> 0');
};

RN.tests._testGetStatus = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    clients: [{ id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true, diaPago: 5, mesInicio: '2025-09', descuentoRecurrente: 0 }],
    history: [],
    descuentos: []
  });

  // Caso 1: cliente inactivo -> 'ok'
  RN.state.clients[0].activo = false;
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'ok', 'getStatus: inactivo -> ok');

  // Caso 2: mes de inicio futuro -> 'por-iniciar'
  RN.state.clients[0].activo = true;
  RN.state.clients[0].mesInicio = '2025-12';
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'por-iniciar', 'getStatus: inicio futuro -> por-iniciar');

  // Caso 3: pagó el mes actual completo -> 'paid'
  RN.state.clients[0].mesInicio = '2025-01';
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 }];
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'paid', 'getStatus: pagó completo -> paid');

  // Caso 4: pago parcial -> 'parcial'
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 200 }];
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'parcial', 'getStatus: pago parcial -> parcial');

  // Caso 5: con mora de meses anteriores -> 'due'
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 }];
  RN.tests._assertEq(RN.calc.getStatus(RN.state.clients[0]), 'due', 'getStatus: con mora -> due');
};
