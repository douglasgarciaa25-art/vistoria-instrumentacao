import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';

const source=readFileSync('background-sync.js','utf8');
function fakeIndexedDB(legacy=[]){
 const stores=new Map([['jobs',new Map(legacy.map(j=>[j.id,structuredClone(j)]))]]);
 let version=legacy.length?1:0;
 let writeBarrier=Promise.resolve();
 const clone=x=>x===undefined?undefined:structuredClone(x);
 function transaction(wait=Promise.resolve(),release=()=>{}){
  let pending=0,closed=false,failed=false;
  const t={oncomplete:null,onerror:null,onabort:null,error:null,abort(){failed=true;queueMicrotask(()=>t.onabort?.())}};
  function finish(){if(!pending&&!closed&&!failed){closed=true;queueMicrotask(()=>{t.oncomplete?.();release()})}}
  function request(operation){const r={result:null,error:null,onsuccess:null,onerror:null};pending++;
   wait.then(()=>queueMicrotask(()=>{try{r.result=clone(operation());r.onsuccess?.({target:r})}catch(error){r.error=error;failed=true;r.onerror?.({target:r});t.error=error;t.onerror?.({target:t})}finally{pending--;finish()}}));
   return r;
  }
  t.objectStore=name=>{
   const map=stores.get(name);if(!map)throw Error('Store ausente '+name);
   return {
    get:key=>request(()=>map.get(key)),
    getAll:()=>request(()=>[...map.values()]),
    put:item=>request(()=>{const k=item.key??item.id;if(!k)throw Error('Sem chave');map.set(k,clone(item));return k}),
    delete:key=>request(()=>map.delete(key))
   };
  };
  t.finish=finish;
  return t;
 }
 const db={
  objectStoreNames:{contains:name=>stores.has(name)},
  createObjectStore(name,options){stores.set(name,new Map());return {put:item=>{stores.get(name).set(item[options.keyPath],clone(item))}}},
  transaction:(name,mode)=>{
   if(mode==='readwrite'){
    const wait=writeBarrier;let release;
    writeBarrier=new Promise(resolve=>{release=resolve});
    return transaction(wait,release);
   }
   return transaction(writeBarrier);
  },
  close(){}
 };
 return {
  open(name,target){
   assert.equal(name,'vistoria-background-v1');
   const r={result:db,transaction:null,onupgradeneeded:null,onsuccess:null,onerror:null,error:null};
   queueMicrotask(()=>{
    if(target>version){
     const oldVersion=version;const t=transaction();r.transaction=t;
     r.onupgradeneeded?.({oldVersion});
     t.oncomplete=()=>{version=target;r.onsuccess?.({target:r})};
     t.finish();
    }else r.onsuccess?.({target:r});
   });
   return r;
  },
  getStore(name){return stores.get(name)},
 };
}
function fixture(id,subject,revision=0,document={meta:{title:'Teste sintético'},records:[]}){
 return {id,subject,revision,hash:createHash('sha256').update(JSON.stringify(document)).digest('hex'),document,generation:subject+'-generation',state:'pending'};
}
function setup({legacy=[],subject='conta-A',handler,sessionHandler}={}){
 const indexedDB=fakeIndexedDB(legacy),calls=[];
 const fetch=async(url,options={})=>{
  calls.push({url,options});
  if(url==='/api/personal-session')
   return sessionHandler?sessionHandler(url,options):Response.json({subject,access_token:'fake-token'}, {status:200});
  if(handler)return handler(url,options);
  return Response.json({revision:2},{status:200});
 };
 const scope={indexedDB,fetch,crypto:webcrypto,TextEncoder,Response,Date,URL,console,btoa,
  setTimeout,clearTimeout};
 scope.globalThis=scope;
 vm.runInNewContext(source,scope,{filename:'background-sync.js'});
 return {queue:scope.VistoriaBackground,indexedDB,calls};
}

