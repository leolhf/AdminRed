# Dependencias de Módulos - RedNet (AdminRed)

Este documento describe el orden de carga y las dependencias entre los módulos JavaScript de la aplicación. **Verificado contra el `<script>` real de `index.html`.**

## Orden de Carga (CRÍTICO)

El orden de carga de los scripts en `index.html` es CRÍTICO. Los scripts deben cargarse en este orden exacto para evitar errores de referencia a variables no definidas.

```
1. CORE (Estado, configuración base y modelo de inversión)
   ├── version.js              (Sin dependencias)
   ├── state.js               (Sin dependencias - DEBE SER PRIMERO)
   ├── keys.js                (Sin dependencias)
   ├── config.js              (Depende de: state.js)
   ├── crypto.js              (Depende de: keys.js)
   ├── calculations-clientes.js (Depende de: state.js) [v5.4.0 — +getPrecioCliente, +calcularDescuento]
   ├── calculations-mes.js    (Depende de: state.js, calculations-clientes.js) [v5.4.0 — +snapshots, +recibos]
   ├── calculations-finanzas.js (Depende de: state.js, calculations-clientes.js)
   ├── calculations-utils.js   (Depende de: state.js) [v5.4.0 — +snapshots, +recibos]
   ├── logger.js              (Depende de: state.js) [Sistema de logging de errores para debugging offline]
   ├── event-delegation.js    (Sin dependencias) [Sistema de event delegation para eliminar onclick inline]
   ├── form-validation.js     (Sin dependencias) [Sistema de validación de formularios inline con mensajes de error]
   ├── moneda.js              (Depende de: state.js, calculations-clientes.js; carga tras calculations.js) [v5.6.0 — doble moneda USD/CUP, tasa auto vía proxy CORS]
   ├── reset-app.js           (Depende de: state.js)
   ├── models/investment.js   (Depende de: state.js, calculations.js)
   ├── migration.js           (Depende de: state.js, calculations.js)
   ├── checkpoint.js          (Depende de: state.js, storage-local.js, storage-file.js)
   ├── undo.js                (Depende de: state.js, storage-local.js, storage-file.js)
   └── validacion.js          (Depende de: state.js)

2. STORAGE (Persistencia de datos)
   ├── storage-local.js       (Depende de: state.js, keys.js)
   ├── storage-file.js        (Depende de: state.js, keys.js, crypto.js, validacion.js)
   ├── export.js              (Depende de: state.js, storage-local.js, crypto.js) [v5.4.0 — +importBackup, +exportClientesCSV]
   └── macrodroid-export.js   (Depende de: state.js, calculations.js, storage-file.js)

3. UI (Componentes de interfaz)
   ├── theme.js               (Depende de: keys.js)
   ├── notify-ui.js           (Sin dependencias)
   ├── reloj.js               (Sin dependencias)
   ├── tabs.js                (Sin dependencias)
   ├── render.js              (Depende de: state.js, calculations.js, config.js)
   ├── inline-edit.js         (Depende de: state.js, calculations.js)
   └── ui-components.js       (Depende de: notify-ui.js, tabs.js)

4. CLIENTES (Gestión de clientes)
   ├── cliente-modal-calendar.js (Depende de: state.js, calculations-utils.js) [v5.4.0 — mini-calendario de fecha de pago]
   ├── cliente-modal-render.js   (Depende de: state.js, cliente-modal-calendar.js, calculations-clientes.js) [v5.4.0 — +planes CRUD, +planId]
   ├── cliente-modal-forms.js    (Depende de: state.js, calculations-clientes.js, calculations-utils.js) [v5.4.0 — +descuento, validación]
   ├── confirm-delete.js      (Depende de: state.js)
   └── client-history.js      (Depende de: state.js, calculations.js)

5. COBROS (Gestión de pagos)
   ├── modal-cobro.js         (Depende de: state.js, calculations-clientes.js) [v5.4.0 — +getPrecioCliente, +calcularDescuento, +siguienteRecibo]
   ├── mora.js                (Depende de: state.js)
   ├── inversion.js           (Depende de: state.js, calculations-clientes.js)
   ├── inventario-core.js     (Depende de: state.js, calculations-utils.js) [lógica de cálculo de inventario]
   ├── inventario-ui.js       (Depende de: state.js, inventario-core.js) [renderizado de tarjetas de inventario]
   ├── inventario-forms.js    (Depende de: state.js, inventario-core.js) [formularios de inventario]
   └── month-reset.js         (Depende de: state.js, calculations-clientes.js)

6. REPORTES (Estadísticas e historial)
   ├── historial.js           (Depende de: state.js)
   ├── historial-mensual.js   (Depende de: state.js)
   ├── tendencia.js           (Depende de: state.js)
   ├── prediccion.js          (Depende de: state.js)
   ├── estadisticas.js        (Depende de: state.js, calculations.js)
   ├── macrodroid-export.js   (Depende de: state.js, calculations.js, storage-file.js)
   ├── reporte-mensual.js     (Depende de: state.js, calculations.js) [v5.4.0 — Feature #6, #14]
   ├── recibo.js              (Depende de: state.js, calculations.js) [v5.4.0 — Feature #4]
   ├── calendario.js          (Depende de: state.js, calculations.js) [v5.4.0 — Feature #7]
   └── salud.js               (Depende de: state.js, calculations.js) [v5.4.0 — Feature #13]

7. NOTIFICACIONES (WhatsApp y notificaciones)
   ├── notifications.js       (Depende de: state.js, keys.js)
   ├── whatsapp.js            (Depende de: state.js, calculations.js)
   └── wa-templates.js        (Depende de: state.js, calculations.js; carga después de whatsapp.js)

8. OTROS (Funcionalidades específicas)
   ├── gastos.js              (Depende de: state.js, calculations.js)
   ├── pin.js                 (Depende de: state.js)
   ├── pwa.js                 (Depende de: state.js)
   └── red/equipos-red.js     (Depende de: state.js)

9. INIT (Inicialización de la app)
   └── init.js                (Depende de: TODOS los anteriores)

9. FIREBASE (módulo ES, cargado con type="module")
   └── firebase/firebase-init.js (Depende de: state.js — sincroniza clientes
                                  a Firestore y gestiona el token FCM para
                                  notificaciones push con la app cerrada)

    └── init.js                (Depende de: TODOS los anteriores — DEBE SER EL ÚLTIMO)
```

