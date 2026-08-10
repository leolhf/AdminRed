# TODO — Sistema de Descuentos + WhatsApp (v5.8.0)

## Fase 1 — Núcleo de datos ✅
- [x] state.js: colección `descuentos[]`, config defaults
- [x] storage-local.js: persistir `descuentos`
- [x] migration.js: `migrarDescuentosPuntuales()`
- [x] calculations.js: `descuentosPendientesCliente`, `calcularDescuentoTotal`, integrar en `precioNetoCliente` y `montoTotalACobrar`
- [x] descuentos.js: módulo completo (crear/eliminar/marcar/revertir, sub-panel cobro, lote)

## Fase 2 — Cobro con descuento puntual ✅
- [x] modal-cobro.js openCobroModal: usar `calcularDescuentoTotal`, init sub-panel
- [x] modal-cobro.js registrarCobro: persistir + marcar + guardar `descuentoAplicado` objeto
- [x] modal-cobro.js eliminarCobro: llamar `revertirDescuentosDeCobro(h.hid)`
- [x] index.html: panel HTML `cobro-descuentos-panel` dentro modal-cobro
- [x] index.html: modal HTML `modal-lote-descuento` + botón FAB "Descuento lote"
- [x] index.html: tag `<script src="./js/cobros/descuentos.js">`
- [x] recibo.js: mostrar desglose de descuentos (recurrente + puntuales), compat número/objeto

## Fase 3 — WhatsApp ✅
- [x] wa-templates.js: markers `{descuentoLinea}`, `{descuentoTotal}`, `{precioBase}`, `{precioNeto}`, `{motivoDescuento}`, `{montoRecibido}`, `{reciboNum}` + plantilla `receipt`
- [x] whatsapp.js: `buildDescuentoLinea()` + `_buildDescuentoExtra()` + inyectar en `generateReminderMessage` + `generateReceiptMessage` + `sendWhatsAppReceipt`
- [x] index.html: quitar `readonly` de `wa-confirm-mensaje`
- [x] modal-cobro.js: ofrecer enviar comprobante WhatsApp tras cobro

## Fase 4 — Gestión y reportes ✅
- [x] Crear `js/reportes/descuentos-view.js` (lista, filtros, exportar, resumen)
- [x] index.html: sub-tab "🎁 Descuentos" + tab-content con filtros
- [x] tabs.js: activar sub-tab descuentos + render call
- [x] render.js: llamar `renderDescuentosView` en render()
- [x] month-reset.js: llamar `anularDescuentosNoAplicadosMes(mes)` al cerrar mes

## Fase 5 — Accesos rápidos ✅
- [x] render.js: badge "🎁 N desc. puntual(es)" en renderTable1 y renderTable2

## Fase 6 — Pulido
- [ ] DEPENDENCIAS.md: documentar descuentos.js
- [ ] version.js → 5.8.0
- [ ] CHANGELOG.md: entrada v5.8.0
- [ ] node --check todos los JS modificados
- [ ] Verificar en navegador