test('duas contas com mesmo ID não substituem uma à outra; cancelamento é individual',async()=>{
 const {queue}=setup();
 await queue.put(fixture('registro-001','conta-A'));
 await queue.put(fixture('registro-001','conta-B'));
 assert.equal((await queue.list()).length,2);
 const [a,b]=(await queue.list()).sort((x,y)=>x.subject.localeCompare(y.subject));
 assert.notEqual(a.key,b.key);
 assert.equal(await queue.cancel(a),true);
 assert.deepEqual((await queue.list()).map(x=>x.subject),['conta-B']);
 assert.equal(await queue.clearFor('conta-A'),0);
 assert.equal((await queue.list())[0].subject,'conta-B');
 assert.equal(await queue.clearFor('conta-B'),1);
 assert.equal((await queue.list()).length,0);
});

test('migração preserva fila antiga e isola por identidade',async()=>{
 const legacy=[fixture('repetido','conta-A'),fixture('outro','conta-B')];
 const {queue,indexedDB}=setup({legacy});
 assert.equal((await queue.list()).length,2);
 assert.equal(indexedDB.getStore('jobs').size,2,'Cópia de recuperação não foi apagada');
 assert.equal(indexedDB.getStore('jobs_scoped').size,2);
 await queue.put(fixture('repetido','conta-B'));
 assert.equal((await queue.list()).length,3);
});

test('execução com login A nunca transmite trabalho da conta B e mantém recibo',async()=>{
 const {queue,calls}=setup();
 await queue.put(fixture('mesma-tag','conta-A',1));
 await queue.put(fixture('mesma-tag','conta-B',1));
 await queue.run();
 const saved=await queue.list();
 assert.equal(saved.find(x=>x.subject==='conta-A').state,'sent');
 assert.equal(saved.find(x=>x.subject==='conta-A').newRevision,2);
 assert.equal(saved.find(x=>x.subject==='conta-A').document,null);
 assert.equal(saved.find(x=>x.subject==='conta-B').state,'pending');
 assert.equal(calls.filter(x=>x.url.startsWith('/api/team-reports')).length,1);
});

test('duas execuções simultâneas não enviam a mesma revisão duas vezes',async()=>{
 const {queue,calls}=setup();
 await queue.put(fixture('registro-2','conta-A'));
 await Promise.all([queue.run(),queue.run()]);
 assert.equal(calls.filter(x=>x.url.startsWith('/api/team-reports')).length,1);
 assert.equal((await queue.list())[0].state,'sent');
});

test('HTTP 409 preserva documento, bloqueia reenvio automático',async()=>{
 const {queue}=setup({handler:()=>new Response('',{status:409})});
 await queue.put(fixture('registro-3','conta-A'));
 await queue.run();
 const [job]=await queue.list();
 assert.equal(job.state,'conflict');
 assert.ok(job.document);
});

test('recibo inválido não remove o documento nem marca envio como confirmado',async()=>{
 const {queue}=setup({handler:()=>Response.json({revision:0})});
 await queue.put(fixture('registro-4','conta-A',1));
 await queue.run();
 const [job]=await queue.list();
 assert.equal(job.state,'pending');
 assert.ok(job.document);
 assert.equal(job.lease,null);
});

test('logout/cancelamento durante requisição não ressuscita a fila',async()=>{
 let start,finish;
 const started=new Promise(r=>{start=r});
 const held=new Promise(r=>{finish=r});
 const {queue}=setup({handler:async()=>{start();await held;return Response.json({revision:2})}});
 await queue.put(fixture('registro-5','conta-A'));
 const running=queue.run();
 await started;
 assert.equal(await queue.clearFor('conta-A'),1);
 finish();
 await running;
 assert.equal((await queue.list()).length,0);
});

test('sem cookie ou autorização, nenhuma requisição de relatório acontece',async()=>{
 const {queue,calls}=setup({handler:()=>{throw Error('Não deveria transmitir')}});
 await queue.put(fixture('registro-6','conta-B'));
 await queue.run();
 assert.equal(calls.filter(x=>x.url.startsWith('/api/team-reports')).length,0);
 assert.equal((await queue.list())[0].state,'pending');
});


