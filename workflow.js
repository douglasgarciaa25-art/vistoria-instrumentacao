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
 const search=document.createElement('div');search.className='report-search';search.innerHTML='<div class="report-filters"><label>Buscar ponto neste relatório<input type="search" id="reportSearch" placeholder="TAG, OS, área ou descrição"></label><label>Situação<select id="reportStatusFilter"><option value="">Todos os pontos</option><option value="Pendente">Pendentes</option><option value="Em acompanhamento">Em acompanhamento</option><option value="finalizados">Finalizados</option></select></label></div><p id="reportSearchCount" class="muted" aria-live="polite"></p>';$('entries').before(search);
 function reportPointMatches(r,query,status){
  const normalized=String(query||'').trim().toLocaleLowerCase('pt-BR');
  const closed=['Corrigido','Sem pendência'].includes(r.status);
  const statusMatches=!status||(status==='finalizados'?closed:r.status===status);
  return statusMatches&&(!normalized||[r.tag,r.pointWorkOrder,r.area,r.equipment,r.problem,r.action].join(' ').toLocaleLowerCase('pt-BR').includes(normalized));
 }
 function reportPointDetails(r){
  return [['Condição',r.condition],['Diagnóstico / testes',r.analysisDraft],['Histórico de análise',r.analysisHistory],['Impacto',r.impact],['Ação recomendada / realizada',r.action],['Responsável',r.owner],['Prazo',r.deadline],['Serviço realizado',r.completionWork],['Data de conclusão',r.completionDate],['Concluído por',r.completionBy]].filter(([,v])=>String(v??'').trim());
 }
 let filterReportId;
 const selectedPoints=new Set();
 const selectionBar=document.createElement('section');selectionBar.className='report-selection';
 selectionBar.innerHTML='<p id="pointSelectionCount" role="status">Nenhum ponto selecionado</p><div class="actions"><button type="button" class="secondary" id="selectVisiblePoints">Selecionar visíveis</button><button type="button" class="secondary" id="clearPointSelection">Limpar seleção</button></div><label class="report-selection-check"><input type="checkbox" id="onlySelectedPoints"> Exibir somente pontos selecionados</label><button type="button" id="pdfSelectedPoints" disabled>Baixar PDF dos pontos selecionados</button><p class="muted">A seleção não altera os dados da vistoria nem a opção de PDF completo.</p>';
 search.after(selectionBar);
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
 function updatePointSelection(){
  const available=new Set(records.map(r=>r.pointId).filter(Boolean));
  for(const id of selectedPoints)if(!available.has(id))selectedPoints.delete(id);
  $('pointSelectionCount').textContent=selectedPoints.size+' de '+records.length+' ponto(s) selecionado(s)';
  $('pdfSelectedPoints').disabled=!selectedPoints.size;
  $('entries').querySelectorAll('.entry').forEach((entry,i)=>{
   const r=records[i];if(!r)return;
   let input=entry.querySelector('[data-select-point]');
   if(!input){const label=document.createElement('label');label.className='report-selection-check';input=document.createElement('input');input.type='checkbox';label.append(input,document.createTextNode(' Incluir no relatório selecionado'));entry.prepend(label)}
   input.dataset.selectPoint=r.pointId||'';input.disabled=!r.pointId;
   input.checked=!!r.pointId&&selectedPoints.has(r.pointId);
   input.setAttribute('aria-label','Selecionar ponto '+(i+1)+' '+(r.tag||''));
  });
 }
 function filterReport(){
  if(filterReportId!==activeReportId){filterReportId=activeReportId;selectedPoints.clear();$('onlySelectedPoints').checked=false;$('reportSearch').value='';$('reportStatusFilter').value=''}
  updatePointSelection();
  const q=$('reportSearch').value,status=$('reportStatusFilter').value;let count=0;
  $('entries').querySelectorAll('.entry').forEach((entry,i)=>{const r=records[i];const match=!!r&&reportPointMatches(r,q,status)&&(!$('onlySelectedPoints').checked||selectedPoints.has(r.pointId));entry.hidden=!match;if(match)count++});
  const closed=records.filter(r=>['Corrigido','Sem pendência'].includes(r.status)).length;
  $('reportSearchCount').textContent=count+' de '+records.length+' ponto(s) exibido(s) · '+closed+' finalizado(s).'+(q||status||$('onlySelectedPoints').checked?' O filtro não altera o PDF completo.':'');
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
 $('reportSearch').oninput=filterReport;$('reportStatusFilter').onchange=filterReport;
 $('onlySelectedPoints').onchange=filterReport;
 $('entries').addEventListener('change',e=>{const input=e.target;if(!input.matches('[data-select-point]')||!input.dataset.selectPoint)return;const id=input.dataset.selectPoint;if(input.checked)selectedPoints.add(id);else selectedPoints.delete(id);filterReport()});
 $('selectVisiblePoints').onclick=()=>{for(const entry of $('entries').querySelectorAll('.entry:not([hidden])')){const id=entry.querySelector('[data-select-point]')?.dataset.selectPoint;if(id)selectedPoints.add(id)}filterReport()};
 $('clearPointSelection').onclick=()=>{selectedPoints.clear();$('onlySelectedPoints').checked=false;filterReport()};
 $('pdfSelectedPoints').onclick=()=>guarded(async()=>{
  const snapshot=selectedReportSnapshot(data(),selectedPoints);
  if(!snapshot)return notify('Selecione pelo menos um ponto já registrado.');
  const pending=data().pending;
  if(pending&&(pending.editing!==null&&pending.editing!==undefined||pending.fields?.tag||pending.fields?.problem||pending.photos?.length)){
   if(!confirm('Existem alterações no formulário ainda não aplicadas. O PDF selecionado utilizará somente os pontos já registrados. Continuar?'))return;
  }
  const button=$('pdfSelectedPoints');button.disabled=true;
  try{await exportReportDocuments([snapshot])}finally{filterReport()}
 });
 document.addEventListener('vistoria-saved',filterReport);
 // A single viewer serves current records and TAG history, without changing the source files.
 const viewer=document.createElement('dialog');viewer.className='photo-viewer';viewer.innerHTML='<div class="viewer-head"><h2 id="viewerTitle">Fotos da vistoria</h2><button type="button" id="closeViewer" class="secondary">Fechar</button></div><div class="actions"><button type="button" id="viewerSingle">Foto ampliada</button><button type="button" id="viewerCompare" class="secondary">Antes / depois</button><button type="button" id="viewerZoom" class="secondary">Ampliar detalhe</button></div><div id="singlePhoto"><label>Foto<select id="viewerPhoto"></select></label><div class="photo-zoom"><img id="viewerImage" alt=""></div><p id="viewerCaption" class="muted"></p></div><div id="comparePhotos" hidden><p class="muted">Escolha as fotos para comparar. As legendas Antes/Depois sugerem a seleção.</p><div class="compare-grid"><div><label>Antes<select id="viewerBefore"></select></label><img id="beforeImage" alt="Antes da intervenção"></div><div><label>Depois<select id="viewerAfter"></select></label><img id="afterImage" alt="Depois da intervenção"></div></div></div>';document.body.append(viewer);let viewerPhotos=[];
 function displayPhoto(){const p=viewerPhotos[+$('viewerPhoto').value];if(!p)return;$('viewerImage').src=p.src;$('viewerImage').alt=p.caption||'Evidência da vistoria';$('viewerCaption').textContent=p.caption||'Sem legenda';$('viewerImage').classList.remove('zoomed');$('viewerZoom').textContent='Ampliar detalhe'}
 function displayCompare(){for(const [select,img] of [['viewerBefore','beforeImage'],['viewerAfter','afterImage']]){const p=viewerPhotos[+$(select).value];if(p){$(img).src=p.src;$(img).alt=p.caption||'Evidência'}}}
 function openPhotos(list,title){if(!list.length)return notify('Este ponto não possui fotos.');viewerPhotos=list;$('viewerTitle').textContent=title||'Fotos da vistoria';const options=list.map((p,i)=>'<option value="'+i+'">Foto '+(i+1)+' — '+esc(p.caption||'Sem legenda')+'</option>').join('');for(const id of ['viewerPhoto','viewerBefore','viewerAfter'])$(id).innerHTML=options;$('viewerBefore').value=Math.max(0,list.findIndex(p=>/^\[Antes\]/.test(p.caption)));const after=list.findIndex(p=>/^\[Depois\]/.test(p.caption));$('viewerAfter').value=after<0?Math.min(1,list.length-1):after;$('viewerCompare').disabled=list.length<2;$('singlePhoto').hidden=false;$('comparePhotos').hidden=true;$('viewerZoom').hidden=false;displayPhoto();displayCompare();viewer.showModal()}
 $('viewerPhoto').onchange=displayPhoto;$('viewerBefore').onchange=displayCompare;$('viewerAfter').onchange=displayCompare;$('closeViewer').onclick=()=>viewer.close();$('viewerSingle').onclick=()=>{$('singlePhoto').hidden=false;$('comparePhotos').hidden=true;$('viewerZoom').hidden=false};$('viewerCompare').onclick=()=>{$('singlePhoto').hidden=true;$('comparePhotos').hidden=false;$('viewerZoom').hidden=true};$('viewerZoom').onclick=()=>{const zoom=$('viewerImage').classList.toggle('zoomed');$('viewerZoom').textContent=zoom?'Ajustar à tela':'Ampliar detalhe'};
 function photoButtons(){$('entries').querySelectorAll('.entry').forEach((entry,i)=>{if(!records[i].photos.length)return;const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.viewPhotos=i;b.textContent='Ver fotos / comparar';entry.querySelector('.actions').append(b)})}
 $('entries').addEventListener('click',e=>{if(e.target.dataset.viewPhotos!==undefined){const r=records[+e.target.dataset.viewPhotos];if(r)openPhotos(r.photos,r.tag)}});
 const originalRender=render;render=function(){originalRender();filterReport();addReportDetails();photoButtons()};filterReport();addReportDetails();photoButtons();
 const historyPhotos=$('tagHistoryList');if(historyPhotos)historyPhotos.addEventListener('click',e=>{if(e.target.tagName!=='IMG')return;const entry=e.target.closest('.entry');openPhotos([...entry.querySelectorAll('figure')].map(f=>({src:f.querySelector('img').src,caption:f.querySelector('figcaption').textContent})),entry.querySelector('h3').textContent)});
 document.addEventListener('vistoria-saved',()=>{if(plan.open)refreshPlan()});refreshPlan();
 // Export review uses the actual documents passed to the PDF exporter, including bulk exports.
 const audit=document.createElement('details');audit.className='card';audit.innerHTML='<summary>Revisão antes de exportar</summary><p class="muted">Confira os campos faltantes e os pontos ainda não adicionados. Avisos não impedem a emissão, mas devem ser revisados.</p><button type="button" id="auditReport" class="secondary">Conferir vistoria aberta</button><div id="auditResults" aria-live="polite"></div>';$('view-review').prepend(audit);
 function inspect(d){const issues=[],m=d.meta||{};for(const [key,label] of [['number','Referência'],['date','Data'],['author','Responsável'],['objective','Objetivo']])if(!String(m[key]||'').trim())issues.push(label+' não preenchido');if(!d.records.length)issues.push('Nenhum ponto adicionado');d.records.forEach((r,i)=>{const tag=r.tag||'Ponto '+(i+1);for(const [key,label] of [['tag','TAG'],['area','Área'],['problem','Condição encontrada']])if(!String(r[key]||'').trim())issues.push(tag+': '+label+' não preenchido');if(['Pendente','Em acompanhamento'].includes(r.status)){for(const [key,label] of [['action','Ação'],['owner','Responsável pela ação'],['deadline','Prazo']])if(!String(r[key]||'').trim())issues.push(tag+': '+label+' a definir')}if(r.status==='Corrigido'&&(!r.completionDate||!r.completionWork))issues.push(tag+': conclusão sem data ou serviço descrito');if(!r.photos.length)issues.push(tag+': sem foto de evidência')});const pending=d.pending;if(pending&&(pending.fields?.tag||pending.fields?.problem||pending.photos?.length))issues.push(pending.editing!==null&&pending.editing!==undefined?'Existe uma edição ainda não aplicada ao ponto':'Existe um ponto preenchido ainda não adicionado');return issues}
 function drawAudit(docs){const counts=new Map();for(const d of docs){const key=normalize(d.meta.number);if(key)counts.set(key,(counts.get(key)||0)+1)}const result=docs.map((d,i)=>{const issues=inspect(d);if(counts.get(normalize(d.meta.number))>1)issues.push('Referência repetida no conjunto selecionado');return {label:d.meta.number||'Vistoria '+(i+1),issues}});$('auditResults').innerHTML=result.map(r=>'<div class="entry"><h3>'+esc(r.label)+'</h3>'+(r.issues.length?'<ul>'+r.issues.map(v=>'<li>'+esc(v)+'</li>').join('')+'</ul>':'<p class="completion-detail">Campos verificados sem pendências de preenchimento.</p>')+'</div>').join('');return result}
 $('auditReport').onclick=()=>{drawAudit([data()]);audit.open=true};
 const exportPdf=exportReportDocuments;exportReportDocuments=async function(documents){const result=drawAudit(documents),warnings=result.reduce((n,r)=>n+r.issues.length,0);if(warnings){audit.open=true;document.querySelector('[data-view="review"]').click();if(!confirm('A revisão encontrou '+warnings+' aviso(s) de preenchimento em '+documents.length+' vistoria(s).\n\nCancelar: revisar os detalhes na tela.\nOK: gerar o PDF mesmo assim, apenas com os pontos já adicionados.'))return}return exportPdf(documents)};
 const originalWord=$('word').onclick;$('word').onclick=()=>guarded(async()=>{await persistCurrent();const result=drawAudit([data()]);if(result[0].issues.length){audit.open=true;if(!confirm('A revisão encontrou '+result[0].issues.length+' aviso(s). Gerar o Word mesmo assim?'))return}return originalWord()});
})();