> **Nota sobre crypto.js:** `crypto.js` (cifrado AES-GCM ligado al PIN) vive en
> `js/core/crypto.js`. Si lo tocas, verifica su punto real de carga en
> `index.html` antes de mover `storage-file.js`, para no romper el cifrado.

## Reglas de Dependencia

### Regla #1: state.js DEBE cargarse primero
- `state.js` define las variables globales que todos los demás módulos usan
- Si `state.js` no carga primero, todos los demás scripts fallarán

### Regla #2: keys.js debe cargar antes de usar constantes
- `keys.js` centraliza las constantes de storage
- Debe cargar antes de cualquier módulo que use localStorage o IndexedDB

### Regla #3: calculations.js antes de render.js
- `render.js` usa funciones de cálculo definidas en `calculations.js`
- El orden inverso causará errores de referencia

### Regla #4: core/models/investment.js antes de render.js, inversion.js y migration.js
- Estos tres módulos llaman a `getDeudaEquipoCliente`, `getCuotaEquipoCliente`
  y/o `getProgresoEquipoCliente`, todas definidas en `core/models/investment.js`
- Si se carga después, esas funciones no existirán y las tarjetas de cliente
  con deuda de equipo fallarán al renderizar

### Regla #5: checkpoint.js antes de undo.js
- `undo.js` depende de los checkpoints automáticos generados por `checkpoint.js`

### Regla #6: firebase-init.js se carga como módulo ES (`type="module"`)
- Al ser `type="module"` se ejecuta de forma diferida — no asumas que corre
  estrictamente en el orden textual respecto a los scripts clásicos

## Variables Globales Principales

Las siguientes variables globales están definidas en `state.js` y son usadas por múltiples módulos:

- `clients` - Array de clientes
- `history` - Array de historial de cobros (con `montoEquipo` para pagos/ventas de equipo, usado por `getProgresoEquipoCliente`)
- `gastos` - Array de gastos adicionales
- `inventario` - Array de lotes de material compartido (cable, conectores...)
- `asignacionesInventario` - Array de consumo de inventario asignado a clientes
- `config` - Configuración del sistema
- `fileHandle` - Handle del archivo vinculado
- `isDirty` - Flag de cambios sin guardar
- `fileIsEncrypted` - Flag de archivo cifrado