test('envio de 3,2 MB retoma partes sem duplicar após falha de rede',async()=>{
 const document={meta:{workOrder:'0000001234'},records:[],evidence:'X'.repeat(3_200_000)};
 const hash=createHash('sha256').update(JSON.stringify(document)).digest('hex');
 let failed=false,statusRequests=0,partRequests=[],uploaded=new Set(),uploadId=null;
 const {queue}=setup({handler:(url,options)=>{
  const body=JSON.parse(options.body);
  if(body.action==='upload-status'){
   statusRequests++;
   if(uploadId)assert.equal(body.upload_id,uploadId);else uploadId=body.upload_id;
   return Response.json({parts:[...uploaded]});
  }
  if(body.action==='upload-part'){
   assert.equal(body.upload_id,uploadId);
   partRequests.push(body.part);
   if(body.part===2&&!failed){failed=true;return new Response('Temporário',{status:503});}
   uploaded.add(body.part);
   return Response.json({ok:true});
  }
  if(body.action==='upload-finish'){
   assert.equal(body.sha256,hash);
   assert.equal(body.total,Math.ceil(new TextEncoder().encode(JSON.stringify(document)).length/750000));
   assert.equal(uploaded.size,body.total);
   return Response.json({revision:2});
  }
  throw Error('Ação inesperada '+body.action);
 }});
 await queue.put({...fixture('report-large','conta-A',1,document),hash});
 await queue.run();
 assert.equal((await queue.list())[0].state,'pending');
 assert.equal((await queue.list())[0].document.evidence.length,3_200_000);
 await queue.run();
 assert.equal((await queue.list())[0].state,'sent');
 assert.equal((await queue.list())[0].document,null);
 assert.equal(statusRequests,2);
 assert.equal(partRequests.filter(p=>p===0).length,1,'Parte confirmada não deve ser reenviada');
 assert.equal(partRequests.filter(p=>p===1).length,1);
 assert.equal(partRequests.filter(p=>p===2).length,2,'Parte rejeitada deve ser reenviada');
});

test('limite de 12MB não remove o documento quando excedido',async()=>{
 const oversized={meta:{},records:[],evidence:'X'.repeat(12_000_100)};
 const {queue,calls}=setup();
 await queue.put(fixture('large-report','conta-A',0,oversized));
 await queue.run();
 const [job]=await queue.list();
 assert.equal(job.state,'conflict');
 assert.equal(job.document.evidence.length,12_000_100);
 assert.equal(calls.filter(c=>c.url.startsWith('/api/team-reports')).length,0);
});


test('falha HTTP 503 preserva revisão e permite retomada segura após reinício',async()=>{
 let attempts=0;
 const {queue,calls}=setup({handler:()=>{
  attempts++;
  return attempts===1?new Response('Indisponível',{status:503}):Response.json({revision:4});
 }});
 const original=fixture('retomada-503','conta-A',3,{meta:{workOrder:'00000987'},records:[{tag:'CT01'}]});
 await queue.put(original);
 await queue.run();
 let [stored]=await queue.list();
 assert.equal(stored.state,'pending');
 assert.equal(stored.document.meta.workOrder,'00000987');
 assert.equal(stored.revision,3);
 assert.equal(stored.lease,null);
 assert.equal(stored.leaseUntil,0);
 await queue.run();
 [stored]=await queue.list();
 assert.equal(stored.state,'sent');
 assert.equal(stored.newRevision,4);
 assert.equal(stored.document,null);
 assert.equal(calls.filter(c=>c.url.startsWith('/api/team-reports')).length,2);
});

test('substituir geração durante envio impede recibo antigo de apagar versão nova',async()=>{
 let start,finish;
 const entered=new Promise(resolve=>{start=resolve});
 const wait=new Promise(resolve=>{finish=resolve});
 const {queue}=setup({handler:async()=>{
  start();
  await wait;
  return Response.json({revision:2});
 }});
 const first=fixture('same-report','conta-A',1,{meta:{workOrder:'0001'},records:[]});
 await queue.put(first);
 const running=queue.run();
 await entered;
 const newer={...fixture('same-report','conta-A',1,{meta:{workOrder:'0002'},records:[]}),generation:'generation-new'};
 await queue.put(newer);
 finish();
 await running;
 const [saved]=await queue.list();
 assert.equal(saved.state,'pending');
 assert.equal(saved.generation,'generation-new');
 assert.equal(saved.document.meta.workOrder,'0002');
 assert.equal(saved.newRevision,undefined);
});

