(()=>{
 const selected=new Set();let protectionRevision=0,dirty=false;
 const main=document.querySelector('main');
 const protection=document.createElement('section');protection.className='protection-strip';protection.setAttribute('aria-live','polite');protection.innerHTML='<span id="localProtection">Carregando salvamento…</span><span id="cloudProtection">Conferindo última cópia…</span>';main.prepend(protection);
 const updates=document.createElement('section');updates.className='update-banner';updates.hidden=true;updates.innerHTML='<span>Uma nova versão está pronta.</span><button type="button" id="applyUpdate">Salvar e atualizar</button>';protection.before(updates);
 const overdue=document.createElement('div');overdue.innerHTML='<span class="metric-label">Prazos vencidos</span><strong id="metricOverdue">0</strong><small>Pontos que precisam de atenção</small>';document.querySelector('.metrics').append(overdue);
 const bulk=document.createElement('div');bulk.className='selection-bar';bulk.innerHTML='<span id="selectionCount">Nenhuma vistoria selecionada</span><div class="actions"><button type="button" id="selectVisible" class="secondary">Selecionar visíveis</button><button type="button" id="clearSelection" class="secondary">Limpar seleção</button><button type="button" id="pdfSelected" disabled>PDF das selecionadas</button></div>'; $('historyList').before(bulk);
 const trash=document.createElement('details');trash.className='card trash-panel';trash.innerHTML='<summary>Lixeira <span id="trashCount">0</span></summary><p class="muted">Formulários removidos neste aparelho. Você pode restaurá-los com suas fotos; não há exclusão automática.</p><div class="actions"><button type="button" id="emptyTrash" class="danger" disabled>Esvaziar lixeira</button></div><div id="trashList"></div>';$('historyPanel').after(trash);
 const isOverdue=r=>/^\d{4}-\d{2}-\d{2}$/.test(r.deadline||'')&&r.deadline<today()&&['Pendente','Em acompanhamento'].includes(r.status);
 function decorate(){for(const row of historyItems)if(!document.querySelector('[data-select-report="'+row.id+'"]')){const open=document.querySelector('[data-open-report="'+row.id+'"]');if(!open)continue;const entry=open.closest('.entry'),label=document.createElement('label');label.className='select-report';label.innerHTML='<input type="checkbox" data-select-report="'+esc(row.id)+'"> Selecionar para PDF';label.querySelector('input').checked=selected.has(row.id);entry.prepend(label);const late=row.document.records.filter(isOverdue).length;if(late){const p=document.createElement('p');p.className='deadline-alert';p.textContent=late+' ponto(s) com prazo vencido';entry.insertBefore(p,entry.querySelector('.actions'))}}
 for(const id of [...selected])if(!historyItems.some(r=>r.id===id))selected.delete(id);$('selectionCount').textContent=selected.size?selected.size+' vistoria(s) selecionada(s)':'Nenhuma vistoria selecionada';$('pdfSelected').disabled=!selected.size;$('metricOverdue').textContent=historyItems.flatMap(r=>r.document.records).filter(isOverdue).length;
 }
 const originalHistory=renderHistory;renderHistory=function(){originalHistory();decorate()};
 function deadlines(){$('entries').querySelectorAll('.entry').forEach((entry,i)=>{const r=records[i];if(!r)return;const p=document.createElement('p');p.className=isOverdue(r)?'deadline-alert':'deadline-detail';p.textContent=(isOverdue(r)?'Prazo vencido · ':'')+(r.deadline?'Prazo: '+datefmt(r.deadline)+' · ':'')+'Responsável: '+(r.owner||'A definir');entry.insertBefore(p,entry.querySelector('.actions'))})}
 const originalRender=render;render=function(){originalRender();deadlines()};deadlines();decorate();
 $('historyList').addEventListener('change',e=>{const id=e.target.dataset.selectReport;if(!id)return;if(e.target.checked)selected.add(id);else selected.delete(id);decorate()});
 $('selectVisible').onclick=()=>{$('historyList').querySelectorAll('details[data-area-group][open] [data-select-report]').forEach(c=>{selected.add(c.dataset.selectReport);c.checked=true});decorate()};$('clearSelection').onclick=()=>{selected.clear();$('historyList').querySelectorAll('[data-select-report]').forEach(c=>c.checked=false);decorate()};
 $('pdfSelected').onclick=()=>guarded(async()=>{if(!selected.size)return;await persistCurrent();const rows=historyItems.filter(r=>selected.has(r.id)).sort((a,b)=>(a.document.meta.date||'').localeCompare(b.document.meta.date||'')||a.updated.localeCompare(b.updated)),docs=rows.map(r=>structuredClone(r.document));if(!docs.length)return notify('Selecione pelo menos uma vistoria.');const button=$('pdfSelected');button.disabled=true;button.textContent='Gerando PDF…';try{await exportReportDocuments(docs,rows.map(r=>r.id))}finally{button.textContent='PDF das selecionadas';decorate()}});
 window.refreshTrash=async()=>{if(!historyReady)return;const rows=await requestResult(db.transaction('trash').objectStore('trash').getAll());rows.sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt));$('trashCount').textContent=rows.length;$('emptyTrash').disabled=rows.length===0;$('trashList').innerHTML=rows.length?rows.map(r=>'<div class="entry"><h3>'+esc(r.document.meta.number||r.document.meta.title||'Vistoria')+'</h3><p class="muted">Removida em '+esc(new Date(r.deletedAt).toLocaleString('pt-BR'))+' · '+r.document.records.length+' ponto(s)</p><button type="button" data-restore-trash="'+esc(r.id)+'">Restaurar formulário</button></div>').join(''):'<p class="muted">A lixeira está vazia.</p>'};
 $('emptyTrash').onclick=()=>guarded(async()=>{
 const button=$('emptyTrash');button.disabled=true;
 try{
  const ids=await requestResult(db.transaction('trash').objectStore('trash').getAllKeys());
  if(!ids.length){await window.refreshTrash();return notify('A lixeira já está vazia.')}
  if(!confirm('Excluir definitivamente os '+ids.length+' formulário(s) da lixeira deste aparelho e suas fotos? Não será possível desfazer. As vistorias ativas e as cópias na nuvem serão mantidas.'))return;
  const t=db.transaction('trash','readwrite');const store=t.objectStore('trash');
  ids.forEach(id=>store.delete(id));await transactionDone(t);
  await window.refreshTrash();notify('Formulários excluídos definitivamente da lixeira deste aparelho.');
 }finally{button.disabled=$('trashCount').textContent==='0'}
 });
 trash.addEventListener('toggle',()=>{if(trash.open)window.refreshTrash().catch(e=>notify(e.message))});
 $('trashList').onclick=e=>{const id=e.target.dataset.restoreTrash;if(!id)return;if(window.VistoriaTeamTrash?.known(id)){if(confirm('Restaurar esta vistoria em todos os aparelhos da equipe?'))window.VistoriaTeamTrash.restore(id).catch(e=>notify(e.message));return;}guarded(async()=>{const row=await requestResult(db.transaction('trash').objectStore('trash').get(id));if(!row)return;const t=db.transaction(['trash','reports','draft'],'readwrite');t.objectStore('reports').put({id,updated:new Date().toISOString(),document:row.document});t.objectStore('trash').delete(id);t.objectStore('draft').delete('deleted-report:'+id);await transactionDone(t);await refreshHistory();await window.refreshTrash();notify('Formulário restaurado. Abra-o em Suas vistorias.')})};
 async function cloudStatus(){
  const drive=window.VistoriaGoogleDrive?.getState();
  $('cloudProtection').textContent=drive?.enabled?
   'Google Drive conectado — confira o status de sincronização na aba Nuvem':
   'Google Drive: conecte na aba Nuvem para sincronizar';
 }
 document.addEventListener('vistoria-google-status',()=>cloudStatus().catch(()=>{}));
 document.addEventListener('vistoria-dirty',()=>{dirty=true;protectionRevision++;$('localProtection').textContent='Salvando no aparelho…';$('cloudProtection').textContent='Alterações locais: aguardando sincronização com Google Drive'});
 document.addEventListener('vistoria-saved',()=>{dirty=false;$('localProtection').textContent='Salvo no aparelho · '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});cloudStatus().catch(()=>{$('cloudProtection').textContent='Não foi possível conferir a cópia na nuvem'});if(!trash.open&&$('trashList').childElementCount===0)window.refreshTrash().catch(()=>{})});
 new MutationObserver(()=>{if(/indisponível|Falha|Não foi/i.test($('saveState').textContent))$('localProtection').textContent=$('saveState').textContent}).observe($('saveState'),{childList:true});
 if(historyReady){$('localProtection').textContent='Salvo no aparelho';cloudStatus().catch(()=>{});window.refreshTrash().catch(()=>{})}
 if('serviceWorker' in navigator){
  const action=$('applyUpdate');
  const message=updates.querySelector('span');
  let requested=false,registration=null;
  function check(){if(!requested)updates.hidden=!registration?.waiting}
  function attach(reg){if(!reg||registration===reg)return;registration=reg;check();reg.addEventListener('updatefound',()=>{const w=reg.installing;w?.addEventListener('statechange',check)});}
  navigator.serviceWorker.getRegistration().then(attach).catch(()=>{});
  navigator.serviceWorker.ready.then(attach).catch(()=>{});
  // A sincronização em segundo plano é independente do salvamento local.
  // Só operações que modificam o formulário/fotos exigem espera antes de recarregar.
  async function waitForLocalUpdateIdle(){
   for(let attempt=0;(busy||historyBusy)&&attempt<32;attempt++)await new Promise(resolve=>setTimeout(resolve,250));
   if(busy||historyBusy)throw Error('Há uma edição ou foto em processamento. Termine essa operação antes de atualizar; seus registros continuam neste aparelho.');
  }
  action.onclick=async()=>{
   if(requested)return;
   requested=true;action.disabled=true;action.textContent='Salvando…';message.textContent='Salvando a vistoria neste aparelho.';
   try{
    await waitForLocalUpdateIdle();
    await persistCurrent();
    await waitForLocalUpdateIdle();
    const reg=await navigator.serviceWorker.getRegistration();
    const worker=reg?.waiting;
    if(!worker){await waitForLocalUpdateIdle();await persistCurrent();location.reload();return;}
    action.textContent='Atualizando…';message.textContent='Vistoria salva. Instalando a atualização.';
    await new Promise((resolve,reject)=>{
     let timer;
     const cleanup=()=>{clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);worker.removeEventListener('statechange',stateChanged)};
     const finish=()=>{cleanup();resolve()};
     const fail=()=>{cleanup();reject(Error('A atualização não foi ativada. Tente novamente ou feche as outras janelas do aplicativo.'))};
     const changed=()=>finish();
     const stateChanged=()=>{if(worker.state==='activated')finish();else if(worker.state==='redundant')fail()};
     navigator.serviceWorker.addEventListener('controllerchange',changed);
     worker.addEventListener('statechange',stateChanged);
     timer=setTimeout(()=>{if(worker.state==='activated')finish();else fail()},12000);
     try{worker.postMessage({type:'ACTIVATE_UPDATE'});stateChanged()}catch(e){cleanup();reject(e)}
    });
    await waitForLocalUpdateIdle();
    // Regrava qualquer edição feita enquanto o service worker estava ativando.
    await persistCurrent();
    message.textContent='Vistoria salva no aparelho. A sincronização com a nuvem poderá continuar após atualizar.';
    location.reload();
   }catch(e){requested=false;action.disabled=false;action.textContent='Salvar e atualizar';message.textContent=e.message;updates.hidden=false;notify('Não foi possível concluir a atualização: '+e.message)}
  };
 }
})();
