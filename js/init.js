/**
 * init.js — Inicialización de la app.
 * Depende de TODOS los módulos anteriores. Debe ser el último script clásico.
 */
RN.init = RN.init || {};

RN.init.arrancar = async function () {
  // 1. Tema
  RN.theme.init();

  // 2. Versión en header
  const verEl = document.getElementById('app-version');
  if (verEl) verEl.textContent = APP_VERSION;

  // 3. Config (carga desde STORAGE_KEYS.CONFIG)
  RN.config.cargar();

  // 4. Cargar datos locales (respaldo) — carga el blob combinado de STORAGE_KEYS.DATA
  RN.storageLocal.cargar();

  // 4b. v5.13.16 (BUG-CRITICO): Eliminado el segundo RN.config.cargar().
  // Antes, este paso re-aplicaba STORAGE_KEYS.CONFIG después de cargar el blob
  // de STORAGE_KEYS.DATA. Pero desde v5.13.5 (ISSUE #22 y ISSUE #4) se eliminó
  // la llamada a RN.config.persistir() en config.guardar() y en
  // modal-paquete-proveedor.guardarCambios(), por lo que STORAGE_KEYS.CONFIG
  // dejó de actualizarse al guardar cambios de configuración (tasa, fondo, %,
  // paquete pendiente, etc.). Al re-aplicarla aquí al final, se sobreescribía
  // la config más reciente que venía en STORAGE_KEYS.DATA con la config stale
  // de STORAGE_KEYS.CONFIG, perdiéndose los cambios al reabrir la app.
  // Ahora STORAGE_KEYS.DATA (cargada en el paso 4) es la fuente autoritativa
  // para la configuración, ya que serializar() incluye config: RN.state.config.
  // El paso 3 (RN.config.cargar()) se mantiene como fallback inicial para el
  // caso en que STORAGE_KEYS.DATA no exista todavía (primera ejecución).

  // 4c. v5.10.3: Restaurar el flag de cifrado del archivo ANTES de tocar el handle.
  // Sin esto, al reiniciar fileIsEncrypted=false y guardar sobreescribiría un archivo
  // cifrado con texto plano, corrompiéndolo (parece que se "pierde" la vinculación).
  RN.state.fileIsEncrypted = localStorage.getItem(STORAGE_KEYS.FILE_ENCRYPTED) === 'true';

  // 5. Migración ya aplicada en cargar()

  // 6. Restaurar handle de archivo si existe (recupera de IndexedDB + valida permiso).
  // v5.10.3: NO confiar en actualizarStatus() aquí porque el DOM aún no está renderizado.
  // El estado visual se pinta en el paso 11 (render.todo) y se refresca en el paso 11b.
  await RN.storageFile.restaurarHandle();

  // 7. Datos de ejemplo si está vacío (primer uso)
  if (RN.state.clients.length === 0 && RN.state.planes.length === 0 && !localStorage.getItem('adminred:seeded')) {
    RN.init.datosEjemplo();
    localStorage.setItem('adminred:seeded', '1');
  }

  // 8. Checkpoint inicial
  RN.checkpoint.crear();

  // 9. Tasa automática
  RN.moneda.actualizarTasaAuto();

  // 10. Reloj
  RN.reloj.init();

  // 11. UI: tabs, render
  RN.tabs.init();
  RN.tabs.ir(RN.tabs.actual || 'dashboard');
  RN.render.todo();

  // 10b. v5.10.5: Aviso de cambio de mes — si hay cobros pendientes del mes
  // anterior (clientes que debían pagar el mes pasado y no lo hicieron), avisar
  // al usuario para que revise mora/cobranza. Se ejecuta tras renderizar la UI.
  setTimeout(RN.init.avisoCambioMes, 800);

  // v5.13.19: Aviso de sincronización de mes — si el mes real del reloj del sistema
  // está por delante del mes operativo (RN.state.mesActual), ofrecer al usuario
  // sincronizar al mes real generando snapshots automáticamente para cada mes intermedio.
  // Se ejecuta después del render para que el DOM esté listo y el modal se muestre bien.
  setTimeout(RN.init.avisoSincronizarMes, 1200);

  // 11b. v5.12.7: Aviso de tasa USD vencida — comprueba si pasaron más de 24 h
  // desde la última actualización de la tasa y muestra el botón flotante + indicador.
  setTimeout(function () { if (RN.tasaAviso) RN.tasaAviso.comprobarAlIniciar(); }, 1000);

  // 11b. v5.10.3: Refrescar el estado del archivo vinculado DESPUÉS de renderizar.
  // restaurarHandle() corre en el paso 6, cuando #archivo-status aún no existía,
  // por lo que el "✅ Archivo vinculado" no se pintaba al reiniciar y la UI mostraba
  // "⚠️ Sin archivo vinculado" aunque el handle sí estuviera cargado en memoria.
  // Esto es la causa raíz del bug reportado. Ahora lo pintamos con el DOM listo.
  if (RN.state.fileHandle) {
    RN.storageFile.actualizarStatus();
    // Si el permiso quedó pendiente (sin gesto al inicio), mostrar el banner.
    if (RN.state.fileHandle.queryPermission) {
      RN.state.fileHandle.queryPermission({ mode: 'readwrite' }).then(function (perm) {
        if (perm !== 'granted') {
          RN.storageFile._mostrarBannerPermiso(RN.state.fileHandle.name);
        }
      }).catch(function () { /* ignorar */ });
    }
  }

  // 11c. v5.11.2: Mostrar info del último respaldo automático en Ajustes.
  if (RN.autoBackup && RN.autoBackup.info) {
    RN.autoBackup.info().then(function (info) {
      var el = document.getElementById('autobackup-status');
      if (!el) return;
      if (info) {
        el.innerHTML = '✅ Último respaldo automático: ' + info.fecha +
          ' &middot; ' + info.clientes + ' clientes &middot; ' + info.sizeKB + ' KB (guardado local en este navegador)';
      } else {
        el.innerHTML = 'Sin respaldos automáticos aún. Se guardan solos cada vez que modificas datos.';
      }
    }).catch(function () {});
  }

  // 12. Listeners de búsqueda/filtro
  const sc = document.getElementById('search-clientes');
  // v5.13.7 (UI-5): debounce de 200ms en la busqueda para listas grandes.
  var searchTimerCli;
  if (sc) sc.addEventListener('input', () => { clearTimeout(searchTimerCli); searchTimerCli = setTimeout(() => RN.render.clientes(), 200); });
  const fe = document.getElementById('filter-estado');
  if (fe) fe.addEventListener('change', () => RN.render.clientes());
  const sCo = document.getElementById('search-cobros');
  if (sCo) sCo.addEventListener('input', () => RN.render.cobros());

  // 13. Botones de header
  const btnSave = document.getElementById('btn-save');
  if (btnSave) btnSave.addEventListener('click', () => RN.storageFile.guardarAhora());
  const btnUndo = document.getElementById('btn-undo');
  if (btnUndo) btnUndo.addEventListener('click', () => RN.undo.deshacer());
  const btnTheme = document.getElementById('btn-theme');
  if (btnTheme) btnTheme.addEventListener('click', () => RN.theme.toggle());
  const btnInstall = document.getElementById('btn-install');
  if (btnInstall) btnInstall.addEventListener('click', () => RN.pwa.instalar());
  const btnMenu = document.getElementById('btn-menu');
  if (btnMenu) btnMenu.addEventListener('click', RN.init.menuRapido);

  // v5.13.12: Badge de versión clickeable para forzar la búsqueda/aplicación
  // de actualizaciones de la app (Service Worker).
  const btnVersion = document.getElementById('btn-version');
  if (btnVersion) btnVersion.addEventListener('click', () => RN.pwa.forzarActualizacion());

  // FAB: botón flotante de acción rápida (móvil)
  const fab = document.getElementById('fab-action');
  if (fab) fab.addEventListener('click', () => {
    const v = RN.tabs.actual;
    if (v === 'clientes') RN.modalCliente.abrir();
    else if (v === 'gastos') RN.gastos.abrirNuevo();
    else if (v === 'inversion') RN.inversion.abrirNueva();
    else if (v === 'inventario') RN.inventario.abrirNuevoLote();
    else RN.modalCobro.abrirDesdeCobros();
  });

  // 14. PWA
  RN.pwa.init();

  // 15. PIN (si hay)
  RN.pin.init();

  // 16. Notificaciones periódicas
  setInterval(RN.notify.revisarRecordatorios, 3600000); // cada hora

  // 17. Guardar antes de salir si hay cambios
  window.addEventListener('beforeunload', (e) => {
    if (RN.state.isDirty) {
      RN.storageLocal.persistir();
    }
  });

  console.log(`%c AdminRed (RedNet) v${APP_VERSION} iniciado `, 'background:#2563eb;color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold');
};

