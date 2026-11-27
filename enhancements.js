(()=>{
 const selected=new Set();let protectionRevision=0,dirty=false;
 const main=document.querySelector('main');
 const protection=document.createElement('section');protection.className='protection-strip';protection.setAttribute('aria-live','polite');protection.innerHTML='<span id="localProtection">Carregando salvamento…</span><span id="cloudProtection">Conferindo última cópia…</span>';main.prepend(protection);
 const overdue=document.createElement('div');overdue.innerHTML='<span class="metric-label">Prazos vencidos</span><strong id="metricOverdue">0</strong><small>Pontos que precisam de atenção</small>';document.querySelector('.metrics').append(overdue);
 const bulk=document.createElement('div');bulk.className='selection-bar';bulk.innerHTML='<span id="selectionCount">Nenhuma vistoria selecionada</span><div class="actions"><button type="button" id="selectVisible" class="secondary">Selecionar visíveis</button><button type="button" id="clearSelection" class="secondary">Limpar seleção</button><button type="button" id="pdfSelected" disabled>PDF das selecionadas</button></div>'; $('historyList').before(bulk);
 const trash=document.createElement('details');trash.className='card trash-panel';trash.innerHTML='<summary>Lixeira <span id="trashCount">0</span></summary><p class="muted">Vistorias compartilhadas acompanham a lixeira da equipe. Cópias exclusivamente locais permanecem separadas. Vistorias na lixeira expiram após 30 dias.</p><div class="actions"><button type="button" id="emptyTrash" class="danger" disabled>Esvaziar cópias locais</button><button type="button" id="syncTrash" class="secondary">Sincronizar lixeiras</button></div><p class="muted" id="trashSyncState"></p><div id="trashList"></div>';$('historyPanel').after(trash);
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
 window.refreshTrash=async()=>{
  if(!historyReady)return;
  const rows=await requestResult(db.transaction('trash').objectStore('trash').getAll());
  const index=window.VistoriaTeamTrash?.getIndex?.()||{items:[],stamp:null,admin:false};
  const shared=new Map(index.items.map(x=>[x.report_id,x]));
  const local=rows.filter(r=>!r.teamTrash&&!window.VistoriaTeamTrash?.known(r.id)&&!shared.has(r.id));
  const byId=new Map(rows.map(r=>[r.id,r]));
  const cached=rows.filter(r=>!local.includes(r)&&!shared.has(r.id));
  const format=(d)=>esc(new Date(d||0).toLocaleString('pt-BR'));
  const remaining=d=>Math.max(0,Math.ceil((Date.parse(d)+30*86400000-Date.now())/86400000));
  const show=(id,row,item,team)=>{
   const doc=row?.document,localTags=[...new Set((doc?.records||[]).map(p=>p.tag).filter(Boolean))];
   const tags=item?.tags?.length?item.tags:localTags,title=item?.title||doc?.meta?.title||'',number=item?.number||doc?.meta?.number||'';
   const date=item?.deleted_at||row?.deletedAt,days=remaining(date),count=item?.point_count??doc?.records?.length;
   const heading=tags.length?tags.join(' · '):title||number||'Vistoria sem identificação';
   const description=[title!==heading?title:'',number!==heading?number:''].filter(Boolean).join(' · ');
   return '<div class="entry"><h3>'+esc(heading)+'</h3>'+(description?'<p>'+esc(description)+'</p>':'')+'<p class="muted">'+(team?'Lixeira da equipe':'Lixeira deste aparelho')+' · '+(Number.isInteger(count)?count+' ponto(s) · ':'')+'Excluída em '+format(date)+'</p>'+(team?'<p class="muted">Excluída por: '+esc(item?.deleted_by||'Não registrado')+'</p>':'')+'<p><strong>'+days+' dia(s) para exclusão definitiva</strong></p>'+((!team||index.admin)&&days>0?'<button type="button" data-restore-trash="'+esc(id)+'">'+(team?'Restaurar na equipe':'Restaurar formulário')+'</button>':'<p class="muted">Restauração indisponível ou prazo encerrado.</p>')+'</div>';
  };
  $('trashCount').textContent=local.length+shared.size+cached.length;$('emptyTrash').disabled=local.length===0;
  $('trashSyncState').textContent=index.stamp?'Lixeira da equipe consultada em '+new Date(index.stamp).toLocaleTimeString('pt-BR'):'Lixeira compartilhada: aguardando conexão e confirmação.';
  $('trashList').innerHTML=[...Array.from(shared.values(),item=>({id:item.report_id,row:byId.get(item.report_id),item,team:true})),...cached.map(row=>({id:row.id,row,item:null,team:true})),...local.map(row=>({id:row.id,row,item:null,team:false}))].sort((a,b)=>Date.parse(b.item?.deleted_at||b.row?.deletedAt)-Date.parse(a.item?.deleted_at||a.row?.deletedAt)).map(x=>show(x.id,x.row,x.item,x.team)).join('')||'<p class="muted">A lixeira está vazia.</p>';
 };
 $('syncTrash').onclick=async()=>{const b=$('syncTrash');b.disabled=true;try{if(!window.VistoriaTeamTrash?.sync)throw Error('Sincronização da equipe indisponível.');await window.VistoriaTeamTrash.sync();await window.refreshTrash()}catch(e){notify(e.message)}finally{b.disabled=false}};
 $('emptyTrash').onclick=()=>guarded(async()=>{
 const button=$('emptyTrash');button.disabled=true;
 try{
  const ids=(await requestResult(db.transaction('trash').objectStore('trash').getAll())).filter(r=>!r.teamTrash&&!window.VistoriaTeamTrash?.known(r.id)).map(r=>r.id);
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
})();
