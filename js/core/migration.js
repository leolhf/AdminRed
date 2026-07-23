// migration.js
// Funciones de migración de datos para transición al nuevo modelo de inversiones.
// Depende de: state.js, investment.js

// ═══════════════════════════════════════════════════════════
//  MIGRACIÓN A NUEVO MODELO DE INVERSIONES
// ═══════════════════════════════════════════════════════════
function migrarANuevoModeloInversiones() {
  let migracionesRealizadas = 0;
  let clientesMigrados = 0;
  
  // 1. Migrar clientes con deudaEquipo (modelo antiguo: número)
  const clientesConDeuda = clients.filter(c => c.deudaEquipo && typeof c.deudaEquipo === 'number' && c.deudaEquipo > 0);
  
  if (clientesConDeuda.length > 0) {
    // Crear inversión genérica para clientes migrados
    const totalDeuda = clientesConDeuda.reduce((s, c) => s + c.deudaEquipo, 0);
    const invLegacy = createInvestment('Equipo (migración)', totalDeuda, new Date().toISOString().split('T')[0]);
    
    // Calcular recuperado desde el historial
    const recuperadoDesdeHistorial = history.reduce((s, h) => s + (h.montoEquipo || 0), 0);
    invLegacy.recuperado = recuperadoDesdeHistorial;
    
    investments.push(invLegacy);
    migracionesRealizadas++;
    
    // Vincular clientes a la inversión legacy
    clientesConDeuda.forEach(c => {
      const deudaAntigua = c.deudaEquipo;
      const cuotaAntigua = c.cuotaEquipo || 0;
      
      // Calcular cuánto ha pagado este cliente específico
      const pagadoPorCliente = history
        .filter(h => h.id === c.id && h.montoEquipo)
        .reduce((s, h) => s + h.montoEquipo, 0);
      
      c.deudaEquipo = {
        investmentId: invLegacy.id,
        cuotaMensual: cuotaAntigua,
        pagado: pagadoPorCliente
      };
      
      if (!invLegacy.clientesVinculados.includes(c.id)) {
        invLegacy.clientesVinculados.push(c.id);
      }
      
      clientesMigrados++;
    });
    
    console.log(`Migración: ${clientesMigrados} clientes con deudaEquipo migrados a inversión ${invLegacy.id}`);
  }
  
  // 2. Migrar gastos de inversión a registros de inversión
  const gastosInversion = gastos.filter(g => g.categoria === 'inversion');
  
  gastosInversion.forEach((g, idx) => {
    // Si el gasto no tiene un investmentId, crear inversión individual
    if (!g.investmentId) {
      const invIndividual = createInvestment(g.desc, g.monto, g.fecha);
      
      // Intentar vincular a clientes que puedan estar relacionados
      // (esto es aproximado, ya que no hay relación directa en el modelo antiguo)
      const clientesPosibles = clients.filter(c => 
        c.deudaEquipo && 
        typeof c.deudaEquipo === 'object' && 
        c.deudaEquipo.investmentId && 
        c.deudaEquipo.investmentId.startsWith('inv_')
      );
      
      if (clientesPosibles.length > 0) {
        // Asignar al primer cliente posible (simplificación)
        const primerCliente = clientesPosibles[0];
        invIndividual.clientesVinculados.push(primerCliente.id);
      }
      
      investments.push(invIndividual);
      g.investmentId = invIndividual.id; // Marcar gasto como migrado
      migracionesRealizadas++;
    }
  });
  
  // 3. Actualizar cálculos de recuperado en inversiones desde historial
  investments.forEach(inv => {
    // Recalcular recuperado basado en pagos de clientes vinculados
    let recuperadoCalculado = 0;
    
    inv.clientesVinculados.forEach(clienteId => {
      const pagosCliente = history
        .filter(h => h.id === clienteId && h.montoEquipo)
        .reduce((s, h) => s + h.montoEquipo, 0);
      recuperadoCalculado += pagosCliente;
    });
    
    inv.recuperado = recuperadoCalculado;
  });
  
  // Guardar cambios
  save();
  
  return {
    migracionesRealizadas,
    clientesMigrados,
    inversionesCreadas: investments.length,
    mensaje: `Migración completada: ${clientesMigrados} clientes migrados, ${investments.length} inversiones creadas`
  };
}

