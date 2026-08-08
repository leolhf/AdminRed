# CHANGELOG — AdminRed

## v5.7.1 — Parche de consistencia financiera (caja real vs. capital)

Esta versión corrige 5 bugs residuales detectados tras la auditoría de la
línea v5.7 (caja real). Los problemas PROB1, PROB2-base y PROB3 reportados
por el usuario ya estaban resueltos en v5.7; este parche cierra las
inconsistencias restantes entre la proyección, la caja real y la
recuperación de inversión.

### Correcciones

**A. Doble conteo en "Recuperación de inversión" (estadisticas.js)**
La sección sumaba `recuperadoInversion()` (todo el histórico de
`history.montoEquipo`) y luego volvía a sumar `history.montoEquipo` de
notas marcadas con 📦, contando los cobros de inventario dos veces. Además
mezclaba el capital de inversiones personales (modelo de proyección, sin
cobros de deuda) con el de equipo/inventario (cobros reales), distorsionando
el %. Ahora se usa el helper unificado `resumenInversion()` que separa los
tres modelos y evita el doble conteo.

**B. Desglose de liquidez inconsistente con el valor mostrado (salud.js)**
El semáforo de Liquidez mostraba `gananciaReal()` (caja real del mes) pero
su desglose textual usaba la proyección (`cobrado()` + reintroducía
`costoMes()`), por lo que el número y el detalle no coincidían. Ahora el
desglose refleja la caja real: cobrado del mes − paquete pagado − gastos
operativos reales.

**C. Inyección XSS/JS por descripción no escapada (inventario.js)**
`openRebajaModal(${inv.id}, '${inv.desc}', ...)` interpolaba la descripción
del inventario sin escapar. Una descripción con comilla simple rompía el
`onclick` y permitía inyección de JS. Añadidos `escapeForJsSingle()` y
`escapeHtml()`; todas las interpolaciones de `inv.desc` ahora se escapan.

**D. Capital de inversión contaminando la caja operativa (calculations.js)**
`totalGastos()` y `gastosRealesMes()` incluían los gastos de categoría
'inversión' (compra de equipo/lote) y 'rebaja' (baja de inventario) del mes.
Estos son salida de capital que se recupera después por cuotas/ventas, no
gasto operativo; restarlos de la "ganancia neta real (caja)" mezclaba
capital con operativa. Ahora:
- `totalGastos()` → solo operativos del mes (operativo + crecimiento).
- `gastosRealesMes()` → solo operativos reales del mes.
- `inversionCapitalMes()` → capital invertido este mes (inversión + rebaja),
  expuesto aparte para que el admin lo vea sin que contamine la caja.
- `totalGastosIncluyendoInversion()` → conserva el comportamiento anterior
  para quienes quieran ver la salida total de caja.
- `generarSnapshot()` guarda `inversionCapitalMes` aparte y `gastos` solo
  operativos, coherente con la caja.

**E. Normalización de los 3 modelos de inversión (PROB4 + PROB5)**
- Nuevo helper `resumenInversion()` (calculations.js) como única fuente de
  verdad para cualquier UI de recuperación de capital: separa (1)
  inversiones personales (proyección vía `proyeccionInversion()`, sin
  `montoEquipo`), (2) deuda de equipo y (3) inventario (ambos con cobros
  reales vía `history.montoEquipo`), y suma cada "recuperado" de su fuente
  correcta sin solapamiento.
- `deleteGasto()` (gastos.js) reforzado: para inversiones con ventas
  asociadas enumera las ventas específicas, exige confirmación explícita en
  dos pasos, y advierte sobre la inconsistencia en métricas de recuperación
  al borrar inversión de equipo puntual sin lote.
- `investment.js` documentado con un encabezado que explica los 3 modelos y
  la regla anti-doble-conteo (`history.montoEquipo` alimenta los modelos
  2+3; el modelo 1 usa `proyeccionInversion()` únicamente).

### Consumidores actualizados
- `render.js` (`renderProfit`): la caja real ahora muestra "Inversión del
  mes (capital)" como línea separada, ya que `totalGastos()` ya no la
  incluye.
- `gastos.js` (`renderGastos`): "Inversión del mes (capital)" agrupa
  inversión + rebaja, alineado con `inversionCapitalMes()`.

### Validación
46 pruebas automatizadas (cargando el código real en un sandbox VM)
verifican: invariantes PROB1/PROB2/PROB3, separación capital/operativo,
`resumenInversion()` sin doble conteo, snapshot coherente, escenario de
paquete no pagado, no-contaminación entre meses, y neutralización de
inyección XSS.

---

## v5.7 — Línea "caja real" (base de este parche)
- Introducción del libro de caja real del mes (`gananciaReal()`,
  `cobradoTotalMes()`, `costoPaqueteContadoMes()`).
- `totalGastos()` ya excluye 'paquete' (resuelve PROB1).
- `gananciaReal()` usa `costoPaqueteContadoMes()` (resuelve base de PROB2).
- `month-reset.js` borra 'paquete'; `totalGastos()` filtra por mes (resuelve
  PROB3).
- `fechaLocalISO()` para manejo consistente UTC→Local.
- Snapshots mensuales para comparación histórica.
