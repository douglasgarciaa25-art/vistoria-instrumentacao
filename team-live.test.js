import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTeamLive} from './team-live.mjs';
import {indexEvent,serveTeamEvents} from './api/team-events.mjs';
import {EventEmitter} from 'node:events';
const topic='realtime:vistoria-private-index';
const joined={topic,event:'phx_reply',ref:'join',payload:{status:'ok',response:{postgres_changes:[{schema:'public',table:'vistoria_report_index'}]}}};
const change={topic,event:'postgres_changes',payload:{data:{schema:'public',table:'vistoria_report_index',record:{drive_file_id:'PRIVATE'}}}};
test('somente índice autenticado gera avisos genéricos',()=>{
 assert.equal(indexEvent(joined,false),'ready');assert.equal(indexEvent(change,false),null);assert.equal(indexEvent(change,true),'change');
 assert.equal(indexEvent({...change,topic:'other'},true),null);
 assert.equal(indexEvent({...change,payload:{data:{schema:'public',table:'other'}}},true),null);
});
test('não conecta ao banco sem membro aprovado',async()=>{
 let status,opened=0;const res={setHeader(){},status(s){status=s;return this},end(){}};
 await serveTeamEvents({method:'GET'},res,{authorize:async()=>null,Socket:class{constructor(){opened++}},key:'test'});
 assert.equal(status,403);assert.equal(opened,0);
});
test('servidor encaminha aviso sem credenciais ou conteúdo do relatório',async()=>{
 let socket;class FakeSocket extends EventTarget{constructor(){super();socket=this;}send(){}close(){}}
 const res=new EventEmitter();const writes=[];res.setHeader=()=>{};res.write=s=>{writes.push(JSON.parse(s));return true};res.end=()=>{res.writableEnded=true};
 const p=serveTeamEvents({method:'GET'},res,{authorize:async()=>({status:'approved'}),Socket:FakeSocket,key:'sb_secret_test',limit:1000});
 await Promise.resolve();socket.dispatchEvent(new Event('open'));socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(joined)}));socket.dispatchEvent(new MessageEvent('message',{data:JSON.stringify(change)}));res.emit('close');await p;
 assert.deepEqual(writes,[{type:'connecting'},{type:'ready'},{type:'change'}]);assert.ok(!JSON.stringify(writes).includes('PRIVATE'));
});
test('cliente recebe eventos fragmentados, inicia uma conexão e mantém fallback após falha',async()=>{
 let calls=0,events=0,clock=0;
 const stream=new ReadableStream({start(c){const enc=new TextEncoder();for(const s of ['{"type":"rea','dy"}\n{"type":"change"}\n','{"type":"ping"}\n'])c.enqueue(enc.encode(s));c.close()}});
 const live=createTeamLive({token:()=> 'google-test',visible:()=>true,online:()=>true,onChange:()=>events++,now:()=>clock,fetcher:async(url,opts)=>{calls++;assert.equal(url,'/api/team-events');assert.equal(opts.headers.Authorization,'Bearer google-test');return new Response(stream,{headers:{'content-type':'application/x-ndjson'}})}});
 await Promise.all([live.start(),live.start()]);assert.equal(calls,1);assert.equal(events,2);assert.equal(live.isReady(),false);await live.start();assert.equal(calls,1);live.stop();
});
