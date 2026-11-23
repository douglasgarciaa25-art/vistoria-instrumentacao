/* Revisão de relatórios: resumo compacto e detalhes recolhíveis, sem modificar dados ou exportação. */
(()=>{
 'use strict';
 const reportView=document.getElementById('view-review');
 const entries=document.getElementById('entries');
 const search=document.getElementById('reportSearch');
 const strip=reportView?.querySelector('.report-strip');
 if(!reportView||!entries||!strip||document.getElementById('reportOverview'))return;

 const overview=document.createElement('section');
 overview.id='reportOverview';
 overview.className='report-overview';
 overview.setAttribute('aria-label','Resumo dos pontos do relatório');
 const title=document.createElement('h3');
 title.textContent='Visão geral da vistoria';
 const numbers=document.createElement('div');
 numbers.className='report-overview-numbers';
 const counters=[['Pontos','total'],['Pendentes','pending'],['Concluídos','resolved'],['Com fotos','photos']].map(([name,key])=>{
  const card=document.createElement('div');
  const count=document.createElement('strong');
  count.dataset.reportCount=key;
  count.textContent='0';
  const label=document.createElement('small');
  label.textContent=name;
  card.append(count,label);numbers.append(card);
  return {key,count};
 });
 overview.append(title,numbers);
 strip.after(overview);

 const style=document.createElement('style');
 style.textContent=[
  '#view-review .report-overview{background:#fff;border:1px solid #e5dfed;border-radius:14px;padding:15px;margin:12px 0 18px;box-shadow:0 2px 10px #30105d08}',
  '#view-review .report-overview h3{font-size:14px;color:#3a2354;margin:0 0 12px;font-weight:700}',
  '#view-review .report-overview-numbers{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
  '#view-review .report-overview-numbers>div{border-radius:10px;background:#f8f5fb;padding:11px 9px;display:flex;flex-direction:column;align-items:flex-start;gap:3px}',
  '#view-review .report-overview-numbers strong{font-size:20px;line-height:1.2;color:#351463;font-variant-numeric:tabular-nums}',
  '#view-review .report-overview-numbers small{font-size:11px;color:#625573;line-height:1.3}',
  '#view-review .report-status-filter{max-width:360px;margin:10px 0;display:block}',
  '#view-review .report-status-filter select{min-height:44px;margin-top:5px}',
  '#entries .report-snippet{font-size:13px;color:#52475f;margin:12px 0 8px;line-height:1.5;overflow-wrap:anywhere}',
  '#entries .report-point-details{border:1px solid #e9e3ef;border-radius:9px;background:#faf8fc;margin:9px 0 13px;overflow:hidden}',
  '#entries .report-point-details summary{min-height:44px;cursor:pointer;display:flex;align-items:center;padding:12px 14px;font-size:12px;font-weight:700;color:#4c326a}',
  '#entries .report-point-details[open] summary{border-bottom:1px solid #e9e3ef}',
  '#entries .report-point-details>p{font-size:12px;padding:0 14px;line-height:1.55;overflow-wrap:anywhere;white-space:pre-wrap;color:#4c4655}',
  '#entries .report-point-details>p:last-child{padding-bottom:10px}',
  '#entries .report-point-details summary:focus-visible{outline:3px solid #91b95b;outline-offset:-3px}',
  '@media(max-width:500px){#view-review .report-overview{padding:12px}#view-review .report-overview-numbers{gap:5px}#view-review .report-overview-numbers>div{padding:9px 6px}#view-review .report-overview-numbers strong{font-size:18px}#view-review .report-overview-numbers small{font-size:10px}}'
 ].join('\n');
 document.head.append(style);

 let filter=null;
 if(search){
  const wrapper=search.closest('.report-search')||search.parentElement;
  filter=document.createElement('label');
  filter.className='report-status-filter';
  filter.textContent='Situação dos pontos';
  const select=document.createElement('select');
  select.id='reportStatusFilter';
  select.setAttribute('aria-label','Filtrar pontos do relatório');
  const options=[
   ['','Todos os pontos'],
   ['pending','Pendentes ou em acompanhamento'],
   ['resolved','Corrigidos ou sem pendência'],
   ['urgent','Prioridade alta ou crítica'],
   ['with-photos','Somente com fotos'],
   ['without-photos','Somente sem fotos']
  ];
  for(const [value,label] of options)select.add(new Option(label,value));
  filter.append(select);
  wrapper?.append(filter);
  select.addEventListener('change',applyFilter);
  search.addEventListener('input',applyFilter);
 }
 const openPoints=new Set();
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
 const isPending=record=>['Pendente','Em acompanhamento'].includes(record.status);
 const isResolved=record=>['Corrigido','Sem pendência'].includes(record.status);
 const photos=record=>Array.isArray(record.photos)?record.photos.length:0;
 function keyFor(record,index){
  return String(activeReportId||'current')+':'+String(record.pointId||record.id||index);
 }
 function matches(record,index,q,mode){
  const searchable=[record.tag,record.area,record.equipment,record.problem,record.impact,record.action,record.pointWorkOrder,record.owner,record.deadline,record.status,record.priority,record.completionWork,document.getElementById('workOrder')?.value].join(' ');
  if(q&&!normalize(searchable).includes(q))return false;
  if(mode==='pending')return isPending(record);
  if(mode==='resolved')return isResolved(record);
  if(mode==='urgent')return ['Alta','Crítica'].includes(record.priority);
  if(mode==='with-photos')return photos(record)>0;
  if(mode==='without-photos')return photos(record)===0;
  return true;
 }
 function updateSummary(){
  const all=Array.isArray(records)?records:[];
  const values={total:all.length,pending:all.filter(isPending).length,resolved:all.filter(isResolved).length,photos:all.filter(r=>photos(r)>0).length};
  for(const {key,count} of counters)count.textContent=String(values[key]);
 }
 function compactEntries(){
  const list=[...entries.querySelectorAll(':scope > .entry')];
  list.forEach((entry,index)=>{
   const record=records[index];
   if(!record||entry.querySelector('.report-point-details'))return;
   const paragraphs=[...entry.children].filter(el=>el.tagName==='P');
   if(paragraphs.length<2)return;
   const actions=[...entry.children].find(el=>el.classList.contains('actions'));
   if(!actions)return;
   const description=String(paragraphs[1].textContent||'').trim();
   if(description){
    const snippet=document.createElement('p');
    snippet.className='report-snippet';
    snippet.textContent=description.length>150?description.slice(0,147).trimEnd()+'…':description;
    actions.before(snippet);
   }
   const details=document.createElement('details');
   details.className='report-point-details';
   const key=keyFor(record,index);
   if(openPoints.has(key))details.open=true;
   const summary=document.createElement('summary');
   summary.textContent='Ver descrição e informações completas';
   details.append(summary);
   for(const p of paragraphs.slice(1))details.append(p);
   actions.before(details);
   details.addEventListener('toggle',()=>{
    if(details.open)openPoints.add(key);
    else openPoints.delete(key);
   });
  });
 }
 function applyFilter(){
  const all=entries.querySelectorAll(':scope > .entry');
  const q=normalize(search?.value);
  const mode=filter?.querySelector('select')?.value||'';
  let visible=0;
  all.forEach((entry,index)=>{
   const record=records[index];
   const keep=Boolean(record&&matches(record,index,q,mode));
   entry.hidden=!keep;
   if(keep)visible++;
  });
  const result=document.getElementById('reportSearchCount');
  if(result)result.textContent=(q||mode)?visible+' de '+records.length+' ponto(s) encontrados. O filtro não altera o PDF.':'';
 }
 function updateView(){
  updateSummary();
  compactEntries();
  applyFilter();
 }
 const originalRender=render;
 render=function(){const result=originalRender.apply(this,arguments);updateView();return result};
 document.addEventListener('vistoria-saved',updateSummary);
 updateView();
})();