test('cancelar somente um item não interrompe outro da mesma conta',async()=>{
 let start,finish,requested=0;
 const entered=new Promise(resolve=>{start=resolve});
 const wait=new Promise(resolve=>{finish=resolve});
 const {queue}=setup({handler:async()=>{
  requested++;
  if(requested===1){start();await wait;}
  return Response.json({revision:2});
 }});
 await queue.put(fixture('a-first','conta-A',1));
 await queue.put(fixture('b-second','conta-A',1));
 const running=queue.run();
 await entered;
 const first=(await queue.list()).find(x=>x.id==='a-first');
 assert.equal(await queue.cancel(first),true);
 finish();
 await running;
 const jobs=await queue.list();
 assert.equal(jobs.length,1);
 assert.equal(jobs[0].id,'b-second');
 assert.equal(jobs[0].state,'sent');
 assert.equal(requested,2);
});

test('logout da conta A mantém trabalhos da conta B durante resposta pendente',async()=>{
 let start,finish;
 const entered=new Promise(resolve=>{start=resolve});
 const wait=new Promise(resolve=>{finish=resolve});
 const {queue}=setup({handler:async()=>{start();await wait;return Response.json({revision:2});}});
 await queue.put(fixture('same-id','conta-A',1));
 await queue.put(fixture('same-id','conta-B',1));
 const running=queue.run();
 await entered;
 assert.equal(await queue.clearFor('conta-A'),1);
 finish();
 await running;
 const jobs=await queue.list();
 assert.equal(jobs.length,1);
 assert.equal(jobs[0].subject,'conta-B');
 assert.equal(jobs[0].state,'pending');
});

test('SHA-256 inválido preserva documento e impede qualquer POST de relatório',async()=>{
 const {queue,calls}=setup();
 const job=fixture('hash-invalid','conta-A',1,{meta:{workOrder:'00001'},records:[]});
 await queue.put({...job,hash:'f'.repeat(64)});
 await queue.run();
 const [stored]=await queue.list();
 assert.equal(stored.state,'conflict');
 assert.equal(stored.integrityError,'sha256-mismatch');
 assert.equal(stored.document.meta.workOrder,'00001');
 assert.equal(stored.lease,null);
 assert.equal(calls.filter(x=>x.url.startsWith('/api/team-reports')).length,0);
});

test('alteração silenciosa do documento na IndexedDB é detectada antes do envio',async()=>{
 const {queue,indexedDB,calls}=setup();
 await queue.put(fixture('tampered','conta-A',1,{meta:{workOrder:'00012'},records:[]}));
 const store=indexedDB.getStore('jobs_scoped');
 const [key,job]=[...store.entries()][0];
 job.document.meta.workOrder='00013';
 store.set(key,job);
 await queue.run();
 const [stored]=await queue.list();
 assert.equal(stored.state,'conflict');
 assert.equal(stored.document.meta.workOrder,'00013');
 assert.equal(calls.filter(x=>x.url.startsWith('/api/team-reports')).length,0);
});

test('hash malformado nunca é aceito como prova de integridade',async()=>{
 const {queue,calls}=setup();
 await queue.put({...fixture('malformed','conta-A',0),hash:'fake-sha256'});
 await queue.run();
 const [stored]=await queue.list();
 assert.equal(stored.integrityError,'sha256-mismatch');
 assert.equal(stored.state,'conflict');
 assert.ok(stored.document);
 assert.equal(calls.filter(x=>x.url.startsWith('/api/team-reports')).length,0);
});


