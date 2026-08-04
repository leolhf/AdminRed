// tendencia.js
// Gráfico de tendencia mensual de ingresos.
// SVG generado a mano (sin librerías) — línea + área con curva de 6 meses.
// Depende de: state.js (history), calculations.js (fmt)

// ═══════════════════════════════════════════════════════════
//  TENDENCIA MENSUAL
// ═══════════════════════════════════════════════════════════
function renderTrend() {
  const el=document.getElementById('trend-chart'); if(!el) return;
  const now=new Date();
  const buckets=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const label=d.toLocaleDateString('es-CU',{month:'short'});
    buckets.push({key,label,total:0});
  }
  history.forEach(h=>{
    if(!h.fecha) return;
    const mes=h.fecha.substring(0,7);
    const b=buckets.find(x=>x.key===mes);
    if(b) b.total+=h.monto;
  });

  if(!buckets.some(b=>b.total>0)){
    el.innerHTML='<div class="empty-state" style="padding:22px 0">Aún no hay cobros registrados</div>';
    return;
  }

  const w=680,h=140,padX=30,padTop=28,padBottom=24;
  const max=Math.max(...buckets.map(b=>b.total),1);
  const stepX=(w-padX*2)/(buckets.length-1);
  const curKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const pts=buckets.map((b,i)=>({
    x:padX+i*stepX,
    y:padTop+(h-padTop-padBottom)*(1-b.total/max),
    ...b
  }));
  const line=pts.map((p,i)=>(i===0?'M':'L')+p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
  const area=line+` L${pts[pts.length-1].x.toFixed(1)},${h-padBottom} L${pts[0].x.toFixed(1)},${h-padBottom} Z`;
  const gridY=padTop+(h-padTop-padBottom)/2;

  const points=pts.map(p=>{
    const isCur=p.key===curKey;
    const valLabel=p.total>0?(p.total/1000).toFixed(1)+'K':'—';
    return `
      <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${isCur?4.4:3}" class="trend-dot${isCur?' cur':''}"><title>${p.label}: ${fmt(p.total)}</title></circle>
      <text x="${p.x.toFixed(1)}" y="${(p.y-10).toFixed(1)}" text-anchor="middle" class="trend-val-label${isCur?' cur':''}">${valLabel}</text>
      <text x="${p.x.toFixed(1)}" y="${h-6}" text-anchor="middle" class="trend-month-label${isCur?' cur':''}">${p.label}</text>`;
  }).join('');

  el.innerHTML=`
    <svg viewBox="0 0 ${w} ${h}" class="trend-svg">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--green)" stop-opacity="0.28"/>
          <stop offset="100%" stop-color="var(--green)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <line x1="${padX}" y1="${gridY.toFixed(1)}" x2="${w-padX}" y2="${gridY.toFixed(1)}" class="trend-grid"/>
      <path d="${area}" fill="url(#trendFill)" stroke="none"/>
      <path d="${line}" fill="none" stroke="var(--green)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${points}
    </svg>`;
}
