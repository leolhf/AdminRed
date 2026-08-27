/**
 * reportes/estadisticas.js — Estadísticas del negocio.
 */
RN.estadisticas = RN.estadisticas || {};

RN.estadisticas.calcular = function () {
  const clientes = RN.calc.clientesActivos();
  const totalClientes = RN.state.clients.length;
  const ticketPromedio = RN.state.history.length
    ? RN.state.history.reduce((s, h) => s + (h.monto || 0) + (h.montoEquipo || 0), 0) / RN.state.history.length
    : 0;
  return {
    totalClientes,
    clientesActivos: clientes.length,
    ingresosTotales: RN.calc.ingresosTotales(),
    gastosTotales: RN.calc.gastosTotales(),
    utilidadAcumulada: RN.calc.ingresosTotales() - RN.calc.gastosTotales(),
    cobrosRegistrados: RN.state.history.length,
    ticketPromedio,
    inversionRecuperada: RN.investment.porcentajeRecuperacion(),
    planesCount: RN.state.planes.length
  };
};

RN.estadisticas.ver = function () {
  const s = RN.estadisticas.calcular();
  const kpis = [
    { label: 'Clientes totales', value: s.totalClientes, cls: 'blue' },
    { label: 'Clientes activos', value: s.clientesActivos, cls: 'green' },
    { label: 'Cobros registrados', value: s.cobrosRegistrados, cls: 'blue' },
    { label: 'Ticket promedio', value: RN.calc.formatCUP(s.ticketPromedio), cls: 'amber' },
    { label: 'Ingresos totales', value: RN.calc.formatCUP(s.ingresosTotales), cls: 'green' },
    { label: 'Gastos totales', value: RN.calc.formatCUP(s.gastosTotales), cls: 'red' },
    { label: 'Utilidad acumulada', value: RN.calc.formatCUP(s.utilidadAcumulada), cls: 'blue' },
    { label: 'Inversión recuperada', value: s.inversionRecuperada + '%', cls: 'amber' },
    { label: 'Planes de servicio', value: s.planesCount, cls: 'blue' }
  ];
  const html = `
    <div class="modal-header"><h3>Estadísticas del negocio</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body"><div class="kpi-grid">${kpis.map(k => `<div class="kpi ${k.cls}"><div class="label">${k.label}</div><div class="value" style="font-size:18px">${k.value}</div></div>`).join('')}</div></div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>`;
  RN.uiComponents.modal(html, { lg: true });
};
