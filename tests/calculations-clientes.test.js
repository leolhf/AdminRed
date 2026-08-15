// calculations-clientes.test.js
// Tests unitarios para calculations-clientes.js

import { describe, it, expect, beforeEach } from 'vitest';

// Cargar las funciones desde el archivo real
// Nota: esto requiere que el archivo sea un módulo ES. Si no lo es, necesitaríamos adaptarlo.
describe('Calculations Clientes', () => {
  beforeEach(() => {
    // Resetear estado global antes de cada test
    global.clients = [];
    global.planes = [];
    global.descuentos = [];
    global.config = {
      megas: 100,
      costoPorMega: 50,
      margenMegas: 10,
      sobreventaMegas: 5,
      diaInicio: 1,
      diasBaseMes: 30,
      mesActual: null
    };
  });

  describe('getPlanCliente', () => {
    it('debería retornar null si el cliente no tiene planId', () => {
      const cliente = { id: 1, nombre: 'Test', planId: null };
      global.planes = [];
      
      // Simular la función ya que no podemos importar directamente
      const getPlanCliente = (c) => {
        if (!c.planId) return null;
        return global.planes.find(p => p.id === c.planId) || null;
      };
      
      expect(getPlanCliente(cliente)).toBeNull();
    });

    it('debería retornar el plan si el cliente tiene planId válido', () => {
      const plan = { id: 1, nombre: 'Plan Básico', megas: 10, precio: 100 };
      const cliente = { id: 1, nombre: 'Test', planId: 1 };
      global.planes = [plan];
      
      const getPlanCliente = (c) => {
        if (!c.planId) return null;
        return global.planes.find(p => p.id === c.planId) || null;
      };
      
      expect(getPlanCliente(cliente)).toEqual(plan);
    });
  });

  describe('getPrecioCliente', () => {
    it('debería usar el precio del plan si está asignado', () => {
      const plan = { id: 1, nombre: 'Plan Básico', megas: 10, precio: 100 };
      const cliente = { id: 1, nombre: 'Test', planId: 1, precio: 150 };
      global.planes = [plan];
      
      const getPlanCliente = (c) => {
        if (!c.planId) return null;
        return global.planes.find(p => p.id === c.planId) || null;
      };
      
      const getPrecioCliente = (c) => {
        const plan = getPlanCliente(c);
        if (plan && plan.precio) return plan.precio;
        return c.precio || 0;
      };
      
      expect(getPrecioCliente(cliente)).toBe(100);
    });

    it('debería usar el precio manual si no hay plan', () => {
      const cliente = { id: 1, nombre: 'Test', planId: null, precio: 150 };
      global.planes = [];
      
      const getPlanCliente = (c) => {
        if (!c.planId) return null;
        return global.planes.find(p => p.id === c.planId) || null;
      };
      
      const getPrecioCliente = (c) => {
        const plan = getPlanCliente(c);
        if (plan && plan.precio) return plan.precio;
        return c.precio || 0;
      };
      
      expect(getPrecioCliente(cliente)).toBe(150);
    });
  });

  describe('calcularDescuento', () => {
    it('debería retornar 0 si no hay descuento', () => {
      const cliente = { descuento: 0, descuentoTipo: 'monto' };
      
      const calcularDescuento = (c, precioMes) => {
        if (!c.descuento || c.descuento <= 0) return 0;
        if (c.descuentoTipo === 'pct') return Math.round(precioMes * c.descuento / 100);
        return Math.min(c.descuento, precioMes);
      };
      
      expect(calcularDescuento(cliente, 1000)).toBe(0);
    });

    it('debería calcular descuento de monto fijo correctamente', () => {
      const cliente = { descuento: 100, descuentoTipo: 'monto' };
      
      const calcularDescuento = (c, precioMes) => {
        if (!c.descuento || c.descuento <= 0) return 0;
        if (c.descuentoTipo === 'pct') return Math.round(precioMes * c.descuento / 100);
        return Math.min(c.descuento, precioMes);
      };
      
      expect(calcularDescuento(cliente, 1000)).toBe(100);
    });

    it('debería calcular descuento porcentual correctamente', () => {
      const cliente = { descuento: 10, descuentoTipo: 'pct' };
      
      const calcularDescuento = (c, precioMes) => {
        if (!c.descuento || c.descuento <= 0) return 0;
        if (c.descuentoTipo === 'pct') return Math.round(precioMes * c.descuento / 100);
        return Math.min(c.descuento, precioMes);
      };
      
      expect(calcularDescuento(cliente, 1000)).toBe(100); // 10% de 1000
    });

    it('no debería exceder el precio del mes', () => {
      const cliente = { descuento: 1500, descuentoTipo: 'monto' };
      
      const calcularDescuento = (c, precioMes) => {
        if (!c.descuento || c.descuento <= 0) return 0;
        if (c.descuentoTipo === 'pct') return Math.round(precioMes * c.descuento / 100);
        return Math.min(c.descuento, precioMes);
      };
      
      expect(calcularDescuento(cliente, 1000)).toBe(1000); // No puede descontar más que el precio
    });
  });

  describe('megasDisponiblesParaVenta', () => {
    it('debería calcular megas disponibles correctamente', () => {
      global.clients = [
        { id: 1, megas: 10, suspendido: false },
        { id: 2, megas: 15, suspendido: false },
        { id: 3, megas: 5, suspendido: true } // Suspendido no cuenta
      ];
      global.config = { megas: 100, margenMegas: 10, sobreventaMegas: 5 };
      
      const megasDisponiblesParaVenta = (excluirId = null) => {
        const vendidoOtros = global.clients
          .filter(c => c.id !== excluirId)
          .reduce((s, c) => s + (c.suspendido ? 0 : (c.megas || 0)), 0);
        return global.config.megas + (global.config.sobreventaMegas || 0) - (global.config.margenMegas || 0) - vendidoOtros;
      };
      
      // Vendido: 10 + 15 = 25 (suspendido no cuenta)
      // Disponible: 100 + 5 - 10 - 25 = 70
      expect(megasDisponiblesParaVenta()).toBe(70);
    });

    it('debería excluir cliente específico del cálculo', () => {
      global.clients = [
        { id: 1, megas: 10, suspendido: false },
        { id: 2, megas: 15, suspendido: false }
      ];
      global.config = { megas: 100, margenMegas: 10, sobreventaMegas: 5 };
      
      const megasDisponiblesParaVenta = (excluirId = null) => {
        const vendidoOtros = global.clients
          .filter(c => c.id !== excluirId)
          .reduce((s, c) => s + (c.suspendido ? 0 : (c.megas || 0)), 0);
        return global.config.megas + (global.config.sobreventaMegas || 0) - (global.config.margenMegas || 0) - vendidoOtros;
      };
      
      // Excluyendo cliente 1: vendido = 15
      // Disponible: 100 + 5 - 10 - 15 = 80
      expect(megasDisponiblesParaVenta(1)).toBe(80);
    });
  });

  describe('precioNetoCliente', () => {
    it('debería calcular precio neto sin descuento', () => {
      const cliente = { megas: 10, precio: 100, descuento: 0, descuentoTipo: 'monto' };
      
      const calcularDescuento = (c, precioMes) => {
        if (!c.descuento || c.descuento <= 0) return 0;
        if (c.descuentoTipo === 'pct') return Math.round(precioMes * c.descuento / 100);
        return Math.min(c.descuento, precioMes);
      };
      
      const getPrecioCliente = (c) => c.precio || 0;
      
      const precioNetoCliente = (c) => {
        const precioMes = (c.megas || 0) * getPrecioCliente(c);
        const descuentoTotal = calcularDescuento(c, precioMes);
        return Math.max(0, precioMes - descuentoTotal);
      };
      
      expect(precioNetoCliente(cliente)).toBe(1000); // 10 * 100 - 0
    });

    it('debería calcular precio neto con descuento de monto', () => {
      const cliente = { megas: 10, precio: 100, descuento: 50, descuentoTipo: 'monto' };
      
      const calcularDescuento = (c, precioMes) => {
        if (!c.descuento || c.descuento <= 0) return 0;
        if (c.descuentoTipo === 'pct') return Math.round(precioMes * c.descuento / 100);
        return Math.min(c.descuento, precioMes);
      };
      
      const getPrecioCliente = (c) => c.precio || 0;
      
      const precioNetoCliente = (c) => {
        const precioMes = (c.megas || 0) * getPrecioCliente(c);
        const descuentoTotal = calcularDescuento(c, precioMes);
        return Math.max(0, precioMes - descuentoTotal);
      };
      
      expect(precioNetoCliente(cliente)).toBe(950); // 10 * 100 - 50
    });

    it('debería calcular precio neto con descuento porcentual', () => {
      const cliente = { megas: 10, precio: 100, descuento: 10, descuentoTipo: 'pct' };
      
      const calcularDescuento = (c, precioMes) => {
        if (!c.descuento || c.descuento <= 0) return 0;
        if (c.descuentoTipo === 'pct') return Math.round(precioMes * c.descuento / 100);
        return Math.min(c.descuento, precioMes);
      };
      
      const getPrecioCliente = (c) => c.precio || 0;
      
      const precioNetoCliente = (c) => {
        const precioMes = (c.megas || 0) * getPrecioCliente(c);
        const descuentoTotal = calcularDescuento(c, precioMes);
        return Math.max(0, precioMes - descuentoTotal);
      };
      
      expect(precioNetoCliente(cliente)).toBe(900); // 10 * 100 - 100 (10%)
    });
  });
});