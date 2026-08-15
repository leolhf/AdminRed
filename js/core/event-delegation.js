// event-delegation.js
// Sistema de event delegation para manejar eventos de UI de forma centralizada
// Elimina la necesidad de onclick inline y mejora la performance

const EventDelegation = {
  init() {
    // Delegación de eventos para navegación sidebar
    document.addEventListener('click', (e) => {
      // Sidebar tabs
      const sidebarTab = e.target.closest('[data-sidebar-tab]');
      if (sidebarTab) {
        const tab = sidebarTab.dataset.sidebarTab;
        if (typeof switchSidebarTab === 'function') {
          switchSidebarTab(tab);
        }
      }

      // Main tabs
      const mainTab = e.target.closest('[data-main-tab]');
      if (mainTab) {
        const tab = mainTab.dataset.mainTab;
        if (typeof switchMainTab === 'function') {
          switchMainTab(tab);
        }
      }

      // Sub tabs
      const subTab = e.target.closest('[data-tab]');
      if (subTab) {
        const tab = subTab.dataset.tab;
        if (typeof switchTab === 'function') {
          switchTab(tab);
        }
      }

      // Section headers (toggle)
      const sectionHeader = e.target.closest('.section-header');
      if (sectionHeader) {
        if (typeof toggleSection === 'function') {
          toggleSection(sectionHeader);
        }
      }

      // Evolution range buttons
      const evoRangoBtn = e.target.closest('[data-rango]');
      if (evoRangoBtn) {
        const rango = parseInt(evoRangoBtn.dataset.rango);
        if (typeof evoCambiarRango === 'function') {
          evoCambiarRango(rango);
        }
      }

      // Botones con data-action
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        const action = actionBtn.dataset.action;
        this.handleAction(action, e);
      }
    });

    // Delegación para inputs
    document.addEventListener('input', (e) => {
      if (e.target.id === 'search-input') {
        if (typeof renderTable2 === 'function') renderTable2();
        if (typeof toggleSearchClear === 'function') toggleSearchClear();
      }
    });
  },

  handleAction(action, event) {
    const actions = {
      'toggle-theme': () => typeof toggleTheme === 'function' && toggleTheme(),
      'toggle-settings': () => typeof toggleSettingsMenu === 'function' && toggleSettingsMenu(),
      'toggle-file-menu': () => typeof toggleFileMenu === 'function' && toggleFileMenu(),
      'install-pwa': () => typeof installPWA === 'function' && installPWA(),
      'sync-manual': () => typeof syncManual === 'function' && syncManual(),
      'request-notif': () => typeof requestNotifPermission === 'function' && requestNotifPermission(),
      'export-backup': () => typeof exportBackup === 'function' && exportBackup(),
      'import-backup': () => typeof importBackup === 'function' && importBackup(),
      'export-csv-clientes': () => typeof exportClientesCSV === 'function' && exportClientesCSV(),
      'open-checkpoints': () => typeof openCheckpointsModal === 'function' && openCheckpointsModal(),
      'undo-change': () => typeof deshacerUltimoCambio === 'function' && deshacerUltimoCambio(),
      'reset-app': () => typeof openResetAppModal === 'function' && openResetAppModal(),
      'link-new-file': () => typeof linkNewFile === 'function' && linkNewFile(),
      'open-existing-file': () => typeof openExistingFile === 'function' && openExistingFile(),
      'save-file': () => typeof saveToFile === 'function' && saveToFile(),
      'unlink-file': () => typeof unlinkFile === 'function' && unlinkFile(),
      'link-macrodroid': () => typeof linkMacrodroidFile === 'function' && linkMacrodroidFile(),
      'mark-paquete-paid': () => typeof marcarPaquetePagado === 'function' && marcarPaquetePagado(),
      'add-client': () => typeof openAddModal === 'function' && openAddModal(),
      'clear-search': () => {
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        if (typeof renderTable2 === 'function') renderTable2();
        if (typeof toggleSearchClear === 'function') toggleSearchClear();
      },
      'manage-planes': () => typeof openPlanesModal === 'function' && openPlanesModal(),
      'add-gasto': () => typeof openGastoModal === 'function' && openGastoModal(),
      'add-inventario': () => typeof openInventarioModal === 'function' && openInventarioModal(),
      'export-csv-cobros': () => typeof exportCSV === 'function' && exportCSV(),
      'clear-history': () => typeof clearHistory === 'function' && clearHistory(),
      'add-lote-descuento': () => typeof abrirModalLoteDescuento === 'function' && abrirModalLoteDescuento(),
      'export-descuentos-csv': () => typeof exportDescuentosCSV === 'function' && exportDescuentosCSV(),
      'add-equipo': () => typeof openEquipoModal === 'function' && openEquipoModal(),
      'decline-restore': () => typeof declineRestore === 'function' && declineRestore(),
      'confirm-restore': () => typeof confirmRestore === 'function' && confirmRestore(),
      'close-checkpoints': () => typeof closeCheckpointsModal === 'function' && closeCheckpointsModal(),
      'add-inversion': () => typeof abrirModalNuevaInversion === 'function' && abrirModalNuevaInversion(),
    };

    if (actions[action]) {
      actions[action]();
    } else {
      console.warn(`Acción no reconocida: ${action}`);
    }
  }
};

// Inicializar cuando el DOM esté listo
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => EventDelegation.init());
  } else {
    EventDelegation.init();
  }
}