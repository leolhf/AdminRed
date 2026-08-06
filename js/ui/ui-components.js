// ui-components.js
// Maneja los nuevos componentes UI: menú settings, menú archivo, centro de notificaciones,
// secciones colapsables, FAB de acciones rápidas, sidebar y sub-tabs.
// Depende de: notify-ui.js (notify)

// ═══════════════════════════════════════════════════════════
//  SETTINGS MENU (menú hamburguesa)
// ═══════════════════════════════════════════════════════════
function toggleSettingsMenu() {
  const menu = document.getElementById('settings-menu');
  if(!menu) return;
  menu.classList.toggle('open');
}

function closeSettingsMenu() {
  const menu = document.getElementById('settings-menu');
  if(menu) menu.classList.remove('open');
}

// Cerrar menú al hacer clic fuera
document.addEventListener('click', (e) => {
  const menu = document.getElementById('settings-menu');
  const btn = document.getElementById('btn-settings');
  if(menu && !menu.contains(e.target) && !btn?.contains(e.target)) {
    closeSettingsMenu();
  }
});

// ═══════════════════════════════════════════════════════════
//  FILE MENU (submenú de archivo)
// ═══════════════════════════════════════════════════════════
function toggleFileMenu() {
  const menu = document.getElementById('file-menu');
  if(!menu) return;
  menu.classList.toggle('open');
}

function closeFileMenu() {
  const menu = document.getElementById('file-menu');
  if(menu) menu.classList.remove('open');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('file-menu');
  const btn = document.getElementById('btn-file-menu');
  if(menu && !menu.contains(e.target) && !btn?.contains(e.target)) {
    closeFileMenu();
  }
});

// ═══════════════════════════════════════════════════════════
//  NOTIFICATION CENTER (centro de notificaciones unificado)
// ═══════════════════════════════════════════════════════════

// BUG FIX: la versión original usaba actionCallback.toString() en un atributo
// onclick inline. Esto fallaba para cualquier función con referencias a variables
// del scope externo (closures), funciones arrow, o cualquier función que dependiera
// de su contexto de cierre — producía un ReferenceError silencioso al pulsar el botón.
// Solución: registro de callbacks indexados, sin serializar funciones a texto.
const _notifCallbacks = {};
let _notifCallbackIdx = 0;

function showNotification(type, message, actionText, actionCallback) {
  const center = document.getElementById('notification-center');
  if(!center) return;

  const notif = document.createElement('div');
  notif.className = `notif-item ${type}`;
  notif.innerHTML = `
    <span>${message}</span>
    ${actionText ? `<button class="notif-action-btn">${actionText}</button>` : ''}
    <button onclick="dismissNotification(this.parentElement)">✕</button>
  `;

  // Vincular el callback correctamente si existe, sin convertirlo a string
  if(actionText && typeof actionCallback === 'function') {
    const key = ++_notifCallbackIdx;
    _notifCallbacks[key] = actionCallback;
    const btn = notif.querySelector('.notif-action-btn');
    btn.addEventListener('click', () => {
      _notifCallbacks[key]();
      delete _notifCallbacks[key];
      dismissNotification(notif);
    });
  }

  center.appendChild(notif);

  // Auto-dismiss después de 8 segundos si no tiene acción
  if(!actionText) {
    setTimeout(() => dismissNotification(notif), 8000);
  }
}

function dismissNotification(notif) {
  if(notif && notif.parentElement) {
    notif.style.opacity = '0';
    notif.style.transform = 'translateY(-10px)';
    setTimeout(() => notif.remove(), 200);
  }
}

// ═══════════════════════════════════════════════════════════
//  DASHBOARD SECTIONS COLAPSABLES
// ═══════════════════════════════════════════════════════════
function toggleSection(header) {
  const section = header.closest('.dashboard-section');
  if(!section) return;
  section.classList.toggle('collapsed');
  
  // Guardar estado en localStorage
  const sectionId = section.id || section.className;
  const isCollapsed = section.classList.contains('collapsed');
  localStorage.setItem(`section_${sectionId}`, isCollapsed);
}

function restoreSectionStates() {
  document.querySelectorAll('.dashboard-section').forEach(section => {
    const sectionId = section.id || section.className;
    const savedState = localStorage.getItem(`section_${sectionId}`);
    if(savedState === 'true') {
      section.classList.add('collapsed');
    }
  });
}

// ═══════════════════════════════════════════════════════════
//  FAB (Floating Action Button) - Acciones rápidas
// ═══════════════════════════════════════════════════════════
function toggleQuickActions() {
  const menu = document.getElementById('quick-actions-menu');
  if(!menu) return;
  menu.classList.toggle('open');
}

