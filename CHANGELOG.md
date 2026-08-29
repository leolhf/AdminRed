# Changelog — AdminRed (RedNet)

## v5.13.2 — Fusión Deuda + Inversión

### Refactorización arquitectónica (sin cambios visuales ni de datos)
- **Fusión de `deudas.js` en `inversion.js`**: Los dos módulos gestionaban el mismo modelo de datos (`RN.state.investments`) con solo un filtro de diferencia. Se unifican en un solo módulo. `deudas.js` eliminado (−201 líneas).
- **Devoluciones movidas de `caja.js` a `inversion.js`**: `caja.js` mezclaba retiros de caja con devoluciones de préstamo. Ahora `caja.js` tiene responsabilidad única (solo retiros). 421 → 212 líneas (−50%).
- **Helpers compartidos en `investment.js`**: Extraídos `_cobrosClienteDesde()` y `_margenMensualClientes()`, eliminando 6 funciones duplicadas (filtro de cobros 3×, bucle de margen 3×).
- **Helper `_filaDetalle()` en `render.js`**: Centraliza las ~22 filas de detalle condicionales de las tarjetas de inversión, reemplazando ternarios inline por `{ cond: … }`.
- **Bug corregido en `eliminar()`**: La versión de `deudas.js` SIEMPRE borraba las devoluciones asociadas, incluso para capital propio. Ahora la función unificada solo borra devoluciones cuando es préstamo externo.

### Archivos modificados
- `js/version.js` — versión 5.13.1 → 5.13.2
- `js/core/models/investment.js` — 2 helpers extraídos, 6 funciones simplificadas (646 → 638 líneas)
- `js/cobros/inversion.js` — absorbe lógica de deudas + devoluciones (módulo unificado)
- `js/cobros/deudas.js` — **ELIMINADO** (fusionado en inversion.js)
- `js/cobros/caja.js` — devoluciones movidas a inversion.js (421 → 212 líneas)
- `js/ui/render.js` — helper `_filaDetalle()` + 22 filas refactorizadas + referencias actualizadas
- `index.html` — eliminado `<script src="js/cobros/deudas.js">`
- `CHANGELOG_v5.13.2.md` — changelog detallado de esta versión

### Verificación
- Sintaxis JS: 0 errores en todos los archivos.
- Referencias rotas: 0 (cero referencias a `RN.deudas`, `RN.caja.devolucion*` o `deudas.js` en código ejecutable).
- Compatibilidad: total (sin cambios en modelo de datos ni persistencia).

---

## v5.13.1 — Corrección de 18 bugs de auditoría

Versión de corrección de errores detectados en la auditoría de v5.13.0. Se corrigen 18 bugs sin cambiar la arquitectura ni el modelo de datos. Ver `CHANGELOG_v5.13.1.md` para el detalle completo de cada bug.

### Bugs principales corregidos
- `mesActual` guardado pero nunca leído (cálculos usaban reloj del sistema).
- Pago parcial mezclaba servicio y equipo en `h.monto` (doble conteo).
- Descuento de equipo no aplicaba en pago parcial.
- `actualizarTasaAuto()` podía sobreescribir tasa con valor inválido.
- `eliminar()` divergente entre `deudas.js` e `inversion.js`.
- Validación de IPs con puntos, migración de datos, y 12 bugs más.

---

## v5.13.0 — 27 ago 2026

### Tasa USD: persistencia robusta
- **Fix `moneda.js` `actualizarTasaAuto()`**: Ahora se valida que la tasa recibida de la API automática (mdiv.pro) sea un número realista (mayor que 0 y menor que 100000) antes de sobreescribir la tasa configurada. Esto evita que una respuesta inválida o corrupta borre la tasa que el usuario configuró manualmente.
- **Fix `storage-local.js` `_aplicarData()`**: Al cargar datos desde un archivo de respaldo o backup, la configuración de tasa USD se preserva desde `STORAGE_KEYS.CONFIG` (la fuente autoritativa) si es más reciente que la del blob de datos. Esto evita que cargar un backup antiguo sobreescriba la tasa actual.

