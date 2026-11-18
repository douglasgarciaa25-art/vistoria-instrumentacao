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
 const r=await fetch('/api/team-reports?id='+encodeURIComponent(job.id),{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify({document:job.document,revision:job.revision})});
 if(r.ok){const d=await r.json();await put({...job,document:null,state:'sent',newRevision:d.revision});}
 else if([400,403,404,409].includes(r.status))await put({...job,state:'conflict'});
 else throw Error('Envio temporariamente indisponível');
 }
 }
 root.VistoriaBackground={list,put,clear,run};
})(globalThis);
