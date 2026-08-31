/**
 * cobros/month-reset.js — Cierre de mes.
 * Resetea el ciclo de cobro mensual, genera snapshot inmutable de KPIs,
 * y anula automáticamente los descuentos puntuales no aplicados de ese mes.
 */
RN.monthReset = RN.monthReset || {};

RN.monthReset.confirmar = function () {
  // v5.13.1: Bug #1 — usar var y precomputar mesSiguiente.
  // Ahora mesActualStr() respeta RN.state.mesActual, asi que al asignarlo
  // aqui tiene efecto real en todos los calculos posteriores.
  var mes = RN.calc.mesActualStr();
  var mesSiguiente = RN.calc.mesSiguiente(mes);
  const snapshot = RN.calc.generarSnapshot(mes);
  const sinAplicar = RN.state.descuentos.filter(d => d.mes === mes && d.estado === 'pendiente' && !d.soloPago).length;
  // v5.13.8 (LOG-4): Verificar cobros adelantados del mes siguiente
  const cobrosAdelantados = RN.state.history.filter(h => h.mes === mesSiguiente).length;
  // v5.13.8 (UI-10): Verificar cobros parciales pendientes del mes actual
  const cobrosParciales = RN.state.history.filter(h => h.mes === mes && h.tipoPago === 'parcial').length;

  // v5.13.8: Construir mensaje con advertencias opcionales
  let advertencias = '';
  if (cobrosAdelantados > 0) {
    advertencias += `\n\n⚠️ Hay ${cobrosAdelantados} cobro(s) adelantado(s) del mes siguiente (${RN.calc.mesTexto(mesSiguiente)}). Estos cobros ya están registrados y no se verán afectados.`;
  }
  if (cobrosParciales > 0) {
    advertencias += `\n\n⚠️ Hay ${cobrosParciales} cliente(s) con pago parcial este mes. Sus saldos pendientes NO se arrastran al mes siguiente (el pago parcial ya quedó en el historial).`;
  }

  RN.uiComponents.confirm(
    'Cerrar mes — ' + RN.calc.mesTexto(mes),
    `Se generará un snapshot con:\n• Ingresos: ${RN.calc.formatCUP(snapshot.ingresos)}\n• Gastos: ${RN.calc.formatCUP(snapshot.gastos)}\n• Utilidad: ${RN.calc.formatCUP(snapshot.utilidad)}\n• Cobranza: ${snapshot.clientesPagaron}/${snapshot.clientesTotal}\n\nSe anularán ${sinAplicar} descuento(s) puntual(es) no aplicado(s). El mes actual pasará a ${RN.calc.mesTexto(mesSiguiente)}.${advertencias}`,
    () => {
      // 1. Snapshot
      RN.state.snapshots.push(snapshot);
      // 2. Anular descuentos puntuales no aplicados del mes
      // v5.12.5: NO anular descuentos soloPago (pasan al mes siguiente hasta que se usen)
      RN.state.descuentos.forEach(d => {
        if (d.mes === mes && d.estado === 'pendiente' && !d.soloPago) d.estado = 'anulado';
      });
      // 3. Avanzar mes actual
      // v5.13.1: Ahora esto tiene efecto real porque mesActualStr() respeta RN.state.mesActual
      RN.state.mesActual = mesSiguiente;
      // v5.12.4: Aplicar paquete pendiente si existe (cambio guardado para este mes)
      let paqueteAplicadoMsg = '';
      if (RN.state.config.paquetePendiente) {
        const pp = RN.state.config.paquetePendiente;
        RN.state.config.proveedorInternet = pp.proveedor || RN.state.config.proveedorInternet;
        RN.state.config.proveedorMegas = pp.megas;
        RN.state.config.proveedorPrecioMega = pp.precioMega;
        RN.state.config.proveedorMonto = +((pp.megas || 0) * (pp.precioMega || 0)).toFixed(2);
        RN.state.config.sobreventaMegas = pp.sobreventa;
        RN.state.config.paquetePendiente = null;
        paqueteAplicadoMsg = ' Paquete actualizado: ' + pp.megas + 'M × ' + pp.precioMega + ' CUP/M.';
      }
      RN.config.persistir();
      RN.storageLocal.guardar();
      RN.render.todo();
      RN.notifyUI.toast('Mes cerrado. Snapshot generado.' + paqueteAplicadoMsg, 'success');
      RN.notify.local('Mes cerrado', RN.calc.mesTexto(mes) + ' → ' + RN.calc.mesTexto(RN.state.mesActual));
    },
    { danger: true }
  );
};
