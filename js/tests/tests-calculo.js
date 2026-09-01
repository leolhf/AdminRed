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
    RN.tests._testMesActualRespetaState();   // Bug #1
    RN.tests._testDeudaTotalCliente();        // Bug #4
    RN.tests._testAUSD();                     // Bug #8
    RN.tests._testAporteRecuperacionFecha();  // Bug #11
    RN.tests._testCostoMegaConfigurado();     // Bug #17
    RN.tests._testRestanteEfectivo();         // v5.13.16 BUG-1
    RN.tests._testAporteExtraAcumuladoFiltro(); // v5.13.16 BUG-2
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

// ---------------- Tests de bugs críticos corregidos (v5.13.1+) ----------------

/**
 * v5.13.20: mesActualStr() SIEMPRE usa el reloj del sistema (Opcion B).
 * El mes operativo siempre es el mes real del calendario. Ya no se respeta
 * RN.state.mesActual para determinar el mes operativo (solo se guarda como
 * referencia). mesActualStr() y mesRealStr() ahora son identicas.
 */
RN.tests._testMesActualRespetaState = function () {
  // v5.13.20: Restaurar mesActualStr a la funcion real (usa el reloj del sistema),
  // porque _testMora y _testGetStatus la mockean y no la restauran.
  // La funcion real siempre devuelve new Date() -> mes del reloj.
  RN.calc.mesActualStr = function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  };
  // Guardar y restaurar RN.state.mesActual
  var mesGuardado = RN.state.mesActual;
  try {
    // Caso 1: aunque mesActual este definido, mesActualStr() usa el reloj
    RN.state.mesActual = '2025-09';
    var str1 = RN.calc.mesActualStr();
    RN.tests._assert(/^\d{4}-\d{2}$/.test(str1), 'v5.13.20: mesActualStr siempre usa el reloj (ignora mesActual)');

    // Caso 2: mesActualStr() y mesRealStr() deben devolver lo mismo
    RN.state.mesActual = '2025-09';
    var actualStr = RN.calc.mesActualStr();
    var realStr = RN.calc.mesRealStr();
    RN.tests._assertEq(actualStr, realStr, 'v5.13.20: mesActualStr() === mesRealStr() (siempre identicas)');

    // Caso 3: mesActual vacio/null -> usa reloj del sistema (formato YYYY-MM)
    RN.state.mesActual = null;
    var real = RN.calc.mesActualStr();
    RN.tests._assert(/^\d{4}-\d{2}$/.test(real), 'v5.13.20: sin mesActual, usa reloj del sistema (formato YYYY-MM)');

    // Caso 4: formato valido YYYY-MM
    var f = RN.calc.mesActualStr();
    RN.tests._assert(/^\d{4}-\d{2}$/.test(f), 'v5.13.20: mesActualStr devuelve formato YYYY-MM');
  } finally {
    RN.state.mesActual = mesGuardado;
  }
};

/**
 * Bug #4: deudaTotalCliente() debe sumar el servicio pendiente del mes actual
 * más los meses en mora, más la deuda de equipo. Antes de la corrección cada
 * vista calculaba la deuda de forma distinta.
 */
