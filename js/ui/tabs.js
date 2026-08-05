// tabs.js
// BUG FIX: el sistema de pestañas fue rediseñado en ui-components.js para
// usar categorías principales (.tab) + sub-pestañas (.sub-tab), pero la
// versión original de switchTab() seguía usando el índice de posición de
// los elementos .tab (que ahora son solo 3 categorías, no 5 contenidos).
// Esto causaba:
//   1) Los sub-tabs (.sub-tab) nunca se marcaban como activos.
//   2) Las categorías principales se activaban en la posición incorrecta.
//   3) Sub-tabs 'cobros', 'reportes', 'inventario', 'ajustes' no tenían
//      un elemento #tab-* correspondiente → no mostraban ningún contenido.
// La versión corregida usa data-attributes en lugar de posición, y agrega
// alias para redirigir sub-tabs sin contenido propio al panel más adecuado.

// Alias: nombres de sub-tab sin #tab-* → pestaña que sí existe con ese contenido.
const TAB_ALIAS = {
  // 'reportes' ya tiene su propio #tab-reportes (v5.4.0: calendario + reporte mensual)
};

// Mapa tab-name → categoría, para actualizar el tab de categoría activo.
const TAB_CATEGORY_MAP = {
  'dashboard':'operaciones', 'clientes':'operaciones',
  'cobros':'operaciones',    'gastos':'operaciones',
  'estadisticas':'analisis', 'reportes':'analisis',
  'equipos':'config',        'inventario':'config', 'ajustes':'config'
};

function switchTab(name) {
  const resolved = TAB_ALIAS[name] || name;

  // ── 1. Actualizar sub-tab activo ──
  // Usa el atributo onclick para identificar a qué nombre de tab pertenece
  // cada .sub-tab (más robusto que posición o texto visible).
  document.querySelectorAll('.sub-tab').forEach(t => {
    const oc = t.getAttribute('onclick') || '';
    const m  = oc.match(/switchTab\('(\w+)'\)/);
    if(m) t.classList.toggle('active', m[1] === name || m[1] === resolved);
  });

  // ── 2. Actualizar categoría principal activa ──
  const cat = TAB_CATEGORY_MAP[name] || TAB_CATEGORY_MAP[resolved];
  if(cat) {
    document.querySelectorAll('.tabs-main .tab').forEach(t => {
      t.classList.toggle('active', t.dataset.category === cat);
    });
    document.querySelectorAll('.sub-tabs-container').forEach(c => {
      c.classList.toggle('active', c.dataset.category === cat);
    });
  }

  // ── 3. Mostrar el tab-content correcto ──
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  const tabContent = document.getElementById('tab-' + resolved);
  if(tabContent) tabContent.classList.add('active');

  // ── 4. Acciones especiales por pestaña ──
  if(resolved === 'estadisticas') renderEstadisticas();
  if(resolved === 'gastos') {
    renderGastos();
    // Si el alias era 'inventario', abrir el sub-panel de inventario directamente
    if(name === 'inventario') switchGastosTab('inventario');
    else switchGastosTab('gastos');
  }
  if(resolved === 'equipos') renderEquiposRed();
  if(resolved === 'cobros') renderHistory();
  if(resolved === 'inventario') renderInventario();
  if(resolved === 'reportes') {
    if(typeof renderCalendario === 'function') renderCalendario();
    if(typeof renderReporteMensual === 'function') renderReporteMensual();
  }
}

// ═══════════════════════════════════════════════════════════
//  SWIPE ENTRE PESTAÑAS (móvil)
//  Desliza a la izquierda/derecha sobre el contenido para
//  moverte entre Dashboard → Clientes → Gastos → Estadísticas
//  → Equipos de Red, en ese orden.
// ═══════════════════════════════════════════════════════════
(function(){
  const ORDEN=['dashboard','clientes','gastos','estadisticas','equipos'];
  let startX=0,startY=0,tracking=false;
  const UMBRAL_PX=55;        // distancia mínima horizontal para contar como swipe
  const TOLERANCIA_VERTICAL=60; // si se mueve más que esto en vertical, es scroll, no swipe

  function currentTabIndex(){
    // BUG FIX: el código original buscaba '.tab.active' que ahora es el
    // tab de categoría principal (Operaciones/Análisis/Config), no el tab de
    // contenido individual. Ahora busca el tab-content activo y mapea al índice
    // correcto dentro de ORDEN.
    const activo = document.querySelector('.tab-content.active');
    if(!activo) return -1;
    const nombre = activo.id.replace('tab-', '');
    return ORDEN.indexOf(nombre);
  }

  function onTouchStart(e){
    // No interceptar si hay un modal abierto, o si el toque empieza dentro
    // de un elemento con su propio scroll horizontal (tablas, etc).
    if(document.querySelector('.modal-overlay.open')) { tracking=false; return; }
    if(e.target.closest('.table-wrap, .modal, input, textarea, select')) { tracking=false; return; }
    if(e.touches.length!==1) { tracking=false; return; }
    startX=e.touches[0].clientX;
    startY=e.touches[0].clientY;
    tracking=true;
  }

  function onTouchEnd(e){
    if(!tracking) return;
    tracking=false;
    const touch=e.changedTouches[0];
    const dx=touch.clientX-startX;
    const dy=touch.clientY-startY;
    if(Math.abs(dy)>TOLERANCIA_VERTICAL) return;
    if(Math.abs(dx)<UMBRAL_PX) return;
    const idx=currentTabIndex();
    if(idx<0) return;
    if(dx<0 && idx<ORDEN.length-1){
      switchTab(ORDEN[idx+1]); // swipe izquierda → siguiente pestaña
    } else if(dx>0 && idx>0){
      switchTab(ORDEN[idx-1]); // swipe derecha → pestaña anterior
    }
  }

  document.addEventListener('touchstart',onTouchStart,{passive:true});
  document.addEventListener('touchend',onTouchEnd,{passive:true});
})();
