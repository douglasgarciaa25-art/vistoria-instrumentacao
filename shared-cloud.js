/* Immutable revisions: concurrent edits remain separate heads until a later edit. */
(()=>{
 const panel=document.createElement('section');panel.className='auto-cloud';
 panel.innerHTML='<h3>Vistorias compartilhadas da equipe</h3><p class="muted">Consulte as vistorias da equipe e os backups antigos. A lista fica recolhida até você abrir. Nenhum dado existente será excluído.</p><p id="teamRemoteCount" role="status">Conecte a equipe para consultar as vistorias compartilhadas.</p><details id="teamListDisclosure" class="team-reports-disclosure"><summary>Mostrar vistorias da equipe <span id="teamListCount"></span></summary><div id="teamList" class="team-report-list"><p class="muted">Conecte a equipe e consulte a lista.</p></div></details><p id="sharedCloudState" role="status">Sincronização contínua desativada. Os envios precisam ser confirmados.</p><div class="actions"><button type="button" id="teamInspect" class="secondary">Atualizar lista da equipe</button><button type="button" id="teamSendAll" class="secondary">Enviar todas as vistorias locais</button><button type="button" id="teamRecover" class="secondary">Recuperar vistorias neste aparelho</button><button type="button" id="teamSyncToggle">Ativar sincronização contínua</button><button type="button" id="sharedCloudNow" class="secondary" disabled>Sincronizar agora</button></div>';
 $('cloudControls').before(panel);
 const state=$('sharedCloudState');let running=false,timer,epoch=0,active=false;
 const get=key=>requestResult(db.transaction('draft').objectStore('draft').get(key));
 async function set(key,value){const t=db.transaction('draft','readwrite');t.objectStore('draft').put(value,key);await transactionDone(t)}
 function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
 async function hash(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(v)))))].map(v=>v.toString(16).padStart(2,'0')).join('')}
 async function rows(){return requestResult(db.transaction('reports').objectStore('reports').getAll())}
 function schedule(delay=2000){clearTimeout(timer);if(active)timer=setTimeout(run,delay)}
 async function payload(m){let text='';for(let i=0;i<m.parts;i++)text+=(await cloudApi('part&id='+m.id+'&part='+i)).chunk;if(text.length!==m.length)throw Error('Revisão incompleta.');const v=JSON.parse(text);if(typeof v.deleted!=='boolean'||(!v.deleted&&(!valid(v.document)||!checkPending(v.document))))throw Error('Revisão incompatível.');return v}
 async function publish(reportId,parents,value){const id=newId(),text=JSON.stringify(value),parts=Math.ceil(text.length/750000);if(parts>300)throw Error('Vistoria muito grande para sincronizar.');for(let i=0;i<parts;i++)await cloudApi('part&id='+id+'&part='+i,'POST',{chunk:text.slice(i*750000,(i+1)*750000)});return cloudApi('sync-commit&id='+id,'POST',{reportId,parents,parts,length:text.length})}
 async function run(){
  if(!active||running||!historyReady||busy||historyBusy||cloudWorking)return;
  if(!cloudKey){state.textContent='Informe a chave uma vez para conectar este aparelho.';return}
  if(!navigator.onLine){state.textContent='Sem internet. Alterações locais aguardam reconexão.';return}
  running=true;cloudWorking=true;const key=cloudKey;
  try{
   await cloudApi('check');$('cloudControls').hidden=false;
   await persistCurrent();
   const stateKey='shared-cloud-v1:'+await hash(key);
   let meta=await get(stateKey)||{base:{},heads:{}};
   let local=await rows();
   // Verifica alterações feitas por outra aba, que não dispara eventos neste documento.
   const startingHashes=new Map(await Promise.all(local.map(async r=>[r.id,await hash(r.document)])));
   const trashed=await requestResult(db.transaction('trash').objectStore('trash').getAll());const erasedKeys=await requestResult(db.transaction('draft').objectStore('draft').getAllKeys());
   // Mantém tombstones mesmo após esvaziar a lixeira enquanto o aparelho estava offline.
   const trashedIds=new Set([...trashed.map(r=>r.id),...erasedKeys.filter(k=>typeof k==='string'&&k.startsWith('deleted-report:')).map(k=>k.slice('deleted-report:'.length))]);
   const startEpoch=epoch;
   state.textContent='Conferindo vistorias locais e recebimentos da equipe…';
   const before=(await cloudApi('sync-list')).items||[];
   const serverIds=new Set(before.map(m=>m.id));
   const serverByReport=new Map();
   for(const revision of before){
    if(!serverByReport.has(revision.reportId))serverByReport.set(revision.reportId,[]);
    serverByReport.get(revision.reportId).push(revision);
   }
   let sent=0,already=0,pendingConflicts=0;
   const receipts=[];
   // Publish against the revisions actually seen by this device, never unseen edits.
   const ids=new Set([...Object.keys(meta.base),...local.map(r=>r.id),...trashedIds]);
   for(const id of ids){
    if(cloudKey!==key)throw Error('Conexão alterada.');
    const row=local.find(r=>r.id===id);
    // Only an explicitly trashed report can delete shared data.
    if(!row)continue; // Não publicar exclusões na nuvem legada.
    const value={deleted:false,document:row.document};
    const fingerprint=await hash(value);
    const acknowledged=(meta.heads[id]||[]).filter(x=>serverIds.has(x));
    const revisions=serverByReport.get(id)||[];
    const superseded=new Set(revisions.flatMap(m=>m.parents||[]));
    const live=revisions.filter(m=>!superseded.has(m.id));
    // Não enviar uma alteração local sobre uma revisão remota que este aparelho não conhece.
    if(live.length && live.some(m=>!acknowledged.includes(m.id))){
      const latest=live.toSorted((a,b)=>String(a.created).localeCompare(String(b.created))).at(-1);
      const remote=await payload(latest);
      if(!remote.deleted && await hash(remote)===fingerprint){
        meta.base[id]=fingerprint;meta.heads[id]=live.map(x=>x.id);
        await set(stateKey,meta);already++;continue;
      }
      pendingConflicts++;
      continue;
    }
    if(meta.base[id]===fingerprint&&acknowledged.length){already++;continue}
    state.textContent='Enviando '+(sent+1)+' / '+local.length+' vistorias locais à equipe…';
    const revision=await publish(id,acknowledged,value);
    receipts.push(revision.id);sent++;
    meta.base[id]=fingerprint;meta.heads[id]=[revision.id];await set(stateKey,meta);
   }
   const listing=await cloudApi('sync-list');
   const confirmed=new Set((listing.items||[]).map(x=>x.id));
   if(receipts.some(id=>!confirmed.has(id)))throw Error('Nem todos os envios foram confirmados pela nuvem da equipe. Tente novamente.');
   const byReport=new Map();for(const m of listing.items){if(!byReport.has(m.reportId))byReport.set(m.reportId,[]);byReport.get(m.reportId).push(m)}
   const changes=[],next=structuredClone(meta);let conflicts=0;
   for(const [id,revisions] of byReport){
    const superseded=new Set(revisions.flatMap(m=>m.parents));
    const heads=revisions.filter(m=>!superseded.has(m.id)).sort((a,b)=>a.created.localeCompare(b.created)||a.id.localeCompare(b.id));
    if(!heads.length)continue;
    const headIds=heads.map(m=>m.id);
    if(JSON.stringify([...(meta.heads[id]||[])].sort())===JSON.stringify([...headIds].sort()))continue;
    // A deterministic winner keeps every device's main list consistent.
    const winner=heads.at(-1),value=await payload(winner);
    changes.push({id,value,updated:winner.created});next.base[id]=await hash(value);next.heads[id]=headIds;
    // Preserve parallel live edits as independent, synchronized comparison copies.
    for(const alternative of heads.slice(0,-1)){
     if(alternative.deleted)continue;
     const alternate=await payload(alternative),copyId=alternative.id;
     if(await hash(alternate)===await hash(value))continue;
     if(!local.some(r=>r.id===copyId)&&!meta.base[copyId]){
      alternate.document.meta.title=(alternate.document.meta.title||'Vistoria')+' — versão simultânea';
      changes.push({id:copyId,value:alternate,updated:alternative.created});conflicts++;
     }
    }
   }
   // Never replace work typed, saved or opened while network requests were running.
   if(!active||epoch!==startEpoch||saveTimer||busy||historyBusy||cloudKey!==key){state.textContent='Novas alterações locais. Sincronização continuará em instantes.';schedule();return}
   const latest=await rows();
   if(latest.length!==local.length|| (await Promise.all(latest.map(async r=>startingHashes.get(r.id)===await hash(r.document)))).some(ok=>!ok)){
    state.textContent='Outra aba alterou as vistorias. Nova verificação agendada sem sobrescrever os dados locais.';
    schedule();return;
   }
   // Divergências da equipe entram como cópias novas, nunca substituem dados locais.
   for(const change of changes){
    if(change.value.deleted)continue;
    const old=local.find(r=>r.id===change.id);
    if(old&&await hash({deleted:false,document:old.document})!==await hash(change.value)){
     change.id=newId();
     change.value.document.meta.title=(change.value.document.meta.title||'Vistoria')+' (cópia da equipe)';
     conflicts++;
    }
   }
   // Não alterar o formulário aberto: a equipe grava somente no histórico.
   const t=db.transaction(['reports','draft'],'readwrite');
   for(const change of changes){
    if(change.value.deleted)continue; // Nuvem legada nunca exclui vistorias deste dispositivo.
    t.objectStore('reports').put({id:change.id,document:change.value.document,updated:change.updated});
   }
   t.objectStore('draft').put(next,stateKey);await transactionDone(t);await refreshHistory();
   state.textContent='Equipe: '+sent+' enviada(s) agora, '+already+' já confirmada(s), '+pendingConflicts+' divergência(s) não enviada(s). '+local.length+' vistoria(s) locais conferidas às '+new Date().toLocaleTimeString('pt-BR')+'.'+(pendingConflicts?' Compare as versões antes de enviar estas vistorias.':'');
   await inspectTeam();
   if(conflicts)notify('Edições simultâneas preservadas como versões para comparação.');
  }catch(e){state.textContent='Sincronização pendente: '+e.message+' Os dados locais foram mantidos.'}
  finally{running=false;cloudWorking=false}
 }
 async function inspectTeam(){
  if(!cloudKey){$('teamRemoteCount').textContent='Informe a chave da equipe e toque em Conectar equipe.';return}
  const listing=await cloudApi('sync-list');
  const byReport=new Map();
  for(const row of listing.items||[]){
   if(!row.reportId)continue;
   if(!byReport.has(row.reportId))byReport.set(row.reportId,[]);
   byReport.get(row.reportId).push(row);
  }
  const heads=[];
  for(const [id,revisions] of byReport){
   const superseded=new Set(revisions.flatMap(r=>r.parents||[]));
   const live=revisions.filter(r=>!superseded.has(r.id)).sort((a,b)=>String(a.created).localeCompare(String(b.created)));
   if(live.length){const head=live.at(-1);if(!head.deleted)heads.push(head)}
  }
  $('teamRemoteCount').textContent='Nuvem da equipe: '+heads.length+' vistoria(s) ativas e '+(listing.items||[]).length+' revisão(ões) registradas.';
  $('teamListCount').textContent='('+heads.length+')';
  const list=$('teamList');list.replaceChildren();
  if(!heads.length){const p=document.createElement('p');p.className='muted';p.textContent='Nenhuma vistoria ativa encontrada. Consulte também os backups históricos abaixo.';list.append(p);}
  for(const head of heads){
   const entry=document.createElement('article');entry.className='entry';
   const title=document.createElement('h3');title.textContent='Vistoria '+head.reportId.slice(0,8).toUpperCase();
   const date=document.createElement('p');date.className='muted';date.textContent='Última atualização: '+new Date(head.created).toLocaleString('pt-BR');
   const details=document.createElement('p');details.className='muted';details.setAttribute('role','status');
   const actions=document.createElement('div');actions.className='actions';
   const view=document.createElement('button');view.type='button';view.className='secondary';view.textContent='Ver detalhes';
   view.onclick=async()=>{
    view.disabled=true;details.textContent='Abrindo informações da vistoria…';
    try{
     const report=await payload(head),doc=report.document;
     details.textContent='OS / referência: '+(doc.meta?.number||'Não informada')+' • '+(doc.meta?.title||'Relatório técnico')+' • '+doc.records.length+' ponto(s). TAGs: '+(doc.records.map(r=>r.tag).filter(Boolean).slice(0,8).join(', ')||'Não informadas');
     title.textContent=(doc.meta?.number?doc.meta.number+' · ':'')+(doc.meta?.title||'Vistoria compartilhada');
    }catch(e){details.textContent='Não foi possível abrir os detalhes: '+e.message;}
    finally{view.disabled=false}
   };
   const recover=document.createElement('button');recover.type='button';recover.className='secondary';recover.textContent='Criar cópia local';
   recover.onclick=async()=>{
    if(!historyReady||busy||historyBusy||cloudWorking){state.textContent='Aguarde a operação anterior antes de recuperar a vistoria.';return}
    if(!confirm('Criar uma cópia local desta vistoria da equipe? Nenhum registro será substituído.'))return;
    recover.disabled=true;historyBusy=true;
    try{
     await persistCurrent();
     if(await get('team-recovery-v1:'+head.id)){state.textContent='Esta revisão já foi recuperada neste aparelho.';return}
     const packet=await payload(head);
     if(packet.deleted)throw Error('Revisão excluída não pode ser importada.');
     const doc=structuredClone(packet.document),id=newId();
     doc.meta.title=(doc.meta.title||'Vistoria')+' (cópia da equipe)';
     const tx=db.transaction(['reports','draft'],'readwrite');
     tx.objectStore('reports').put({id,document:doc,updated:new Date().toISOString()});
     tx.objectStore('draft').put({revisionId:head.id,recoveredAt:new Date().toISOString()},'team-recovery-v1:'+head.id);
     await transactionDone(tx);await refreshHistory();
     state.textContent='Cópia da equipe recuperada. Consulte a aba Início.';
    }catch(e){state.textContent='Não foi possível recuperar: '+e.message}
    finally{historyBusy=false;recover.disabled=false}
   };
   const history=document.createElement('button');history.type='button';history.className='secondary';history.textContent='Histórico de revisões';
   history.onclick=()=>{
    const revisions=byReport.get(head.reportId)||[];
    details.textContent='Histórico: '+revisions.length+' revisão(ões). Última atualização em '+new Date(head.created).toLocaleString('pt-BR')+'.';
   };
   actions.append(view,recover,history);entry.append(title,date,actions,details);list.append(entry);
  }
  return heads;
 }
 async function recoverTeam(){
  if(!cloudKey){notify('Conecte a nuvem da equipe para recuperar as vistorias.');return}
  if(!historyReady||busy||historyBusy){notify('Aguarde o carregamento dos dados locais.');return}
  historyBusy=true;const button=$('teamRecover');button.disabled=true;
  try{
   const heads=await inspectTeam();
   if(!heads?.length){state.textContent='Nenhuma vistoria ativa encontrada na sincronização da equipe. Confira também as cópias antigas listadas abaixo.';return}
   if(!confirm('Recuperar '+heads.length+' vistoria(s) disponíveis na equipe? Os registros existentes serão mantidos; nada será apagado.'))return;
   await persistCurrent();
   const current=await rows(),byId=new Map(current.map(r=>[r.id,r]));
   const imports=[];
   for(const head of heads){
    state.textContent='Conferindo cópia da equipe: '+(imports.length+1)+' / '+heads.length+'…';
    const recoveredKey='team-recovery-v1:'+head.id;
    if(await get(recoveredKey))continue;
    const packet=await payload(head);
    if(packet.deleted)continue;
    const doc=structuredClone(packet.document);
    const same=byId.get(head.reportId);
    if(same&&await hash(same.document)===await hash(doc))continue;
    const id=same?newId():head.reportId;
    if(same)doc.meta.title=(doc.meta.title||'Vistoria')+' (recuperada da equipe)';
    imports.push({id,updated:head.created||new Date().toISOString(),document:doc,recoveredKey,revisionId:head.id});
    byId.set(id,{id,document:doc});
   }
   if(imports.length){
    const tx=db.transaction(['reports','draft'],'readwrite');
    for(const row of imports){tx.objectStore('reports').put({id:row.id,updated:row.updated,document:row.document});tx.objectStore('draft').put({revisionId:row.revisionId,recoveredAt:new Date().toISOString()},row.recoveredKey)}
    await transactionDone(tx);
    await refreshHistory();
   }
   state.textContent=imports.length+' vistoria(s) recuperada(s) sem substituir arquivos existentes. Consulte a aba Início.';
  }catch(e){state.textContent='Recuperação não concluída: '+e.message+' Nenhuma cópia antiga foi excluída.'}
  finally{historyBusy=false;button.disabled=false}
 }
 $('teamSendAll').onclick=async()=>{
  if(!cloudKey){state.textContent='Primeiro conecte a equipe com a chave de acesso.';return}
  if(!historyReady||busy||historyBusy||cloudWorking||running){state.textContent='Aguarde a operação em andamento e tente novamente.';return}
  const count=(await rows()).length;
  if(!count){state.textContent='Nenhuma vistoria local disponível para envio.';return}
  if(!confirm('Conferir e enviar as '+count+' vistorias locais à nuvem da equipe? Envios já confirmados serão ignorados; dados remotos não serão excluídos.'))return;
  const before=active,button=$('teamSendAll');button.disabled=true;
  active=true;
  try{await run()}
  finally{if(!before){active=false;clearTimeout(timer)}button.disabled=false}
 };
 $('teamInspect').onclick=()=>inspectTeam().catch(e=>{state.textContent='Falha ao consultar a equipe: '+e.message});
 $('teamRecover').onclick=recoverTeam;
 document.addEventListener('vistoria-dirty',()=>{epoch++;schedule()});
 document.addEventListener('vistoria-saved',()=>{epoch++;if(!running)schedule()});
 document.addEventListener('cloud-connected',()=>inspectTeam().catch(e=>{ $('teamRemoteCount').textContent='Não foi possível consultar a equipe: '+e.message; }));
 addEventListener('online',()=>schedule(0));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(0)});
 $('sharedCloudNow').onclick=()=>{if(active)schedule(0)};
 $('teamSyncToggle').onclick=()=>{
  if(active){active=false;clearTimeout(timer);$('teamSyncToggle').textContent='Ativar sincronização da equipe';$('sharedCloudNow').disabled=true;state.textContent='Sincronização contínua pausada. Backups preservados.';return}
  if(!cloudKey){state.textContent='Conecte-se à nuvem da equipe primeiro.';return}
  if(!confirm('Ativar sincronização contínua da equipe neste aparelho? As vistorias locais serão preservadas; edições divergentes serão mantidas como cópias.'))return;
  active=true;$('teamSyncToggle').textContent='Pausar sincronização da equipe';$('sharedCloudNow').disabled=false;schedule(0)
 };
 setInterval(()=>{if(active&&!document.hidden)run()},20000);
})();
