# CHANGELOG — AdminRed

## v6.0.3 — La causa raíz real de "no actualiza": PRECACHE del Service Worker desactualizado

Esta es la explicación de por qué subir `APP_VERSION` en v6.0.1 y v6.0.2 no
tuvo ningún efecto visible: el Service Worker nunca llegaba a instalarse.

- **BUG FIX (raíz):** `sw.js` seguía listando en `PRECACHE` archivos que la
  refactorización de v6.0.0 eliminó (`js/core/calculations.js`,
  `js/clientes/modal-cliente.js`, `js/cobros/inventario.js`) y le faltaban
  los nuevos (`calculations-clientes.js`, `calculations-mes.js`,
  `calculations-finanzas.js`, `calculations-utils.js`, `logger.js`,
  `event-delegation.js`, `form-validation.js`, `cliente-modal-calendar.js`,
  `cliente-modal-render.js`, `cliente-modal-forms.js`, `inventario-core.js`,
  `inventario-ui.js`, `inventario-forms.js`, `descuentos.js`,
  `descuentos-view.js`, `crypto.js`). `cache.addAll()` falla POR COMPLETO si
  una sola URL da 404, así que el evento `install` del Service Worker llevaba
  fallando en silencio desde v6.0.0 — la nueva versión nunca se activaba, sin
  importar cuántas veces se subiera `APP_VERSION`, y el navegador seguía
  sirviendo el Service Worker (y el código) más viejo que sí había logrado
  instalarse alguna vez. Se regeneró `PRECACHE` a partir de los `<script src>`
  reales de `index.html`.

## v6.0.2 — Corrección real de tema/menús (doble init + escapeHtml duplicado)

La v6.0.1 no resolvió el problema porque el diagnóstico anterior era
incorrecto. Causas reales, encontradas simulando la carga completa de la app:

- **BUG FIX (crítico):** `EventDelegation.init()` se estaba llamando DOS
  VECES — una vez automáticamente al final de `event-delegation.js` (que ya
  se auto-inicializa comprobando `document.readyState`), y otra vez desde
  `init.js` (agregada por error en el parche de v6.0.1). Esto registraba el
  listener de clics duplicado, así que cada clic ejecutaba `toggleTheme()` o
  el toggle de menú DOS veces seguidas — como usan `classList.toggle(...)`,
  el efecto se anulaba a sí mismo y visualmente no pasaba nada. Se quita la
  llamada duplicada en `init.js`; `event-delegation.js` ya se encarga solo.
- **BUG FIX (crítico):** `escapeHtml` estaba declarada dos veces en el scope
  global — como `function escapeHtml()` en `js/red/equipos-red.js` y como
  `const escapeHtml` en `js/cobros/inventario-core.js`. Al cargar
  `equipos-red.js` (después de `inventario-core.js`), esto lanzaba
  `SyntaxError: Identifier 'escapeHtml' has already been declared`, lo que
  impedía que se ejecutara ABSOLUTAMENTE NADA de `equipos-red.js` — rompiendo
  toda la sección de Equipos de Red además de dejar el resto de la app en un
  estado inconsistente. Se elimina la declaración duplicada en
  `equipos-red.js`; reutiliza la global ya definida por `inventario-core.js`.
- Se sube `APP_VERSION` para invalidar la caché del Service Worker.

## v6.0.1 — Corrección post-refactorización (event delegation + storage)

Corrige regresiones introducidas por la refactorización de v6.0.0.

- **BUG FIX (crítico):** `saveLocalStorage()` en `storage-local.js` tenía un
  `try` duplicado sin su `catch`/`finally`, lo que provocaba un `SyntaxError`
  y dejaba todo el archivo (guardado, sincronización con Firebase) sin
  cargar.
