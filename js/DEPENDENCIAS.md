# DEPENDENCIAS.md — Orden de carga de scripts

Al no usar bundler, el orden de los `<script>` en `index.html` es **crítico**.
Un módulo que use funciones de otro debe cargarse **después** de él.

## Orden general

### 1. CORE
1. `js/version.js` — sin dependencias, carga primero
2. `js/core/state.js` — define variables globales (RN.state). **Debe ser el primero de core**
3. `js/core/keys.js` — constantes de storage (antes de cualquier módulo que use localStorage/IndexedDB)
4. `js/core/config.js` — configuración
5. `js/core/crypto.js` — cifrado AES-GCM
6. `js/core/calculations.js` — cálculos de negocio (antes de render.js)
7. `js/core/moneda.js` — doble moneda
8. `js/reset-app.js` — reseteo
9. `js/core/models/investment.js` — modelo de deuda de equipo (antes de render.js, inversion.js, migration.js)
10. `js/core/migration.js` — migraciones
11. `js/core/checkpoint.js` — checkpoints (antes de undo.js)
12. `js/core/undo.js` — deshacer/rehacer
13. `js/core/validacion.js` — validación de integridad

### 2. STORAGE
14. `js/storage/storage-local.js` — persistencia localStorage
15. `js/storage/storage-file.js` — File System Access API + cifrado
16. `js/storage/export.js` — export/import respaldos, CSV
16b. `js/storage/autobackup.js` — respaldo automático en IndexedDB (v5.11.2)

### 3. UI
17. `js/ui/theme.js` — temas
18. `js/ui/notify-ui.js` — toasts
19. `js/ui/reloj.js` — reloj
20. `js/ui/tabs.js` — navegación por pestañas
21. `js/ui/render.js` — render principal (usa calculations.js, investment.js)
22. `js/ui/inline-edit.js` — edición inline
23. `js/ui/ui-components.js` — modal, confirm, prompt

### 4. CLIENTES
24. `js/clientes/modal-cliente.js` — CRUD clientes
25. `js/clientes/confirm-delete.js` — confirmación borrado
26. `js/clientes/client-history.js` — historial por cliente

### 5. COBROS
27. `js/cobros/modal-cobro.js` — registro de cobro
28. `js/cobros/mora.js` — mora
29. `js/cobros/inversion.js` — inversión personal (usa investment.js)
30. `js/cobros/inventario.js` — venta/asignación de inventario
31. `js/cobros/descuentos.js` — descuentos puntuales
32. `js/cobros/month-reset.js` — cierre de mes

### 6. REPORTES
33. `js/reportes/historial.js`
34. `js/reportes/historial-mensual.js`
35. `js/reportes/tendencia.js`
36. `js/reportes/prediccion.js`
37. `js/reportes/estadisticas.js`
38. `js/reportes/reporte-mensual.js`
39. `js/reportes/recibo.js`
40. `js/reportes/calendario.js`
41. `js/reportes/salud.js`
42. `js/reportes/descuentos-view.js`

### 7. NOTIFICACIONES
43. `js/notificaciones/notifications.js`
44. `js/notificaciones/whatsapp.js` (usa wa-templates.js)
45. `js/notificaciones/wa-templates.js`

### 8. OTROS
46. `js/red/equipos-red.js`
47. `js/paquete/modal-paquete.js`
48. `js/paquete/modal-paquete-proveedor.js` — pago al proveedor (megas × precio/mega)
49. `js/gastos.js`
50. `js/pin.js` (usa crypto.js)
51. `js/pwa.js`

### 9. INIT
52. `js/init.js` — **debe ser el último** (depende de todos los anteriores)

## Reglas explícitas

- `version.js` carga antes que todo, incluido `sw.js`.
- `state.js` debe cargarse primero dentro de core: define `RN.state`.
- `keys.js` antes de cualquier módulo que use `localStorage`/`IndexedDB`.
- `calculations.js` antes de `render.js`.
- `core/models/investment.js` antes de `render.js`, `inversion.js` y `migration.js`.
- `checkpoint.js` antes de `undo.js`.
- `init.js` debe ser el último script clásico cargado.

## Cómo agregar un nuevo módulo

1. Decidir en qué carpeta encaja (o si se necesita una nueva bajo `js/`).
2. Si el módulo usa funciones de otro, agregarlo en `index.html` **después** de sus dependencias.
3. Actualizar este archivo (`DEPENDENCIAS.md`) con el módulo nuevo y sus dependencias.
4. Si el cambio toca el modelo de datos guardado, revisar `js/core/migration.js`.
5. Subir `APP_VERSION` en `js/version.js` para invalidar la caché del Service Worker.