function closeQuickActions() {
  const menu = document.getElementById('quick-actions-menu');
  if(menu) menu.classList.remove('open');
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('quick-actions-menu');
  const fab = document.querySelector('.fab');
  if(menu && !menu.contains(e.target) && !fab?.contains(e.target)) {
    closeQuickActions();
  }
});

// ═══════════════════════════════════════════════════════════
//  SIDEBAR (desktop) - Navegación lateral
// ═══════════════════════════════════════════════════════════
function switchSidebarTab(tabName) {
  // Actualizar nav items activos
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if(item.dataset.tab === tabName) {
      item.classList.add('active');
    }
  });
  
  // Cambiar tab principal
  switchTab(tabName);
}

// ═══════════════════════════════════════════════════════════
//  SUB-TABS (organización de tabs en categorías)
// ═══════════════════════════════════════════════════════════
const TAB_CATEGORIES = {
  operaciones: ['dashboard', 'clientes', 'cobros', 'gastos'],
  analisis: ['estadisticas', 'reportes'],
  config: ['equipos', 'inventario', 'ajustes']
};

function switchMainTab(category) {
  // Actualizar tabs principales
  document.querySelectorAll('.tabs-main .tab').forEach(tab => {
    tab.classList.remove('active');
    if(tab.dataset.category === category) {
      tab.classList.add('active');
    }
  });
  
  // Mostrar sub-tabs correspondientes
  document.querySelectorAll('.sub-tabs-container').forEach(container => {
    container.classList.remove('active');
    if(container.dataset.category === category) {
      container.classList.add('active');
    }
  });
  
  // Activar el primer sub-tab de la categoría
  const firstTab = TAB_CATEGORIES[category]?.[0];
  if(firstTab) switchTab(firstTab);
}

// ═══════════════════════════════════════════════════════════
//  INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════
function initUIComponents() {
  restoreSectionStates();
  
  // Detectar si estamos en desktop para activar sidebar
  if(window.innerWidth >= 1024) {
    document.body.classList.add('desktop-layout');
  }
  
  // Listener para cambios de tamaño
  window.addEventListener('resize', () => {
    if(window.innerWidth >= 1024) {
      document.body.classList.add('desktop-layout');
    } else {
      document.body.classList.remove('desktop-layout');
    }
  });
}

// Llamar al init cuando el DOM esté listo
if(document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUIComponents);
} else {
  initUIComponents();
}

// ═════════════════════════════════════════════════════════════════════════════
//  ANIMACIÓN COUNT-UP (Feature V4)
//  Anima los números grandes de los KPIs desde 0 hasta su valor real al
//  renderizar, dando sensación de "vida". Respeta prefers-reduced-motion.
//  Uso: tras renderizar tarjetas, llamar animateCountUpCards(container).
//  Cada .card-value / .big-num puede llevar:
//    data-countup="<numero>"        → valor crudo a animar
//    data-countup-suffix="K"        → sufijo fijo (ej. "K", "%", " Mb")
//    data-countup-decimals="1"      → decimales (default 0)
//    data-countup-format="cup"      → formato moneda CUP (miles + " CUP")
// ═════════════════════════════════════════════════════════════════════════════
const _countUpAnims = new WeakMap(); // evita re-animar el mismo elemento

function _easeOutCubic(t){ return 1 - Math.pow(1 - t, 3); }

function _formatCountUp(value, decimals, format, suffix) {
  if(format === 'cup') {
    return Math.round(value).toLocaleString('es-CU') + ' CUP';
  }
  const v = value.toFixed(decimals);
  return v + (suffix || '');
}

function animateCountUpEl(el) {
  if(!el) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const target = parseFloat(el.getAttribute('data-countup'));
  if(isNaN(target)) return;
  const suffix  = el.getAttribute('data-countup-suffix') || '';
  const decimals= parseInt(el.getAttribute('data-countup-decimals')||'0',10) || 0;
  const format  = el.getAttribute('data-countup-format') || '';
  const dur     = 700; // ms

  if(reduce) {
    el.textContent = _formatCountUp(target, decimals, format, suffix);
    return;
  }
  // Cancelar animación previa del mismo elemento
  const prev = _countUpAnims.get(el);
  if(prev) cancelAnimationFrame(prev);

  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / dur);
    const val = target * _easeOutCubic(t);
    el.textContent = _formatCountUp(val, decimals, format, suffix);
    if(t < 1) {
      _countUpAnims.set(el, requestAnimationFrame(frame));
    } else {
      _countUpAnims.delete(el);
    }
  }
  _countUpAnims.set(el, requestAnimationFrame(frame));
}

function animateCountUpCards(container) {
  if(!container) container = document;
  container.querySelectorAll('[data-countup]').forEach(el => animateCountUpEl(el));
}
