/**
 * clientes/client-history.js — Historial de pagos por cliente.
 */
RN.clientHistory = RN.clientHistory || {};

RN.clientHistory.abrir = function (id) {
  const c = RN.state.clients.find(x => x.id === id);
  if (!c) return;
  const hist = RN.state.history.filter(h => h.clienteId === id).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  const total = hist.reduce((s, h) => s + (h.monto || 0) + (h.montoEquipo || 0), 0);
  const mora = RN.calc.getMora(c);
  const deudaEq = RN.investment.getDeudaEquipoCliente(c);

  const rows = hist.length ? hist.map(h => `<tr>
    <td>${RN.render.esc((h.fecha || '').slice(0, 10))}</td>
    <td>${h.tipo === 'servicio' ? 'Servicio ' + (h.mes || '') : (h.tipo === 'equipo' ? 'Cuota equipo' : RN.render.esc(h.concepto || h.tipo))}</td>
    <td>${RN.calc.formatCUP((h.monto || 0) + (h.montoEquipo || 0))}</td>
    <td>${h.reciboNum ? `<button class="btn sm" onclick="RN.recibo.ver('${h.id}')">${h.reciboNum}</button>` : '—'}</td>
  </tr>`).join('') : `<tr><td colspan="4"><div class="empty">Sin pagos registrados</div></td></tr>`;

  const html = `
    <div class="modal-header"><h3>Historial — ${RN.render.esc(c.nombre)}</h3><button class="close" onclick="RN.uiComponents.cerrarModal()">×</button></div>
    <div class="modal-body">
      <div class="kpi-grid mb-16">
        <div class="kpi green"><div class="label">Total pagado</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(total)}</div></div>
        <div class="kpi ${mora ? 'red' : 'ok'}"><div class="label">Mora</div><div class="value" style="font-size:18px">${mora} mes(es)</div></div>
        <div class="kpi ${deudaEq ? 'amber' : 'ok'}"><div class="label">Deuda equipo</div><div class="value" style="font-size:18px">${RN.calc.formatCUP(deudaEq)}</div></div>
      </div>
      <div class="table-wrap"><table><thead><tr><th>Fecha</th><th>Concepto</th><th>Monto</th><th>Recibo</th></tr></thead><tbody>${rows}</tbody></table></div>
    </div>
    <div class="modal-footer">
      <button class="btn" onclick="RN.whatsapp.enviarRecordatorio('${c.id}')">WhatsApp</button>
      <button class="btn ghost" onclick="RN.uiComponents.cerrarModal()">Cerrar</button>
    </div>`;
  RN.uiComponents.modal(html, { lg: true });
};
