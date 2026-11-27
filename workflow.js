(()=>{
 const normalize=s=>String(s||'').trim().toLocaleLowerCase('pt-BR');
 function newReference(){const stamp=($('date').value||today()).slice(0,4),seed=(activeReportId||newId()).replace(/-/g,'').toUpperCase();let length=12,ref;do{ref='RV-'+stamp+'-'+seed.slice(0,length);length+=2}while(historyItems.some(r=>r.id!==activeReportId&&r.document.meta.number===ref)&&length<=32);return ref}
 const numberHelp=document.createElement('small');numberHelp.className='muted';numberHelp.textContent='Referência gerada automaticamente ao preencher. Você pode editar.';$('number').after(numberHelp);
 const originalPersist=persistCurrent;persistCurrent=async function(){if(historyReady&&activeReportId&&!$('number').value.trim()&&hasContent(data())){$('number').value=newReference();$('number').dispatchEvent(new Event('change'))}return originalPersist()};
 const originalBlank=blankReport;blankReport=function(){originalBlank();$('number').value=newReference()};
 const plan=document.createElement('details');plan.className='card action-plan';plan.innerHTML='<summary>Plano de ação</summary><p class="muted">Pendências de todas as vistorias salvas neste aparelho, organizadas por prazo e prioridade. Cópias recuperadas aparecem como versões separadas.</p><div class="fields"><label>Responsável<input id="planOwner" placeholder="Nome ou equipe"></label><label>Prioridade<select id="planPriority"><option value="">Todas</option><option>Crítica</option><option>Alta</option><option>Média</option><option>Baixa</option><option>A definir</option></select></label><label>Prazo<select id="planDeadline"><option value="">Todos</option><option value="late">Vencidos</option><option value="today">Para hoje</option><option value="none">Sem prazo</option></select></label></div><p id="planCount" class="muted" aria-live="polite"></p><div id="planList"></div>';$('historyPanel').before(plan);
 const late=r=>r.deadline&&r.deadline<today();let actionRows=[];
 function refreshPlan(){const owner=normalize($('planOwner').value),priority=$('planPriority').value,deadline=$('planDeadline').value,rank={'Crítica':0,'Alta':1,'Média':2,'Baixa':3};actionRows=historyItems.flatMap(row=>row.document.records.map((record,index)=>({record,index,id:row.id,ref:row.document.meta.number||row.document.meta.title}))).filter(({record:r})=>['Pendente','Em acompanhamento'].includes(r.status)&&(!owner||normalize(r.owner||'A definir').includes(owner))&&(!priority||r.priority===priority)&&(!deadline||(deadline==='late'?late(r):deadline==='today'?r.deadline===today():!r.deadline))).sort((a,b)=>Number(!!late(b.record))-Number(!!late(a.record))||(rank[a.record.priority]??4)-(rank[b.record.priority]??4)||(a.record.deadline||'9999').localeCompare(b.record.deadline||'9999'));
 $('planCount').textContent=actionRows.length+' pendência(s) encontrada(s)';$('planList').innerHTML=actionRows.map(({record:r,ref},i)=>'<article class="entry"><div class="plan-title"><h3>'+esc(r.tag)+' · '+esc(r.area)+'</h3><span class="badge">'+esc(r.priority)+'</span></div><p>'+esc(r.problem)+'</p><p><b>Ação:</b> '+esc(r.action||'A definir')+'</p><p class="'+(late(r)?'deadline-alert':'muted')+'">'+esc(r.owner||'Responsável a definir')+' · '+(r.deadline?(late(r)?'Vencido: ':'Prazo: ')+esc(datefmt(r.deadline)):'Sem prazo')+'</p><p class="muted">'+esc(ref)+' · '+esc(r.status)+'</p><button type="button" class="secondary" data-plan-open="'+i+'">Abrir ponto para tratar</button></article>').join('')||'<p class="empty">Nenhuma pendência com estes filtros.</p>'}
 ['planOwner','planPriority','planDeadline'].forEach(id=>$(id).addEventListener('input',refreshPlan));plan.addEventListener('toggle',()=>{if(plan.open)refreshPlan()});
 $('planList').onclick=e=>{const i=e.target.dataset.planOpen;if(i===undefined)return;const target=actionRows[+i];if(!target)return;guarded(async()=>{await persistCurrent();const row=await requestResult(db.transaction('reports').objectStore('reports').get(target.id));if(!row)return notify('Esta vistoria não está mais no histórico.');reset();activeReportId=row.id;fill(row.document);await persistCurrent();document.querySelector('[data-view="review"]').click();const button=$('entries').querySelector('[data-edit="'+target.index+'"]');if(button)button.click()})};
 const search=document.createElement('div');search.className='report-search';search.innerHTML='<div class="report-filters"><label>Origem<select id="reportScope"><option value="current">Vistoria atual</option><option value="all">Todas as vistorias</option></select></label><label>Buscar ponto<input type="search" id="reportSearch" placeholder="TAG, OS, área ou descrição"></label><label>Situação<select id="reportStatusFilter"><option value="">Todos os pontos</option><option value="Pendente">Pendentes</option><option value="Em acompanhamento">Em acompanhamento</option><option value="finalizados">Finalizados</option></select></label></div><p id="reportSearchCount" class="muted" aria-live="polite"></p>';$('entries').before(search);
 function reportPointMatches(r,query,status){
  const normalized=String(query||'').trim().toLocaleLowerCase('pt-BR');
  const closed=['Corrigido','Sem pendência'].includes(r.status);
  const statusMatches=!status||(status==='finalizados'?closed:r.status===status);
  return statusMatches&&(!normalized||[r.tag,r.pointWorkOrder,r.area,r.equipment,r.problem,r.action].join(' ').toLocaleLowerCase('pt-BR').includes(normalized));
 }
 function reportPointDetails(r){
  return [['Condição',r.condition],['Diagnóstico / testes',r.analysisDraft],['Histórico de análise',r.analysisHistory],['Impacto',r.impact],['Ação recomendada / realizada',r.action],['Responsável',r.owner],['Prazo',r.deadline],['Serviço realizado',r.completionWork],['Data de conclusão',r.completionDate],['Concluído por',r.completionBy]].filter(([,v])=>String(v??'').trim());
 }
 let filterReportId, initialSelectionPending=true;
 const selectedPoints=new Set();
 const selectionBar=document.createElement('section');selectionBar.className='report-selection';
 selectionBar.innerHTML='<p id="pointSelectionCount" role="status"></p><button type="button" class="secondary" id="togglePointSelection" aria-haspopup="dialog">Selecionar pontos</button><input type="checkbox" id="onlySelectedPoints" checked hidden><button type="button" id="pdfSelectedPoints" disabled>Baixar PDF</button>';
 search.before(selectionBar);
 const selectionDialog=document.createElement('dialog');selectionDialog.id='reportSelectionDialog';selectionDialog.className='report-selection-dialog';selectionDialog.setAttribute('aria-labelledby','selectionDialogTitle');
 selectionDialog.innerHTML='<div class="selection-dialog-head"><h2 id="selectionDialogTitle">Selecionar pontos</h2><button type="button" class="secondary" id="closePointSelection" aria-label="Fechar seleção">Fechar</button></div><div id="selectionDialogFilters"></div><div class="actions" id="selectionTools"><button type="button" class="secondary" id="selectVisiblePoints">Selecionar visíveis</button><button type="button" class="secondary" id="clearPointSelection">Limpar seleção</button></div><div id="selectionDialogList"></div><div class="selection-dialog-footer"><span id="selectionDialogCount" role="status"></span><button type="button" id="confirmPointSelection">Concluir seleção</button></div>';
 document.body.append(selectionDialog);$('selectionDialogFilters').append(search);
 const dock=document.createElement('div');dock.className='report-export-dock';dock.append($('pdfSelectedPoints'));$('view-review').insertBefore(dock,$('entries').closest('.card'));
 const emptySelection=document.createElement('p');emptySelection.className='report-empty-selection';emptySelection.textContent='Escolha os pontos para montar a prévia.';$('entries').before(emptySelection);
 const pointKey=(reportId,pointId)=>JSON.stringify([reportId,pointId]);
 const currentKey=r=>pointKey(activeReportId,r.pointId);
 function scopedRows(){
  const active=data(), result=[];
  const add=(id,doc)=>{for(const [i,r] of (doc.records||[]).entries())if(r.pointId)result.push({r,i,id,doc,key:pointKey(id,r.pointId)})};
  add(activeReportId,active);
  if($('reportScope').value==='all')for(const row of historyItems)if(row.id!==activeReportId&&row.document)add(row.id,row.document);
  return result;
 }
 function selectedRows(){return scopedRows().filter(row=>selectedPoints.has(row.key))}
 window.VistoriaReportSelection=()=>selectedRows().map(({r})=>r);
 window.VistoriaSelectedReportRows=selectedRows;
 function selectedSnapshots(){
  const groups=new Map();
  for(const row of selectedRows()){
   if(!groups.has(row.id))groups.set(row.id,{doc:row.doc,ids:new Set()});
   groups.get(row.id).ids.add(row.r.pointId);
  }
  return [...groups.values()].map(({doc,ids})=>selectedReportSnapshot(doc,ids)).filter(Boolean);
 }
 const otherPreview=document.createElement('div');
 otherPreview.id='otherSelectedPoints';
 $('entries').after(otherPreview);
 function renderSelectedPreview(){
  $('entries').querySelectorAll('.entry').forEach((entry,i)=>{
   const r=records[i];entry.hidden=!r||!selectedPoints.has(currentKey(r));
  });
  otherPreview.replaceChildren();
  for(const row of selectedRows().filter(row=>row.id!==activeReportId)){
   const {r,doc,i}=row, article=document.createElement('article');article.className='entry';
   const h=document.createElement('h3');h.textContent='Ponto '+String(i+1).padStart(2,'0')+' · '+(r.tag||'TAG não informada');article.append(h);
   const source=document.createElement('p');source.className='muted';source.textContent=[doc.meta?.number,doc.meta?.workOrder?'OS '+doc.meta.workOrder:'',r.area,r.status,r.priority].filter(Boolean).join(' · ');article.append(source);
   const problem=document.createElement('p');problem.textContent=r.problem||'Sem descrição';article.append(problem);
   for(const [label,value] of reportPointDetails(r)){const p=document.createElement('p');p.textContent=label+': '+value;article.append(p)}
   if(r.photos?.length){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Ver fotos / comparar';b.onclick=()=>openPhotos(r.photos,r.tag);article.append(b)}
   otherPreview.append(article);
  }
  emptySelection.hidden=selectedPoints.size>0;
  $('makeSummary').disabled=!selectedPoints.size;
 }
 function selectedReportSnapshot(doc,ids){
  const indices=doc.records.map((r,i)=>ids.has(r.pointId)?i:-1).filter(i=>i>=0);
  if(!indices.length)return null;
  const snapshot=structuredClone({...doc,records:indices.map(i=>doc.records[i])});
  delete snapshot.pending;
  delete snapshot.exportPointNumber;
  snapshot.exportPointNumbers=indices.map(i=>i+1);
  snapshot.meta.sourcePdf='';snapshot.meta.sourcePdfName='';
  if(indices.length!==doc.records.length)snapshot.meta.conclusion='';
  snapshot.meta.title=(snapshot.meta.title||'Relatório de vistoria técnica')+' — '+indices.length+' ponto(s) selecionado(s)';
  return snapshot;
 }
 function initialPointSelection(points,ids,pending){
  if(!pending||!points.length)return pending;
  if(points.length===1){if(!points[0].pointId)return true;ids.add(points[0].pointId)}
  return false;
 }
 function updatePointSelection(){
  const rows=scopedRows();
  const available=new Set(rows.map(row=>row.key));
  for(const id of selectedPoints)if(!available.has(id))selectedPoints.delete(id);
  if(initialSelectionPending&&rows.length){if(rows.length===1&&!$('reportStatusFilter').value)selectedPoints.add(rows[0].key);initialSelectionPending=false}
  $('pointSelectionCount').textContent=selectedPoints.size+' / '+rows.length+' '+(rows.length===1?'ponto':'pontos');
  $('selectionDialogCount').textContent=selectedPoints.size+' selecionado(s)';
  $('togglePointSelection').textContent=selectedPoints.size?'Alterar seleção':'Selecionar pontos';
  $('clearPointSelection').disabled=!selectedPoints.size;
  $('pdfSelectedPoints').disabled=!selectedPoints.size;const previewControl=$('previewSelectedPdf');if(previewControl)previewControl.disabled=!selectedPoints.size;
  $('entries').querySelectorAll('.entry').forEach((entry,i)=>{
   const r=records[i];if(!r)return;
   let input=entry.querySelector('[data-select-point]');
   if(!input){const label=document.createElement('label');label.className='report-selection-check';input=document.createElement('input');input.type='checkbox';label.append(input,document.createTextNode(' Incluir no relatório selecionado'));entry.prepend(label)}
   input.dataset.selectPoint=r.pointId?currentKey(r):'';input.disabled=!r.pointId;
   input.checked=!!r.pointId&&selectedPoints.has(currentKey(r));
   input.setAttribute('aria-label','Selecionar ponto '+(i+1)+' '+(r.tag||''));
  });
 }
 function filterReport(){
  if(filterReportId!==activeReportId){filterReportId=activeReportId;selectedPoints.clear();initialSelectionPending=true;invalidateSummary();$('onlySelectedPoints').checked=true;$('reportSearch').value='';$('reportStatusFilter').value='';if(selectionDialog.open)selectionDialog.close()}
  updatePointSelection();
  renderSelectedPreview();
  const total=scopedRows().length;
  emptySelection.textContent=total?'Escolha os pontos para montar a prévia.':'Nenhum ponto disponível neste escopo.';
  $('togglePointSelection').disabled=false;
  if(selectionDialog.open)renderSelectionDialog();
 }
 function selectableRows(){
  const q=$('reportSearch').value,status=$('reportStatusFilter').value;
  return scopedRows().filter(({r,doc})=>reportPointMatches({...r,pointWorkOrder:[r.pointWorkOrder,doc.meta?.workOrder,doc.meta?.number].filter(Boolean).join(' ')},q,status));
 }
 function renderSelectionDialog(){
  const rows=selectableRows(),list=$('selectionDialogList');list.replaceChildren();
  for(const {r,i,doc,key} of rows){
   const label=document.createElement('label');label.className='selection-dialog-row';
   const input=document.createElement('input');input.type='checkbox';input.dataset.dialogPoint=key;input.checked=selectedPoints.has(key);
   const text=document.createElement('span');const title=document.createElement('strong');title.textContent='Ponto '+String(i+1).padStart(2,'0')+' · '+(r.tag||'TAG não informada');
   const info=document.createElement('small');info.textContent=[doc.meta?.number,doc.meta?.workOrder?'OS '+doc.meta.workOrder:'',r.area,r.equipment,r.status,r.priority].filter(Boolean).join(' · ');text.append(title,info);label.append(input,text);list.append(label);
  }
  $('reportSearchCount').textContent=rows.length+' de '+scopedRows().length+' pontos disponíveis';
  if(!rows.length){const message=document.createElement('p');message.className='muted';message.textContent='Nenhum ponto encontrado.';list.append(message)}
  const visibleSelected=rows.filter(row=>selectedPoints.has(row.key)).length;
  const outside=selectedPoints.size-visibleSelected;
  $('selectionDialogCount').textContent=selectedPoints.size+' selecionado(s)'+(outside?' · '+outside+' fora da busca atual':'');
  $('selectVisiblePoints').disabled=!rows.length;
 }

 function addReportDetails(){
  $('entries').querySelectorAll('.entry').forEach((entry,i)=>{
   const r=records[i],actions=entry.querySelector('.actions');if(!r||!actions||entry.querySelector('.report-point-details'))return;
   const rows=reportPointDetails(r);if(!rows.length)return;
   const details=document.createElement('details');details.className='report-point-details';
   const summary=document.createElement('summary');summary.textContent='Ver detalhes técnicos';details.append(summary);
   const dl=document.createElement('dl');
   for(const [label,value] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);dl.append(dt,dd)}
   details.append(dl);entry.insertBefore(details,actions);
  });
 }
 $('reportSearch').oninput=filterReport;
 function applyScopeOrStatus(){
  initialSelectionPending=false;
  const status=$('reportStatusFilter').value;
  const allowed=new Set(scopedRows().filter(({r})=>reportPointMatches(r,'',status)).map(row=>row.key));
  for(const id of selectedPoints)if(!allowed.has(id))selectedPoints.delete(id);
  invalidateSummary();filterReport();
 }
 $('reportStatusFilter').onchange=applyScopeOrStatus;
 $('reportScope').onchange=applyScopeOrStatus;
 $('onlySelectedPoints').onchange=filterReport;
 $('togglePointSelection').onclick=()=>{selectionDialog.showModal();filterReport()};
 $('closePointSelection').onclick=$('confirmPointSelection').onclick=()=>selectionDialog.close();
 $('selectionDialogList').addEventListener('change',e=>{const id=e.target.dataset.dialogPoint;if(!id)return;initialSelectionPending=false;if(e.target.checked)selectedPoints.add(id);else selectedPoints.delete(id);invalidateSummary();filterReport()});
 function invalidateSummary(){const field=$('summaryText');if(field)field.value='';}
 $('entries').addEventListener('change',e=>{const input=e.target;if(!input.matches('[data-select-point]')||!input.dataset.selectPoint)return;const id=input.dataset.selectPoint;initialSelectionPending=false;if(input.checked)selectedPoints.add(id);else selectedPoints.delete(id);invalidateSummary();filterReport()});
 $('selectVisiblePoints').onclick=()=>{initialSelectionPending=false;for(const {key} of selectableRows())selectedPoints.add(key);invalidateSummary();filterReport()};
 $('clearPointSelection').onclick=()=>{selectedPoints.clear();$('onlySelectedPoints').checked=true;initialSelectionPending=false;invalidateSummary();filterReport()};
 const previewButton=document.createElement('button');previewButton.type='button';previewButton.className='secondary';previewButton.id='previewSelectedPdf';previewButton.textContent='Visualizar PDF';dock.prepend(previewButton);
 function generateSelectedPdf(preview=false){return guarded(async()=>{
  const snapshots=selectedSnapshots();
  if(!snapshots.length)return notify('Selecione pelo menos um ponto já registrado.');
  const pending=data().pending;
  if(pending&&(pending.editing!==null&&pending.editing!==undefined||pending.fields?.tag||pending.fields?.problem||pending.photos?.length)){
   if(!confirm('Existem alterações no formulário ainda não aplicadas. O PDF selecionado utilizará somente os pontos já registrados. Continuar?'))return;
  }
  const button=$('pdfSelectedPoints');button.disabled=true;
  try{if(preview)await exportReportDocuments(snapshots,[],{preview:true});else await exportReportDocuments(snapshots)}finally{filterReport()}
 });}
 $('pdfSelectedPoints').onclick=()=>generateSelectedPdf();previewButton.onclick=()=>generateSelectedPdf(true);
 document.addEventListener('vistoria-saved',filterReport);
 document.addEventListener('DOMContentLoaded',()=>{
  const report=$('view-review'),review=$('entries').closest('.card'),formats=report.querySelector('.report-formats'),actions=formats?.querySelector('.actions');
  review.classList.add('report-preview-card');
  const heading=review.querySelector('h2');if(heading)heading.textContent='Prévia do relatório';
  const step=review.querySelector('.step');if(step)step.hidden=true;
  if(actions){for(const id of ['pdf','pdfAllPoints']){const button=$(id);if(button)actions.append(button)}const title=formats.querySelector('summary');if(title)title.textContent='Exportação completa e outros formatos';}
  const conclusion=$('conclusion')?.closest('label');
  const extras=document.createElement('details');extras.className='report-extras';extras.innerHTML='<summary>Mais opções</summary>';report.append(extras);
  if(conclusion){const details=document.createElement('details');details.className='advanced report-conclusion';details.innerHTML='<summary>Conclusão / observações gerais</summary>';const tools=conclusion.nextElementSibling;details.append(conclusion);if(tools?.classList.contains('technical-review'))details.append(tools);extras.append(details);}
  const ai=document.createElement('details');ai.className='advanced report-ai';ai.innerHTML='<summary>Ferramentas de revisão com IA</summary>';for(const id of ['reportFullReview','reportFullReviewPanel']){const node=$(id);if(node)ai.append(node)}extras.append(ai);
  const trash=$('deleted-points-panel');if(trash)extras.append(trash);
  if(formats)extras.append(formats);extras.append(audit);
  const exec=$('makeSummary').closest('details');exec.classList.add('report-executive');report.insertBefore(exec,extras);
  report.insertBefore(dock,review);
  const note=[...review.children].find(el=>el.matches('p.muted')&&el.textContent.startsWith('PDF:'));if(note&&formats)formats.append(note);
  const nav=document.querySelector('.app-nav');if(nav&&typeof ResizeObserver!=='undefined'){const setOffset=()=>document.documentElement.style.setProperty('--report-nav-height',nav.getBoundingClientRect().height+'px');new ResizeObserver(setOffset).observe(nav);setOffset()}
  filterReport();
 });
 // A single viewer serves current records and TAG history, without changing the source files.
 const viewer=document.createElement('dialog');viewer.className='photo-viewer';viewer.innerHTML='<div class="viewer-head"><h2 id="viewerTitle">Fotos da vistoria</h2><button type="button" id="closeViewer" class="secondary">Fechar</button></div><div class="actions"><button type="button" id="viewerSingle">Foto ampliada</button><button type="button" id="viewerCompare" class="secondary">Antes / depois</button><button type="button" id="viewerZoom" class="secondary">Ampliar detalhe</button></div><div id="singlePhoto"><label>Foto<select id="viewerPhoto"></select></label><div class="photo-zoom"><img id="viewerImage" alt=""></div><p id="viewerCaption" class="muted"></p></div><div id="comparePhotos" hidden><p class="muted">Escolha as fotos para comparar. As legendas Antes/Depois sugerem a seleção.</p><div class="compare-grid"><div><label>Antes<select id="viewerBefore"></select></label><img id="beforeImage" alt="Antes da intervenção"></div><div><label>Depois<select id="viewerAfter"></select></label><img id="afterImage" alt="Depois da intervenção"></div></div></div>';document.body.append(viewer);let viewerPhotos=[];
 function displayPhoto(){const p=viewerPhotos[+$('viewerPhoto').value];if(!p)return;$('viewerImage').src=p.src;$('viewerImage').alt=p.caption||'Evidência da vistoria';$('viewerCaption').textContent=p.caption||'Sem legenda';$('viewerImage').classList.remove('zoomed');$('viewerZoom').textContent='Ampliar detalhe'}
 function displayCompare(){for(const [select,img] of [['viewerBefore','beforeImage'],['viewerAfter','afterImage']]){const p=viewerPhotos[+$(select).value];if(p){$(img).src=p.src;$(img).alt=p.caption||'Evidência'}}}
 function openPhotos(list,title){if(!list.length)return notify('Este ponto não possui fotos.');viewerPhotos=list;$('viewerTitle').textContent=title||'Fotos da vistoria';const options=list.map((p,i)=>'<option value="'+i+'">Foto '+(i+1)+' — '+esc(p.caption||'Sem legenda')+'</option>').join('');for(const id of ['viewerPhoto','viewerBefore','viewerAfter'])$(id).innerHTML=options;$('viewerBefore').value=Math.max(0,list.findIndex(p=>/^\[Antes\]/.test(p.caption)));const after=list.findIndex(p=>/^\[Depois\]/.test(p.caption));$('viewerAfter').value=after<0?Math.min(1,list.length-1):after;$('viewerCompare').disabled=list.length<2;$('singlePhoto').hidden=false;$('comparePhotos').hidden=true;$('viewerZoom').hidden=false;displayPhoto();displayCompare();viewer.showModal()}
 $('viewerPhoto').onchange=displayPhoto;$('viewerBefore').onchange=displayCompare;$('viewerAfter').onchange=displayCompare;$('closeViewer').onclick=()=>viewer.close();$('viewerSingle').onclick=()=>{$('singlePhoto').hidden=false;$('comparePhotos').hidden=true;$('viewerZoom').hidden=false};$('viewerCompare').onclick=()=>{$('singlePhoto').hidden=true;$('comparePhotos').hidden=false;$('viewerZoom').hidden=true};$('viewerZoom').onclick=()=>{const zoom=$('viewerImage').classList.toggle('zoomed');$('viewerZoom').textContent=zoom?'Ajustar à tela':'Ampliar detalhe'};
 function photoButtons(){$('entries').querySelectorAll('.entry').forEach((entry,i)=>{const r=records[i];if(!r)return;const actions=entry.querySelector('.actions');if(!actions)return;if(r.photos.length){const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.viewPhotos=i;b.textContent='Ver fotos / comparar';actions.append(b)}const menu=document.createElement('details');menu.className='report-point-actions';const label=document.createElement('summary');label.textContent='Ações do ponto';actions.before(menu);menu.append(label,actions)})}
 $('entries').addEventListener('click',e=>{if(e.target.dataset.viewPhotos!==undefined){const r=records[+e.target.dataset.viewPhotos];if(r)openPhotos(r.photos,r.tag)}});
 const originalRender=render;render=function(){originalRender();filterReport();addReportDetails();photoButtons()};filterReport();addReportDetails();photoButtons();
 const historyPhotos=$('tagHistoryList');if(historyPhotos)historyPhotos.addEventListener('click',e=>{if(e.target.tagName!=='IMG')return;const entry=e.target.closest('.entry');openPhotos([...entry.querySelectorAll('figure')].map(f=>({src:f.querySelector('img').src,caption:f.querySelector('figcaption').textContent})),entry.querySelector('h3').textContent)});
 document.addEventListener('vistoria-saved',()=>{if(plan.open)refreshPlan()});refreshPlan();
 // Export review uses the actual documents passed to the PDF exporter, including bulk exports.
 const audit=document.createElement('details');audit.className='card';audit.innerHTML='<summary>Revisão antes de exportar</summary><p class="muted">Confira os campos faltantes e os pontos ainda não adicionados. Avisos não impedem a emissão, mas devem ser revisados.</p><button type="button" id="auditReport" class="secondary">Conferir vistoria aberta</button><div id="auditResults" aria-live="polite"></div>';$('view-review').append(audit);
 function inspect(d){const issues=[],m=d.meta||{};for(const [key,label] of [['number','Referência'],['date','Data'],['author','Responsável'],['objective','Objetivo']])if(!String(m[key]||'').trim())issues.push(label+' não preenchido');if(!d.records.length)issues.push('Nenhum ponto adicionado');d.records.forEach((r,i)=>{const tag=r.tag||'Ponto '+(i+1);for(const [key,label] of [['tag','TAG'],['area','Área'],['problem','Condição encontrada']])if(!String(r[key]||'').trim())issues.push(tag+': '+label+' não preenchido');if(['Pendente','Em acompanhamento'].includes(r.status)){for(const [key,label] of [['action','Ação'],['owner','Responsável pela ação'],['deadline','Prazo']])if(!String(r[key]||'').trim())issues.push(tag+': '+label+' a definir')}if(r.status==='Corrigido'&&(!r.completionDate||!r.completionWork))issues.push(tag+': conclusão sem data ou serviço descrito');if(!r.photos.length)issues.push(tag+': sem foto de evidência')});const pending=d.pending;if(pending&&(pending.fields?.tag||pending.fields?.problem||pending.photos?.length))issues.push(pending.editing!==null&&pending.editing!==undefined?'Existe uma edição ainda não aplicada ao ponto':'Existe um ponto preenchido ainda não adicionado');return issues}
 function drawAudit(docs){const counts=new Map();for(const d of docs){const key=normalize(d.meta.number);if(key)counts.set(key,(counts.get(key)||0)+1)}const result=docs.map((d,i)=>{const issues=inspect(d);if(counts.get(normalize(d.meta.number))>1)issues.push('Referência repetida no conjunto selecionado');return {label:d.meta.number||'Vistoria '+(i+1),issues}});$('auditResults').innerHTML=result.map(r=>'<div class="entry"><h3>'+esc(r.label)+'</h3>'+(r.issues.length?'<ul>'+r.issues.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':'<p class="completion-detail">Campos verificados sem pendências de preenchimento.</p>')+'</div>').join('');return result}
 $('auditReport').onclick=()=>{const snapshots=selectedSnapshots();if(!snapshots.length)return notify('Selecione os pontos antes de revisar.');drawAudit(snapshots);audit.open=true};
 const exportPdf=exportReportDocuments;exportReportDocuments=async function(documents,ids=[],options={}){const result=drawAudit(documents),warnings=result.reduce((n,r)=>n+r.issues.length,0);if(warnings){audit.open=true;if(audit.parentElement?.tagName==='DETAILS')audit.parentElement.open=true;document.querySelector('[data-view="review"]').click();if(!confirm('A revisão encontrou '+warnings+' aviso(s) de preenchimento em '+documents.length+' vistoria(s).\n\nCancelar: revisar os detalhes na tela.\nOK: gerar o PDF mesmo assim, apenas com os pontos já adicionados.'))return}return exportPdf(documents,ids,options)};
 const originalWord=$('word').onclick;$('word').onclick=()=>guarded(async()=>{await persistCurrent();const result=drawAudit([data()]);if(result[0].issues.length){audit.open=true;if(audit.parentElement?.tagName==='DETAILS')audit.parentElement.open=true;if(!confirm('A revisão encontrou '+result[0].issues.length+' aviso(s). Gerar o Word mesmo assim?'))return}return originalWord()});
})();