RN.tests._testDeudaTotalCliente = function () {
  RN.calc.mesActualStr = function () { return '2025-09'; };
  RN.state = RN.tests._mockState({
    config: { graciaDias: 5, diasBaseMes: 30 },
    planes: [{ id: 'p1', nombre: 'Básico', megas: 10, precio: 500 }],
    clients: [{
      id: 'c1', nombre: 'Ana', precio: 500, planId: null, activo: true,
      diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0,
      deudaEquipo: 300, deudaEquipoOriginal: 1000
    }],
    history: [
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', monto: 500 }
    ],
    descuentos: []
  });

  // Mora: pagó hasta jun-2025, actual sep-2025 -> 2 meses en mora (jul, ago)
  // Servicio pendiente = 500 * (2 + 1) = 1500  (mora + mes actual)
  // Deuda equipo = 300
  // Total = 1800
  RN.tests._assertEq(RN.calc.deudaTotalCliente(RN.state.clients[0]), 1800,
    'Bug #4: deudaTotalCliente = servicio(1500) + equipo(300) = 1800');

  // Sin deuda de equipo
  RN.state.clients[0].deudaEquipo = 0;
  RN.tests._assertEq(RN.calc.deudaTotalCliente(RN.state.clients[0]), 1500,
    'Bug #4: deudaTotalCliente sin deuda equipo = 1500');

  // Sin mora (pagó el mes actual)
  RN.state.clients[0].deudaEquipo = 300;
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-09', monto: 500 }];
  RN.tests._assertEq(RN.calc.deudaTotalCliente(RN.state.clients[0]), 800,
    'Bug #4: deudaTotalCliente al día = 500 (servicio) + 300 (equipo) = 800');

  // Deuda total nunca negativa
  RN.state.history = [{ id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-12', monto: 500 }];
  RN.state.clients[0].deudaEquipo = 0;
  RN.tests._assert(RN.calc.deudaTotalCliente(RN.state.clients[0]) >= 0,
    'Bug #4: deudaTotalCliente nunca negativa');
};

/**
 * Bug #8: aUSD() debe devolver un número, no un string. Antes de la corrección
 * podía devolver strings concatenados o NaN, lo que rompía comparaciones
 * numéricas y formato.
 */
RN.tests._testAUSD = function () {
  RN.state = RN.tests._mockState({
    config: { tasaUsd: 320 }
  });

  // Conversión normal: 640 CUP / 320 = 2 USD
  var r1 = RN.moneda.aUSD(640);
  RN.tests._assertEq(r1, 2, 'Bug #8: aUSD(640) con tasa 320 = 2');
  RN.tests._assert(typeof r1 === 'number', 'Bug #8: aUSD devuelve number (no string)');

  // Monto 0 -> 0 (número)
  var r0 = RN.moneda.aUSD(0);
  RN.tests._assertEq(r0, 0, 'Bug #8: aUSD(0) = 0');
  RN.tests._assert(typeof r0 === 'number', 'Bug #8: aUSD(0) es number');

  // Sin tasa -> 0 (número, no NaN ni string vacío)
  RN.state.config.tasaUsd = 0;
  var rNoTasa = RN.moneda.aUSD(1000);
  RN.tests._assertEq(rNoTasa, 0, 'Bug #8: aUSD sin tasa = 0');
  RN.tests._assert(typeof rNoTasa === 'number', 'Bug #8: aUSD sin tasa devuelve number');

  // Argumento inválido (undefined/null) -> 0 (número, no NaN)
  var rUndef = RN.moneda.aUSD(undefined);
  RN.tests._assertEq(rUndef, 0, 'Bug #8: aUSD(undefined) = 0 (no NaN)');
  RN.tests._assert(typeof rUndef === 'number', 'Bug #8: aUSD(undefined) es number');

  var rNull = RN.moneda.aUSD(null);
  RN.tests._assertEq(rNull, 0, 'Bug #8: aUSD(null) = 0 (no NaN)');

  // String numérico -> parsea correctamente
  RN.state.config.tasaUsd = 320;
  var rStr = RN.moneda.aUSD('640');
  RN.tests._assertEq(rStr, 2, 'Bug #8: aUSD("640") = 2 (parsea string numérico)');
  RN.tests._assert(typeof rStr === 'number', 'Bug #8: aUSD(string) devuelve number');

  // Round-trip aCUP(aUSD(x)) ≈ x
  RN.state.config.tasaUsd = 320;
  RN.tests._assertEq(RN.moneda.aCUP(RN.moneda.aUSD(960)), 960,
    'Bug #8: aCUP(aUSD(960)) = 960 (round-trip)');
};

/**
 * Bug #11: aporteRecuperacionCliente() debe filtrar los cobros por fecha de
 * compra. Antes de la corrección, si un cliente tenía cobros anteriores a la
 * fecha de compra de la inversión, esos cobros se sumaban e inflaban la
 * recuperación. Ahora _cobrosClienteDesde filtra por h.fecha >= fechaCompra
 * y h.mes >= mesCompra.
 */
RN.tests._testAporteRecuperacionFecha = function () {
  RN.state = RN.tests._mockState({
    config: { graciaDias: 5, diasBaseMes: 30, proveedorPrecioMega: 0, pctPersonalInversion: 0 },
    planes: [{ id: 'p1', nombre: 'Básico', megas: 10, precio: 500 }],
    clients: [{
      id: 'c1', nombre: 'Ana', precio: 500, planId: 'p1', megas: 10,
      activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0
    }],
    investments: [{
      id: 'inv1', clienteId: 'c1', monto: 3000, fechaCompra: '2025-06-15'
    }],
    history: [
      // Cobro ANTERIOR a la compra (mayo) — NO debe contar
      { id: 'h0', clienteId: 'c1', tipo: 'servicio', mes: '2025-05', fecha: '2025-05-10', monto: 500 },
      // Cobro POSTERIOR a la compra — SÍ debe contar
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-20', monto: 500 },
      { id: 'h2', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', fecha: '2025-07-05', monto: 500 },
      // Cobro de OTRO cliente — NO debe contar
      { id: 'h3', clienteId: 'c2', tipo: 'servicio', mes: '2025-07', fecha: '2025-07-05', monto: 500 },
      // Cobro tipo 'equipo' — NO debe contar (solo servicio)
      { id: 'h4', clienteId: 'c1', tipo: 'equipo', mes: '2025-07', fecha: '2025-07-06', monto: 200 }
    ],
    descuentos: []
  });

  var inv = RN.state.investments[0];
  // Sin costo de mega (proveedorPrecioMega=0) y pctPersonal=0:
  // aporteRecuperacion = suma de cobros posteriores a la compra = 500 + 500 = 1000
  // (h0 de mayo excluido, h3 de otro cliente excluido, h4 de equipo excluido)
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 1000,
    'Bug #11: aporteRecuperacion excluye cobros anteriores a fechaCompra (solo jun+jul = 1000)');

  // _cobrosClienteDesde debe devolver solo 2 cobros
  var cobros = RN.investment._cobrosClienteDesde('c1', inv);
  RN.tests._assertEq(cobros.length, 2,
    'Bug #11: _cobrosClienteDesde filtra por fecha y devuelve solo 2 cobros');

  // Con costo de mega: 10 megas × 1 CUP/mega = 10 costo por mes
  // jun: 500 - 10 = 490; jul: 500 - 10 = 490; total = 980
  RN.state.config.proveedorPrecioMega = 1;
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 980,
    'Bug #11: aporteRecuperacion con costoMega descuenta 10/mes (980)');

  // Con % personal 50%: solo la mitad recupera capital
  RN.state.config.pctPersonalInversion = 50;
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 490,
    'Bug #11: aporteRecuperacion con 50% personal = 980×0.5 = 490');

  // Cobro del MISMO DÍA de la compra (15-jun) — debe incluirse
  RN.state.config.proveedorPrecioMega = 0;
  RN.state.config.pctPersonalInversion = 0;
  RN.state.history = [
    { id: 'hs', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-15', monto: 500 }
  ];
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 500,
    'Bug #11: cobro del mismo día de la compra SÍ se incluye (sin bug de zona horaria)');

  // Cobro del día ANTERIOR a la compra (14-jun) — debe excluirse
  RN.state.history = [
    { id: 'hs', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-14', monto: 500 }
  ];
  RN.tests._assertEq(RN.investment.aporteRecuperacionCliente(inv, 'c1'), 0,
    'Bug #11: cobro del día anterior a la compra se excluye');
};

/**
 * Bug #17: costoMegaConfigurado() indica si el costo de proveedor está
 * configurado. Si no lo está, las métricas de margen y recuperación de
 * inversión están infladas (asumen costo 0). La UI debe advertir al usuario.
 */
RN.tests._testCostoMegaConfigurado = function () {
  // Sin precio de proveedor -> false
  RN.state = RN.tests._mockState({
    config: { proveedorPrecioMega: 0 }
  });
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), false,
    'Bug #17: costoMegaConfigurado = false cuando proveedorPrecioMega = 0');

  // Sin la clave en config -> false
  RN.state.config = {};
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), false,
    'Bug #17: costoMegaConfigurado = false cuando no existe proveedorPrecioMega');

  // Con precio válido -> true
  RN.state.config.proveedorPrecioMega = 1.5;
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), true,
    'Bug #17: costoMegaConfigurado = true cuando proveedorPrecioMega > 0');

  // Con precio negativo -> false (no válido)
  RN.state.config.proveedorPrecioMega = -1;
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), false,
    'Bug #17: costoMegaConfigurado = false cuando proveedorPrecioMega es negativo');

  // Con string numérico válido -> true (+() lo parsea)
  RN.state.config.proveedorPrecioMega = '2';
  RN.tests._assertEq(RN.investment.costoMegaConfigurado(), true,
    'Bug #17: costoMegaConfigurado = true con string numérico "2"');

  // Impacto en costoMegaClienteMes: sin config -> 0 (margen inflado)
  RN.state.config.proveedorPrecioMega = 0;
  var cli = { id: 'c1', megas: 10, planId: null };
  RN.tests._assertEq(RN.investment.costoMegaClienteMes(cli, '2025-06'), 0,
    'Bug #17: costoMegaClienteMes = 0 sin config (margen inflado, por eso se advierte)');

  // Con config -> costo real
  RN.state.config.proveedorPrecioMega = 1.5;
  RN.tests._assertEq(RN.investment.costoMegaClienteMes(cli, '2025-06'), 15,
    'Bug #17: costoMegaClienteMes = 15 con 10 megas × 1.5 CUP/mega');
};