/** Menú rápido de acciones frecuentes. */
RN.init.menuRapido = function () {
  const html = `
    <div class="modal-header"><h3>Acciones rápidas</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="flex" style="flex-direction:column;gap:8px">
        <button class="btn" onclick="RN.init._act(()=>RN.mora.listar())">📋 Ver clientes con mora</button>
        <button class="btn" onclick="RN.init._act(()=>RN.historialMensual.ver())">📅 Historial mensual</button>
        <button class="btn" onclick="RN.init._act(()=>RN.prediccion.ver())">🔮 Predicción de ingresos</button>
        <button class="btn" onclick="RN.init._act(()=>RN.estadisticas.ver())">📊 Estadísticas del negocio</button>
        <button class="btn" onclick="RN.init._act(()=>RN.whatsapp.enviarMasivo())">💬 Recordatorio masivo WhatsApp</button>
        <button class="btn" onclick="RN.init._act(()=>RN.historial.exportCSV())">⬇️ Exportar historial CSV</button>
        <button class="btn" onclick="RN.init._act(()=>RN.export.exportCSVClientes())">⬇️ Exportar clientes CSV</button>
      </div>
    </div>
    <div class="modal-footer"><button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button></div>`;
  RN.uiComponents.modal(html);
};

RN.init._act = function (fn) {
  RN.uiComponents.cerrarModal();
  setTimeout(fn, 50);
};