- **BUG FIX (crítico):** `EventDelegation.init()` nunca se llamaba, así que
  los botones convertidos de `onclick` a `data-action` (☀️ tema, 📁 Archivo,
  ⚙️ Ajustes, exportar/importar, tabs, etc.) no respondían a los clics.
  Se agrega la llamada en `init()`.
- Se elimina una definición duplicada de `mesActualHoy()` en `render.js`
  (la versión vigente vive en `calculations-utils.js`).
- Se sube `APP_VERSION` para forzar la invalidación de la caché del Service
  Worker y que los usuarios reciban los archivos corregidos.

## v5.8.0 — Sistema de Descuentos Puntuales + Integración con WhatsApp

Sistema completo de descuentos puntuales vinculados a cobros y mensajes de
WhatsApp. Los descuentos pueden ser por **afectaciones del servicio** (caídas,
degradación), **bonificaciones** (promociones, fidelización) o **ajustes
administrativos**. Cada descuento puntual tiene un motivo, un modo (monto fijo,
porcentaje o días sin servicio) y se asocia a un cliente y un mes específico.

### Tipos de descuento

- **⚠️ Afectación:** Descuento por interrupción o degradación del servicio. Se
  puede aplicar a un cliente individual (desde el modal de cobro) o a varios a
  la vez (descuento por lote).
- **🎁 Bonificación:** Descuento por promociones, fidelización o compensaciones
  voluntarias.
- **🔧 Ajuste:** Ajuste administrativo genérico.

### Modos de cálculo

- **Monto fijo (CUP):** Descuento de una cantidad exacta.
- **Porcentaje (%):** Porcentaje del precio mensual del cliente.
- **Días sin servicio:** Proporcional al precio mensual según los días sin
  servicio (`precioMes / diasBaseMes × días`). Configurable via
  `config.diasBaseMes` (default 30).

### Funcionalidades

- **Descuentos recurrentes vs. puntuales:** El sistema de descuento recurrente
  existente (permanente por cliente) se mantiene intacto. Los descuentos
  puntuales son nuevos, de un solo uso por mes, y siempre llevan un motivo.
- **Sub-panel en el modal de cobro:** Al registrar un cobro, el admin ve un
  panel con los descuentos pendientes del mes y puede añadir nuevos al vuelo.
  El precio neto se recalcula automáticamente. Al confirmar el cobro, los
  descuentos se marcan como aplicados y se vinculan al cobro (`cobroHid`).
- **Descuento por lote:** Aplica un mismo descuento (ej. afectación general) a
  varios clientes a la vez, con vista previa del total descontado.
- **Reversión al eliminar cobro:** Si se elimina un cobro, sus descuentos
  puntuales se revierten y vuelven a estar disponibles.
- **Anulación al cierre de mes:** Al iniciar un mes nuevo, los descuentos
  puntuales no aplicados del mes que cierra se anulan automáticamente.
- **Vista de gestión (sub-tab 🎁 Descuentos):** Lista todos los descuentos con
  filtros por mes, tipo y estado. Muestra resumen con totales pendientes y
  aplicados. Permite eliminar descuentos no aplicados y exportar a CSV.
- **Integración con WhatsApp:**
  - Los recordatorios de pago ahora incluyen una línea con el detalle de
    descuentos aplicados (ej. "🎁 Descuento aplicado: −500 CUP (Afectación red:
    −500 CUP).").
  - Nueva plantilla `receipt` (comprobante de pago) enviada tras registrar un
    cobro, con el monto recibido, número de recibo y descuentos aplicados.
  - Nuevos marcadores en plantillas: `{descuentoLinea}`, `{descuentoTotal}`,
    `{precioBase}`, `{precioNeto}`, `{motivoDescuento}`, `{montoRecibido}`,
    `{reciboNum}`.
  - El textarea del modal de confirmación de WhatsApp ya no es `readonly`
    (editable para ajustes manuales).
- **Recibo con desglose:** El recibo de pago impreso muestra el desglose de
  descuentos (recurrente + puntuales con motivo) cuando `descuentoAplicado` es
  un objeto. Compatible con cobros antiguos donde `descuentoAplicado` era un
  número.