## Constantes de Storage

Todas las constantes de storage están centralizadas en `keys.js`:

```javascript
STORAGE_KEYS.DATA             // 'rn_data'
STORAGE_KEYS.THEME            // 'rn_theme'
STORAGE_KEYS.LAST_BACKUP      // 'rn_last_backup'
STORAGE_KEYS.BACKUP_DISMISSED // 'rn_backup_dismissed'

IDB.DB_NAME                   // 'RedNetDB'
IDB.STORE                     // 'rn_store'
IDB.KEY                       // 'fileHandle'

ENCRYPTION.VERSION            // 'v1'
```

## Módulos nuevos (checkpoint, undo, validación, cifrado, migración, macrodroid)

| Módulo | Qué hace |
|---|---|
| `core/checkpoint.js` | Genera checkpoints automáticos del estado (para deshacer cambios grandes o recuperarse de un guardado corrupto) |
| `core/undo.js` | Sistema de deshacer/rehacer sobre los checkpoints de `checkpoint.js` |
| `core/validacion.js` | Valida la integridad de los datos (clientes, historial, config) antes/después de operaciones de guardado |
| `core/crypto.js` | Cifrado AES-GCM del archivo de datos, ligado al PIN del usuario |
| `core/migration.js` | Migra datos de versiones antiguas del modelo (p. ej. reconstruye recuperación de inversión desde el historial cuando el campo no existía) |
| `core/models/investment.js` | Modelo de deuda de equipo / recuperación de inversión por cliente: `getDeudaEquipoCliente`, `getCuotaEquipoCliente`, `getProgresoEquipoCliente`, y stubs de compatibilidad con el modelo antiguo |
| `reportes/macrodroid-export.js` | Exporta datos en un formato consumible por MacroDroid para automatizaciones externas |
| `firebase/firebase-init.js` | Sincroniza datos mínimos de clientes (nombre, día de pago, monto) a Firestore y gestiona el token de Firebase Cloud Messaging para notificaciones push con la app cerrada |
| `red/equipos-red.js` | Gestión de equipos de red asociados a clientes |

## Notas de Mantenimiento

- Al agregar un nuevo módulo, identificar sus dependencias
- Agregar el script en la sección apropiada de `index.html`
- Actualizar este documento con las nuevas dependencias
- Si un módulo no tiene dependencias, puede ir en cualquier posición dentro de su sección
- `init.js` DEBE ser el último script clásico cargado (antes del `<script type="module">` de Firebase)

## Módulos Nuevos v5.4.0