/**
 * v5.10.5: Aviso de cambio de mes.
 * Detecta clientes activos que debían pagar el MES ANTERIOR (mesInicio <= mesAnterior)
 * y no tienen cobro de servicio registrado en ese mes. Si los hay, muestra un toast
 * informativo para que el usuario revise la mora/cobranza del nuevo mes.
 * Solo se muestra una vez por sesión (guarda flag en RN.state._avisoMesMostrado).
 */
RN.init.avisoCambioMes = function () {
  if (RN.state._avisoMesMostrado) return;
  RN.state._avisoMesMostrado = true;
  try {
    var mes = RN.calc.mesActualStr();
    var mesAnt = RN.calc.mesAnterior(mes);
    // Clientes que ya debían estar activos el mes anterior (mesInicio <= mesAnt)
    // y no registran cobro de servicio en el mes anterior.
    var pendientesAnt = RN.calc.clientesActivos().filter(function (c) {
      var inicio = RN.calc.mesInicioCliente(c);
      if (inicio > mesAnt) return false; // empezó este mes o después
      var pago = RN.state.history.some(function (h) {
        return h.clienteId === c.id && h.tipo === 'servicio' && h.mes === mesAnt;
      });
      return !pago;
    });
    if (pendientesAnt.length > 0) {
      var msg = pendientesAnt.length + ' cliente' + (pendientesAnt.length === 1 ? '' : 's') +
        ' no pagó el mes pasado (' + mesAnt + '). Revisa Mora y Cobranza.';
      RN.notifyUI.toast(msg, 'warn', 9000);
    }
  } catch (e) {
    console.warn('[avisoCambioMes]', e);
  }
};

/**
 * v5.13.19: Aviso de sincronización de mes operativo.
 * Detecta si el mes real (reloj del sistema) está por delante del mes operativo
 * (RN.state.mesActual). Si hay uno o más meses de diferencia, muestra un modal
 * ofreciendo sincronizar: cierra cada mes intermedio generando un snapshot
 * automático, anulando descuentos puntuales pendientes, aplicando paquetePendiente
 * y avanzando RN.state.mesActual hasta el mes real.
 * También ofrece ignorar (mantener el mes operativo actual).
 * Solo se muestra una vez por sesión (flag _avisoSyncMesMostrado).
 */
