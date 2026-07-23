// tabs.js
function switchTab(name) {
  const names = ['dashboard','clientes','gastos','estadisticas'];
  document.querySelectorAll('.tab').forEach((t,i) => t.classList.toggle('active', names[i] === name));
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  if (name === 'estadisticas') renderEstadisticas();
  if (name === 'gastos') { renderGastos(); switchGastosTab('gastos'); }
}
