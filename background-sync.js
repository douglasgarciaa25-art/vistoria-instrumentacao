/* Explicit background queue: existing shared reports only. No OAuth tokens persisted. */
(function(root){
 const open=()=>new Promise((resolve,reject)=>{const q=indexedDB.open('vistoria-background-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('jobs',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 async function store(mode,fn){const db=await open();try{return await new Promise((resolve,reject)=>{const t=db.transaction('jobs',mode),q=fn(t.objectStore('jobs'));t.oncomplete=()=>resolve(q.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}finally{db.close();}}
 const list=()=>store('readonly',s=>s.getAll()),put=j=>store('readwrite',s=>s.put(j)),clear=()=>store('readwrite',s=>s.clear());
 // Compare-and-set in a single IndexedDB transaction; never resurrect a cleared or replaced job.
 const same=(a,b)=>!!a&&a.state==='pending'&&a.subject===b.subject&&a.hash===b.hash&&a.revision===b.revision&&a.generation===b.generation;
 async function change(job,patch){
 const db=await open();try{return await new Promise((resolve,reject)=>{const t=db.transaction('jobs','readwrite'),s=t.objectStore('jobs'),q=s.get(job.id);let changed=false;
 q.onsuccess=()=>{if(!same(q.result,job))return;changed=true;if(patch===null)s.delete(job.id);else s.put({...q.result,...patch});};
 t.oncomplete=()=>resolve(changed);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}finally{db.close();}
 }
 const cancel=job=>change(job,null);
 const active=async job=>same((await list()).find(j=>j.id===job.id),job);
 async function checkpoint(job,patch){if(!await change(job,patch))throw Error('Fila alterada');}

 async function run(){
 const jobs=(await list()).filter(j=>j.state==='pending');if(!jobs.length)return;
 const session=await fetch('/api/personal-session',{method:'POST',cache:'no-store'});if(!session.ok)return;
 const auth=await session.json();if(!auth.subject||!auth.access_token)return;
 for(const job of jobs){
 if(job.subject!==auth.subject)continue;
 const current=(await list()).find(j=>j.id===job.id);if(!same(current,job))continue;
 const bytes=new TextEncoder().encode(JSON.stringify(job.document));
 const request=async body=>{if(!await active(job))throw Error('Fila alterada');return fetch('/api/team-reports?id='+encodeURIComponent(job.id),{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});};
 let r;
 if(bytes.length<=3000000)r=await request({document:job.document,revision:job.revision});
 else{
 if(bytes.length>12000000){await change(job,{state:'conflict'});continue;}
 const upload_id=job.upload_id||crypto.randomUUID();await checkpoint(job,{upload_id});
 const base={upload_id,revision:job.revision};
 const staged=await request({...base,action:'upload-status'});
 if(!staged.ok){if([400,403,404,409].includes(staged.status)){await change(job,{state:'conflict'});continue;}throw Error('Falha temporária');}
 const received=new Set((await staged.json()).parts||[]),size=750000,total=Math.ceil(bytes.length/size);
 for(let part=0;part<total;part++){
 const latest=(await list()).find(j=>j.id===job.id);if(!same(latest,job))throw Error('Fila alterada');
 if(received.has(part))continue;
 const chunk=bytes.subarray(part*size,(part+1)*size);let binary='';for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));
 const result=await request({...base,action:'upload-part',part,payload:btoa(binary)});
 if(!result.ok)throw Error('Parte não enviada');
 await checkpoint(job,{progress:part+1,total});
 }
 r=await request({...base,action:'upload-finish',total,sha256:job.hash});
 }

 if(r.ok){const d=await r.json();await change(job,{document:null,state:'sent',newRevision:d.revision});}
 else if([400,403,404,409].includes(r.status))await change(job,{state:'conflict'});
 else throw Error('Envio temporariamente indisponível');
 }
 }
 root.VistoriaBackground={list,put,clear,cancel,run};
})(globalThis);