test('falha transitória de um ponto não bloqueia outro e ambos podem ser recuperados',async()=>{
 let firstFails=true;
 const {queue,calls}=setup({handler:(url,options)=>{
  const id=new URL(url,'https://local.invalid').searchParams.get('id');
  if(id==='a-falha'&&firstFails)return new Response('Indisponível',{status:503});
  return Response.json({revision:2});
 }});
 await queue.put(fixture('a-falha','conta-A',1,{meta:{workOrder:'0001'},records:[]}));
 await queue.put(fixture('b-ok','conta-A',1,{meta:{workOrder:'0002'},records:[]}));
 await queue.run();
 let jobs=await queue.list();
 assert.equal(jobs.find(j=>j.id==='a-falha').state,'pending');
 assert.equal(jobs.find(j=>j.id==='a-falha').document.meta.workOrder,'0001');
 assert.equal(jobs.find(j=>j.id==='a-falha').lease,null);
 assert.equal(jobs.find(j=>j.id==='b-ok').state,'sent');
 assert.equal(jobs.find(j=>j.id==='b-ok').newRevision,2);
 firstFails=false;
 await queue.run();
 jobs=await queue.list();
 assert.equal(jobs.find(j=>j.id==='a-falha').state,'sent');
 assert.equal(jobs.find(j=>j.id==='b-ok').state,'sent');
 assert.equal(calls.filter(c=>c.url.includes('id=b-ok')).length,1);
 assert.equal(calls.filter(c=>c.url.includes('id=a-falha')).length,2);
});

test('recibo JSON inválido não impede outro relatório e mantém cópia original',async()=>{
 const {queue}=setup({handler:(url)=>{
  const id=new URL(url,'https://local.invalid').searchParams.get('id');
  return id==='a-json'?new Response('{inválido',{status:200,headers:{'Content-Type':'application/json'}}):Response.json({revision:2});
 }});
 await queue.put(fixture('a-json','conta-A',1));
 await queue.put(fixture('b-valid','conta-A',1));
 await queue.run();
 const jobs=await queue.list();
 assert.equal(jobs.find(j=>j.id==='a-json').state,'pending');
 assert.ok(jobs.find(j=>j.id==='a-json').document);
 assert.equal(jobs.find(j=>j.id==='b-valid').state,'sent');
});


test('troca de conta entre dois relatórios impede envio pela sessão anterior',async()=>{
 let account='conta-A',sent=0;
 const {queue,calls}=setup({
  sessionHandler:()=>Response.json({subject:account,access_token:'synthetic-'+account}),
  handler:()=>{sent++;account='conta-B';return Response.json({revision:2})}
 });
 await queue.put(fixture('primeiro','conta-A',1));
 await queue.put(fixture('segundo','conta-A',1));
 await queue.run();
 const jobs=await queue.list();
 assert.equal(sent,1,'O segundo relatório não pode usar a sessão anterior');
 assert.equal(jobs.find(x=>x.id==='primeiro').state,'sent');
 assert.equal(jobs.find(x=>x.id==='segundo').state,'pending');
 assert.ok(jobs.find(x=>x.id==='segundo').document);
 assert.equal(jobs.find(x=>x.id==='segundo').lease,null);
 assert.equal(calls.filter(x=>x.url.startsWith('/api/team-reports')).length,1);
});

test('logout antes de enviar um chunk suspende transferência sem perder documento',async()=>{
 let sessionCount=0,parts=0;
 const document={meta:{workOrder:'00077'},records:[],evidence:'X'.repeat(3_200_000)};
 const {queue,calls}=setup({
  sessionHandler:()=>{
   sessionCount++;
   return sessionCount<=3?Response.json({subject:'conta-A',access_token:'synthetic-token'}):
    new Response('',{status:401});
  },
  handler:(url,options)=>{
   const body=JSON.parse(options.body);
   if(body.action==='upload-status')return Response.json({parts:[]});
   if(body.action==='upload-part'){parts++;return Response.json({ok:true})}
   throw Error('Não deve concluir o upload após logout');
  }
 });
 await queue.put(fixture('chunk-logout','conta-A',1,document));
 await queue.run();
 const [job]=await queue.list();
 assert.equal(parts,1);
 assert.equal(job.state,'pending');
 assert.equal(job.lease,null);
 assert.ok(job.document.evidence.length>3_000_000);
 assert.equal(calls.filter(c=>c.url.includes('upload-finish')).length,0);
});

test('troca de conta durante consulta de partes impede qualquer upload',async()=>{
 let checks=0;
 const document={meta:{},records:[],evidence:'X'.repeat(3_100_000)};
 const {queue,calls}=setup({
  sessionHandler:()=>Response.json({subject:++checks===1?'conta-A':'conta-B',access_token:'synthetic-token'}),
  handler:()=>{throw Error('Nenhuma requisição de upload autorizada')}
 });
 await queue.put(fixture('switch-parts','conta-A',1,document));
 await queue.run();
 const [job]=await queue.list();
 assert.equal(job.state,'pending');
 assert.ok(job.document);
 assert.equal(calls.filter(c=>c.url.startsWith('/api/team-reports')).length,0);
});

