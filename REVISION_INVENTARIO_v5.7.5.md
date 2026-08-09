# Revisión profunda del Inventario — AdminRed v5.7.5

## Resumen

Se revisó a fondo la sección de Inventario y, en particular, las **rebajas**, que
daban error en ocasiones. Se detectaron y corrigieron **10 bugs** (5 críticos en
rebajas + 4 de rendering/estado + 1 de `fmt`), se añadieron mejoras funcionales
(trazabilidad de rebajas, revertir rebajas) y se rediseñó visualmente toda la
tarjeta del lote con barra de progreso tri-segmentada.

---

## Bugs corregidos

### BUG R1 (crítico) — Las rebajas se registraban como ventas

**El bug más grave.** `registrarRebaja()` sumaba la cantidad rebajada a
`cantidadAsignada` y el monto a `montoAsignado`, tratando la rebaja como si fuera
una venta. Esto:

- Inflaba la métrica de "vendido" del lote
- Corrompía `precioSugerido()` (repartía la ganancia objetivo sobre unidades
  "vendidas" que en realidad se perdieron)
- Mezclaba rebajas con ventas en "Ventas de este lote"

**Fix:** Las rebajas ahora usan campos propios `cantidadRebajada` /
`montoRebajado` y NO tocan los contadores de ventas.

### BUG R2 — Sin trazabilidad de rebajas

Las rebajas no guardaban vínculo con el lote ni se podían ver ni deshacer desde
Inventario. Aparecían solo como gastos anónimos.

**Fix:** El gasto de rebaja ahora lleva `loteId`, `rebajaId`, `motivo`,
`cantidad` y `valorUnidad`. Se muestran en una sección colapsable "Rebajas de
este lote" dentro de cada tarjeta, con botón ↩ para revertirlas.

### BUG R3 — Rebajas con valor 0

El input de valor unitario tenía `min="0"`, permitiendo rebajas de 0 CUP que
generaban un gasto fantasma.

**Fix:** Se valida `valor > 0` antes de registrar. El input usa `min="1"`.

### BUG R4 — El total de la rebaja no se actualizaba al cambiar la cantidad

`actualizarTotalRebaja()` solo se disparaba desde el input de valor (`oninput`),
no desde el de cantidad. Al escribir la cantidad, el total no cambiaba.

**Fix:** Ambos inputs (cantidad y valor) disparan el cálculo en tiempo real.
Además, muestra un aviso inline si la cantidad excede el stock disponible.

### BUG R5 — Borrar un gasto de rebaja desde Gastos no devolvía el material

`deleteGasto()` solo manejaba `categoria === 'inversion'`. Al borrar un gasto de
`categoria === 'rebaja'` desde la pestaña Gastos, el `cantidadRebajada` del lote
quedaba inconsistente — el material estaba "perdido" para siempre.

**Fix:** `deleteGasto()` ahora tiene una rama `else if (g.categoria === 'rebaja'
&& g.loteId)` que restaura el material al stock antes de borrar el gasto.

### BUG V1 — `renderInventario` mostraba disponible incorrecto

Mostraba `disponible = cantidadTotal - cantidadAsignada` sin descontar rebajas
(y con R1, las rebajas estaban dentro de `cantidadAsignada`).

**Fix:** Usa `unidadesDisponibles()` que resta `cantidadAsignada` +
`cantidadRebajada`.

### BUG V2 — `unidadesDisponibles()` no restaba rebajas

Calculaba `cantidadTotal - cantidadAsignada` sin `cantidadRebajada`.

**Fix:** `const rebajada = inv.cantidadRebajada || 0; return inv.cantidadTotal -
inv.cantidadAsignada - rebajada;`

### BUG V3 — `fmt()` abortaba con `undefined`/`null`

`fmt(n)` llamaba `n.toLocaleString()` directamente. Si `n` era `undefined` o
`null` (lote antiguo sin `gananciaAcumulada`), lanzaba `TypeError` y rompía todo
`renderInventario()`.

**Fix:** `const fmt = n => (typeof n === 'number' ? n : 0).toLocaleString('es-CU')
+ ' CUP';`

### BUG V4 — `renderInventario` crash con lotes sin `margenObjetivo`

Usaba `inv.montoTotal * inv.margenObjetivo` y `inv.gananciaAcumulada` directly.
Si faltaban, generaba `NaN` o crash.

