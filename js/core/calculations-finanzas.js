// calculations-finanzas.js
// Cómputos financieros de inversión, deuda de equipo y finanzas generales
// Depende de: state.js (investments, history, gastos, clients),
//             calculations-clientes.js (getDeudaEquipoCliente, precioNetoCliente, facturacionIniciada)

const inversionTotalHistorica   = ()=>investments.reduce((s,i)=>s+(i.costoTotal||0),0);

// BUG FIX: antes sumaba investments[].recuperado, un campo que ningún código llega
// a escribir (actualizarRecuperadoInversion es un no-op desde que se pasó al modelo
// de proyección automática). Por eso la barra de "Recuperación de inversión" se
// quedaba siempre en 0% aunque el cliente pagara su cuota de equipo.
// Ahora se suma directamente lo ya cobrado real: history[].montoEquipo, que SÍ se
// registra en cada cobro (modal-cobro.js), liquidación (liquidarDeuda) y venta de
// inventario (inventario.js). Esto refleja el dinero realmente recuperado.
const recuperadoInversion       = ()=>history.reduce((s,h)=>s+(h.montoEquipo||0),0);

// BUG FIX: gananciaAjustada() sumaba ganancia() (un número del mes en curso) con
// recuperadoInversion() (un acumulado histórico de TODA la vida de la app, sin
// filtrar por fecha). Con cada mes que pasaba, "Ganancia ajustada" iba sumando
// cada vez más lo cobrado en meses anteriores — un número que crecía sin parar
// y no representaba nada real de "este mes".
// Para gananciaAjustada() se usa ahora solo lo recuperado DENTRO del mes en curso.
// recuperadoInversion() se deja intacta (histórica) para la sección "Recuperación
// de inversión" de Estadísticas, que sí está pensada como acumulado de toda la vida.
const recuperadoInversionMes    = ()=>history.reduce((s,h)=>s+((config.mesActual && (h.fecha||'').startsWith(config.mesActual))?(h.montoEquipo||0):0),0);
const deudaEquipoPendienteTotal = ()=>clients.reduce((s,c)=>s+getDeudaEquipoCliente(c),0);
const gananciaAjustada          = ()=>ganancia()+recuperadoInversionMes();

