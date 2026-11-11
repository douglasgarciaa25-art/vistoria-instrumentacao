/* Immutable revisions: concurrent edits remain separate heads until a later edit. */
(()=>{
 const panel=document.createElement('section');panel.className='auto-cloud';
 panel.innerHTML='<h3>Nuvem compartilhada</h3><p class="muted">Use o mesmo link e a mesma chave nos aparelhos autorizados. A conexão é lembrada neste navegador. Todos com a chave podem consultar, editar e excluir vistorias. A atualização ocorre a cada 20 segundos enquanto o aplicativo está aberto. Sem internet, as alterações ficam no aparelho até reconectar.</p><p id="sharedCloudState" role="status">Aguardando conexão.</p><button type="button" id="sharedCloudNow">Sincronizar agora</button>';
 $('cloudControls').before(panel);
 const state=$('sharedCloudState');let running=false,timer,epoch=0;
 const get=key=>requestResult(db.transaction('draft').objectStore('draft').get(key));
 async function set(key,value){const t=db.transaction('draft','readwrite');t.objectStore('draft').put(value,key);await transactionDone(t)}
 function canonical(v){if(Array.isArray(v))return v.map(canonical);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v}
 async function hash(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(v)))))].map(v=>v.toString(16).padStart(2,'0')).join('')}
 async function rows(){return requestResult(db.transaction('reports').objectStore('reports').getAll())}
 function schedule(delay=2000){clearTimeout(timer);timer=setTimeout(run,delay)}
 async function payload(m){let text='';for(let i=0;i<m.parts;i++)text+=(await cloudApi('part&id='+m.id+'&part='+i)).chunk;if(text.length!==m.length)throw Error('Revisão incompleta.');const v=JSON.parse(text);if(typeof v.deleted!=='boolean'||(!v.deleted&&(!valid(v.document)||!checkPending(v.document))))throw Error('Revisão incompatível.');return v}
 async function publish(reportId,parents,value){const id=newId(),text=JSON.stringify(value),parts=Math.ceil(text.length/750000);if(parts>300)throw Error('Vistoria muito grande para sincronizar.');for(let i=0;i<parts;i++)await cloudApi('part&id='+id+'&part='+i,'POST',{chunk:text.slice(i*750000,(i+1)*750000)});return cloudApi('sync-commit&id='+id,'POST',{reportId,parents,parts,length:text.length})}
 async function run(){
  if(running||!historyReady||busy||historyBusy||cloudWorking)return;
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
   const trashed=await requestResult(db.transaction('trash').objectStore('trash').getAll());const trashedIds=new Set(trashed.map(r=>r.id));const startEpoch=epoch;
   state.textContent='Sincronizando vistorias…';
   // Publish against the revisions actually seen by this device, never unseen edits.
   const ids=new Set([...Object.keys(meta.base),...local.map(r=>r.id)]);
   for(const id of ids){
    if(cloudKey!==key)throw Error('Conexão alterada.');
    const row=local.find(r=>r.id===id);
    // Only an explicitly trashed report can delete shared data.
    if(!row&&!trashedIds.has(id))continue;
    const value=row?{deleted:false,document:row.document}:{deleted:true};
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
   if(epoch!==startEpoch||saveTimer||busy||historyBusy||cloudKey!==key){state.textContent='Novas alterações locais. Sincronização continuará em instantes.';schedule();return}
   const latest=await rows();
   if(latest.length!==local.length|| (await Promise.all(latest.map(async r=>startingHashes.get(r.id)===await hash(r.document)))).some(ok=>!ok)){
    state.textContent='Outra aba alterou as vistorias. Nova verificação agendada sem sobrescrever os dados locais.';
    schedule();return;
   }
   const t=db.transaction(['reports','trash','draft'],'readwrite');
   let activeChange=null;
   for(const change of changes){
    if(change.value.deleted){const old=local.find(r=>r.id===change.id);if(old)t.objectStore('trash').put({...old,deletedAt:change.updated});t.objectStore('reports').delete(change.id)}
    else {t.objectStore('reports').put({id:change.id,document:change.value.document,updated:change.updated});t.objectStore('trash').delete(change.id)}
    if(change.id===activeReportId)activeChange=change;
   }
   if(activeChange){
    if(activeChange.value.deleted){blankReport();t.objectStore('draft').put({...data(),reportId:activeReportId},'current')}
    else {reset();fill(activeChange.value.document);t.objectStore('draft').put({...activeChange.value.document,reportId:activeReportId},'current')}
   }
   t.objectStore('draft').put(next,stateKey);await transactionDone(t);await refreshHistory();if(window.refreshTrash)await window.refreshTrash();
   state.textContent='Conectado • Vistorias sincronizadas às '+new Date().toLocaleTimeString('pt-BR')+'.';
   if(conflicts)notify('Edições simultâneas preservadas como versões para comparação.');
  }catch(e){state.textContent='Sincronização pendente: '+e.message+' Os dados locais foram mantidos.'}
  finally{running=false;cloudWorking=false}
 }
 document.addEventListener('vistoria-dirty',()=>{epoch++;schedule()});
 document.addEventListener('vistoria-saved',()=>{epoch++;if(!running)schedule()});
 document.addEventListener('cloud-connected',()=>schedule(0));
 addEventListener('online',()=>schedule(0));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule(0)});
 $('sharedCloudNow').onclick=()=>schedule(0);
 setInterval(()=>{if(!document.hidden)run()},20000);schedule(1000);
})();
