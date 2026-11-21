/* Fila offline isolada por Google subject e relatório. Nenhum token OAuth é salvo. */
(function(root){
 'use strict';
 const DATABASE='vistoria-background-v1',VERSION=2,STORE='jobs_scoped';
 const keyFor=(subject,id)=>{
  if(typeof subject!=='string'||!subject||typeof id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(id))throw Error('Conta ou relatório inválido');
  return subject.length+':'+subject+':'+id;
 };
 const open=()=>new Promise((resolve,reject)=>{
  const q=indexedDB.open(DATABASE,VERSION);
  q.onupgradeneeded=event=>{
   const db=q.result,transaction=q.transaction;
   const next=db.objectStoreNames.contains(STORE)?transaction.objectStore(STORE):db.createObjectStore(STORE,{keyPath:'key'});
   // Migração atômica: conserva a tabela anterior como cópia de recuperação.
   if(event.oldVersion<2&&db.objectStoreNames.contains('jobs')){
    const legacy=transaction.objectStore('jobs').getAll();
    legacy.onsuccess=()=>{
     for(const job of legacy.result||[]){
      try{next.put({...job,key:keyFor(job.subject,job.id)})}catch{/* Entrada incompleta permanece na cópia antiga, nunca enviada. */}
     }
    };
   }
  };
  q.onsuccess=()=>resolve(q.result);
  q.onerror=()=>reject(q.error);
 });
 async function transaction(mode,fn){
  const db=await open();
  try{return await new Promise((resolve,reject)=>{
   const t=db.transaction(STORE,mode),s=t.objectStore(STORE);
   let result;try{fn(s,t,value=>{result=value})}catch(error){t.abort();reject(error);return;}
   t.oncomplete=()=>resolve(result);
   t.onerror=()=>reject(t.error||Error('Falha na fila'));
   t.onabort=()=>reject(t.error||Error('Operação interrompida'));
  })}finally{db.close()}
 }
 const list=()=>transaction('readonly',(s,t,done)=>{const q=s.getAll();q.onsuccess=()=>done(q.result||[])});
 const put=job=>{
  const key=keyFor(job?.subject,job?.id);
  if(job.state!=='pending'||typeof job.generation!=='string'||!job.generation||typeof job.hash!=='string'||!job.hash||!job.document)throw Error('Envio inválido');
  return transaction('readwrite',s=>s.put({...job,key,queuedAt:job.queuedAt||new Date().toISOString()}));
 };
 const same=(current,job)=>!!current&&current.state==='pending'&&current.key===keyFor(job.subject,job.id)
  &&current.subject===job.subject&&current.hash===job.hash&&current.revision===job.revision
  &&current.generation===job.generation;
 async function change(job,patch,lease){
  const key=keyFor(job.subject,job.id);
  return transaction('readwrite',(s,t,done)=>{
   const q=s.get(key);
   q.onsuccess=()=>{
    const current=q.result;
    if(!same(current,job)||(lease&&current.lease!==lease)){done(false);return;}
    if(patch===null)s.delete(key);
    else s.put({...current,...patch});
    done(true);
   };
  });
 }
 const cancel=job=>change(job,null);
 // Desconectar cancela apenas as transmissões da conta em uso; não toca nos relatórios locais ou em outras contas.
 const clearFor=subject=>transaction('readwrite',(s,t,done)=>{
  if(typeof subject!=='string'||!subject)throw Error('Conta necessária');
  const q=s.getAll();
  q.onsuccess=()=>{
   let count=0;for(const job of q.result||[])if(job.subject===subject){s.delete(job.key);count++}
   done(count);
  };
 });
 async function claim(job,lease){
  return transaction('readwrite',(s,t,done)=>{
   const q=s.get(keyFor(job.subject,job.id));
   q.onsuccess=()=>{
    const current=q.result,now=Date.now();
    if(!same(current,job)||(current.leaseUntil>now)){done(false);return;}
    s.put({...current,lease,leaseUntil:now+120000});
    done(true);
   };
  });
 }
 async function active(job,lease){
  const stored=await transaction('readonly',(s,t,done)=>{
   const q=s.get(keyFor(job.subject,job.id));
   q.onsuccess=()=>done(q.result);
  });
  return same(stored,job)&&stored.lease===lease;
 }
 async function checkpoint(job,lease,patch){
  if(!await change(job,{...patch,leaseUntil:Date.now()+120000},lease))throw Error('Fila alterada ou cancelada');
 }
 const successStatus=s=>s>=200&&s<300;
 async function run(){
  const jobs=(await list()).filter(j=>j.state==='pending');
  if(!jobs.length)return;
  const session=await fetch('/api/personal-session',{method:'POST',cache:'no-store',credentials:'same-origin'});
  if(!session.ok)return;
  const auth=await session.json();
  if(!auth.subject||!auth.access_token)return;
  for(const job of jobs){
   if(job.subject!==auth.subject)continue;
   const lease=crypto.randomUUID();
   if(!await claim(job,lease))continue;
   try{
    const bytes=new TextEncoder().encode(JSON.stringify(job.document));
    const request=async body=>{
     if(!await active(job,lease))throw Error('Fila alterada, conta desconectada ou envio cancelado');
     // A sessão pode mudar durante uma transferência longa ou entre duas partes.
     // Não reutilizar o token capturado no início se a conta tiver mudado ou saído.
     const check=await fetch('/api/personal-session',{method:'POST',cache:'no-store',credentials:'same-origin'});
     if(!check.ok)throw Error('Sessão não disponível para continuar o envio');
     const fresh=await check.json();
     if(fresh.subject!==job.subject||fresh.subject!==auth.subject||!fresh.access_token)
      throw Error('Conta alterada durante o envio');
     if(!await active(job,lease))throw Error('Fila cancelada durante a verificação da sessão');
     return fetch('/api/team-reports?id='+encodeURIComponent(job.id),{method:'POST',cache:'no-store',
      headers:{Authorization:'Bearer '+fresh.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});
    };
    let response;
    if(bytes.length>12000000){await change(job,{state:'conflict',lease:null,leaseUntil:0},lease);continue;}
    // Verificar os bytes persistidos antes de transmitir. Um registro corrompido ou
    // alterado fora do fluxo normal nunca deve receber recibo de envio válido.
    const calculated=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),
      byte=>byte.toString(16).padStart(2,'0')).join('');
    if(!/^[a-f0-9]{64}$/.test(job.hash)||calculated!==job.hash){
     await change(job,{state:'conflict',integrityError:'sha256-mismatch',lease:null,leaseUntil:0},lease);
     continue;
    }
    if(!await active(job,lease))throw Error('Fila alterada antes do envio');
    if(bytes.length<=3000000)response=await request({document:job.document,revision:job.revision});
    else{
     const upload_id=job.upload_id||crypto.randomUUID();
     await checkpoint(job,lease,{upload_id});
     const base={upload_id,revision:job.revision};
     const staged=await request({...base,action:'upload-status'});
     if(!staged.ok){
      if([400,403,404,409].includes(staged.status)){await change(job,{state:'conflict',lease:null,leaseUntil:0},lease);continue;}
      throw Error('Falha temporária ao consultar partes');
     }
     const received=new Set((await staged.json()).parts||[]),size=750000,total=Math.ceil(bytes.length/size);
     for(let part=0;part<total;part++){
      if(!await active(job,lease))throw Error('Fila alterada');
      if(received.has(part))continue;
      const chunk=bytes.subarray(part*size,(part+1)*size);
      let binary='';for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));
      const result=await request({...base,action:'upload-part',part,payload:btoa(binary)});
      if(!successStatus(result.status))throw Error('Parte não enviada');
      await checkpoint(job,lease,{progress:part+1,total});
     }
     response=await request({...base,action:'upload-finish',total,sha256:job.hash});
    }
    if(response.ok){
     const result=await response.json();
     if(!Number.isSafeInteger(result.revision)||result.revision<=job.revision)throw Error('Recibo da revisão inválido');
     await change(job,{document:null,state:'sent',newRevision:result.revision,finishedAt:new Date().toISOString(),lease:null,leaseUntil:0},lease);
    }else if([400,403,404,409].includes(response.status))
     await change(job,{state:'conflict',lease:null,leaseUntil:0},lease);
    else throw Error('Envio temporariamente indisponível');
   }catch(error){
    // Uma falha de rede, recibo ou JSON de um ponto não deve impedir os demais
    // pontos da mesma conta de serem enviados. A cópia permanece na fila.
    // Não persistir tokens, respostas do servidor nem detalhes sensíveis.
    if(typeof console!=='undefined'&&console.warn)
     console.warn('Envio em segundo plano pendente; nova tentativa necessária.');
   }finally{
    // Falha temporária não apaga o documento nem prende a fila por dois minutos.
    await change(job,{lease:null,leaseUntil:0},lease).catch(()=>{});
   }
  }
 }
 root.VistoriaBackground={list,put,cancel,clearFor,run};
})(globalThis);
