/* Persistent multi-report history. Uses the same database to migrate the previous draft. */
let activeReportId=null,historyItems=[],historyReady=false,historyBusy=false,saveTimer=null;
function savedEvent(){if(typeof document.dispatchEvent==='function')document.dispatchEvent(new CustomEvent('vistoria-saved'))}
const newId=()=>crypto.randomUUID();
const hasContent=d=>d.records.length||(d.meta.number&&!/^RV-\d{4}-[A-F0-9]+$/i.test(d.meta.number))||d.meta.workOrder||d.pending?.fields?.pointWorkOrder||d.meta.objective||d.meta.conclusion||d.pending?.fields?.tag||d.pending?.fields?.problem||d.pending?.photos?.length;
function transactionDone(t){return new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onerror=()=>reject(t.error||Error('Falha de armazenamento'));t.onabort=()=>reject(t.error||Error('Gravação cancelada'))})}
function requestResult(r){return new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
/* Gravações sequenciais: uma conclusão atrasada nunca sobrescreve a edição seguinte. */
let persistQueue=Promise.resolve();
async function persistCurrent(){
 clearTimeout(saveTimer);saveTimer=null;
 if(!historyReady||!db)throw Error('Armazenamento indisponível. Baixe uma cópia antes de sair.');
 // Captura o formulário e seu ID juntos, antes de qualquer operação assíncrona.
 const snapshot=structuredClone(data()),savingId=activeReportId;
 if(snapshot.meta.finalizedAt&&(!vistoriaAllPointsClosed(snapshot)||vistoriaHasNewDraft(snapshot))){snapshot.meta.finalizedAt='';$('finalizedAt').value='';}
 const task=async()=>{
  const t=db.transaction(['draft','reports'],'readwrite');
  t.objectStore('draft').put({...snapshot,reportId:savingId},'current');
  const deletion=t.objectStore('draft').get('deleted-report:'+savingId);
  deletion.onsuccess=()=>{
   if(deletion.result)return;
   if(hasContent(snapshot))t.objectStore('reports').put({id:savingId,updated:new Date().toISOString(),document:snapshot});
   else t.objectStore('reports').delete(savingId);
  };
  await transactionDone(t);
  if(savingId===activeReportId&&!saveTimer)$('saveState').textContent='Formulário salvo automaticamente neste navegador.';
  await refreshHistory();
  savedEvent();
 };
 const pending=persistQueue.catch(()=>{}).then(task);
 persistQueue=pending;
 return pending;
}
function save(){clearTimeout(saveTimer);$('saveState').textContent='Alterações pendentes de salvamento…';if(typeof document.dispatchEvent==='function')document.dispatchEvent(new CustomEvent('vistoria-dirty'));saveTimer=setTimeout(()=>persistCurrent().catch(e=>{$('saveState').textContent=e.message;notify(e.message)}),450)}
if(typeof document.addEventListener==='function'){const flush=()=>{if(saveTimer&&historyReady)persistCurrent().catch(e=>notify(e.message))};document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush()});if(typeof window!=='undefined')window.addEventListener('pagehide',flush)}
// Organização por área, independente da área técnica dos pontos.
const VISTORIA_AREA_KEY='vistoria-report-areas-v1';
const vistoriaAreaOpen=new Map();
// Keep the user's disclosure state across refreshes, filters and moves by report ID.
const vistoriaMoreOpen=new Set();
let vistoriaHistoryMarkup=null;
function vistoriaReplaceHistoryMarkup(host,markup){
 for(const menu of host.querySelectorAll('details.report-more')){
  const id=menu.closest('[data-area-report-id]')?.dataset.areaReportId;
  if(id){if(menu.open)vistoriaMoreOpen.add(id);else vistoriaMoreOpen.delete(id);}
 }
 // Sync/autosave often refresh the exact same list. Keep its actual DOM, including focus and drag state.
 if(vistoriaHistoryMarkup===markup)return;
 const focused=typeof document!=='undefined'?document.activeElement:null;
 const focusedCard=focused?.closest?.('[data-area-report-id]');
 const focusedId=focusedCard?.dataset.areaReportId;
 const focusedAction=focused&&focusedCard?Array.from(focused.attributes||[]).find(a=>a.name.startsWith('data-'))?.name:null;
 const focusedSummary=focused?.matches?.('.report-more>summary');
 host.innerHTML=markup;vistoriaHistoryMarkup=markup;
 for(const menu of host.querySelectorAll('details.report-more')){
  const id=menu.closest('[data-area-report-id]')?.dataset.areaReportId;
  menu.open=vistoriaMoreOpen.has(id);
 }
 if(focusedId){
  const card=Array.from(host.querySelectorAll('[data-area-report-id]')).find(el=>el.dataset.areaReportId===focusedId);
  const next=focusedSummary?card?.querySelector('.report-more>summary'):focusedAction?card?.querySelector('['+focusedAction+']'):null;
  next?.focus({preventScroll:true});
 }
}
function vistoriaAreaName(value){return String(value||'').normalize('NFC').trim().replace(/\s+/g,' ').slice(0,80);}
function vistoriaAreaKey(value){return vistoriaAreaName(value).toLocaleLowerCase('pt-BR');}
function vistoriaReportArea(doc){
 const explicit=vistoriaAreaName(doc?.meta?.reportArea);
 if(explicit)return explicit;
 const names=[...new Map((doc?.records||[]).map(p=>[vistoriaAreaKey(p.area),vistoriaAreaName(p.area)]).filter(([k])=>k)).values()];
 return names.length===1?names[0]:'';
}
function vistoriaAreaCatalog(rows=historyItems,custom){
 let saved=custom;
 if(!saved){try{saved=JSON.parse(localStorage.getItem(VISTORIA_AREA_KEY)||'[]')}catch{saved=[]}}
 const names=[...(Array.isArray(saved)?saved:[]),...rows.flatMap(r=>[vistoriaReportArea(r.document),])];
 const unique=new Map();for(const value of names){const name=vistoriaAreaName(value),key=vistoriaAreaKey(name);if(key&&!unique.has(key))unique.set(key,name);}
 return [...unique.values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function vistoriaGroupRows(rows,catalog){
 const groups=new Map(catalog.map(name=>[vistoriaAreaKey(name),{name,rows:[]}]));
 for(const row of rows){const area=vistoriaReportArea(row.document),key=vistoriaAreaKey(area);if(!groups.has(key))groups.set(key,{name:area||'Sem área definida',rows:[]});groups.get(key).rows.push(row);}
 return [...groups.entries()].sort(([a,x],[b,y])=>a===b?0:!a?1:!b?-1:x.name.localeCompare(y.name,'pt-BR'));
}
function vistoriaRefreshAreaOptions(){
 const list=$('vistoriaAreaOptions');if(!list)return;
 list.replaceChildren(...vistoriaAreaCatalog().map(name=>{const o=document.createElement('option');o.value=name;return o;}));
}
function vistoriaRememberArea(value){
 const name=vistoriaAreaName(value);if(!name)throw Error('Informe o nome da área.');
 const match=vistoriaAreaCatalog().find(a=>vistoriaAreaKey(a)===vistoriaAreaKey(name));
 let saved;try{saved=JSON.parse(localStorage.getItem(VISTORIA_AREA_KEY)||'[]')}catch{saved=[]}
 if(!Array.isArray(saved))saved=[];
 if(!saved.some(a=>vistoriaAreaKey(a)===vistoriaAreaKey(name)))localStorage.setItem(VISTORIA_AREA_KEY,JSON.stringify([...saved,match||name]));
 return match||name;
}
function vistoriaCreateArea(){
 const value=prompt('Nome da nova área (ex.: Britagem, Moagem, Flotação):');if(value===null)return;
 try{const name=vistoriaRememberArea(value);renderHistory();refreshVistoriaCloudStatuses();notify('Área disponível: '+name);}catch(e){notify(e.message);}
}
async function vistoriaDeleteArea(key){
 if(!key)return;
 return guarded(async()=>{
  await persistCurrent();
  const name=vistoriaAreaCatalog().find(a=>vistoriaAreaKey(a)===key);
  if(!name)return;
  if(historyItems.some(r=>vistoriaAreaKey(vistoriaReportArea(r.document))===key))throw Error('Mova todas as vistorias desta área antes de excluir. Confira também as finalizadas.');
  if(!confirm('Excluir a área vazia '+name+'? Nenhuma vistoria será excluída.'))return;
  let saved=JSON.parse(localStorage.getItem(VISTORIA_AREA_KEY)||'[]');
  if(!Array.isArray(saved))saved=[];
  localStorage.setItem(VISTORIA_AREA_KEY,JSON.stringify(saved.filter(a=>vistoriaAreaKey(a)!==key)));
  vistoriaAreaOpen.delete(key);renderHistory();refreshVistoriaCloudStatuses();notify('Área excluída neste aparelho.');
 });
}
async function vistoriaMoveArea(id,destination){
 return guarded(async()=>{
  await persistCurrent();
  const previous=await requestResult(db.transaction('reports').objectStore('reports').get(id));
  if(!previous)throw Error('Sincronize a vistoria antes de mover.');
  const current=vistoriaReportArea(previous.document),names=vistoriaAreaCatalog();
  const value=destination===undefined?prompt('Área de destino (escolha uma existente ou digite uma nova):\n'+names.join(' · '),current):destination;
  if(value===null)return;
  const area=vistoriaRememberArea(value);
  if(vistoriaAreaKey(area)===vistoriaAreaKey(current)&&previous.document.meta.reportArea)return;
  const tx=db.transaction(['reports','draft'],'readwrite'),done=transactionDone(tx),store=tx.objectStore('reports'),draft=tx.objectStore('draft');
  let changed=false;
  const req=store.get(id);
  req.onsuccess=()=>{
   const latest=req.result;if(!latest||JSON.stringify(latest.document)!==JSON.stringify(previous.document))return;
   const marker=draft.get('deleted-report:'+id);
   marker.onsuccess=()=>{
    if(marker.result)return;
    const next={...latest.document,meta:{...latest.document.meta,reportArea:area}};
    const current=draft.get('current');
    current.onsuccess=()=>{
     store.put({...latest,updated:new Date().toISOString(),document:next});
     if(current.result?.reportId===id)draft.put({...current.result,meta:{...current.result.meta,reportArea:area}},'current');
     changed=true;
    };
   };
  };
  await done;if(!changed)throw Error('A vistoria foi alterada. Tente novamente.');
  if(activeReportId===id)$('reportArea').value=area;
  await refreshHistory();savedEvent();notify('Vistoria movida para '+area+'. Os pontos e o ID foram preservados.');
 });
}

// Finalização da vistoria: no clique, salva a edição aberta, marca pontos como corrigidos e preserva evidências.
function vistoriaAllPointsClosed(doc){
 return !!doc?.records?.length&&doc.records.every(vistoriaPointClosed);
}
function vistoriaPointClosed(p){return ['Corrigido','Sem pendência'].includes(p?.status);}
function vistoriaClosedPointCount(doc){return (doc?.records||[]).filter(vistoriaPointClosed).length;}
function vistoriaHistoryPoints(doc,show){return (doc?.records||[]).filter(p=>show||!vistoriaPointClosed(p));}
function vistoriaHasNewDraft(doc){
 const p=doc?.pending;
 return !!p&&p.editing==null&&!!(p.fields?.tag||p.fields?.problem||p.fields?.pointWorkOrder||p.photos?.length);
}
function vistoriaReportStatus(doc){
 if(!doc||!Array.isArray(doc.records))return {kind:'unknown',label:'Status indisponível'};
 if(doc.records.some(p=>p?.status==='Pendente'))return {kind:'pending',label:'Pendente'};
 if(vistoriaAllPointsClosed(doc)&&!vistoriaHasNewDraft(doc)&&doc.pending?.editing==null)return doc.meta?.finalizedAt?{kind:'done',label:'Finalizada'}:{kind:'progress',label:'Pronta para finalizar'};
 if(!doc.records.length)return {kind:'progress',label:'Não iniciada'};
 if(vistoriaAllPointsClosed(doc)&&!vistoriaHasNewDraft(doc))return {kind:'progress',label:'Pronta para finalizar'};
 return {kind:'progress',label:'Em acompanhamento'};
}
function vistoriaStatusHtml(doc){
 const {kind,label}=vistoriaReportStatus(doc);
 const closed=vistoriaClosedPointCount(doc);
 return '<span class="vistoria-status" data-status-kind="'+kind+'" data-finalized-points="'+closed+'"><span class="vistoria-status-dot" aria-hidden="true"></span>'+label+(closed?' · '+closed+' ponto(s) finalizado(s)':'')+'</span>';
}
function vistoriaStatusAction(doc){
 return vistoriaReportStatus(doc).kind==='done'?'Reabrir vistoria':'Marcar como finalizada';
}
// Only an explicit filter action opens folders with matching finalized reports.
function vistoriaRevealFinalizedAreas(host,folderSelector){
 for(const folder of host.querySelectorAll(folderSelector)){
  const cards=folder.querySelectorAll('[data-area-report-id],.cloud-report-card[data-report-id]');
  if(Array.from(cards).some(card=>!card.hidden&&card.style.display!=='none'&&(card.querySelector('[data-status-kind="done"]')||Number(card.querySelector('[data-finalized-points]')?.dataset.finalizedPoints)>0)))folder.open=true;
 }
}
function vistoriaFinalizedLabel(count,show){
 return 'Mostrar finalizadas ('+count+' pontos)'+(show&&count===0?' — nenhuma encontrada nos filtros atuais':'');
}
function vistoriaVisible(doc,showFinalized){
 return !!showFinalized||vistoriaReportStatus(doc).kind!=='done';
}
function refreshVistoriaCloudStatuses(){
 const lists=new Set();
 for(const card of document.querySelectorAll('.cloud-report-card[data-report-id]')){
  const indicator=card.querySelector('[data-vistoria-status]'),button=card.querySelector('[data-finalize-cloud-report]');
  if(!indicator)continue;
  const row=historyItems.find(r=>r.id===card.dataset.reportId),doc=row?.document;
  indicator.innerHTML=vistoriaStatusHtml(doc);
  if(button){button.textContent=vistoriaStatusAction(doc);button.disabled=!doc;}const area=card.querySelector('[data-report-area-label]');if(area)area.textContent=vistoriaReportArea(doc)||'Sem área definida';const move=card.querySelector('[data-move-cloud-area]');if(move)move.disabled=!doc;
  const list=card.closest('.cloud-report-list');if(list)lists.add(list);
 }
 for(const list of lists)list.dispatchEvent(new Event('vistoria-status-refresh'));
}
function vistoriaPrepareFinalization(doc,stamp){
  if(!doc?.records?.length)throw Error('Adicione pelo menos um ponto antes de finalizar a vistoria.');
  const next=structuredClone(doc);
  if(vistoriaHasNewDraft(next))throw Error('Salve o novo ponto antes de finalizar. Nenhum rascunho será descartado.');
  const edit=next.pending?.editing;
  if(edit!=null){
    if(!Number.isInteger(edit)||!next.records[edit])throw Error('Não foi possível identificar o ponto em edição. Salve o ponto antes de finalizar.');
    const fields=next.pending.fields||{},updated={...next.records[edit]};
    for(const key of itemKeys)if(Object.prototype.hasOwnProperty.call(fields,key))updated[key]=String(fields[key]??'').trim();
    if(!updated.tag||!updated.area||!updated.problem)throw Error('Informe TAG, área e condição encontrada no ponto em edição antes de finalizar.');
    updated.photos=structuredClone(next.pending.photos??updated.photos??[]);
    next.records[edit]=updated;
  }
  next.records=next.records.map(point=>{
    if(vistoriaPointClosed(point))return point;
    return {...point,status:'Corrigido',completionDate:point.completionDate||today()};
  });
  next.meta={...next.meta,finalizedAt:stamp};
  next.pending={...next.pending,editing:null,photos:[],fields:Object.fromEntries(itemKeys.map(key=>[key,'']))};
  return next;
}
async function setVistoriaFinalized(id){
 return guarded(async()=>{
  await persistCurrent();
  const previous=await requestResult(db.transaction('reports').objectStore('reports').get(id));
  if(!previous)throw Error('Vistoria não encontrada neste aparelho. Sincronize a nuvem.');
  const reopen=!!previous.document.meta?.finalizedAt&&vistoriaReportStatus(previous.document).kind==='done';
  if(reopen){
   if(!confirm('Abrir esta vistoria para reavaliar os pontos? Altere a situação do ponto que precisa ser reaberto.'))return;
   const reopened=structuredClone(previous.document);reopened.meta.finalizedAt='';
   reset();activeReportId=previous.id;fill(reopened);
   if(window.openSavedPointEditor)window.openSavedPointEditor();
   await persistCurrent();
   notify('Vistoria aberta. Altere a situação do ponto para reabrir a pendência.');
   ($('identification')||$('meta')).scrollIntoView({behavior:'smooth'});
   return;
  }
  const stamp=new Date().toISOString();
  const next=vistoriaPrepareFinalization(previous.document,stamp);
  const tx=db.transaction(['reports','draft'],'readwrite'),done=transactionDone(tx),store=tx.objectStore('reports'),draft=tx.objectStore('draft');
  let changed=false;
  const req=store.get(id);
  req.onsuccess=()=>{
   const latest=req.result;
   if(!latest||JSON.stringify(latest.document)!==JSON.stringify(previous.document))return;
   const marker=draft.get('deleted-report:'+id);
   marker.onsuccess=()=>{
    if(marker.result)return;
    const current=draft.get('current');
    current.onsuccess=()=>{
     store.put({...latest,updated:new Date().toISOString(),document:next});
     if(current.result?.reportId===id)draft.put({...next,reportId:id},'current');
     changed=true;
    };
   };
  };
  await done;
  if(!changed)throw Error('A vistoria foi alterada durante a operação. Atualize e tente novamente.');
  if(activeReportId===id){reset();fill(next);}
  await refreshHistory();savedEvent();
  notify('Vistoria finalizada e pontos marcados como corrigidos. Use Mostrar finalizadas para consultá-la.');
 });
}
async function refreshHistory(){const rows=await requestResult(db.transaction('reports').objectStore('reports').getAll());historyItems=rows.sort((a,b)=>b.updated.localeCompare(a.updated));renderHistory();vistoriaRefreshAreaOptions();refreshVistoriaCloudStatuses()}
function renderHistory(){const query=$('historySearch').value.trim().toLocaleLowerCase('pt-BR');const matching=historyItems.filter(r=>matchesFilters(r.document)).filter(r=>[r.document.meta.title,r.document.meta.number,r.document.meta.workOrder,r.document.meta.date,vistoriaReportArea(r.document),...r.document.records.flatMap(v=>[v.tag,v.area,v.pointWorkOrder,v.completionBy,v.owner])].join(' ').toLocaleLowerCase('pt-BR').includes(query));const showFinalized=!!$('showFinalizedReports')?.checked;const rows=matching.filter(r=>vistoriaVisible(r.document,showFinalized));const finalLabel=$('finalizedReportsLabel');if(finalLabel)finalLabel.textContent=vistoriaFinalizedLabel(matching.reduce((sum,r)=>sum+vistoriaClosedPointCount(r.document),0),showFinalized);const host=$('historyList');for(const d of host.querySelectorAll('details[data-area-group]'))vistoriaAreaOpen.set(d.dataset.areaGroup,d.open);const catalog=vistoriaAreaCatalog();const groups=vistoriaGroupRows(rows,catalog);const card=r=>{const d=r.document;return `<div class="entry" data-area-report-id="${esc(r.id)}"><span class="area-drag-handle" draggable="true" title="Arraste para outra área" aria-hidden="true">⠿</span><h3>${esc(d.meta.title||'Relatório de vistoria')}</h3><p class="report-reference">${esc(d.meta.number||'')}</p>${vistoriaStatusHtml(d)}<p>${esc(datefmt(d.meta.date))} · ${d.records.length} ponto(s)${r.id===activeReportId?' · <b>Em edição</b>':''}</p><p class="muted">${esc(vistoriaHistoryPoints(d,showFinalized).map(v=>v.tag).slice(0,5).join(' · '))}</p><div class="actions"><button type="button" data-review-report="${esc(r.id)}">Ver relatório</button><button type="button" class="secondary" data-open-report="${esc(r.id)}">Abrir / editar</button><button type="button" class="secondary vistoria-finalize-action" data-finalize-report="${esc(r.id)}">${vistoriaStatusAction(d)}</button><details class="report-more"><summary>Mais opções</summary><div class="report-more-actions"><button type="button" class="secondary" data-move-report-area="${esc(r.id)}">Mover para área</button><button type="button" class="secondary" data-duplicate-report="${esc(r.id)}">Duplicar vistoria</button><button type="button" class="danger" data-remove-report="${esc(r.id)}">Mover para lixeira</button></div></details></div></div>`};const markup=groups.length?groups.map(([key,group])=>`<details class="vistoria-area-group" data-area-group="${esc(key)}" ${vistoriaAreaOpen.get(key)===true?'open':''}><summary><span>${esc(group.name)}</span><small>${group.rows.length} vistoria(s)</small></summary><div class="vistoria-area-body">${key?`<div class="area-folder-actions"><button type="button" class="danger" data-delete-area="${esc(key)}">Excluir área</button></div>`:''}${group.rows.map(card).join('')||'<p class="muted">Nenhuma vistoria visível nesta área.</p>'}</div></details>`).join(''):`<p class="empty">${query?'Nenhum formulário encontrado.':'Seus formulários aparecerão aqui ao preencher a vistoria.'}</p>`;vistoriaReplaceHistoryMarkup(host,markup);vistoriaRefreshAreaOptions()}
function blankReport(){records=[];reset();['reportArea','finalizedAt','number','workOrder','objective','conclusion','revision','approver','approvalDate','homologator','homologDate','revisionNote'].forEach(k=>$(k).value='');$('date').value=today();activeReportId=newId();render()}
async function guarded(action){if(busy||historyBusy)return notify('Aguarde a operação em andamento.');if(!historyReady)return notify('O armazenamento ainda não está disponível.');historyBusy=true;try{await action()}catch(e){notify('Não foi possível concluir: '+e.message)}finally{historyBusy=false}}
async function createNew(){await guarded(async()=>{await persistCurrent();blankReport();await persistCurrent();notify('Nova vistoria aberta. A anterior permanece na lista.');($('identification')||$('meta')).scrollIntoView({behavior:'smooth'})})}
$('newReport').onclick=createNew;$('clear').onclick=createNew;
$('saveReport').onclick=()=>guarded(async()=>{await persistCurrent();notify('Formulário salvo.')});
const finalFilter=document.createElement('label');finalFilter.className='vistoria-finalized-filter';finalFilter.innerHTML='<input type="checkbox" id="showFinalizedReports"><span id="finalizedReportsLabel" aria-live="polite">Mostrar finalizadas (0)</span>';$('historyList').before(finalFilter);
$('showFinalizedReports').onchange=()=>{renderHistory();if($('showFinalizedReports').checked)vistoriaRevealFinalizedAreas($('historyList'),'details[data-area-group]');};
const areaTools=document.createElement('div');areaTools.className='vistoria-area-tools';
const createAreaButton=document.createElement('button');createAreaButton.type='button';createAreaButton.className='secondary';createAreaButton.textContent='+ Criar área';createAreaButton.onclick=vistoriaCreateArea;
const areaHint=document.createElement('small');areaHint.className='muted';areaHint.textContent='Áreas vazias ficam neste aparelho; áreas atribuídas acompanham a sincronização.';
areaTools.append(createAreaButton,areaHint);$('historyList').before(areaTools);
const areaHistory=$('historyList');
areaHistory.addEventListener('click',ev=>{const b=ev.target.closest('[data-delete-area]');if(!b)return;ev.preventDefault();ev.stopImmediatePropagation();vistoriaDeleteArea(b.dataset.deleteArea)},true);
let draggedAreaReport=null;
function clearAreaDrag(){draggedAreaReport=null;areaHistory.querySelectorAll('.area-drop-target').forEach(el=>el.classList.remove('area-drop-target'))}
areaHistory.addEventListener('dragstart',ev=>{
 const handle=ev.target.closest('.area-drag-handle'),card=handle?.closest('[data-area-report-id]');
 if(!card||!ev.dataTransfer)return;
 draggedAreaReport=card.dataset.areaReportId;ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',draggedAreaReport);
});
areaHistory.addEventListener('dragover',ev=>{
 const folder=ev.target.closest('details[data-area-group]');
 if(!draggedAreaReport||!folder?.dataset.areaGroup||!ev.dataTransfer)return;
 ev.preventDefault();ev.dataTransfer.dropEffect='move';
 areaHistory.querySelectorAll('.area-drop-target').forEach(el=>{if(el!==folder)el.classList.remove('area-drop-target')});
 folder.classList.add('area-drop-target');
});
areaHistory.addEventListener('dragleave',ev=>{const folder=ev.target.closest('details[data-area-group]');if(folder&&!folder.contains(ev.relatedTarget))folder.classList.remove('area-drop-target')});
areaHistory.addEventListener('dragend',clearAreaDrag);
areaHistory.addEventListener('drop',ev=>{
 const folder=ev.target.closest('details[data-area-group]'),id=draggedAreaReport;
 if(!id||!folder?.dataset.areaGroup){clearAreaDrag();return;}
 ev.preventDefault();const target=vistoriaAreaCatalog().find(a=>vistoriaAreaKey(a)===folder.dataset.areaGroup);clearAreaDrag();
 if(target&&historyItems.some(r=>r.id===id))vistoriaMoveArea(id,target);
});
$('historyList').addEventListener('click',ev=>{const b=ev.target.closest('[data-move-report-area]');if(!b)return;ev.preventDefault();ev.stopImmediatePropagation();vistoriaMoveArea(b.dataset.moveReportArea)},true);
$('reportArea').addEventListener('change',()=>{if($('reportArea').value.trim()){try{$('reportArea').value=vistoriaRememberArea($('reportArea').value)}catch(err){notify(err.message)}}save()});
$('historyList').addEventListener('click',e=>{const b=e.target.closest('[data-finalize-report]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();setVistoriaFinalized(b.dataset.finalizeReport)},true);
$('historySearch').oninput=renderHistory;
$('historyList').onclick=e=>{const open=e.target.dataset.openReport,remove=e.target.dataset.removeReport;if(open)guarded(async()=>{await persistCurrent();const row=await requestResult(db.transaction('reports').objectStore('reports').get(open));if(!row)throw Error('Formulário não encontrado.');reset();activeReportId=row.id;fill(row.document);if(window.openSavedPointEditor)window.openSavedPointEditor();await persistCurrent();notify('Vistoria aberta com os dados salvos. Selecione o ponto e use Salvar alteração após editar.');($('identification')||$('meta')).scrollIntoView({behavior:'smooth'})});if(remove)guarded(async()=>{const row=historyItems.find(r=>r.id===remove);if(!row||!confirm('Mover para a lixeira o formulário '+(row.document.meta.number||row.document.meta.title)+' e suas fotos? Você poderá restaurá-los.'))return;await persistCurrent();const latest=await requestResult(db.transaction('reports').objectStore('reports').get(remove));const t=db.transaction(['reports','trash'],'readwrite');t.objectStore('trash').put({...latest,deletedAt:new Date().toISOString()});t.objectStore('reports').delete(remove);await transactionDone(t);if(remove===activeReportId){blankReport();await persistCurrent()}else await refreshHistory();notify('Formulário movido para a lixeira.');if(typeof window!=='undefined'&&window.refreshTrash)await window.refreshTrash()})};
$('backupAll').onclick=()=>guarded(async()=>{await persistCurrent();const rows=await requestResult(db.transaction('reports').objectStore('reports').getAll());download(new Blob([JSON.stringify({type:'vistoria-archive',version:1,reports:rows.map(r=>r.document),equipment:window.exportEquipmentCatalog?await window.exportEquipmentCatalog():[]})],{type:'application/json'}),'Vistorias-completas-'+today()+'.json');notify('Cópia de todos os formulários gerada.')});
function checkPending(d){if(!d.pending)return true;const p=d.pending;return p.fields&&itemKeys.every(k=>typeof p.fields[k]==='string'||(['pointWorkOrder','inspectionType','checklistData','completionDate','completionWork','completionBy','analysisHistory','analysisDraft'].includes(k)&&p.fields[k]===undefined))&&Array.isArray(p.photos)&&p.photos.length<=8&&p.photos.every(v=>typeof v.caption==='string'&&typeof v.src==='string'&&/^data:image\/jpeg;base64,[a-zA-Z0-9+/=]+$/.test(v.src))&&(p.editing===null||Number.isInteger(p.editing)&&p.editing>=0&&p.editing<d.records.length)}
$('restore').onchange=async e=>{const f=e.target.files[0];if(!f)return;await guarded(async()=>{if(f.size>150*1024*1024)throw Error('A cópia excede 150 MB.');const value=JSON.parse(await f.text());const docs=value.type==='vistoria-archive'&&value.version===1?value.reports:[value];if(!Array.isArray(docs)||!docs.length||!docs.every(d=>valid(d)&&checkPending(d)))throw Error('Cópia inválida ou incompatível.');await persistCurrent();const t=db.transaction('reports','readwrite');const imported=docs.map(document=>({id:newId(),updated:new Date().toISOString(),document}));imported.forEach(row=>t.objectStore('reports').put(row));await transactionDone(t);const last=imported.at(-1);reset();activeReportId=last.id;fill(last.document);await persistCurrent();if(window.importEquipmentCatalog)await window.importEquipmentCatalog(value.equipment);notify(imported.length+' formulário(s) importado(s). Os anteriores foram preservados.')});e.target.value=''};
// Block typing only while loading the previous draft so it cannot overwrite new input.
document.querySelector('main').inert=true;
try{const req=indexedDB.open('vistoria-douglas-v1',3);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains('trash'))d.createObjectStore('trash',{keyPath:'id'});if(!d.objectStoreNames.contains('draft'))d.createObjectStore('draft');if(!d.objectStoreNames.contains('reports'))d.createObjectStore('reports',{keyPath:'id'})};req.onsuccess=async()=>{db=req.result;db.onversionchange=()=>{db.close();historyReady=false;notify('Atualização detectada. Recarregue a página.')};try{const old=await requestResult(db.transaction('draft').objectStore('draft').get('current'));activeReportId=old?.reportId||newId();if(old){reset();fill(old)}historyReady=true;await persistCurrent()}catch(e){notify('Não foi possível carregar os formulários: '+e.message)}finally{document.querySelector('main').inert=false}};req.onerror=()=>{document.querySelector('main').inert=false;$('saveState').textContent='Armazenamento indisponível. Use Baixar cópia.';notify('Não foi possível abrir o histórico. Use Baixar cópia para preservar seu trabalho.')};req.onblocked=()=>{document.querySelector('main').inert=false;notify('Feche outras abas deste aplicativo e recarregue para liberar o histórico.')};}catch(e){document.querySelector('main').inert=false;notify('Armazenamento indisponível. Use Baixar cópia.')}

// Load the chosen document before navigating, preserving the previous draft.
$('historyList').addEventListener('click',e=>{
 const button=e.target.closest('[data-review-report]');
 if(!button)return;
 guarded(async()=>{
  const id=button.dataset.reviewReport;
  await persistCurrent();
  const row=await requestResult(db.transaction('reports').objectStore('reports').get(id));
  if(!row)throw Error('Vistoria não encontrada. Atualize a lista.');
  reset();activeReportId=row.id;fill(row.document);
  await persistCurrent();
  const tab=document.querySelector('[data-view="review"]');
  if(tab)tab.click();
  notify(records.length?'Relatório da vistoria selecionada aberto.':'Esta vistoria ainda não possui pontos adicionados ao relatório.');
 });
});