- **Badges en tarjetas de clientes:** Las tablas de clientes muestran un badge
  "🎁 N desc. puntual(es)" cuando hay descuentos pendientes ese mes.
- **Migración automática:** `migrarDescuentosPuntuales()` inicializa la
  colección `descuentos[]`, normaliza `config.mencionarDescuentoRecurrente` y
  `config.diasBaseMes`, y sanitiza items existentes.

### Archivos modificados/creados

- **Nuevos:**
  - `js/cobros/descuentos.js` — Núcleo del sistema de descuentos puntuales.
  - `js/reportes/descuentos-view.js` — Vista de gestión de descuentos.
- **Modificados:**
  - `js/core/state.js` — Colección `descuentos[]` + config defaults.
  - `js/storage/storage-local.js` — Persistencia de `descuentos`.
  - `js/core/migration.js` — `migrarDescuentosPuntuales()`.
  - `js/core/calculations.js` — `descuentosPendientesCliente()`,
    `calcularDescuentoTotal()`, integración en `precioNetoCliente()` y
    `montoTotalACobrar()`.
  - `js/cobros/modal-cobro.js` — `openCobroModal`, `registrarCobro`,
    `eliminarCobro` actualizados; oferta de comprobante WhatsApp post-cobro.
  - `js/reportes/recibo.js` — Desglose de descuentos en el recibo impreso.
  - `js/notificaciones/whatsapp.js` — `buildDescuentoLinea()`,
    `generateReceiptMessage()`, `sendWhatsAppReceipt()`, inyección en
    recordatorios.
  - `js/notificaciones/wa-templates.js` — Nuevos marcadores + plantilla
    `receipt` + editor de plantillas actualizado.
  - `js/cobros/month-reset.js` — Anulación de descuentos no aplicados al cerrar
    mes.
  - `js/ui/tabs.js` — Sub-tab "Descuentos" + render call.
  - `js/ui/render.js` — Badge de descuentos puntuales en tablas + render de
    vista.
  - `index.html` — Panel de descuentos en modal-cobro, modal de lote, sub-tab,
    tab-content, script tags, botón FAB, textarea editable.
  - `js/version.js` — `5.7.8` → `5.8.0`.
  - `js/DEPENDENCIAS.md` — Documentación de nuevos módulos.
  - `CHANGELOG.md` — Esta entrada.

---

Red

## v5.7.8 — Modal de pago del paquete: efectivo se auto-llena y recalcula

Mejora la experiencia del modal "Pago del paquete contratado". Antes, el campo
"EFECTIVO CUP" aparecía vacío al abrir el modal y el usuario tenía que calcular
manualmente cuánto faltaba pagar. Ahora el efectivo se llena automáticamente con
el saldo pendiente y se recalcula cuando se introducen pagos en USD o
transferencia.

### Cambios

- **Efectivo auto-lleno al abrir el modal:** Cuando se abre el modal de pago del
  paquete, el campo "EFECTIVO CUP" muestra automáticamente el saldo pendiente
  (costo del paquete − abonos previos del mes). El usuario ve de inmediato cuánto
  falta pagar sin tener que hacer cálculos.
- **Recálculo automático:** Si el usuario introduce un pago en **USD** o
  **Transferencia**, el campo "EFECTIVO CUP" se recalcula automáticamente:
  `efectivo = max(0, pendiente − transferenciaCUP − usdEnCUP)`.
- **Efectivo editable manualmente:** Si el usuario modifica el campo efectivo a
  mano, su valor se mantiene — esto permite **pagos parciales deliberados** (por
  ejemplo, pagar menos de lo pendiente si no se tiene todo el efectivo ahora).
- **Recálculo al actualizar la tasa:** Si se pulsa "Actualizar tasa" dentro del
  modal y el usuario ya había introducido USD, el efectivo se recalcula con la
  nueva tasa.
