# RedNet (AdminRed)

App web para administrar un negocio de servicio de internet compartido: clientes, cobros mensuales, mora, deuda de equipo/inventario, gastos, estadísticas y recordatorios push. Es una PWA de JavaScript vanilla (sin build, sin dependencias de npm en el frontend) pensada para instalarse en el teléfono y usarse offline.

**Versión actual:** ver `js/version.js` (`APP_VERSION`).

## Instalación / uso

No requiere build ni instalación de paquetes para correr el frontend.

1. Clona o descarga el repo.
2. Sirve la carpeta con cualquier servidor estático (no abras `index.html` con `file://` directamente, porque el Service Worker y algunas APIs necesitan `http(s)://`):
   ```bash
   npx serve .
   # o
   python3 -m http.server 8080
   ```
3. Abre la URL local en el navegador. Desde ahí puedes instalarla como PWA (ícono "Instalar app" / "Agregar a pantalla de inicio").

También está publicada en GitHub Pages y empaquetada como app Android (TWA) vía PWABuilder — ver la sección **Notificaciones push** más abajo para cómo se generan los recordatorios cuando la app está cerrada.

### Primer uso
- Al abrir por primera vez se pide crear/vincular un archivo de datos (con opción de cifrado por PIN, ver `js/core/crypto.js`).
- Los datos viven en ese archivo (y en respaldo en `localStorage`/IndexedDB) — no hay backend propio para los datos del negocio.

### Script de despliegue por Termux
Si trabajas desde Android con Termux, el flujo típico es un script `actualizar` (`~/actualizar-adminred.sh`) que hace `git pull`/`push` sobre la copia local del repo. Ajusta las rutas a tu entorno.

## Arquitectura

Vanilla JS modular, sin framework ni bundler. El **orden de carga de los `<script>` en `index.html` es crítico** — está documentado en detalle en [`js/DEPENDENCIAS.md`](js/DEPENDENCIAS.md), léelo antes de mover o agregar scripts.

```
js/
  core/           Estado global, config, cálculos, cifrado, checkpoints, undo, validación, migraciones
    models/       Modelo de inversión/deuda de equipo (investment.js)
  storage/        Persistencia: localStorage, archivo (File System Access API), export
  ui/             Render de tablas/tarjetas, temas, pestañas, edición inline
  clientes/       Alta/edición/borrado de clientes, historial por cliente
  cobros/         Cobro mensual, mora, inversión/deuda de equipo, venta de inventario, cierre de mes
  reportes/       Historial, tendencias, predicción, estadísticas, export a MacroDroid
  notificaciones/ Notificaciones locales y envío de recordatorio por WhatsApp
  red/            Equipos de red asociados a clientes
  firebase/       Sincronización a Firestore + FCM para push con la app cerrada
scripts/          Script Node (fuera del frontend) que dispara los recordatorios push vía GitHub Actions
.github/workflows/ Cron de GitHub Actions que corre scripts/enviar-recordatorios.js
icons/            Íconos PWA (192/512, normal y maskable)
```

### Conceptos clave del dominio
- **Estado del cliente** (`getStatus` en `calculations.js`): `ok` / `warn` / `due` / `paid`, según día de pago y si tiene mora.
- **Mora**: meses de atraso en el pago del servicio mensual.
- **Deuda de equipo**: saldo pendiente por un equipo vendido a plazos a un cliente; se cobra junto con el servicio mensual (`cuotaEquipo`) hasta saldarse.
- **Recuperación de inversión**: seguimiento de cuánto se ha recuperado de lo invertido en equipos/inventario, con proyección de fecha de cierre.

## Cómo agregar una nueva funcionalidad

1. Decide en qué carpeta encaja (o si necesitas una nueva bajo `js/`).
2. Si el módulo usa funciones de otro (`state.js`, `calculations.js`, `core/models/investment.js`, etc.), agrégalo al `<script>` de `index.html` **después** de sus dependencias.
3. Actualiza `js/DEPENDENCIAS.md` con el módulo nuevo y sus dependencias.
4. Si el cambio toca el modelo de datos guardado (nuevos campos en cliente, historial, config), revisa `js/core/migration.js` para migrar datos existentes sin romper archivos ya guardados.
5. Sube el número en `js/version.js` para invalidar la caché del Service Worker (`sw.js`).

## Notificaciones push (app cerrada)

Usa Firebase (Firestore + Cloud Messaging) para sincronizar datos mínimos de clientes (nombre, día de pago, monto) y un cron de **GitHub Actions** (no una Cloud Function de pago) que corre `scripts/enviar-recordatorios.js` cada hora (`.github/workflows/recordatorios.yml`) para enviar los recordatorios. Requiere el secreto `FIREBASE_SERVICE_ACCOUNT` configurado en GitHub Actions.

## Troubleshooting común

- **"La app no carga / pantalla en blanco"**: revisa la consola del navegador — casi siempre es un script cargado fuera de orden. Verifica contra `js/DEPENDENCIAS.md`.
- **"Los cambios no se ven tras actualizar el código"**: sube `APP_VERSION` en `js/version.js` para forzar la invalidación de caché del Service Worker, o desregistra el Service Worker manualmente desde DevTools.
- **"El archivo de datos no abre / pide PIN y falla"**: el archivo está cifrado con `core/crypto.js`; si se perdió el PIN no hay forma de recuperar el contenido (es cifrado real, no ofuscación).
- **"Las notificaciones push no llegan con la app cerrada"**: revisa que el cron de `.github/workflows/recordatorios.yml` esté corriendo (pestaña Actions del repo) y que el secreto `FIREBASE_SERVICE_ACCOUNT` siga vigente.
- **"Un cliente muestra datos de deuda de equipo raros tras editar"**: revisa `getDeudaEquipoCliente`/`getCuotaEquipoCliente` en `core/models/investment.js` — ambos exigen `deudaEquipo > 0`, no solo que sea `number`, para evitar cobrar cuotas de deudas ya saldadas.

## Estado del proyecto

No hay tests automatizados ni pipeline de CI configurados — los cambios se prueban manualmente antes de subir. Ver `js/DEPENDENCIAS.md` para el detalle técnico de módulos.
