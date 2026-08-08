# CHANGELOG — AdminRed

## v5.7.3 — Panel "Evolución Histórica" (estadísticas a lo largo del tiempo)

Añade un panel de estadísticas temporales en la pestaña **Estadísticas**
que muestra la evolución mes a mes de ganancias, ingresos cobrados, deudas
pendientes y crecimiento de clientes, permitiendo ver el desempeño del
negocio a lo largo del tiempo (6, 12 o 24 meses) en lugar de únicamente el
mes actual.

### Novedades

**Motor de serie temporal (js/reportes/evolucion-historica.js — nuevo, 385 líneas)**
- `_evoReconstruirMes(mesKey)`: reconstruye los datos de cualquier mes a
  partir del historial de cobros (`history`) y gastos (`gastos`) cuando no
  existe un snapshot guardado. Calcula cobrado (servicios + equipo),
  pagoPaquete, gastos operativos y ganancia real (caja). Marca el mes con
  `_reconstruido: true` para distinguirlo visualmente en la UI.
- `_evoMesesConDatos()`: detecta todos los meses que tienen información
  (snapshots + historial + gastos + mes actual), ordenados ascendentemente.
- `_evoConstruirSerie()`: construye la serie temporal completa para el rango
  seleccionado, usando snapshots guardados cuando existen y reconstrucción
  del historial para los meses sin snapshot. Esto garantiza que la vista
  funcione desde el primer uso aunque el admin nunca haya guardado snapshots.
- `_evoKPIs(serie)`: calcula mejor mes, peor mes, promedio de ganancia,
  tendencia (2ª mitad vs 1ª mitad del período) y total cobrado.

**Gráfico SVG multi-línea (`_evoRenderGrafico`)**
- Líneas para Ganancia (verde), Cobrado (azul) y Deuda pendiente (rojo).
- Cuadrícula, línea de cero, etiquetas en eje Y y nombres de mes en eje X.
- Tooltips con valores al hacer hover sobre cada punto.
- Escala automática según los datos del período.

**Tabla cronológica (`_evoRenderTabla`)**
- Columnas: Mes, Cobrado, Δ, Ganancia, Δ, Deuda pend., Gastos, Tasa cobro,
  Clientes, Mora.
- Flechas ▲/▼ con porcentaje de cambio vs mes anterior en cobrado y ganancia.
- Indicador ⟳ en meses reconstruidos del historial (vs snapshots guardados).

**KPIs de tendencia (`_evoRenderKPIs`)**
- Tarjetas: Mejor mes, Peor mes, Promedio ganancia/mes, Tendencia
  (2ª vs 1ª mitad), Total cobrado.
- Colores semánticos (verde/rojo) según signo de la ganancia.

**Selector de rango (6m / 12m / 24m)**
- Botones en la cabecera del panel que re-renderizan al cambiar.
- `evoCambiarRango(n)` actualiza el estado y refresca gráfico + tabla + KPIs.

### Integración
- `index.html`: añadido panel HTML dentro de `tab-estadisticas` (después
  del gráfico de tendencia existente) y tag `<script>` después de
  `tendencia.js`.
- `js/reportes/estadisticas.js`: `renderEstadisticas()` ahora llama
  `renderEvolucionHistorica()` después de `renderTrend()`.
- `style.css`: ~40 líneas de estilos para el panel (cabecera, botones de
  rango, KPIs, gráfico SVG, tabla con responsive y media query móvil).

### Validación
- 34/34 tests en `test-evolucion.js` (detección de meses, reconstrucción
  mensual, prioridad de snapshots, KPIs, render vacío y poblado, cambio de
  rango, ganancia negativa, helpers).
- Validación visual en navegador: gráfico multi-línea, tabla con deltas
  y KPIs renderizan correctamente con datos inyectados.

---

## v5.7.2 — Mini-calendario de selección de día de pago

Reemplaza el input numérico simple (1-28) + toggle "Este mes / Próximo mes"
del modal de Nuevo Cliente por un mini-calendario navegable (‹ ›) que
resalta los días hábiles de pago (rangos 1-5, 10-15, 20-25) y permite
seleccionar el día de pago **y** el mes de inicio de cobro en una sola
interacción visual.

### Novedades

**Mini-calendario de pago (modal-cliente.js, index.html, style.css)**
- Calendario mensual navegable hasta 12 meses atrás y 12 adelante.
- Días hábiles (1-5, 10-15, 20-25) resaltados en verde y seleccionables;
  el resto del mes se muestra atenuado y no es clicable.
- Al hacer clic en un día hábil se define automáticamente `diaPago` y
  `fechaInicio` (YYYY-MM-DD) según el mes visible (pasado / actual / futuro).
- Resumen "Inicio de cobro: Día X · fecha (mes pasado / próximo mes)".
- Soporta altas retroactivas: si se selecciona un día de un mes pasado,
  aparece el checkbox **"Este cliente ya pagó este ciclo"**. Si se marca,
  el cliente se guarda con `pagado=true` y `mora=0` para que el reinicio de
  mes (`month-reset`) no le genere mora por un ciclo que el admin confirma
  ya fue cobrado manualmente.
- `selectMesInicio()` se conserva como no-op por compatibilidad.
- `editClient()` ahora inicializa el calendario con el `diaPago` + `fechaInicio`
  existentes del cliente y oculta el checkbox "ya pagó" (eso se gestiona
  desde Cobros).
- `saveClient()` lee `f-fecha-inicio-iso` directamente del calendario en
  lugar de inferir la fecha desde el toggle Este/Próximo mes.

### Compatibilidad verificada
- `facturacionIniciada(c)`: clientes con `fechaInicio` futura siguen
  excluidos de pendientes; pasados, incluidos.
- `getStatus(c)` / `clientLabel(c)`: badge "Desde <mes>" para futuros.
- `month-reset` (`debiaCobrar`): clientes retroactivos con `pagado=true`
  no reciben mora; con `pagado=false` sí (comportamiento esperado).

## v5.7.1 — Parche de consistencia financiera (caja real vs. capital)
 — Parche de consistencia financiera (caja real vs. capital)

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
