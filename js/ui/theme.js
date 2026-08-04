// theme.js
// Alternar y aplicar tema claro/oscuro.
// No depende de otros módulos.

// ═══════════════════════════════════════════════════════════
//  TEMA CLARO / OSCURO
// ═══════════════════════════════════════════════════════════
function toggleTheme() {
  const isLight=document.body.classList.toggle('theme-light');
  document.getElementById('theme-btn').textContent=isLight?'🌙':'☀️';
  localStorage.setItem(STORAGE_KEYS.THEME,isLight?'light':'dark');
}
function applyTheme() {
  const t=localStorage.getItem(STORAGE_KEYS.THEME);
  if(t==='light'){document.body.classList.add('theme-light');document.getElementById('theme-btn').textContent='🌙';}
}
