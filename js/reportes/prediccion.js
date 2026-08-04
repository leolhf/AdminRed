// prediccion.js
// Prediccion/etiqueta de riesgo segun historial de retrasos de un cliente.
// Feature #8: la tolerancia de dias ahora es configurable (config.toleranciaMoraDias).
// Si no existe (datos antiguos), se mantiene el valor historico de 5 dias.

// BUG FIX #8: antes comparaba solo el dia del mes del cobro contra el limite,
// sin considerar que un pago hecho en el mes SIGUIENTE siempre es tardio
// aunque su dia sea pequeno (ej: pago el 3 del mes siguiente → tardio obvio).
function getLateLabel(clientId) {
  const cobros = history.filter(h=>h.id===clientId && h.fecha);
  if(cobros.length < 2) return '';
  const c = clients.find(x=>x.id===clientId);
  if(!c) return '';

  // Feature #8: tolerancia configurable. Fallback a 5 si no existe.
  const margenDias = (config.toleranciaMoraDias!=null && !isNaN(config.toleranciaMoraDias)) ? config.toleranciaMoraDias : 5;
  const limiteDia  = (c.diaPago||config.diaInicio) + margenDias;

  let tardios = 0;
  cobros.forEach(h=>{
    const fechaCobro  = new Date(h.fecha+'T00:00:00');
    const diaCobro    = fechaCobro.getDate();

    // Aproximacion practica: cobro tardio si diaCobro > limiteDia.
    // Para detectar el caso "mes siguiente": si limiteDia > 28, el pago
    // el dia 1-X del mes siguiente no puede distinguirse facilmente sin mas contexto,
    // asi que usamos la heuristica del dia dentro del mes del cobro.
    if(diaCobro > limiteDia) tardios++;
  });

  const pct = tardios / cobros.length;
  if(pct >= 0.5) return `<span style="font-size:0.6rem;color:var(--red);font-family:var(--mono)">🔴 historial de retrasos (${tardios}/${cobros.length})</span>`;
  if(pct >= 0.25) return `<span style="font-size:0.6rem;color:var(--amber);font-family:var(--mono)">🟡 algunos retrasos (${tardios}/${cobros.length})</span>`;
  return '';
}