- **Indicador visual:** La etiqueta del campo efectivo ahora muestra "(auto:
  pendiente)" para indicar que el valor se calcula automáticamente.

### Archivos modificados
- `js/paquete/modal-paquete.js` — `abrirModalPaquete()` pre-llena efectivo con
  pendiente; nueva función `recalcularEfectivoPaquete()`; `clickActualizarTasaPaquete()`
  ahora llama al recálculo.
- `index.html` — `oninput` de `paq-transferencia` y `paq-usd` ahora llaman a
  `recalcularEfectivoPaquete()`; etiqueta de efectivo con indicador "(auto)".
- `js/version.js` — `5.7.7` → `5.7.8`.

---

## v5.7.7 — Revisión de Gastos: categorías más claras, agrupación visual, correcciones

Revisa a fondo la sección de gastos: tipos de gasto, lógica de cálculos e
interfaz. Se eliminan categorías redundantes, se bloquea la edición de gastos
del sistema, se agrupan visualmente por categoría con subtotales, y se corrigen
bugs de truncado de decimales y validación de fecha.

### Categorías de gasto: qué se cambió

**Antes (4 categorías en el selector):**
- Operativo
- 📦 Por lote (impacta inventario)
- Crecimiento de red
- 📡 Paquete contratado ← **eliminada del selector**

**Ahora (3 categorías en el selector):**
- 🔧 Operativo (luz, transporte, mantenimiento)
- 📡 Crecimiento de red (antenas, switches, expansión)
- 📦 Por lote (compra de material/inventario)

**¿Por qué se quitó "Paquete contratado"?**
El pago del paquete al proveedor tiene su **modal dedicado** ("Pagar paquete")
con desglose de transferencia CUP + USD + efectivo y soporte de pagos parciales.
Permitir crear un gasto "paquete" manualmente desde el modal de gastos generaba
un gasto plano sin desglose, inconsistente con el sistema de pagos parciales, y
podía confundir al usuario duplicando el pago. Ahora el pago del paquete se
registra **exclusivamente** desde su botón dedicado.

### Gastos del sistema vs gastos manuales

Los gastos ahora se distinguen visualmente:
- **Gastos del sistema** (inversión, rebaja, paquete): aparecen con un icono 🔒
  en lugar del botón de editar. No se pueden editar desde el modal de gastos —
  se gestionan desde su sección correspondiente (Inventario / Pagar paquete).
  Esto evita que el usuario cambie accidentalmente la categoría de una inversión
  a "operativo", rompiendo los cálculos de recuperación de capital.
- **Gastos manuales** (operativo, crecimiento): se pueden editar y eliminar
  libremente.

### Agrupación visual por categoría

La lista de gastos ahora se agrupa por categoría, cada grupo con:
- Un **badge de color** con icono y nombre de la categoría
- Un **subtotal** con el número de gastos y el monto total del grupo
- Los gastos individuales debajo

Al final se muestra el **total general** de todos los gastos.

Orden de grupos:
1. 🌐 Pago del paquete (cian)
2. 📦 Inversión / lotes (ámbar)
3. 📉 Rebajas de inventario (rojo)
4. 🔧 Operativos (azul)
5. 📡 Crecimiento de red (verde)

### Resumen financiero: etiquetas más claras

- "Gastos operativos" → "Gastos operativos (luz, transporte…)"
- "Inversión del mes" → "Inversión del mes (lotes, capital)"
- "Crecimiento de red" → "Crecimiento de red (antenas, switches)"
- "Proyeccion" → "Proyección" (tilde corregido)

### Bugs corregidos

1. **`parseInt()` truncaba decimales en el monto del gasto.** Si el usuario
   ingresaba `1500.50`, se guardaba como `1500`. Cambiado a `parseFloat()`.