// ═══════════════════════════════════════════════════════════
//  REPARAR INVERSIONES-FANTASMA CREADAS POR VENTAS DE INVENTARIO
// ═══════════════════════════════════════════════════════════
// Bug (v4.0.1): dos flujos (venta de inventario "a plazo" y el modal "Ajustar
// inversión" por cliente) dejaban al cliente con una deudaEquipo tipo OBJETO
// vinculada a una tarjeta en Inversiones Personales — pero ningún cobro normal
// reconocía ese objeto, así que la cuota nunca se cobraba y la tarjeta quedaba
// fija en 0%, además de aparecer mezclada con inversiones personales reales.
// Esta función detecta cualquier cliente en ese estado (por estructura, no por
// nombre), le devuelve su deuda como número simple (funcional, cobrable con el
// mecanismo que sí funciona) y quita la tarjeta huérfana de Inversiones Personales.
function repararInversionesInventario() {
  const clientesAfectados = clients.filter(c => c.deudaEquipo && typeof c.deudaEquipo === 'object');
  if (!clientesAfectados.length) return { reparadas: 0 };

  let reparadas = 0;
  clientesAfectados.forEach(c => {
    const invId = c.deudaEquipo.investmentId;
    const inv = invId ? investments.find(i => i.id === invId) : null;

    const yaRecuperado = history
      .filter(h => h.id === c.id && h.investmentId === invId)
      .reduce((s, h) => s + (h.montoEquipo || 0), 0);
    const cuotaMensualPrevia = c.deudaEquipo.cuotaMensual || 0;
    const costoTotal = inv ? (inv.costoTotal || 0) : cuotaMensualPrevia;
    const pendiente = Math.max(0, costoTotal - yaRecuperado);

    c.deudaEquipo = pendiente; // el objeto no es deuda numérica previa válida
    if (!c.cuotaEquipo || c.cuotaEquipo <= 0) c.cuotaEquipo = cuotaMensualPrevia || pendiente;

    if (inv) {
      const idx = investments.indexOf(inv);
      if (idx !== -1) investments.splice(idx, 1);
      const gastoIdx = gastos.findIndex(g => g.investmentId === inv.id);
      if (gastoIdx !== -1) gastos.splice(gastoIdx, 1);
    }

    reparadas++;
  });

  save();
  return { reparadas };
}

// ═══════════════════════════════════════════════════════════
//  VERIFICAR SI NECESITA MIGRACIÓN
// ═══════════════════════════════════════════════════════════
function necesitaMigracion() {
  // Verificar si hay clientes con deudaEquipo como número (modelo antiguo)
  const clientesAntiguoModelo = clients.filter(c => 
    c.deudaEquipo && typeof c.deudaEquipo === 'number'
  );
  
  // Verificar si no hay inversiones pero sí hay gastos de inversión
  const tieneGastosInversion = gastos.some(g => g.categoria === 'inversion');
  const sinInversiones = investments.length === 0;
  
  return clientesAntiguoModelo.length > 0 || (tieneGastosInversion && sinInversiones);
}

// ═══════════════════════════════════════════════════════════
//  EJECUTAR MIGRACIÓN SI ES NECESARIA (al iniciar la app)
// ═══════════════════════════════════════════════════════════
function verificarYMigrar() {
  let huboMigracion = false;

  if (necesitaMigracion()) {
    console.log('Detectada necesidad de migración al nuevo modelo de inversiones...');
    const resultado = migrarANuevoModeloInversiones();
    console.log(resultado.mensaje);
    notify(resultado.mensaje);
    huboMigracion = true;
  }

  const reparacion = repararInversionesInventario();
  if (reparacion.reparadas > 0) {
    console.log(`Reparadas ${reparacion.reparadas} inversión(es) fantasma creadas por ventas de inventario`);
    notify(`Se corrigieron ${reparacion.reparadas} inversión(es) generadas por ventas de inventario`);
    huboMigracion = true;
  }

  return huboMigracion;
}
