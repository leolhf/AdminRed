/**
 * state.js — Variables globales de estado.
 * DEBE CARGARSE PRIMERO (después de version.js). Define todo el estado
 * del negocio que usan el resto de los módulos.
 */
const RN = window.RN || {};

RN.state = {
  /** Array de clientes */
  clients: [],
  /** Array de historial de cobros (incluye montoEquipo para pagos/ventas de equipo) */
  history: [],
  /** Array de gastos del negocio */
  gastos: [],
  /** Array de lotes de material compartido */
  inventario: [],
  /** Array de consumo de inventario asignado a clientes */
  asignacionesInventario: [],
  /** Array de inversiones personales */
  investments: [],
  /** Array de planes/paquetes de servicio */
  planes: [],
  /** Array de equipos de red asociados a clientes */
  equiposRed: [],
  /** Array de descuentos puntuales */
  descuentos: [],
  /** Snapshots inmutables de KPIs por mes cerrado */
  snapshots: [],
  /** Configuración del sistema */
  config: {
    tasaUsd: 0,
    /**
     * v5.12.7 — Fecha (ISO timestamp) de la última actualización de la tasa USD.
     * Se registra al guardar la tasa manualmente (Ajustes) o al actualizarla
     * automáticamente (mdiv.pro). Sirve para el aviso de tasa vencida a 24h/72h.
     * null/undefined cuando la tasa nunca se ha actualizado (aviso inmediato).
     */
    fechaTasaUsd: null,
    diasBaseMes: 30,
    mencionarDescuentoRecurrente: true,
    tasaAuto: false,
    nombreNegocio: 'AdminRed',
    telefonoNegocio: '',
    direccionNegocio: '',
    /** Saldo inicial de caja (capital semilla). Fondo calculado automaticamente. */
    fondoInicial: 0,
    /** Datos del proveedor de internet (para el modal de pago de mi servicio) */
    proveedorInternet: '',
    proveedorMonto: 0,
    /** Megas contratados del paquete del proveedor (v5.8.6) */
    proveedorMegas: 0,
    /** Precio por mega (CUP) del paquete del proveedor (v5.8.6) */
    proveedorPrecioMega: 0,
    /** Megas de sobreventa permitidos sobre el paquete del proveedor (v5.8.7, default 5) */
    sobreventaMegas: 5,
    /**
     * v5.11.3 — Porcentaje (0-100) del margen neto que se retiene como ganancia
     * personal y NO computa como recuperación de inversión. Global para todas
     * las inversiones. Solo el (100 - pct) del margen recupera el capital.
     * Default 0 (todo el margen recupera la inversión, comportamiento previo).
     */
    pctPersonalInversion: 0,
    /**
     * v5.12.0 — Porcentaje (default 20) de ganancia aplicado sobre el precio de
     * costo al vender/asignar material de inventario. El precio de venta se
     * pre-llena como costo × (1 + pct/100) y queda editable. Configurable en
     * Ajustes. Controla la ganancia real de cada venta de inventario.
     */
    pctGananciaInventario: 20,
    /**
     * v5.12.9 — Porcentaje (0-100) de la ganancia neta REAL del mes (ingresos
     * totales − gastos totales, excluyendo devoluciones de préstamo y retiros
     * de caja) que se destina como APORTE EXTRA a la recuperación de cada
     * inversión marcada como préstamo externo. Esto permite que la recuperación
     * efectiva refleje no solo lo cobrado a clientes, sino también una parte
     * de la utilidad real del negocio. Default 0 (sin aporte extra).
     * Configurable en Ajustes → "% de ganancia del mes para recuperación".
     */
    pctRecuperacionGananciaMes: 0,
    /**
     * v5.12.4 — Paquete pendiente para el proximo mes. Cuando el usuario hace
     * un cambio en el modal del proveedor y elige "vigente para el proximo mes",
     * se guarda aqui { megas, precioMega, sobreventa, proveedor } y se aplica
     * automaticamente al cerrar el mes actual. Es null cuando no hay cambios
     * pendientes.
     */
    paquetePendiente: null
  },
  /** Handle del archivo de datos vinculado (File System Access API) */
  fileHandle: null,
  /** Flag de cambios sin guardar */
  isDirty: false,
  /** Flag de si el archivo está cifrado */
  fileIsEncrypted: false,
  /** PIN configurado (hash) */
  pinHash: null,
  /** Contador de recibos para numeración auto-incremental */
  reciboCounter: 0,
  /** Mes actual de cobro (YYYY-MM) */
  mesActual: null,
  /** Checkpoints para undo */
  checkpoints: [],
  /** Índice actual en el stack de undo */
  undoIndex: -1
};

// Accesos directos convenientes
RN.clients = () => RN.state.clients;
RN.history_ = () => RN.state.history;
RN.config_ = () => RN.state.config;
