import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';

const source=readFileSync('background-sync.js','utf8');
function fakeIndexedDB(legacy=[]){
 const stores=new Map([['jobs',new Map(legacy.map(j=>[j.id,structuredClone(j)]))]]);
 let version=legacy.length?1:0;
 const clone=x=>x===undefined?undefined:structuredClone(x);
 function transaction(){
  let pending=0,closed=false,failed=false;
  const t={oncomplete:null,onerror:null,onabort:null,error:null,abort(){failed=true;queueMicrotask(()=>t.onabort?.())}};
  function finish(){if(!pending&&!closed&&!failed){closed=true;queueMicrotask(()=>t.oncomplete?.())}}
  function request(operation){const r={result:null,error:null,onsuccess:null,onerror:null};pending++;
   queueMicrotask(()=>{try{r.result=clone(operation());r.onsuccess?.({target:r})}catch(error){r.error=error;failed=true;r.onerror?.({target:r});t.error=error;t.onerror?.({target:t})}finally{pending--;finish()}});
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
  transaction:()=>{const t=transaction();return t;},
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
 return {id,subject,revision,hash:'fake-sha256',document,generation:subject+'-generation',state:'pending'};
}
function setup({legacy=[],subject='conta-A',handler}={}){
 const indexedDB=fakeIndexedDB(legacy),calls=[];
 const fetch=async(url,options={})=>{
  calls.push({url,options});
  if(url==='/api/personal-session')
   return Response.json({subject,access_token:'fake-token'}, {status:200});
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
 await assert.rejects(queue.run(),/Recibo da revisão inválido/);
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