2. **Sin validación de fecha.** Si el campo de fecha estaba vacío, el gasto se
   guardaba sin fecha, rompiendo `gastosDelMes()` que filtra por
   `(g.fecha||'').startsWith(config.mesActual)`. Ahora se valida que la fecha
   no esté vacía.
3. **Editar un gasto de inversión mostraba "Operativo" en el selector.** Aunque
   al guardar se preservaba la categoría, el usuario veía "Operativo" en el
   dropdown, lo cual era confuso. Ahora los gastos del sistema no se pueden
   editar desde el modal de gastos.

### Archivos modificados
- `js/gastos.js`: `openGastoModal()` (bloqueo de gastos del sistema),
  `saveGasto()` (parseFloat + validación de fecha, sin rama de paquete),
  `renderGastos()` (agrupación por categoría con subtotales y badges).
- `index.html`: selector de categorías (quitada "paquete", mejoradas etiquetas,
  añadido aviso informativo).
- `style.css`: estilos para `.gasto-grupo`, `.gasto-badge`,
  `.gasto-grupo-subtotal`, `.gasto-total-general`.
- `js/version.js`: `5.7.6` → `5.7.7`.

## v5.7.6 — Reabastecer lotes: comprar más del mismo lote con costo promediado

Añade la posibilidad de **reabastecer un lote existente** en lugar de crear un
lote nuevo cada vez que se compra más del mismo producto. El costo por unidad se
**promedia** (ponderado por el stock disponible + las unidades nuevas), de modo
que el lote refleje la mezcla de la compra original y la reposición.

### Nueva función: Reabastecer lote

- **Botón "📦 Reabastecer"** en cada tarjeta de lote, junto al botón de Rebaja.
- Abre un modal que muestra el stock disponible actual, el costo por unidad
  actual, y calcula en **tiempo real** el costo promedio resultante y el total a
  pagar por la nueva compra.
- Al confirmar, la función `reabastecerLote()`:
  1. Suma las unidades nuevas a `cantidadTotal`.
  2. Suma el costo de la nueva compra a `montoTotal`.
  3. **Promedia** `costoPorUnidad` = (costo del stock actual + costo de la nueva
     compra) / (unidades disponibles + unidades nuevas).
  4. Registra un gasto de inversión adicional vinculado al mismo lote
     (`loteId`), marcado con `reabastecimiento: true` para distinguirlo de la
     compra original.
  5. Conserva `gananciaAcumulada` (no se toca lo ya ganado) y `margenObjetivo`
     (es decisión del usuario, no del costo).

### Promedio ponderado del costo

Fórmula:
```
costoProm = (dispActual × costoViejo + cantidadNueva × costoNuevo) / (dispActual + cantidadNueva)
```
Solo se promedia sobre el **stock disponible** (no sobre lo ya vendido o
rebajado), porque el costo de las unidades ya salidas del lote es agua pasada.

### Borrar un reabastecimiento desde Gastos

`deleteGasto()` ahora distingue entre:
- **Gasto de compra original** (`reabastecimiento` no definido): borra el lote
  entero (comportamiento anterior, con confirmación de ventas huérfanas).
- **Gasto de reabastecimiento** (`reabastecimiento: true`): solo resta las
  unidades añadidas, re-promedia el costo al valor anterior, y **NO borra el
  lote**. Avisa si el stock podría quedar negativo por ventas ya hechas.

### Bug corregido durante pruebas
- El modal de reabastecer hacía referencia a `#reab-unidad` (span que muestra
  "metros"/"unidades" en la etiqueta del campo de cantidad) que no existía en el
  HTML, causando `TypeError: Cannot set properties of null`. Se añadió el elemento
  al HTML y se hizo la referencia defensiva en JS.

### Archivos modificados
- `js/cobros/inventario.js`: `reabastecerLote()` (nueva), `openReabastecerModal()`,
  `closeReabastecerModal()`, `actualizarTotalReabastecer()`,
  `registrarReabastecimiento()`, botón en `renderInventario()`.