| Módulo | Función |
|---------|----------|
| `reportes/reporte-mensual.js` | Reporte ejecutivo mensual con KPIs y comparación contra el snapshot del mes anterior (Feature #6). Incluye guardado de snapshots inmutables (Feature #14). |
| `reportes/recibo.js` | Generación de recibos de pago imprimibles/exportables a PDF con número auto-incremental (Feature #4). |
| `reportes/calendario.js` | Calendario visual mensual de cobros con código de colores por estado de pago (Feature #7). |
| `reportes/salud.js` | Dashboard de salud del negocio con KPIs tipo semáforo (verde/amarillo/rojo) (Feature #13). |
| `reportes/descuentos-view.js` | **v5.8.0** Vista de gestión de descuentos puntuales: lista con filtros por mes/tipo/estado, resumen con totales, exportación a CSV. Funciones: `renderDescuentosView()`, `eliminarDescuentoVista()`, `exportDescuentosCSV()`. |
| `cobros/descuentos.js` | **v5.8.0** Núcleo del sistema de descuentos puntuales (afectación/bonificación/ajuste). Crea, elimina, marca-aplicado y revierte descuentos vinculados a cobros. Sub-panel dentro del modal de cobro, aplicación por lote, y anulación al cierre de mes. |

## Funciones Nuevas en calculations.js (v5.4.0)

| Función | Descripción |
|----------|-------------|
| `getPlanCliente(c)` | Devuelve el plan asignado a un cliente (o null si no tiene) |
| `getPrecioCliente(c)` | Devuelve el precio por mega: del plan si tiene, o `c.precio` si no |
| `getMegasCliente(c)` | Devuelve los megas: del plan si tiene y no tiene megas manuales, o `c.megas` |
| `calcularDescuento(c, precioMes)` | Calcula el descuento aplicable (monto fijo o porcentaje) |
| `generarSnapshot(mes)` | Genera un objeto snapshot con todos los KPIs del mes |
| `guardarSnapshot(mes)` | Guarda/reemplaza un snapshot en el array `snapshots` |
| `getSnapshotMes(mes)` | Devuelve el snapshot de un mes específico |
| `getSnapshotAnterior(mesKey)` | Devuelve el snapshot del mes inmediatamente anterior |
| `siguienteRecibo()` | Incrementa y devuelve el número de recibo auto-incremental |
| `formatoRecibo(n)` | Formatea un número de recibo como `R-YYYY-0000` |
| `mesActualHoy()` | Devuelve el mes actual como `YYYY-MM` |
| `labelMes(mesKey)` | Convierte `YYYY-MM` a etiqueta legible (`enero 2025`) |

## Módulo Nuevo v5.6.0 — Doble Moneda USD/CUP

| Módulo | Función |
|---------|----------|
| `core/moneda.js` | Soporte de doble moneda (Variante B híbrida). CUP es la moneda principal; el USD se muestra como equivalencia informativa. Funciones: `tasaUsd()`, `cupToUsd()`, `usdToCup()`, `fmtUsd()`, `fmtCup()`, `equivUsd()`, `actualizarTasaUsd()` (consulta mdiv.pro vía proxy.cors.sh), `guardarTasaUsdManual()`, `renderMonedaEditor()`. La tasa se persiste en `config.tasaUsd` / `config.tasaUsdFecha` / `config.tasaUsdFuente`. El dashboard (`render.js`) y los recibos (`recibo.js`) muestran la equivalencia en USD solo cuando hay tasa configurada. |


## Módulo Nuevo v5.8.0 — Descuentos Puntuales + WhatsApp

| Módulo | Función |
|---------|----------|
| `cobros/descuentos.js` | Sistema de descuentos puntuales por cliente y mes (afectación/bonificación/ajuste). Funciones: `crearDescuentoPuntual()`, `eliminarDescuentoPuntual()`, `marcarDescuentosAplicados()`, `revertirDescuentosDeCobro()`, `anularDescuentosNoAplicadosMes()`, sub-panel `_initCobroDescuentos()`/`renderCobroDescuentosPanel()`, lote `abrirModalLoteDescuento()`/`aplicarLoteDescuento()`. |
| `reportes/descuentos-view.js` | Vista de gestión: `renderDescuentosView()`, `eliminarDescuentoVista()`, `exportDescuentosCSV()`. |

### Funciones nuevas en calculations.js (v5.8.0)

| Función | Descripción |
|----------|-------------|
| `descuentosPendientesCliente(c, mes)` | Devuelve array de descuentos puntuales pendientes (no aplicados) del mes, con monto calculado |
| `calcularDescuentoTotal(c, precioMes)` | Devuelve `{total, recurrente, puntuales}` combinando descuento recurrente + puntuales, capado al precio del mes |

### Cambios en state.js (v5.8.0)

| Campo | Descripción |
|-------|-------------|
| `descuentos[]` | Colección de descuentos puntuales: `{id, clienteId, tipo, motivo, modo, valor, mes, fecha, aplicado, cobroHid}` |
| `config.mencionarDescuentoRecurrente` | Boolean: si true, menciona el descuento recurrente en mensajes de WhatsApp |
| `config.diasBaseMes` | Días base para cálculo proporcional de descuentos por días sin servicio (default 30) |

### Marcadores nuevos en wa-templates.js (v5.8.0)

| Marcador | Descripción |
|----------|-------------|
| `{descuentoLinea}` | Texto con detalle de descuentos aplicados (recurrente + puntuales con motivo) |
| `{descuentoTotal}` | Monto total descontado con " CUP" |
| `{precioBase}` | Precio base del servicio antes de descuentos |
| `{precioNeto}` | Precio neto tras descuentos |
| `{motivoDescuento}` | Motivo del primer descuento puntual |
| `{montoRecibido}` | Monto recibido en el cobro (plantilla receipt) |
| `{reciboNum}` | Número de recibo (plantilla receipt) |

### Orden de carga de scripts (v5.8.0)

`descuentos.js` se carga después de `modal-cobro.js` y antes de `mora.js` (dentro de la sección COBROS).
`descuentos-view.js` se carga después de `recibo.js` y antes de `calendario.js` (dentro de la sección REPORTES).
