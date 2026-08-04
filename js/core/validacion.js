// validacion.js
// Corrige de forma silenciosa datos que quedaron en un estado invalido
// (por bugs, interrupciones a mitad de una operacion, o ediciones manuales
// del archivo) antes de guardar — para que nunca queden negativos que
// distorsionen las cuentas: deudas negativas, mora negativa, montos
// negativos, etc. Se ejecuta automaticamente en cada save().
// Depende de: state.js

function validarYCorregirDatos() {
  let corregidos = 0;
  const clamp0 = (v) => { const n = Number(v); return (isNaN(n) || n < 0) ? 0 : n; };

  clients.forEach(c=>{
    if(c.mora < 0){ c.mora = 0; corregidos++; }
    // BUG FIX: las comparaciones < 0 en deudaEquipo y cuotaEquipo fallaban
    // silenciosamente si el valor era un objeto (estado de migracion pendiente):
    // `objeto < 0` → NaN < 0 → false, nunca se corregia. Se verifica el tipo
    // antes de comparar para que la correccion solo aplique a valores numericos.
    if(typeof c.deudaEquipo === 'number' && c.deudaEquipo < 0){ c.deudaEquipo = 0; corregidos++; }
    if(typeof c.cuotaEquipo === 'number' && c.cuotaEquipo < 0){ c.cuotaEquipo = 0; corregidos++; }
    if(c.abono < 0){ c.abono = 0; corregidos++; }
    if(c.megas < 0){ c.megas = 0; corregidos++; }
    if(c.precio < 0){ c.precio = 0; corregidos++; }
    // Feature #10: descuento no puede ser negativo
    if(typeof c.descuento === 'number' && c.descuento < 0){ c.descuento = 0; corregidos++; }
    // Un cliente no puede deber mas equipo del que originalmente se le asigno como cuota mensual sin tope logico —
    // pero si puede pasar que cuotaEquipo quede en 0 con deudaEquipo>0 (cuota mal borrada): no se puede cobrar nunca.
    if(typeof c.deudaEquipo === 'number' && c.deudaEquipo > 0 && !c.cuotaEquipo){
      console.warn(`${c.nombre}: tiene deuda de equipo (${c.deudaEquipo}) sin cuota mensual definida — no se podra saldar sola.`);
    }
  });

  gastos.forEach(g=>{ if(g.monto < 0){ g.monto = 0; corregidos++; } });

  if(config.megas < 0){ config.megas = 0; corregidos++; }
  if(config.costoPorMega < 0){ config.costoPorMega = 0; corregidos++; }
  if(config.margenMegas < 0){ config.margenMegas = 0; corregidos++; }
  if(config.sobreventaMegas < 0){ config.sobreventaMegas = 0; corregidos++; }
  // Feature #8: tolerancia de mora no puede ser negativa
  if(config.toleranciaMoraDias < 0){ config.toleranciaMoraDias = 5; corregidos++; }

  if(corregidos > 0){
    console.warn(`validarYCorregirDatos: se corrigieron ${corregidos} valor(es) invalido(s) antes de guardar.`);
  }
  return corregidos;
}
