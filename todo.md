# TODO — Revisión de Gastos (v5.7.7)

## Análisis de tipos de gasto
- [x] Analizar categorías: operativo, lote, crecimiento, paquete, inversión, rebaja
- [x] Identificar problemas: paquete redundante, crecimiento confuso, edición de gastos del sistema, sin agrupación, parseInt truncando decimales, sin validación de fecha

## Implementación de mejoras
- [x] FIX 1: Quitar "paquete" del select de tipos de gasto (se gestiona desde modal dedicado)
- [x] FIX 2: Mejorar etiquetas: 🔧 Operativo, 📡 Crecimiento de red, 📦 Por lote
- [x] FIX 3: Resumen financiero con etiquetas descriptivas (paréntesis aclaratorios)
- [x] FIX 4: Bloquear edición de gastos del sistema (inversion, rebaja, paquete) — icono 🔒
- [x] FIX 5: Agrupar gastos por categoría en la lista con subtotales y badges de color
- [x] FIX 6: Cambiar parseInt a parseFloat en saveGasto (preserva decimales)
- [x] FIX 7: Validar que la fecha no esté vacía
- [x] FIX 8: Mejorar diseño visual — badges de categoría con color, total general
- [x] Bump version a 5.7.7
- [x] Actualizar CHANGELOG
- [x] Probar en navegador: agrupación, bloqueo edición, decimales, modal sin paquete
- [x] Tomar screenshots
- [x] Entregar al usuario