RN.init.avisoSincronizarMes = function () {
  if (RN.state._avisoSyncMesMostrado) return;
  RN.state._avisoSyncMesMostrado = true;
  try {
    var mesOper = RN.calc.mesActualStr();
    var mesReal = RN.calc.mesRealStr();
    // Si el mes operativo ya coincide o está por delante del real, no hacer nada
    var diff = RN.calc.mesesEntre(mesOper, mesReal);
    if (diff <= 0) return;

    // Construir lista de meses a cerrar (desde mesOper hasta mesReal-1)
    // Cada mes que se cierra genera un snapshot y avanza al siguiente
    var mesesCerrar = [];
    var m = mesOper;
    while (m !== mesReal) {
      mesesCerrar.push(m);
      m = RN.calc.mesSiguiente(m);
    }

    // Construir mensaje con resumen de cada mes a cerrar
    var resumenMeses = mesesCerrar.map(function (mes) {
      var snap = RN.calc.generarSnapshot(mes);
      return '• ' + RN.calc.mesTexto(mes) + ': Ingresos ' + RN.calc.formatCUP(snap.ingresos) +
        ' · Gastos ' + RN.calc.formatCUP(snap.gastos) +
        ' · Cobranza ' + snap.clientesPagaron + '/' + snap.clientesTotal;
    }).join('\n');

    var titulo = 'Sincronizar mes operativo';
    var cuerpo = 'El mes operativo actual es <strong>' + RN.calc.mesTexto(mesOper) +
      '</strong>, pero ya estamos en <strong>' + RN.calc.mesTexto(mesReal) +
      '</strong> (' + diff + ' mes' + (diff === 1 ? '' : 'es') + ' de diferencia).\n\n' +
      'Al sincronizar se cerrará' + (diff === 1 ? '' : 'n') + ' ' + diff +
      ' mes' + (diff === 1 ? '' : 'es') + ' generando snapshot' + (diff === 1 ? '' : 's') +
      ' automático' + (diff === 1 ? '' : 's') + ':\n\n' + resumenMeses +
      '\n\n✅ Cada mes se cerrará con su snapshot, los descuentos puntuales no aplicados se anularán y el mes operativo avanzará hasta ' + RN.calc.mesTexto(mesReal) + '.';

    var html = '<div class="modal-header">' +
      '<h3>📅 ' + titulo + '</h3>' +
      '<button class="close" onclick="RN.init._cancelarSyncMes()">×</button>' +
      '</div>' +
      '<div class="modal-body">' +
      '<p style="white-space:pre-line">' + cuerpo + '</p>' +
      '</div>' +
      '<div class="modal-footer">' +
      '<button class="btn ghost" onclick="RN.init._cancelarSyncMes()">Mantener ' + RN.calc.mesTexto(mesOper) + '</button>' +
      '<button class="btn success" onclick="RN.init._confirmarSyncMes()">✅ Sincronizar a ' + RN.calc.mesTexto(mesReal) + '</button>' +
      '</div>';

    // Guardar contexto para los handlers
    RN.init._syncMesContexto = { mesesCerrar: mesesCerrar, mesOper: mesOper, mesReal: mesReal };
    RN.uiComponents.modal(html);
  } catch (e) {
    console.warn('[avisoSincronizarMes]', e);
  }
};

/**
 * v5.13.19: Cancelar la sincronización — cierra el modal y mantiene el mes operativo actual.
 */
RN.init._cancelarSyncMes = function () {
  RN.uiComponents.cerrarModal();
  RN.notifyUI.toast('Mes operativo mantenido en ' + RN.calc.mesTexto(RN.calc.mesActualStr()) + '. Recuerda cerrar el mes manualmente cuando estés listo.', 'info', 6000);
};

/**
 * v5.13.19: Confirmar la sincronización — cierra cada mes intermedio generando snapshots.
 * Replica la lógica de RN.monthReset.confirmar() pero sin diálogo de confirmación por cada mes:
 * 1. Para cada mes en mesesCerrar: genera snapshot, lo guarda en RN.state.snapshots,
 *    anula descuentos puntuales pendientes del mes, avanza RN.state.mesActual.
 * 2. Aplica paquetePendiente si existe (solo una vez, al final del primer cierre).
 * 3. Persiste config + data, re-renderiza, muestra toast de éxito.
 */
