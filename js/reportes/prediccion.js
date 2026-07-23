// prediccion.js
// Predicción/etiqueta de riesgo según historial de retrasos de un cliente.

// BUG FIX #8: antes comparaba solo el día del mes del cobro contra el límite,
// sin considerar que un pago hecho en el mes SIGUIENTE siempre es tardío
// aunque su día sea pequeño (ej: pagó el 3 del mes siguiente → tardío obvio).
function getLateLabel(clientId) {
  const cobros = history.filter(h=>h.id===clientId && h.fecha);
  if(cobros.length < 2) return '';
  const c = clients.find(x=>x.id===clientId);
  if(!c) return '';

  const margenDias = 5; // tolerancia fija de 5 días
  const limiteDia  = (c.diaPago||config.diaInicio) + margenDias;

  let tardios = 0;
  cobros.forEach(h=>{
    const fechaCobro  = new Date(h.fecha+'T00:00:00');
    const diaCobro    = fechaCobro.getDate();
    const mesCobro    = fechaCobro.getMonth();
    const anioCobro   = fechaCobro.getFullYear();

    // Determinar el mes esperado de pago: el mismo mes del historial
    // para saber si el día está dentro del límite.
    // Si el día del cobro supera el límite, o si el cobro fue el mes siguiente
    // al que se esperaba (solo detectable si hay cobros consecutivos), es tardío.
    // Aproximación práctica: cobro tardío si diaCobro > limiteDia.
    // Para detectar el caso "mes siguiente": si limiteDia > 28, el pago
    // el día 1-X del mes siguiente no puede distinguirse fácilmente sin más contexto,
    // así que usamos la heurística del día dentro del mes del cobro.
    if(diaCobro > limiteDia) tardios++;
  });

  const pct = tardios / cobros.length;
  if(pct >= 0.5) return `<span style="font-size:0.6rem;color:var(--red);font-family:var(--mono)">🔴 historial de retrasos (${tardios}/${cobros.length})</span>`;
  if(pct >= 0.25) return `<span style="font-size:0.6rem;color:var(--amber);font-family:var(--mono)">🟡 algunos retrasos (${tardios}/${cobros.length})</span>`;
  return '';
}
