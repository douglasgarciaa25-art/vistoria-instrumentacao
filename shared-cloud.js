/* Immutable revisions: concurrent edits remain separate heads until a later edit. */
(()=>{
 const panel=document.createElement('section');panel.className='auto-cloud';
 panel.innerHTML='<h3>Vistorias compartilhadas da equipe</h3><p class="muted">Acesse o histórico da equipe com a chave já utilizada. Consulte ou recupere cópias sem apagar registros. A sincronização contínua exige ativação explícita e funciona apenas com o aplicativo aberto.</p><p id="teamRemoteCount" role="status">Conecte a equipe para consultar as vistorias compartilhadas.</p><p id="sharedCloudState" role="status">Sincronização contínua desativada por segurança.</p><div class="actions"><button type="button" id="teamInspect" class="secondary">Consultar vistorias da equipe</button><button type="button" id="teamRecover" class="secondary">Recuperar vistorias neste aparelho</button><button type="button" id="teamSyncToggle">Ativar sincronização da equipe</button><button type="button" id="sharedCloudNow" class="secondary" disabled>Sincronizar agora</button></div>';
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
   state.textContent='Sincronizando vistorias…';
   // Publish against the revisions actually seen by this device, never unseen edits.
   const ids=new Set([...Object.keys(meta.base),...local.map(r=>r.id),...trashedIds]);
   for(const id of ids){
    if(cloudKey!==key)throw Error('Conexão alterada.');
    const row=local.find(r=>r.id===id);
    // Only an explicitly trashed report can delete shared data.
    if(!row)continue; // Não publicar exclusões na nuvem legada.
    const value={deleted:false,document:row.document};
    const fingerprint=await hash(value);if(meta.base[id]===fingerprint)continue;
    const revision=await publish(id,meta.heads[id]||[],value);
    meta.base[id]=fingerprint;meta.heads[id]=[revision.id];await set(stateKey,meta);
   }
   const listing=await cloudApi('sync-list');
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
   state.textContent='Conectado • Vistorias sincronizadas às '+new Date().toLocaleTimeString('pt-BR')+'.';
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
