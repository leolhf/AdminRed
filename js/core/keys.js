// ═══════════════════════════════════════════════════════════
//  KEYS DE STORAGE - Constantes centralizadas
// ═══════════════════════════════════════════════════════════

// LocalStorage keys
const STORAGE_KEYS = {
  PIN: 'rn_pin',
  DATA: 'rn_data',
  THEME: 'rn_theme',
  LAST_BACKUP: 'rn_last_backup',
  BACKUP_DISMISSED: 'rn_backup_dismissed'
};

// IndexedDB
const IDB = {
  DB_NAME: 'RedNetDB',
  VERSION: 1,
  STORE: 'rn_store',
  KEY: 'fileHandle'
};

// Cifrado
const ENCRYPTION = {
  VERSION: 'v1'
};

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STORAGE_KEYS, IDB, ENCRYPTION };
}
