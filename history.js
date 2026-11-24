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
// Finalização geral: não altera nem encerra pontos técnicos automaticamente.
function vistoriaAllPointsClosed(doc){
 return !!doc?.records?.length&&doc.records.every(p=>['Corrigido','Sem pendência'].includes(p?.status));
}
function vistoriaHasNewDraft(doc){
 const p=doc?.pending;
 return !!p&&p.editing==null&&!!(p.fields?.tag||p.fields?.problem||p.fields?.pointWorkOrder||p.photos?.length);
}
function vistoriaReportStatus(doc){
 if(!doc||!Array.isArray(doc.records))return {kind:'unknown',label:'Status indisponível'};
 if(doc.records.some(p=>p?.status==='Pendente'))return {kind:'pending',label:'Pendente'};
 if(vistoriaAllPointsClosed(doc)&&!vistoriaHasNewDraft(doc)&&doc.meta?.finalizedAt)return {kind:'done',label:'Finalizada'};
 if(!doc.records.length)return {kind:'progress',label:'Não iniciada'};
 if(vistoriaAllPointsClosed(doc)&&!vistoriaHasNewDraft(doc))return {kind:'progress',label:'Pronta para finalizar'};
 return {kind:'progress',label:'Em acompanhamento'};
}
function vistoriaStatusHtml(doc){
 const {kind,label}=vistoriaReportStatus(doc);
 return '<span class="vistoria-status" data-status-kind="'+kind+'"><span class="vistoria-status-dot" aria-hidden="true"></span>'+label+'</span>';
}
function vistoriaStatusAction(doc){
 return vistoriaReportStatus(doc).kind==='done'?'Reabrir vistoria':'Marcar como finalizada';
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
  if(button){button.textContent=vistoriaStatusAction(doc);button.disabled=!doc;}
  const list=card.closest('.cloud-report-list');if(list)lists.add(list);
 }
 for(const list of lists)list.dispatchEvent(new Event('vistoria-status-refresh'));
}
async function setVistoriaFinalized(id){
 return guarded(async()=>{
  await persistCurrent();
  const previous=await requestResult(db.transaction('reports').objectStore('reports').get(id));
  if(!previous)throw Error('Vistoria não encontrada neste aparelho. Sincronize a nuvem.');
  const reopen=vistoriaReportStatus(previous.document).kind==='done';
  if(!reopen&&(!vistoriaAllPointsClosed(previous.document)||vistoriaHasNewDraft(previous.document)))throw Error('Conclua todos os pontos e salve os novos registros antes de finalizar a vistoria.');
  if(!reopen&&previous.document.pending?.editing!=null)throw Error('Salve ou encerre a edição do ponto antes de finalizar a vistoria.');
  if(!confirm(reopen?'Reabrir esta vistoria? Os pontos e o histórico serão preservados.':'Marcar esta vistoria como finalizada? Ela ficará oculta por padrão e poderá ser reaberta.'))return;
  const stamp=reopen?'':new Date().toISOString();
  const tx=db.transaction(['reports','draft'],'readwrite'),done=transactionDone(tx),store=tx.objectStore('reports'),draft=tx.objectStore('draft');
  let changed=false;
  const req=store.get(id);
  req.onsuccess=()=>{
   const latest=req.result;
   if(!latest||JSON.stringify(latest.document)!==JSON.stringify(previous.document))return;
   const marker=draft.get('deleted-report:'+id);
   marker.onsuccess=()=>{
    if(marker.result)return;
    const next={...latest.document,meta:{...latest.document.meta,finalizedAt:stamp}};
    const current=draft.get('current');
    current.onsuccess=()=>{
     store.put({...latest,updated:new Date().toISOString(),document:next});
     if(current.result?.reportId===id)draft.put({...current.result,meta:{...current.result.meta,finalizedAt:stamp}},'current');
     changed=true;
    };
   };
  };
  await done;
  if(!changed)throw Error('A vistoria foi alterada durante a operação. Atualize e tente novamente.');
  if(activeReportId===id)$('finalizedAt').value=stamp;
  await refreshHistory();savedEvent();
  notify(reopen?'Vistoria reaberta.':'Vistoria finalizada. Use Mostrar finalizadas para consultá-la.');
 });
}
async function refreshHistory(){const rows=await requestResult(db.transaction('reports').objectStore('reports').getAll());historyItems=rows.sort((a,b)=>b.updated.localeCompare(a.updated));renderHistory();refreshVistoriaCloudStatuses()}
function renderHistory(){const query=$('historySearch').value.trim().toLocaleLowerCase('pt-BR');const rows=historyItems.filter(r=>vistoriaVisible(r.document,$('showFinalizedReports')?.checked)).filter(r=>matchesFilters(r.document)).filter(r=>[r.document.meta.title,r.document.meta.number,r.document.meta.workOrder,r.document.meta.date,...r.document.records.flatMap(v=>[v.tag,v.area,v.pointWorkOrder,v.completionBy,v.owner])].join(' ').toLocaleLowerCase('pt-BR').includes(query));$('historyList').innerHTML=rows.length?rows.map(r=>{const d=r.document;return `<div class="entry"><h3>${esc(d.meta.number?d.meta.number+' · ':'')}${esc(d.meta.title||'Relatório de vistoria')}</h3>${vistoriaStatusHtml(d)}<p>${esc(datefmt(d.meta.date))} · ${d.records.length} ponto(s)${r.id===activeReportId?' · <b>Em edição</b>':''}</p><p class="muted">${esc(d.records.map(v=>v.tag).slice(0,5).join(' · '))}</p><div class="actions"><button type="button" data-review-report="${esc(r.id)}">Ver relatório</button><button type="button" class="secondary" data-open-report="${esc(r.id)}">Abrir / editar</button><button type="button" class="secondary vistoria-finalize-action" data-finalize-report="${esc(r.id)}">${vistoriaStatusAction(d)}</button><button type="button" class="secondary" data-duplicate-report="${esc(r.id)}">Duplicar vistoria</button><button type="button" class="danger" data-remove-report="${esc(r.id)}">Mover para lixeira</button></div></div>`}).join(''):`<p class="empty">${query?'Nenhum formulário encontrado.':'Seus formulários aparecerão aqui ao preencher a vistoria.'}</p>`}
function blankReport(){records=[];reset();['finalizedAt','number','workOrder','objective','conclusion','revision','approver','approvalDate','homologator','homologDate','revisionNote'].forEach(k=>$(k).value='');$('date').value=today();activeReportId=newId();render()}
async function guarded(action){if(busy||historyBusy)return notify('Aguarde a operação em andamento.');if(!historyReady)return notify('O armazenamento ainda não está disponível.');historyBusy=true;try{await action()}catch(e){notify('Não foi possível concluir: '+e.message)}finally{historyBusy=false}}
async function createNew(){await guarded(async()=>{await persistCurrent();blankReport();await persistCurrent();notify('Nova vistoria aberta. A anterior permanece na lista.');($('identification')||$('meta')).scrollIntoView({behavior:'smooth'})})}
$('newReport').onclick=createNew;$('clear').onclick=createNew;
$('saveReport').onclick=()=>guarded(async()=>{await persistCurrent();notify('Formulário salvo.')});
const finalFilter=document.createElement('label');finalFilter.className='vistoria-finalized-filter';finalFilter.innerHTML='<input type="checkbox" id="showFinalizedReports"> Mostrar finalizadas';$('historyList').before(finalFilter);
$('showFinalizedReports').onchange=()=>renderHistory();
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
