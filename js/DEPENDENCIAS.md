# Dependencias de Módulos - RedNet

Este documento describe el orden de carga y las dependencias entre los módulos JavaScript de la aplicación.

## Orden de Carga (CRÍTICO)

El orden de carga de los scripts en `index.html` es CRÍTICO. Los scripts deben cargarse en este orden exacto para evitar errores de referencia a variables no definidas.

```
1. CORE (Estado y configuración base)
   ├── version.js              (Sin dependencias)
   ├── state.js               (Sin dependencias - DEBE SER PRIMERO)
   ├── keys.js                (Sin dependencias)
   ├── config.js              (Depende de: state.js)
   ├── crypto.js              (Depende de: keys.js)
   └── calculations.js        (Depende de: state.js)

2. STORAGE (Persistencia de datos)
   ├── storage-local.js       (Depende de: state.js, keys.js)
   ├── storage-file.js        (Depende de: state.js, keys.js, crypto.js)
   └── export.js              (Depende de: state.js)

3. UI (Componentes de interfaz)
   ├── theme.js               (Depende de: keys.js)
   ├── notify-ui.js           (Sin dependencias)
   ├── reloj.js               (Sin dependencias)
   ├── tabs.js                (Sin dependencias)
   ├── render.js              (Depende de: state.js, calculations.js, config.js)
   └── inline-edit.js         (Depende de: state.js, calculations.js)

4. CLIENTES (Gestión de clientes)
   ├── modal-cliente.js       (Depende de: state.js, calculations.js)
   ├── confirm-delete.js      (Depende de: state.js)
   └── client-history.js      (Depende de: state.js, calculations.js)

5. COBROS (Gestión de pagos)
   ├── modal-cobro.js         (Depende de: state.js, calculations.js)
   ├── mora.js                (Depende de: state.js)
   ├── inversion.js           (Depende de: state.js, calculations.js)
   ├── inventario.js          (Depende de: state.js, calculations.js)
   └── month-reset.js         (Depende de: state.js, calculations.js)

6. REPORTES (Estadísticas e historial)
   ├── historial.js           (Depende de: state.js)
   ├── historial-mensual.js   (Depende de: state.js)
   ├── tendencia.js           (Depende de: state.js)
   ├── prediccion.js          (Depende de: state.js)
   └── estadisticas.js        (Depende de: state.js, calculations.js)

7. NOTIFICACIONES (WhatsApp y notificaciones)
   ├── notifications.js       (Depende de: state.js, keys.js)
   └── whatsapp.js            (Depende de: state.js, calculations.js)

8. OTROS (Funcionalidades específicas)
   ├── gastos.js              (Depende de: state.js, calculations.js)
   ├── pin.js                 (Depende de: state.js, keys.js)
   └── pwa.js                 (Depende de: state.js)

9. INIT (Inicialización de la app)
   └── init.js                (Depende de: TODOS los anteriores)
```

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

### Regla #4: crypto.js antes de storage-file.js
- `storage-file.js` usa funciones de cifrado de `crypto.js`
- Necesario para el sistema de archivos cifrados

## Variables Globales Principales

Las siguientes variables globales están definidas en `state.js` y son usadas por múltiples módulos:

- `clients` - Array de clientes
- `history` - Array de historial de cobros
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
STORAGE_KEYS.PIN              // 'rn_pin'
STORAGE_KEYS.DATA             // 'rn_data'
STORAGE_KEYS.THEME            // 'rn_theme'
STORAGE_KEYS.LAST_BACKUP      // 'rn_last_backup'
STORAGE_KEYS.BACKUP_DISMISSED // 'rn_backup_dismissed'

IDB.DB_NAME                   // 'RedNetDB'
IDB.STORE                     // 'rn_store'
IDB.KEY                       // 'fileHandle'

ENCRYPTION.VERSION            // 'v1'
```

## Notas de Mantenimiento

- Al agregar un nuevo módulo, identificar sus dependencias
- Agregar el script en la sección apropiada de `index.html`
- Actualizar este documento con las nuevas dependencias
- Si un módulo no tiene dependencias, puede ir en cualquier posición dentro de su sección
- `init.js` DEBE ser el último script cargado