test('recibo de partes inválido não pula bytes nem descarta documento',async()=>{
 const document={meta:{workOrder:'0000123'},records:[],evidence:'X'.repeat(3_100_000)};
 for(const parts of [[-1],[99],[0,0],[0.5],['0'],null]){
  let sent=0;
  const {queue}=setup({handler:(url,options)=>{
   const body=JSON.parse(options.body);
   if(body.action==='upload-status')return Response.json({parts});
   sent++;
   throw Error('Não deveria enviar partes com status inválido');
  }});
  await queue.put(fixture('invalid-status','conta-A',1,document));
  await queue.run();
  const [job]=await queue.list();
  assert.equal(sent,0);
  assert.equal(job.state,'pending');
  assert.equal(job.document.meta.workOrder,'0000123');
  assert.equal(job.lease,null);
  assert.equal(job.leaseUntil,0);
 }
});

test('resposta de status com JSON inválido mantém fila e permite recuperação',async()=>{
 const document={meta:{workOrder:'0000777'},records:[],evidence:'X'.repeat(3_100_000)};
 let bad=true,parts=0;
 const {queue}=setup({handler:(url,options)=>{
  const body=JSON.parse(options.body);
  if(body.action==='upload-status')return bad
   ?new Response('{erro',{status:200,headers:{'Content-Type':'application/json'}})
   :Response.json({parts:[]});
  if(body.action==='upload-part'){parts++;return Response.json({ok:true})}
  if(body.action==='upload-finish')return Response.json({revision:2});
  throw Error('Ação inesperada');
 }});
 await queue.put(fixture('invalid-json','conta-A',1,document));
 await queue.run();
 assert.equal(parts,0);
 assert.equal((await queue.list())[0].state,'pending');
 bad=false;
 await queue.run();
 const [saved]=await queue.list();
 assert.equal(saved.state,'sent');
 assert.equal(saved.document,null);
 assert.ok(parts>0);
});


test('HTTP 200 sem confirmação da parte não avança o progresso nem conclui upload',async()=>{
 const document={meta:{workOrder:'000009'},records:[],evidence:'X'.repeat(3_100_000)};
 let partCalls=0,finishCalls=0;
 const {queue}=setup({handler:(url,options)=>{
  const body=JSON.parse(options.body);
  if(body.action==='upload-status')return Response.json({parts:[]});
  if(body.action==='upload-part'){partCalls++;return Response.json({ok:false});}
  if(body.action==='upload-finish'){finishCalls++;return Response.json({revision:2});}
  throw Error('Ação inesperada');
 }});
 await queue.put(fixture('invalid-part-ack','conta-A',1,document));
 await queue.run();
 const [job]=await queue.list();
 assert.equal(partCalls,1);
 assert.equal(finishCalls,0);
 assert.equal(job.state,'pending');
 assert.ok(job.document);
 assert.equal(job.progress,undefined);
 assert.equal(job.lease,null);
});

test('recibo de parte com JSON corrompido não descarta documento e permite retomar',async()=>{
 const document={meta:{workOrder:'000010'},records:[],evidence:'X'.repeat(3_100_000)};
 let invalid=true;
 const {queue}=setup({handler:(url,options)=>{
  const body=JSON.parse(options.body);
  if(body.action==='upload-status')return Response.json({parts:[]});
  if(body.action==='upload-part')return invalid
   ?new Response('{broken',{status:200,headers:{'Content-Type':'application/json'}})
   :Response.json({ok:true});
  if(body.action==='upload-finish')return Response.json({revision:2});
  throw Error('Ação inesperada');
 }});
 await queue.put(fixture('corrupt-part-ack','conta-A',1,document));
 await queue.run();
 assert.equal((await queue.list())[0].state,'pending');
 assert.ok((await queue.list())[0].document);
 invalid=false;
 await queue.run();
 assert.equal((await queue.list())[0].state,'sent');
});
