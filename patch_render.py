#!/usr/bin/env python3
# Patch render.js: reescribir renderProfit() y renderSummary() con libro de caja real.
import io

path = 'js/ui/render.js'
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

# --- 1) renderProfit() ---
old_profit_start = "function renderProfit() {"
old_profit_end = "  `;\n}\n\nfunction renderTable1() {"

i = src.index(old_profit_start)
j = src.index(old_profit_end) + len(old_profit_end)

new_profit = '''function renderProfit() {
  const moraPendiente=clients.filter(c=>!c.pagado&&getMora(c)>0).reduce((s,c)=>s+precioNetoCliente(c)*getMora(c),0);
  const invPend=deudaEquipoPendienteTotal();

  // --- v5.7: CAJA REAL DEL MES (lo que realmente entro/salio) ---
  const cobServ = cobradoServiciosMes();
  const cobEq   = cobradoEquipoMes();
  const cobTot  = cobradoTotalMes();
  const paqGasto= pagoPaqueteMes();
  const paqPag  = paquetePagadoEsteMes();
  const tg      = totalGastos();          // gastos del mes sin el paquete
  const ganR    = gananciaReal();

  // --- PROYECCION (lo esperado, solo informativo) ---
  const ingEsp  = ingresosMes();
  const pend    = pendienteTotal();
  const ganProj = ganancia();

  document.getElementById('profit-rows').innerHTML=`
    <div class="bw-title" style="margin:2px 0 6px;font-size:0.8rem">Caja del mes (real)</div>
    <div class="pb-row"><span>Cobrado en servicios</span><span class="text-green">+${fmt(cobServ)}</span></div>
    ${cobEq>0?`<div class="pb-row"><span>Cobrado en cuotas de equipo</span><span class="text-amber">+${fmt(cobEq)}</span></div>`:''}
    <div class="pb-row"><span>Total cobrado este mes</span><span class="text-green"><strong>+${fmt(cobTot)}</strong></span></div>
    <div class="pb-row"><span>Pago paquete al proveedor</span><span class="text-red">${paqPag?`-${fmt(paqGasto)}`:`<span style="color:var(--amber)">Pendiente (${fmt(costoMes())})</span>`}</span></div>
    ${tg>0?`<div class="pb-row"><span>Gastos del mes</span><span class="text-red">-${fmt(tg)}</span></div>`:''}
    <div class="pb-row"><span><strong>Ganancia neta real (caja)</strong></span><span class="${ganR>=0?'text-green':'text-red'}"><strong>${fmt(ganR)}</strong></span></div>

    <div class="bw-title" style="margin:12px 0 6px;font-size:0.8rem;color:var(--text-muted)">Proyeccion (esperado)</div>
    <div class="pb-row"><span>Ingresos brutos esperados</span><span class="text-green">+${fmt(ingEsp)}</span></div>
    <div class="pb-row"><span>Costo servicio (${config.megas} Mb x ${fmt(config.costoPorMega)})</span><span class="text-red">-${fmt(costoMes())}</span></div>
    ${moraPendiente>0?`<div class="pb-row"><span>Mora pendiente por cobrar</span><span style="color:var(--purple)">+${fmt(moraPendiente)}</span></div>`:''}
    <div class="pb-row"><span>Pendiente por cobrar</span><span style="color:var(--purple)">${fmt(pend)}</span></div>
    <div class="pb-row"><span>Ganancia proyectada (si todos pagan)</span><span class="${ganProj>=0?'text-green':'text-red'}">${fmt(ganProj)}</span></div>
    ${invPend>0?`<div class="pb-row"><span>Inversion aun pendiente por cobrar</span><span class="text-amber">${fmt(invPend)}</span></div>`:''}
  `;
}

function renderTable1() {'''

src = src[:i] + new_profit + src[j:]

# --- 2) renderSummary(): la tarjeta "Ganancia neta" pasa a mostrar la REAL ---
old_card = '    <div class="card"><div class="card-label">Ganancia neta</div><div class="card-value '
idx = src.index(old_card)
# localizar el fin de esa tarjeta (el </div> que cierra la sub)
end_card_marker = '</div></div>\n    <div class="card"><div class="card-label">Pendiente'
k = src.index(end_card_marker, idx)
# reconstruir la tarjeta de ganancia neta REAL
new_card = ('    <div class="card"><div class="card-label">Ganancia neta (caja)</div>'
            '<div class="card-value {ganRColor}" data-countup="{ganRK}" data-countup-decimals="1" data-countup-suffix="K">0K</div>'
            '<div class="card-sub">cobrado - pagado este mes{subUsdGanR}</div></div>'
            '    <div class="card"><div class="card-label">Pendiente')
# como hay plantillas literales con ${...} usamos replace post-calc
# mejor: reconstruir con un bloque JS que calcule antes.
print("card start at", idx, "end at", k)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)
print("OK render.js renderProfit parchado (card pendiente)")
