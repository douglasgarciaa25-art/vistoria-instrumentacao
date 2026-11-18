/* Explicit background queue: existing shared reports only. No OAuth tokens persisted. */
(function(root){
 const open=()=>new Promise((resolve,reject)=>{const q=indexedDB.open('vistoria-background-v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('jobs',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
 async function store(mode,fn){const db=await open();try{return await new Promise((resolve,reject)=>{const t=db.transaction('jobs',mode),q=fn(t.objectStore('jobs'));t.oncomplete=()=>resolve(q.result);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});}finally{db.close();}}
 const list=()=>store('readonly',s=>s.getAll()),put=j=>store('readwrite',s=>s.put(j)),clear=()=>store('readwrite',s=>s.clear());
 async function run(){
 const jobs=(await list()).filter(j=>j.state==='pending');if(!jobs.length)return;
 const session=await fetch('/api/personal-session',{method:'POST',cache:'no-store'});if(!session.ok)return;
 const auth=await session.json();if(!auth.subject||!auth.access_token)return;
 for(const job of jobs){
 if(job.subject!==auth.subject)continue;
 const current=(await list()).find(j=>j.id===job.id);if(!current||current.state!=='pending'||current.hash!==job.hash)continue;
 const bytes=new TextEncoder().encode(JSON.stringify(job.document));
 const request=body=>fetch('/api/team-reports?id='+encodeURIComponent(job.id),{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 let r;
 if(bytes.length<=3000000)r=await request({document:job.document,revision:job.revision});
 else{
 if(bytes.length>12000000){await put({...job,state:'conflict'});continue;}
 const upload_id=job.upload_id||crypto.randomUUID();job.upload_id=upload_id;await put(job);
 const base={upload_id,revision:job.revision};
 const staged=await request({...base,action:'upload-status'});
 if(!staged.ok){if([400,403,404,409].includes(staged.status)){await put({...job,state:'conflict'});continue;}throw Error('Falha temporária');}
 const received=new Set((await staged.json()).parts||[]),size=750000,total=Math.ceil(bytes.length/size);
 for(let part=0;part<total;part++){
 const latest=(await list()).find(j=>j.id===job.id);if(!latest||latest.hash!==job.hash||latest.state!=='pending')throw Error('Fila alterada');
 if(received.has(part))continue;
 const chunk=bytes.subarray(part*size,(part+1)*size);let binary='';for(let i=0;i<chunk.length;i+=8192)binary+=String.fromCharCode(...chunk.subarray(i,i+8192));
 const result=await request({...base,action:'upload-part',part,payload:btoa(binary)});
 if(!result.ok)throw Error('Parte não enviada');
 }
 r=await request({...base,action:'upload-finish',total,sha256:job.hash});
 }

 if(r.ok){const d=await r.json();await put({...job,document:null,state:'sent',newRevision:d.revision});}
 else if([400,403,404,409].includes(r.status))await put({...job,state:'conflict'});
 else throw Error('Envio temporariamente indisponível');
 }
 }
 root.VistoriaBackground={list,put,clear,run};
})(globalThis);