- `js/gastos.js`: `deleteGasto()` — rama para reabastecimiento (no borra el lote).
- `js/version.js`: `5.7.5` → `5.7.6`.
- `index.html`: modal `#modal-reabastecer` + span `#reab-unidad`.
- `style.css`: `.inv-reabastecer-btns`, `.inv-reab-btn`.

## v5.7.5 — Inventario y Rebajas: corrección de bugs críticos + rediseño visual

Revisa a fondo la sección de Inventario y, sobre todo, las **rebajas**, que
daban error en ocasiones y corruptaban las métricas del lote. Se corrigen
varios bugs funcionales y se mejora el diseño visual de las tarjetas de lote,
la barra de progreso y los modales.

### Bugs corregidos

**BUG R1 (crítico) — las rebajas se registraban como ventas**
`registrarRebaja()` sumaba la cantidad a `cantidadAsignada` y el monto a
`montoAsignado`, tratando la rebaja como si fuera una venta. Esto inflaba la
métrica de "vendido", corrompía el `precioSugerido()` (repartía la ganancia
objetivo sobre unidades "vendidas" que en realidad se perdieron) y mezclaba
conceptos. Ahora las rebajas usan campos propios `cantidadRebajada` /
`montoRebajado` y NO tocan los contadores de ventas.

**BUG R2 — sin trazabilidad de rebajas**
Las rebajas no guardaban vínculo con el lote ni se podían ver ni deshacer
desde la pestaña Inventario. Ahora el gasto de rebaja lleva `loteId`,
`rebajaId`, `motivo`, `cantidad` y `valorUnidad`, y se muestran en una sección
colapsable "Rebajas de este lote" dentro de cada tarjeta, con botón para
revertirlas (`eliminarRebaja()`).

**BUG R3 — rebajas con valor 0**
El input de valor unitario tenía `min="0"`, permitiendo rebajas de 0 CUP
que generaban un gasto fantasma. Ahora se valida `valor > 0` y el input usa
`min="1"`.

**BUG R4 — el total de la rebaja no se actualizaba al cambiar la cantidad**
`actualizarTotalRebaja()` solo se disparaba desde el input de valor (oninput),
no desde el de cantidad. Ahora ambos inputs disparan el cálculo en tiempo real
y además muestran un aviso si la cantidad excede el stock disponible.

**BUG R5 — borrar un gasto de rebaja desde Gastos no devolvía el material**
`deleteGasto()` solo manejaba `categoria === 'inversion'`; al borrar un gasto de
`categoria === 'rebaja'` desde la pestaña Gastos, el `cantidadRebajada` del
lote quedaba inconsistente (material "perdido" para siempre). Ahora se
detecta la rebaja vinculada, se confirma con el usuario y se devuelve el
material al stock antes de borrar el gasto.

**BUG V1 — `switchGastosTab()` rompía si faltaban paneles**
La función accedía a `gpanel-historial`, `gpanel-inventario`,
`gsub-btn-historial`, etc. sin null-checks, lanzando un TypeError cuando esos
elementos no existían (el inventario tiene su propia pestaña top-level). Ahora
todos los accesos están protegidos.

**BUG V2 — `unidadesDisponibles()` no restaba rebajas**
Calculaba `cantidadTotal - cantidadAsignada` sin descontar las rebajas. Ahora
resta también `cantidadRebajada`, con compatibilidad para lotes viejos.

**BUG V3 — `fmt()` abortaba con `undefined`/`null`**
`fmt(n)` llamaba `n.toLocaleString()` directamente; si `n` era `undefined` o
`null` (ej. un lote antiguo sin `gananciaAcumulada` o `margenObjetivo`), la
función lanzaba `TypeError: Cannot read properties of undefined` y rompía todo
el `renderInventario()`. Ahora `fmt` trata `undefined`/`null` como `0`.