// ───────────────────────────────────────────────────────────────────────────
//  RESUMEN UNIFICADO DE INVERSIÓN (v5.7.1)
// ───────────────────────────────────────────────────────────────────────────
//  El sistema maneja TRES modelos de inversión que NO deben mezclarse ni
//  contabilizarse dos veces:
//
//  1) INVERSIONES PERSONALES (investments[]): capital propio en infraestructura
//     (ej. una antena, un router core). Los clientes vinculados NO generan
//     deuda; solo aportan su ganancia neta de servicio para PROYECTAR en cuántos
//     meses se recupera el capital. Su recuperación NO se registra en
//     history.montoEquipo (es una proyección, no un cobro de deuda).
//
//  2) DEUDA DE EQUIPO (clients[].deudaEquipo): compra puntual de equipo para un
//     cliente, que la paga por cuotas mensuales junto al servicio. Sí genera un
//     cobro real (history.montoEquipo en cada abono/liquidación).
//
//  3) INVENTARIO COMPARTIDO (inventario[] + asignacionesInventario[]): compra de
//     un lote de material (cable, conectores) que se va vendiendo a clientes. Si
//     se vende "al momento" genera un cobro history.montoEquipo de inmediato; si
//     se vende "a plazo" crea deudaEquipo del cliente y se cobra después por
//     cuotas (también history.montoEquipo).
//
//  El problema anterior: la sección "Recuperación de inversión" de Estadísticas
//  sumaba investments[].costoTotal + inventario[].montoTotal como "total
//  invertido", pero calculaba "recuperado" a partir de history.montoEquipo — que
//  SOLO incluye cobros de los modelos 2 y 3, NO del modelo 1 (proyección). El % de
//  recuperación quedaba distorsionado: el capital de inversiones personales
//  (modelo 1) aparecía como "nunca recuperado" aunque su proyección dijera lo
//  contrario, y los cobros de inventario se podían contar dos veces (una en
//  recuperadoInversion() y otra en el filter por nota '📦').
//
//  resumenInversion() devuelve una estructura CONSISTENTE que separa cada modelo,
//  suma cada "recuperado" de su fuente correcta, y evita el doble conteo. Es la
//  única fuente de verdad para cualquier UI que muestre recuperación de capital.
function resumenInversion() {
  // --- Modelo 1: inversiones personales (proyección, sin cobros de deuda) ---
  const invPersonales = (investments || []).filter(i => i.activo !== false);
  const capitalPersonalTotal = invPersonales.reduce((s,i)=>s+(i.costoTotal||0),0);
  // Recuperación PROYECTADA de inversiones personales: suma el recuperadoEstimado
  // de cada una (ganancia neta de servicio realmente cobrada a los vinculados).
  // NO usa history.montoEquipo (esos cobros son de deuda de equipo/inventario).
  const recuperadoPersonal = invPersonales.reduce((s,i)=>{
    try { return s + (proyeccionInversion(i).recuperadoEstimado||0); }
    catch(e){ return s; }
  },0);

  // --- Modelos 2 y 3: deuda de equipo + inventario (cobros reales via montoEquipo) ---
  // Capital total efectivamente invertido en equipo/lotes (gastos 'inversion' de
  // toda la vida, que month-reset.js conserva). Se reconstruye desde gastos para
  // incluir tanto deuda de equipo puntual como lotes de inventario.
  const capitalEquipoTotal = gastos
    .filter(g=>g.categoria==='inversion')
    .reduce((s,g)=>s+(g.monto||0),0);
  // Recuperación REAL de equipo + inventario: todo history.montoEquipo de toda la
  // vida (abonos de cuota, liquidaciones, ventas de inventario al momento). Es la
  // única fuente coherente para los modelos que sí generan cobro de deuda.
  const recuperadoEquipo = history.reduce((s,h)=>s+Number(h.montoEquipo||0),0);

  // --- Pendiente por recuperar (solo modelos 2 y 3 generan deuda cobrable) ---
  // Deuda de equipo activa de clientes (modelo 2 + ventas de inventario a plazo
  // que se materializaron como deudaEquipo).
  const pendienteEquipo = deudaEquipoPendienteTotal();
  // Ventas de inventario a plazo pendientes (modelo 3 a plazo, reflejo en
  // asignacionesInventario). NOTA: estas YA están incluidas en deudaEquipo del
  // cliente (asignarConsumoInventario las suma a c.deudaEquipo), así que NO se
  // suman de nuevo para evitar doble conteo del pendiente.
  const pendienteTotal = pendienteEquipo;

  // --- Totales consolidados ---
  const capitalTotal = capitalPersonalTotal + capitalEquipoTotal;
  const recuperadoTotal = recuperadoPersonal + recuperadoEquipo;
  const pct = capitalTotal>0 ? Math.min(100, Math.round(recuperadoTotal/capitalTotal*100)) : 0;

  return {
    // Modelo 1 — personales (proyección)
    capitalPersonalTotal, recuperadoPersonal,
    pctPersonal: capitalPersonalTotal>0 ? Math.min(100, Math.round(recuperadoPersonal/capitalPersonalTotal*100)) : 0,
    nPersonales: invPersonales.length,
    // Modelos 2+3 — equipo + inventario (cobros reales)
    capitalEquipoTotal, recuperadoEquipo, pendienteEquipo,
    pctEquipo: capitalEquipoTotal>0 ? Math.min(100, Math.round(recuperadoEquipo/capitalEquipoTotal*100)) : 0,
    // Consolidado
    capitalTotal, recuperadoTotal, pendienteTotal, pct
  };
}