/**
 * v5.13.16 (BUG-1): restanteEfectivo() debe usar recuperadoEfectivo()
 * (margen de clientes + aporte extra acumulado) cuando pctGananciaMes > 0,
 * y recuperadoRealInv() (solo margen) cuando pctGananciaMes === 0.
 *
 * Sin esta correccion, proyectarRecuperacion() y mesesParaRecuperar()
 * mostraban una proyeccion pesimista (no contaban el aporte extra) que era
 * inconsistente con el "% efectivo" de la card.
 */
RN.tests._testRestanteEfectivo = function () {
  RN.state = RN.tests._mockState({
    config: { graciaDias: 5, diasBaseMes: 30, proveedorPrecioMega: 0, pctPersonalInversion: 0, pctRecuperacionGananciaMes: 0 },
    planes: [{ id: 'p1', nombre: 'Basico', megas: 10, precio: 500 }],
    clients: [{
      id: 'c1', nombre: 'Ana', precio: 500, planId: 'p1', megas: 10,
      activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0
    }],
    investments: [{
      id: 'inv1', clienteId: 'c1', clienteIds: ['c1'], monto: 3000, fechaCompra: '2025-06-15'
    }],
    history: [
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-20', monto: 500 },
      { id: 'h2', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', fecha: '2025-07-05', monto: 500 }
    ],
    descuentos: []
  });

  var inv = RN.state.investments[0];

  // pctGananciaMes === 0: restanteEfectivo = monto - recuperadoRealInv
  // Sin costo de mega, sin % personal: recuperadoRealInv = 500 + 500 = 1000
  // restante = 3000 - 1000 = 2000
  RN.tests._assertEq(RN.investment.restanteEfectivo(inv), 2000,
    'BUG-1: restanteEfectivo con pctGananciaMes=0 usa recuperadoRealInv (3000-1000=2000)');

  // Con pctGananciaMes > 0: restanteEfectivo = monto - recuperadoEfectivo
  // recuperadoEfectivo = recuperadoRealInv + aporteExtraAcumulado
  // aporteExtraAcumulado: ingresos servicio por mes = 500 (jun) + 500 (jul) = 1000 c/u
  // sin gastos operativos, ganancia neta = 1000/mes, pctGananciaMes=20%
  // aporte extra = 1000*0.2 + 1000*0.2 = 400
  // recuperadoEfectivo = 1000 + 400 = 1400
  // restante = 3000 - 1400 = 1600
  RN.state.config.pctRecuperacionGananciaMes = 20;
  RN.tests._assertEq(RN.investment.aporteExtraAcumulado(inv), 200,
    'BUG-1: aporteExtraAcumulado = 200 (500*20% + 500*20%, sin gastos)');
  RN.tests._assertEq(RN.investment.recuperadoEfectivo(inv), 1200,
    'BUG-1: recuperadoEfectivo = 1000 (margen) + 200 (extra) = 1200');
  RN.tests._assertEq(RN.investment.restanteEfectivo(inv), 1800,
    'BUG-1: restanteEfectivo con pctGananciaMes>0 usa recuperadoEfectivo (3000-1200=1800)');

  // Verificar que restanteEfectivo NO da negativo (min 0) cuando se sobrepasa
  RN.state.investments[0].monto = 500;
  RN.tests._assertEq(RN.investment.restanteEfectivo(inv), 0,
    'BUG-1: restanteEfectivo nunca es negativo (min 0)');

  // mesesParaRecuperar debe usar restanteEfectivo (consistencia)
  RN.state.investments[0].monto = 3000;
  // aporteMensualNeto = margen mensual neto. Sin costo mega ni % personal:
  // margen bruto mensual = 500 (precio Ana), aporte neto = 500
  // meses = ceil(1600 / 500) = 4
  RN.tests._assertEq(RN.investment.mesesParaRecuperar(inv), 4,
    'BUG-1: mesesParaRecuperar usa restanteEfectivo (ceil(1800/500)=4)');
};

/**
 * v5.13.16 (BUG-2): aporteExtraAcumulado() debe sumar SOLO cobros de servicio
 * (h.tipo === 'servicio' o undefined), excluyendo 'equipo' y 'venta-inventario'.
 * Ademas, NO debe sumar h.montoEquipo (es capital, no ingreso operativo).
 *
 * Antes, sumaba TODOS los cobros + h.montoEquipo, lo que inflaba el aporte
 * extra al incluir ventas de equipo e inventario (movimientos de capital, no
 * ingresos recurrentes).
 */
RN.tests._testAporteExtraAcumuladoFiltro = function () {
  RN.state = RN.tests._mockState({
    config: { graciaDias: 5, diasBaseMes: 30, proveedorPrecioMega: 0, pctPersonalInversion: 0, pctRecuperacionGananciaMes: 10 },
    planes: [{ id: 'p1', nombre: 'Basico', megas: 10, precio: 500 }],
    clients: [{
      id: 'c1', nombre: 'Ana', precio: 500, planId: 'p1', megas: 10,
      activo: true, diaPago: 5, mesInicio: '2025-01', descuentoRecurrente: 0
    }],
    investments: [{
      id: 'inv1', clienteId: 'c1', clienteIds: ['c1'], monto: 3000, fechaCompra: '2025-06-15'
    }],
    history: [
      // Cobro de servicio jun: 1000 -> cuenta
      { id: 'h1', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-20', monto: 1000 },
      // Cobro de servicio jul: 1000 -> cuenta
      { id: 'h2', clienteId: 'c1', tipo: 'servicio', mes: '2025-07', fecha: '2025-07-05', monto: 1000 },
      // Cobro de EQUIPO jun: 500 -> NO cuenta (es capital)
      { id: 'h3', clienteId: 'c1', tipo: 'equipo', mes: '2025-06', fecha: '2025-06-21', monto: 500 },
      // Venta de inventario jul: 300 -> NO cuenta (ingreso no recurrente)
      { id: 'h4', clienteId: 'c1', tipo: 'venta-inventario', mes: '2025-07', fecha: '2025-07-06', monto: 300 },
      // Cobro de servicio con montoEquipo: el montoEquipo NO debe sumar
      { id: 'h5', clienteId: 'c1', tipo: 'servicio', mes: '2025-06', fecha: '2025-06-22', monto: 200, montoEquipo: 800 }
    ],
    descuentos: []
  });

  var inv = RN.state.investments[0];

  // Ingresos de servicio por mes:
  //   jun: h1(1000) + h5(200, sin montoEquipo) = 1200
  //   jul: h2(1000) = 1000
  // Sin gastos operativos:
  //   ganancia neta jun = 1200, aporte extra = 1200 * 10% = 120
  //   ganancia neta jul = 1000, aporte extra = 1000 * 10% = 100
  //   total aporteExtraAcumulado = 220
  // Si el bug NO estuviera corregido, sumaria tambien h3(500), h4(300) y
  // h5.montoEquipo(800) = 1600 extra, dando 380 en lugar de 220.
  RN.tests._assertEq(RN.investment.aporteExtraAcumulado(inv), 220,
    'BUG-2: aporteExtraAcumulado solo suma servicio (220), excluye equipo/inventario/montoEquipo');

  // Verificar que el cobro de equipo (h3, 500) NO se conto
  // Si lo contara: jun = 1200 + 500 = 1700, aporte = 170, total = 270
  RN.tests._assert(RN.investment.aporteExtraAcumulado(inv) !== 270,
    'BUG-2: el cobro de equipo (500) NO infla el aporte extra');

  // Sin pctGananciaMes -> siempre 0
  RN.state.config.pctRecuperacionGananciaMes = 0;
  RN.tests._assertEq(RN.investment.aporteExtraAcumulado(inv), 0,
    'BUG-2: aporteExtraAcumulado = 0 cuando pctGananciaMes = 0');

  // Con gastos operativos: se restan (pero no devoluciones ni retiros)
  RN.state.config.pctRecuperacionGananciaMes = 10;
  RN.state.gastos = [
    { id: 'g1', mes: '2025-06', monto: 200 },  // gasto operativo -> resta
    { id: 'g2', mes: '2025-06', monto: 100, esDevolucionInversion: true },  // NO resta (capital)
    { id: 'g3', mes: '2025-07', monto: 50, esRetiroCaja: true }  // NO resta (capital)
  ];
  // jun: 1200 - 200 (g1) = 1000, aporte = 100
  // jul: 1000 - 0 (g3 es retiro, no operativo) = 1000, aporte = 100
  // total = 200
  RN.tests._assertEq(RN.investment.aporteExtraAcumulado(inv), 200,
    'BUG-2/DUP-3: gastos operativos restan, pero devoluciones y retiros no (200)');
};