**BUG V4 — `renderInventario()` crash con lotes sin `margenObjetivo`/`gananciaAcumulada`**
Usaba `inv.montoTotal * inv.margenObjetivo` y `inv.gananciaAcumulada`
directamente; si faltaban (lotes viejos o recién creados), generaba `NaN` o
crash. Ahora usa defaults seguros (`margenObj = 0.35`, `gananciaAcum = 0`,
`montoTotal || costoTotal || 0`).

### Mejoras funcionales
- Nuevo modelo de lote con `cantidadRebajada` / `montoRebajado` (compatibilidad
  con lotes antiguos: se asume 0 si faltan).
- Nueva función `eliminarRebaja(rebajaId)` para revertir una rebaja desde la
  tarjeta del lote (devuelve el material y borra el gasto).
- `asignarDesdeModal()` ahora valida cliente y cantidad con mensajes claros.
- Sección colapsable "Rebajas de este lote" con iconos por motivo
  (deterioro, pérdida, robo, vencimiento, otro) y botón ↩ para revertir.
- Mapa `REBAJA_MOTIVOS` con etiqueta e icono por motivo.

### Mejoras visuales
- Rediseño de las tarjetas de lote (clase `.inv-card`) con borde lateral
  amber, hover suave y estado "agotado" atenuado.
- **Barra de progreso** de tres segmentos (vendido en verde / rebajado en
  rojo / disponible en gris) con leyenda debajo.
- Badges de stock disponible con jerarquía tipográfica (número grande +
  unidad).
- Modal de rebaja con descripción explicativa, badge de "stock disponible del
  lote", aviso inline si la cantidad excede el disponible y tope dinámico.
- Modal de compra de lote con descripción explicativa.
- Estilos CSS específicos para inventario (`.inv-*`) con responsive en móvil.
- Empty state del inventario con instrucción de uso.

### Archivos modificados
- `js/cobros/inventario.js` — corrección de rebajas, nuevo modelo, render
  rediseñado, `eliminarRebaja()`, `toggleRebajasLote()`, validaciones.
- `js/gastos.js` — `deleteGasto()` maneja rebajas; `switchGastosTab()` con
  null-checks.
- `index.html` — modales de rebaja y compra mejorados (badge, aviso, oninput).
- `style.css` — estilos `.inv-*` para tarjetas, barra de progreso y modales.
- `js/version.js` — bump a 5.7.5 (invalida caché del Service Worker).

## v5.7.4 — Pago desglosado del paquete (transferencia + USD + efectivo) con pagos parciales

Reemplaza el botón "Marcar como pagado" (pago único de un clic) por un
**modal de pago desglosado** que permite pagar el paquete contratado al
proveedor combinando tres métodos — transferencia CUP, USD (al cambio del
mercado informal con tasa ajustada −5) y efectivo CUP — exactamente igual
que los clientes pueden pagar en USD. Además soporta **pagos parciales**:
se pueden registrar múltiples abonos hasta completar el costo mensual del
paquete, con seguimiento del saldo pendiente en tiempo real.

### Novedades

**Modal de pago desglosado (js/paquete/modal-paquete.js — nuevo, ~380 líneas)**
- `abrirModalPaquete()`: abre el modal calculando costo del paquete
  (`costoMes()`), total ya pagado este mes (`_paquetePagadoAcumuladoMes()`)
  y saldo pendiente. Muestra la fila "Ya pagado (abonos previos)" solo si
  existen abonos previos. Resetea los campos de entrada y calcula el
  desglose inicial.
- `calcularDesglosePaquete()`: cálculo en tiempo real al escribir. Lee los
  tres campos (transferencia, USD, efectivo), convierte el USD con
  `tasaAjustadaUsd()` (tasa del mercado informal −5, redondeada a múltiplo
  de 5), suma el total y lo compara con el saldo pendiente. Muestra:
  "✓ Cubre exactamente el saldo pendiente", "Sobran X CUP" (si se pasa) o
  "⚠ Pago parcial — faltan X CUP para completar el paquete".