**Fix:** Defaults seguros: `margenObj = inv.margenObjetivo != null ?
inv.margenObjetivo : 0.35`, `gananciaAcum = inv.gananciaAcumulada || 0`,
`montoTotal || costoTotal || 0`.

### BUG V5 — `switchGastosTab()` rompía si faltaban paneles

Accedía `document.getElementById('gpanel-' + n).style.display` sin null-check.

**Fix:** Todos los accesos DOM envueltos en null-checks.

---

## Mejoras funcionales

1. **Nuevo modelo de lote** con `cantidadRebajada` / `montoRebajado`
   (compatibilidad con lotes antiguos: se asume 0 si faltan).

2. **Nueva función `eliminarRebaja(rebajaId)`** — revierte una rebaja desde la
   tarjeta del lote: devuelve el material al stock y borra el gasto asociado.

3. **`asignarDesdeModal()`** ahora valida cliente y cantidad con mensajes claros
   antes de proceder.

4. **Sección colapsable "Rebajas de este lote"** con iconos por motivo
   (🔧 deterioro, ❓ pérdida, 🚨 robo, 📅 vencimiento, 📝 otro) y botón ↩ para
   revertir.

5. **Mapa `REBAJA_MOTIVOS`** con etiqueta e icono por cada motivo.

6. **`openRebajaModal()`** ahora muestra badge de stock disponible, setea el
   `max` dinámicamente en el input de cantidad, y usa el valor disponible como
   placeholder.

---

## Mejoras visuales

- **Rediseño de tarjetas de lote** (clase `.inv-card`):
  - Borde lateral de color (verde = disponible, gris = agotado)
  - Badge grande de unidades disponibles a la derecha
  - Barra de progreso tri-segmentada: 🟢 vendido / 🔴 rebajado / ⬜ disponible
  - Leyenda con cantidades debajo de la barra
  - Fila de ganancia acumulada vs objetivo con porcentaje
  - Bloque de venta inline con precio sugerido, cliente, cantidad, precio y modo
    de pago (a plazo / pagado al momento)
  - Secciones colapsables "Ventas de este lote" y "Rebajas de este lote"

- **Modal de rebaja** rediseñado:
  - Descripción explicativa de qué es una rebaja
  - Badge de stock disponible
  - Input de cantidad con `max` dinámico
  - Aviso inline si la cantidad excede el disponible
  - Total que se actualiza en tiempo real

- **Modal de compra** con descripción explicativa.

- **CSS específico** (~85 líneas): `.inv-card`, `.inv-progress`, `.inv-badge`,
  `.inv-sell-block`, `.inv-subsection`, responsive `@media(max-width:480px)`.

---

## Archivos modificados

| Archivo | Cambios |
|---|---|
| `js/cobros/inventario.js` | `unidadesDisponibles`, `registrarRebaja`, `actualizarTotalRebaja`, `openRebajaModal`, `eliminarRebaja` (nueva), `renderInventario` (rediseño), `REBAJA_MOTIVOS` (nuevo), `toggleRebajasLote` (nuevo) |
| `js/gastos.js` | `deleteGasto` (rama rebaja), `switchGastosTab` (null-checks) |
| `js/core/calculations.js` | `fmt` (safe para undefined/null) |
| `js/version.js` | `APP_VERSION` → `'5.7.5'` |
| `index.html` | Modal de rebaja (badge, aviso, oninput), modal de compra (descripción) |
| `style.css` | ~85 líneas nuevas de CSS para inventario |
| `CHANGELOG.md` | Entrada v5.7.5 con todos los bugs y mejoras |

---

## Verificación

Flujos probados con datos limpios en el navegador:

1. ✅ Comprar lote → vender → rebajar → verificar `disponible = total - vendido -
   rebajado`
2. ✅ Eliminar venta → material vuelve al stock
3. ✅ Eliminar rebaja desde Inventario → material vuelve, gasto borrado
4. ✅ Eliminar rebaja desde Gastos → material vuelve, gasto borrado
5. ✅ Rebaja con valor=0 → bloqueada con notificación de error
6. ✅ Total de rebaja se actualiza en tiempo real al cambiar cantidad o valor
7. ✅ `fmt(undefined)` → `0 CUP` (sin crash)
8. ✅ Lote sin `margenObjetivo`/`gananciaAcumulada` → renderiza con defaults
