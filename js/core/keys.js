// ═══════════════════════════════════════════════════════════
//  KEYS DE STORAGE - Constantes centralizadas
// ═══════════════════════════════════════════════════════════

// LocalStorage keys
const STORAGE_KEYS = {
  DATA: 'rn_data',
  THEME: 'rn_theme',
  LAST_BACKUP: 'rn_last_backup',
  BACKUP_DISMISSED: 'rn_backup_dismissed',
  // BUG FIX: faltaba la clave PIN — getPIN()/setPIN() en pin.js usaban
  // localStorage.getItem(undefined) y almacenaban bajo la clave literal "undefined",
  // rompiendo completamente el sistema de PIN.
  PIN: 'rn_pin'
};

// IndexedDB
const IDB = {
  DB_NAME: 'RedNetDB',
  VERSION: 2,
  STORE: 'rn_store',
  KEY: 'fileHandle',
  CHECKPOINTS_STORE: 'rn_checkpoints'
};

// Constante de cifrado — usada por crypto.js para identificar la versión
// del formato cifrado. BUG FIX: crypto.js referenciaba ENCRYPTION.VERSION
// pero esta constante no existía en ningún archivo, causando un
// ReferenceError en carga que rompía el módulo de cifrado completo.
const ENCRYPTION = {
  VERSION: 'REDNET-ENC-V1'
};

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { STORAGE_KEYS, IDB, ENCRYPTION };
}
