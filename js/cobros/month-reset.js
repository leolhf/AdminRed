// month-reset.js
// Detección y ejecución del reseteo automático de mes.

function checkMesNuevo() {
  const ahora=new Date();
  const mesActual=`${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;
  if(config.mesActual && config.mesActual!==mesActual) {
    const label=ahora.toLocaleDateString('es-CU',{month:'long',year:'numeric'});
    document.getElementById('reset-mes-label').textContent=label;
    document.getElementById('reset-banner').style.display='flex';
  }
}

function iniciarNuevoMes() {
  if(!confirm('¿Iniciar nuevo mes? Esto marcará a todos los clientes como no pagados y borrará los gastos operativos del mes actual (los gastos de inversión se conservan).')) return;
  const ahora=new Date();
  const mesActual=`${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;

  clients.forEach(c=>{
    // BUG FIX #3: solo acumular mora si el cliente ya debía cobrar este mes
    // (fechaInicio ya pasó o no tiene fechaInicio) Y no pagó.
    const debiaCobrar = !c.fechaInicio || new Date(c.fechaInicio+'T00:00:00') <= ahora;
    if(!c.pagado && debiaCobrar) {
      c.mora = (c.mora||0) + 1;
    }

    // Resetear estado para el nuevo mes
    if(c.fechaInicio) {
      const fi = new Date(c.fechaInicio+'T00:00:00');
      if(ahora >= fi) {
        c.pagado=false;
        delete c.fechaInicio;
        delete c.mesInicio;
      }
      // Si fechaInicio es aún futura, no tocar — el cliente aún no entra en ciclo
    } else {
      c.pagado = false;
    }
    delete c.abono; // reset abonos parciales del mes que cierra
  });

  // Conservar solo gastos de inversión (incluyendo lotes de inventario)
  gastos = gastos.filter(g => g.categoria === 'inversion');
  config.mesActual = mesActual;
  document.getElementById('reset-banner').style.display='none';
  save(); render();
  notify('✅ Nuevo mes iniciado — gastos y abonos reiniciados');
  if(window.FirebaseSync) clients.forEach(c=>window.FirebaseSync.syncCliente(c));
}
