/* In-app confirmation and atomic local deletion, including the open report. */
(()=>{
 const dialog=document.createElement('dialog');dialog.style.cssText='border:0;border-radius:16px;padding:24px;max-width:420px;width:85%;color:#171717';
 dialog.innerHTML='<h3>Confirmar exclusão</h3><p id="trashConfirmText"></p><div class="actions"><button type="button" id="trashConfirmCancel" class="secondary">Cancelar</button><button type="button" id="trashConfirmYes" class="danger">Confirmar</button></div>';
 document.body.append(dialog);let decision=null;
 function finish(value){const resolve=decision;decision=null;dialog.close();if(resolve)resolve(value)}
 $('trashConfirmCancel').onclick=()=>finish(false);$('trashConfirmYes').onclick=()=>finish(true);
 dialog.addEventListener('cancel',e=>{e.preventDefault();finish(false)});
 function ask(message){if(decision)return Promise.resolve(false);$('trashConfirmText').textContent=message;dialog.showModal();return new Promise(resolve=>{decision=resolve})}
 async function move(id){
  if(!await ask('Mover esta vistoria e suas fotos para a lixeira? Você poderá restaurá-la.'))return;
  await guarded(async()=>{
   clearTimeout(saveTimer);saveTimer=null;
   const old=await requestResult(db.transaction('reports').objectStore('reports').get(id));
   if(!old)return notify('Esta vistoria já foi removida.');
   // Capture unsaved edits without requiring a complete point or valid form.
   const isActive=id===activeReportId;
   const row=isActive?{id,updated:new Date().toISOString(),document:structuredClone(data())}:old;
   const t=db.transaction(['reports','trash','draft'],'readwrite');
   t.objectStore('trash').put({...row,deletedAt:new Date().toISOString()});
   t.objectStore('reports').delete(id);
   t.objectStore('draft').put(true,'deleted-report:'+id);
   if(isActive)t.objectStore('draft').delete('current');
   await transactionDone(t);
   if(isActive){blankReport();await persistCurrent()}
   else {await persistCurrent();savedEvent()}
   await refreshHistory();await window.refreshTrash();
   const panel=$('trashList').closest('details');if(panel)panel.open=true;
   notify('Vistoria movida para a lixeira.');
  });
 }
 async function erase(id){
  const rows=await requestResult(db.transaction('trash').objectStore('trash').getAll());
  const selected=id?rows.filter(r=>r.id===id):rows;
  if(!selected.length){await window.refreshTrash();return notify('A lixeira está vazia.')}
  if(!await ask('Apagar '+selected.length+' vistoria(s) e suas fotos da lixeira deste aparelho? Não é possível desfazer. O histórico e backups da nuvem são mantidos.'))return;
  await guarded(async()=>{
   const t=db.transaction('trash','readwrite');for(const row of selected)t.objectStore('trash').delete(row.id);
   await transactionDone(t);await window.refreshTrash();savedEvent();notify('Exclusão concluída neste aparelho.');
  });
 }
 // Capture makes nested button labels work and avoids older delegated handlers.
 $('historyList').addEventListener('click',e=>{const b=e.target.closest('[data-remove-report]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();move(b.dataset.removeReport).catch(err=>notify('Não foi possível mover: '+err.message))},true);
 const originalRefresh=window.refreshTrash;
 window.refreshTrash=async()=>{await originalRefresh();$('trashList').querySelectorAll('[data-restore-trash]').forEach(b=>{const row=b.closest('.entry');if(row.querySelector('[data-erase-trash]'))return;const remove=document.createElement('button');remove.type='button';remove.className='danger';remove.dataset.eraseTrash=b.dataset.restoreTrash;remove.textContent='Apagar definitivamente';remove.style.margin='8px';row.append(remove)})};
 $('emptyTrash').onclick=()=>erase().catch(err=>notify('Não foi possível apagar: '+err.message));
 $('trashList').addEventListener('click',e=>{const b=e.target.closest('[data-erase-trash]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();erase(b.dataset.eraseTrash).catch(err=>notify('Não foi possível apagar: '+err.message))},true);
 if(historyReady)window.refreshTrash().catch(()=>{});
})();