### Deudas personales — nueva sección en Finanzas
- **Nueva subpestaña "Deudas"** en el grupo Finanzas, junto a Inversión, Inventario, Gastos y Descuentos.
- **Vista de deudas personales**: Muestra los préstamos externos (capital a devolver) separados en dos grupos:
  - **Deudas activas**: Préstamos con saldo pendiente (saldoADevolver > 0)
  - **Historial de deudas concluidas**: Préstamos totalmente liquidados (saldoADevolver = 0)
- **KPIs de deudas**: Deudas activas, Saldo por devolver, Ya devuelto (activas), Concluidas (cantidad + total).
- **Tarjetas de deuda**: Cada deuda muestra estado (activa/concluida), fecha de creación, fecha de conclusión (si aplica), monto del préstamo, total devuelto, saldo por devolver o saldo final, % devuelto con barra de progreso visual, pago de la compra, historial de devoluciones, y botones de acción (Devolver préstamo, Ver devoluciones, Editar, Eliminar).
- **Auto-conclusión automática**: Cuando se registra una devolución que liquida completamente el saldo (saldoADevolver = 0), la deuda se marca automáticamente como concluida (`deudaConcluida = true`, `fechaConclusion = timestamp`) y pasa al historial de deudas concluidas. Se muestra un toast de confirmación: "¡Deuda liquidada! Trasladada al historial de deudas concluidas."

### Deudas personales: editables y eliminables
- **Editar**: Cualquier deuda personal (activa o concluida) puede editarse usando el botón "Editar", que abre el mismo formulario de inversión con los datos cargados.
- **Eliminar desde Deudas**: El botón 🗑 en la vista de Deudas elimina la deuda personal Y todas sus devoluciones asociadas, con un diálogo de confirmación que muestra cuántas devoluciones se eliminarán y el monto total.
- **Eliminar desde Inversión mejorado**: `RN.inversion.eliminar()` ahora, para préstamos externos, también elimina las devoluciones asociadas (antes se conservaban). El mensaje de confirmación se adapta según si es préstamo o capital propio.

### Archivos modificados
- `js/version.js` — versión 5.12.9 → 5.13.0
- `js/core/moneda.js` — `actualizarTasaAuto()`: validación de tasa antes de sobreescribir
- `js/storage/storage-local.js` — `_aplicarData()`: preservar config autoritativa de tasa USD
- `js/core/models/investment.js` — nuevas funciones: `deudasActivas()`, `deudasConcluidas()`, `verificarConclusion()`, `totalDevueltoConcluidas()`
- `js/cobros/caja.js` — `guardarDevolucion()`: auto-conclusión de deuda + re-render de deudas
- `js/cobros/inversion.js` — `eliminar()`: limpia devoluciones asociadas para préstamos externos
- `js/cobros/deudas.js` — **NUEVO**: módulo `RN.deudas` con render de deudas activas/concluidas y eliminar
- `js/ui/render.js` — `vista()`: case 'deudas' → `RN.deudas.render()`
- `js/ui/tabs.js` — `_vistaAGrupo`: mapeo `deudas: 'finanzas'`
- `index.html` — nueva sección `view-deudas`, subtab "Deudas", script tag `deudas.js`
- `sw.js` — Service Worker con `importScripts('js/version.js')` (cache key usa versión real)

---

## v5.12.9 — Calendario interactivo + Recuperación de inversión rediseñada

### Calendario interactivo con días de corte
- Calendario mensual con días de corte configurables por cliente
- Click en un día de corte abre modal con clientes a cobrar, monto total, botones de cobro y WhatsApp
- Botón "Recordar a todos" para enviar recordatorios masivos

### Recuperación de inversión: origen del capital
- Nuevo campo "Origen del capital": Capital propio vs Préstamo externo
- Préstamo externo: lleva saldo a devolver, permite registrar devoluciones desde la caja
- Aporte extra del mes: porcentaje configurable de la ganancia neta se destina a acelerar la recuperación
- Funciones: `origenCapital()`, `saldoADevolver()`, `totalDevuelto()`, `recuperadoNetoInv()`, `aporteExtraMes()`, `recuperadoEfectivo()`

### Service Worker fix
- `sw.js` ahora usa `importScripts('js/version.js')` para que el cache key use la versión real
- `version.js` y `sw.js` son network-first; el resto es cache-first