RN.init._confirmarSyncMes = function () {
  var ctx = RN.init._syncMesContexto;
  if (!ctx || !ctx.mesesCerrar || ctx.mesesCerrar.length === 0) {
    RN.uiComponents.cerrarModal();
    return;
  }

  var snapshotsCreados = 0;
  var paqueteAplicadoMsg = '';

  ctx.mesesCerrar.forEach(function (mes) {
    // 1. Generar snapshot del mes
    var snapshot = RN.calc.generarSnapshot(mes);
    RN.state.snapshots.push(snapshot);
    snapshotsCreados++;

    // 2. Anular descuentos puntuales no aplicados del mes (no soloPago)
    RN.state.descuentos.forEach(function (d) {
      if (d.mes === mes && d.estado === 'pendiente' && !d.soloPago) d.estado = 'anulado';
    });

    // 3. Avanzar el mes actual al siguiente
    RN.state.mesActual = RN.calc.mesSiguiente(mes);

    // 4. Aplicar paquetePendiente si existe (solo la primera vez que se encuentre)
    if (RN.state.config.paquetePendiente && !paqueteAplicadoMsg) {
      var pp = RN.state.config.paquetePendiente;
      RN.state.config.proveedorInternet = pp.proveedor || RN.state.config.proveedorInternet;
      RN.state.config.proveedorMegas = pp.megas;
      RN.state.config.proveedorPrecioMega = pp.precioMega;
      RN.state.config.proveedorMonto = +((pp.megas || 0) * (pp.precioMega || 0)).toFixed(2);
      RN.state.config.sobreventaMegas = pp.sobreventa;
      RN.state.config.paquetePendiente = null;
      paqueteAplicadoMsg = ' Paquete actualizado: ' + pp.megas + 'M × ' + pp.precioMega + ' CUP/M.';
    }
  });

  // Persistir y re-renderizar
  RN.config.persistir();
  RN.storageLocal.guardar();
  RN.render.todo();

  // Cerrar el modal y mostrar toast de éxito
  RN.uiComponents.cerrarModal();
  var msg = 'Mes sincronizado a ' + RN.calc.mesTexto(RN.state.mesActual) +
    '. ' + snapshotsCreados + ' snapshot' + (snapshotsCreados === 1 ? '' : 's') +
    ' generado' + (snapshotsCreados === 1 ? '' : 's') + '.' + paqueteAplicadoMsg;
  RN.notifyUI.toast(msg, 'success', 8000);
  RN.notify.local('Mes sincronizado', 'Mes operativo actualizado a ' + RN.calc.mesTexto(RN.state.mesActual));

  // Limpiar contexto
  RN.init._syncMesContexto = null;
};

/** Crea datos de ejemplo para primer uso. */
RN.init.datosEjemplo = function () {
  // Planes
  RN.state.planes = [
    { id: 'plan-hogar10', nombre: 'Hogar 10M', megas: 10, precio: 500 },
    { id: 'plan-hogar25', nombre: 'Hogar 25M', megas: 25, precio: 800 },
    { id: 'plan-negocio50', nombre: 'Negocio 50M', megas: 50, precio: 1500 }
  ];
  // Clientes
  RN.state.clients = [
    { id: 'cli-1', nombre: 'Juan Pérez', telefono: '53123456', direccion: 'Calle 10 #25', planId: 'plan-hogar10', precio: 500, diaPago: 5, descuentoRecurrente: 0, deudaEquipo: 0, activo: true, createdAt: new Date().toISOString() },
    { id: 'cli-2', nombre: 'María González', telefono: '53987654', direccion: 'Av. 3 #100', planId: 'plan-hogar25', precio: 800, diaPago: 10, descuentoRecurrente: 50, deudaEquipo: 300, deudaEquipoOriginal: 600, cuotaEquipo: 100, activo: true, createdAt: new Date().toISOString() },
    { id: 'cli-3', nombre: 'Carlos Romero', telefono: '53445566', direccion: 'Calle 8 #50', planId: 'plan-negocio50', precio: 1500, diaPago: 15, descuentoRecurrente: 0, deudaEquipo: 0, activo: true, createdAt: new Date().toISOString() }
  ];
  // Inventario
  RN.state.inventario = [
    { id: 'lot-1', material: 'Cable UTP cat6', cantidad: 100, notas: 'Proveedor local', fecha: new Date().toISOString() },
    { id: 'lot-2', material: 'Conectores RJ45', cantidad: 50, notas: '', fecha: new Date().toISOString() }
  ];
  // Config
  RN.state.config.tasaUsd = 320;
  RN.state.config.diasBaseMes = 30;
  RN.state.config.mencionarDescuentoRecurrente = true;
  RN.state.mesActual = RN.calc.mesActualStr();
  RN.config.persistir();
  RN.storageLocal.persistir();
};

// Arranque automático cuando el DOM está listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', RN.init.arrancar);
} else {
  RN.init.arrancar();
}
