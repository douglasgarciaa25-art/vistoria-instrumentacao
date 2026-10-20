/* Historical plot and workbook import; stored in the existing reports database. */
(()=>{
 const box=document.createElement('div');box.className='actions';box.innerHTML='<button type="button" id="cal-import-model">Importar histórico RET4 enviado</button><label class="secondary">Importar outra planilha Excel<input id="cal-import-file" type="file" accept=".xlsx"></label><p id="cal-import-status" role="status"></p>';$('scale-search').before(box);
 const plot=document.createElement('section');plot.id='cal-history-plot';$('scale-calibrations').before(plot);
 const fmt=v=>v.toLocaleString('pt-BR',{maximumFractionDigits:4});
 function draw(){
  const cards=[...$('scale-calibrations').querySelectorAll('[data-cal-open]')].filter(b=>!b.closest('article').hidden);
  const rows=cards.map(b=>historyItems.find(r=>r.id===b.dataset.calOpen)).filter(Boolean).sort((a,b)=>a.document.calibration.date.localeCompare(b.document.calibration.date));
  if(!rows.length){plot.innerHTML='<p class="muted">Nenhum registro para exibir no gráfico com os filtros atuais.</p>';return}
  const pts=rows.map(r=>{const c=r.document.calibration,e=CalibrationCore.evaluate(c);return {date:c.date,initial:e.initial.state==='valid'?e.initial.error:null,final:e.max,limit:CalibrationCore.parse(c.tolerance)}});
  const max=Math.max(.01,...pts.flatMap(p=>[p.initial,p.final,p.limit].filter(Number.isFinite).map(Math.abs)))*1.2;
  const x=i=>65+(pts.length===1?260:i*520/(pts.length-1)),y=v=>155-v/max*110;
  let svg='<svg viewBox="0 0 650 330" role="img" aria-label="Evolução do erro por data, em porcentagem" style="width:100%;min-width:320px;background:#faf9fc;border-radius:12px">';
  for(const v of [-max,0,max])svg+=`<line x1="65" x2="600" y1="${y(v)}" y2="${y(v)}" stroke="#ddd"/><text x="3" y="${y(v)+4}" font-size="11">${fmt(v)}%</text>`;
  for(const [key,color] of [['initial','#8262b2'],['final','#167343'],['limit','#b13b35']]){
   let last=null;pts.forEach((p,i)=>{const v=p[key];if(!Number.isFinite(v)){last=null;return}if(last!==null)svg+=`<line x1="${x(last)}" y1="${y(pts[last][key])}" x2="${x(i)}" y2="${y(v)}" stroke="${color}" stroke-width="2" ${key==='limit'?'stroke-dasharray="5 4"':''}/>`;svg+=`<circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${color}"><title>${esc(p.date)}: ${fmt(v)}%</title></circle>`;last=i});
  }
  pts.forEach((p,i)=>{if(pts.length<9||i===0||i===pts.length-1||i%Math.ceil(pts.length/8)===0)svg+=`<text transform="translate(${x(i)},285) rotate(-35)" font-size="11">${esc(datefmt(p.date))}</text>`});
  plot.innerHTML='<h3>Evolução das calibrações</h3><p>Roxo: erro inicial com sinal · Verde: maior erro absoluto final · Vermelho: limite de aceitação.</p>'+svg+'</svg><p class="muted">Leituras vazias não são tratadas como zero. Registros sem leitura final permanecem pendentes.</p><details><summary>Dados do gráfico</summary><div class="cal-scroll"><table class="cal-table"><thead><tr><th>Data</th><th>Inicial (%)</th><th>Final absoluto (%)</th><th>Limite (%)</th></tr></thead><tbody>'+pts.map(p=>'<tr><td>'+esc(datefmt(p.date))+'</td>'+[p.initial,p.final,p.limit].map(v=>'<td>'+(Number.isFinite(v)?fmt(v):'—')+'</td>').join('')+'</tr>').join('')+'</tbody></table></div></details>';
 }
 document.addEventListener('calibration-filter-changed',draw);
 new MutationObserver(draw).observe($('scale-calibrations'),{childList:true});
 async function excel(){if(window.ExcelJS)return;await new Promise((ok,no)=>{const s=document.createElement('script');s.src='exceljs.min.js';s.onload=ok;s.onerror=()=>no(Error('Falha ao carregar leitor Excel.'));document.head.append(s)})}
 const coords=[['C16','D16'],['G16','H16'],['C25','D25'],['G25','H25'],['C30','D30'],['G30','H30'],['C35','D35']];
 async function importBook(bytes){await excel();const w=new ExcelJS.Workbook();await w.xlsx.load(bytes);const pending=[];let duplicates=0;
  for(const s of w.worksheets){const value=a=>{const v=s.getCell(a).value;return v&&typeof v==='object'&&!(v instanceof Date)?v.result??v.text??'':v??''};if(!String(value('F7')).trim())continue;
   const c=window.vistoriaCalibration.defaults();c.enabled=true;
   for(const [k,a] of Object.entries({identification:'C7',tag:'F7',area:'I7',order:'D8',range:'D9',manufacturer:'H9',model:'C10',executor:'D54',technician:'H54',certificate:'H36'}))c[k]=String(value(a)).trim();
   const date=value('I8');c.date=date instanceof Date?date.toISOString().slice(0,10):typeof date==='number'?new Date(Date.UTC(1899,11,30)+date*86400000).toISOString().slice(0,10):String(date);if(!/^\d{4}-\d{2}-\d{2}$/.test(c.date))throw Error('Data inválida na aba '+s.name);
   const tol=value('H10');if(typeof tol!=='number'||!Number.isFinite(tol)||tol<0)throw Error('Limite inválido na aba '+s.name);c.tolerance=String(tol*100).replace('.',',');
   c.readings=coords.map(([m,p])=>({measured:String(value(m)).replace('.',','),reference:String(value(p)).replace('.',','),photos:[]}));c.notes=[48,49,50,51,52].map(r=>String(value('A'+r))).filter(Boolean).join('\n');
   if(c.readings.some(r=>CalibrationCore.reading(r).state==='invalid'))throw Error('Peso inválido na aba '+s.name);
   c.standards=c.standards.map((r,i)=>Object.fromEntries(['id','name','certificate','resolution','uncertainty','expiry'].map((k,j)=>[k,String(value(['A','C','E','F','H','I'][j]+(43+i)))])));
   const signature=JSON.stringify([c.tag,c.date,c.readings,c.order,c.executor]);const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature));const id='excel-cal-'+Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
   if(historyItems.some(r=>r.id===id)||pending.some(r=>r.id===id)){duplicates++;continue}
   const d={version:1,meta:Object.fromEntries(metaKeys.map(k=>[k,k==='title'?'Calibração — '+c.tag:k==='date'?c.date:k==='number'?'CAL-'+c.tag+'-'+c.date:''])),records:[],pending:{fields:Object.fromEntries(itemKeys.map(k=>[k,''])),photos:[],editing:null},calibration:c};pending.push({id,updated:new Date().toISOString(),document:d});
  }
  if(!pending.length){$('cal-import-status').textContent=duplicates?'Este histórico já foi importado.':'Nenhuma aba compatível encontrada.';return}
  if(!confirm('Importar '+pending.length+' calibração(ões)? '+duplicates+' aba(s) duplicada(s) serão ignoradas. O limite 0,02 da planilha será interpretado como 2%.'))return;
  const t=db.transaction('reports','readwrite');for(const r of pending)t.objectStore('reports').put(r);await transactionDone(t);await refreshHistory();savedEvent();$('cal-import-status').textContent=pending.length+' calibração(ões) importada(s). Abra Ver histórico para consultar o gráfico.';
 }
 async function run(get){await guarded(async()=>{await persistCurrent();$('cal-import-status').textContent='Lendo planilha…';try{await importBook(await get())}catch(e){$('cal-import-status').textContent=e.message;throw e}})}
 $('cal-import-model').onclick=()=>run(async()=>{const r=await fetch('historico-ret4.xlsx');if(!r.ok)throw Error('Planilha não encontrada.');return r.arrayBuffer()});
 $('cal-import-file').onchange=e=>{const f=e.target.files[0];if(f)run(()=>f.arrayBuffer());e.target.value=''};
})();