- `confirmarPagoPaquete()`: valida que el total sea > 0, crea un gasto con
  `categoria:'paquete'`, `monto` = total en CUP, y un objeto `desglose`
  con `{transferencia, usd, usdTasa, usdCup, efectivo}` para auditoría.
  La descripción del gasto incluye el desglose legible
  ("transferencia 9,250 CUP + 50 USD × 315 = 15,750 CUP"). Si el abono
  completa el paquete, marca `config.paquetePagadoMes = mes`.
- `_paquetePagadoAcumuladoMes(mesKey)`: suma todos los gastos de categoría
  'paquete' de un mes dado (YYYY-MM), para calcular el saldo pendiente y
  el progreso de pagos parciales.
- `clickActualizarTasaPaquete()`: permite actualizar la tasa USD desde
  dentro del modal (reutiliza `actualizarTasaUsd()`).
- `_actualizarAvisoStalePaquete()`: muestra aviso "⚠ Tasa sin actualizar
  hace más de 5 h." si la tasa está desactualizada.

**Soporte de pagos parciales (calculations.js — modificado)**
- `paquetePagadoEsteMes()`: además de la marca rápida
  (`config.paquetePagadoMes === mes`), ahora verifica si el acumulado de
  abonos del mes (`pagoPaqueteMes()`) es ≥ `costoMes()`. Esto permite que
  el sistema reconozca el paquete como pagado aunque se haya completado con
  múltiples abonos parciales en lugar de un solo pago.
- `costoPaqueteContadoMes()` sigue siendo la suma real de lo pagado al
  proveedor este mes, por lo que `gananciaReal()` refleja correctamente
  los abonos parciales en la caja.

**Panel "Paquete Contratado" con tres estados (render.js — modificado)**
- `renderPaqueteStatus()` ahora muestra tres estados:
  1. **Pagado** (verde, ✓): el acumulado ≥ costo. Botón oculto.
  2. **Pago parcial** (ámbar, ⚠): "10,000 CUP / 25,000 CUP (40%)" con
     "Faltan 15,000 CUP para completar". Botón cambia a "Completar pago".
  3. **Pendiente** (ámbar, ⚠): sin abonos. Botón "Pagar paquete".

**Botón "Marcar como pagado" → "Pagar paquete" (gastos.js — modificado)**
- `marcarPaquetePagado()` ya no hace un pago único de un clic. Ahora abre
  el modal de pago desglosado (`abrirModalPaquete()`).

### Integración
- `index.html`: añadido HTML del modal (`#modal-paquete`) antes del modal
  de mora, y tag `<script src="./js/paquete/modal-paquete.js">` después de
  `gastos.js`.
- `style.css`: ~40 líneas de estilos para el modal (`.paq-info`,
  `.paq-info-row`, `.paq-desglose`, `.paq-line`, `.paq-estado`) con media
  query móvil.
- `sw.js`: añadido `./js/paquete/modal-paquete.js` al precache.

### Validación
- 62/62 tests en `test-paquete.js` (pagos parciales, sobrepago, marca
  rápida, acumulado mensual, inicialización del modal, desglose en tiempo
  real solo transferencia / combinado / parcial, confirmación completa y
  parcial, validaciones de entrada, tasa ajustada −5, costo contado con
  múltiples abonos, aislamiento entre meses).
- Validación visual en navegador: flujo completo de pago parcial (10,000
  CUP → 40% → reabrir modal muestra "Ya pagado 10,000" → completar con
  15,000 → "✓ Pagado"), conversión USD con tasa ajustada (320→315,
  50 USD = 15,750 CUP), pago combinado (transferencia + USD = exacto),
  y verificación del gasto registrado con metadata de desglose.

---

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
