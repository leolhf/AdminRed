// reloj.js
// Reloj/fecha en el encabezado.
// No depende de otros módulos.

// ═══════════════════════════════════════════════════════════
//  RELOJ
// ═══════════════════════════════════════════════════════════
function updateClock() {
  const n=new Date();
  document.getElementById('clock').textContent=
    n.toLocaleDateString('es-CU',{day:'2-digit',month:'short'})+' · '+
    n.toLocaleTimeString('es-CU',{hour:'2-digit',minute:'2-digit'});
}
