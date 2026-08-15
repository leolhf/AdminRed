// logger.js
// Sistema de logging de errores para debugging offline
// Depende de: state.js (config), storage-local.js (save) opcional

const Logger = {
  errors: [],
  warnings: [],
  maxEntries: 100, // Máximo de entradas a mantener
  
  log(type, message, data = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      type: type, // 'error', 'warning', 'info'
      message: message,
      data: data,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      url: typeof window !== 'undefined' ? window.location.href : null
    };

    if (type === 'error') {
      this.errors.push(entry);
      console.error(`[Logger ERROR] ${message}`, data || '');
      
      // Mantener solo los últimos maxEntries errores
      if (this.errors.length > this.maxEntries) {
        this.errors.shift();
      }
    } else if (type === 'warning') {
      this.warnings.push(entry);
      console.warn(`[Logger WARNING] ${message}`, data || '');
      
      if (this.warnings.length > this.maxEntries) {
        this.warnings.shift();
      }
    } else {
      console.log(`[Logger INFO] ${message}`, data || '');
    }

    // Opcional: persistir en localStorage para diagnóstico offline
    try {
      if (typeof localStorage !== 'undefined') {
        const logKey = 'rn_error_log';
        const currentLog = JSON.parse(localStorage.getItem(logKey) || '[]');
        currentLog.push(entry);
        
        // Mantener solo los últimos 50 entradas en localStorage
        if (currentLog.length > 50) {
          currentLog.shift();
        }
        
        localStorage.setItem(logKey, JSON.stringify(currentLog));
      }
    } catch (e) {
      // Silenciar errores de localStorage (puede estar lleno o deshabilitado)
    }
  },

  error(message, data = null) {
    this.log('error', message, data);
  },

  warning(message, data = null) {
    this.log('warning', message, data);
  },

  info(message, data = null) {
    this.log('info', message, data);
  },

  // Capturar errores globales no manejados
  setupGlobalErrorHandler() {
    if (typeof window !== 'undefined') {
      window.addEventListener('error', (event) => {
        this.error('Error global no manejado', {
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          stack: event.error?.stack
        });
      });

      window.addEventListener('unhandledrejection', (event) => {
        this.error('Promise rejection no manejada', {
          reason: event.reason,
          promise: event.promise
        });
      });
    }
  },

  // Obtener resumen de errores
  getErrorSummary() {
    return {
      totalErrors: this.errors.length,
      totalWarnings: this.warnings.length,
      recentErrors: this.errors.slice(-10), // Últimos 10 errores
      recentWarnings: this.warnings.slice(-5) // Últimas 5 advertencias
    };
  },

  // Limpiar logs
  clear() {
    this.errors = [];
    this.warnings = [];
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('rn_error_log');
      }
    } catch (e) {
      // Silenciar errores de localStorage
    }
    this.info('Logs limpiados');
  },

  // Exportar logs para diagnóstico
  exportLogs() {
    const logs = {
      errors: this.errors,
      warnings: this.warnings,
      summary: this.getErrorSummary(),
      exportedAt: new Date().toISOString()
    };
    
    return JSON.stringify(logs, null, 2);
  }
};

// Configurar manejador global de errores cuando esté disponible
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => Logger.setupGlobalErrorHandler());
  } else {
    Logger.setupGlobalErrorHandler();
  }
}