import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./pwa.js',import.meta.url),'utf8');
function setup({saveError=false,busy=false,autoActivate=true,activateElsewhere=false}={}){
 const events=[],timers=new Map();let next=0,button=null;
 class Target{
  constructor(){this.handlers=new Map();this.state='installed';this.inert=false;this.style={};}
  addEventListener(n,fn){const set=this.handlers.get(n)||new Set();set.add(fn);this.handlers.set(n,set);}
  removeEventListener(n,fn){this.handlers.get(n)?.delete(fn);}
  emit(n){for(const fn of [...(this.handlers.get(n)||[])])fn();}
  setAttribute(){}
 }
 const old=new Target(),worker=new Target(),sw=new Target(),reg=new Target(),main=new Target();
 sw.controller=old;reg.waiting=worker;reg.update=async()=>{};sw.register=async()=>reg;
 worker.postMessage=()=>{events.push('activate');if(autoActivate){reg.waiting=null;worker.state='activated';sw.controller=worker;sw.emit('controllerchange');}};
 const nodes=new Map();const doc=new Target();
 doc.getElementById=id=>{if(!nodes.has(id))nodes.set(id,new Target());return nodes.get(id)};
 doc.querySelector=s=>s==='main'?main:{append:b=>{button=b}};doc.createElement=()=>new Target();
 doc.visibilityState='visible';
 const ctx={document:doc,navigator:{serviceWorker:sw,onLine:true},matchMedia:()=>({matches:false}),addEventListener(){},historyReady:true,busy,historyBusy:false,persistCurrent:async()=>{events.push('save');if(saveError)throw Error('Falha no armazenamento')},location:{reload(){events.push('reload')}},notify:m=>events.push(m),setTimeout:fn=>{timers.set(++next,fn);return next},clearTimeout:id=>timers.delete(id)};
 vm.runInNewContext(source,ctx);
 return {events,timers,main,sw,reg,worker,click:async()=>{await new Promise(resolve=>setImmediate(resolve));assert.ok(button,'botão criado após registro');if(activateElsewhere){reg.waiting=null;worker.state='activated';sw.controller=worker;}const fn=[...button.handlers.get('click')][0];return fn()},button:()=>button};
}
test('salva antes de ativar e recarrega uma única vez',async()=>{const s=setup();await s.click();assert.deepEqual(s.events,['save','activate','reload']);});
test('falha de salvamento não ativa nem recarrega e desbloqueia botão',async()=>{const s=setup({saveError:true});await s.click();assert.deepEqual(s.events,['save','Falha no armazenamento']);assert.equal(s.button().disabled,false);assert.equal(s.main.inert,false);});
test('operação em andamento não força atualização',async()=>{const s=setup({busy:true});await s.click();assert.equal(s.events.length,1);assert.match(s.events[0],/operação em andamento/);});
test('atualização já ativada por outra aba salva antes de recarregar',async()=>{const s=setup({activateElsewhere:true});await s.click();assert.deepEqual(s.events,['save','reload']);});
test('timeout libera botão para nova tentativa sem descartar dados',async()=>{const s=setup({autoActivate:false});const pending=s.click();await new Promise(resolve=>setImmediate(resolve));assert.equal(s.timers.size,1);for(const cb of [...s.timers.values()])cb();await pending;assert.equal(s.button().disabled,false);assert.equal(s.main.inert,false);assert.ok(!s.events.includes('reload'));});
test('não há segundo botão de atualização',()=>{const e=readFileSync(new URL('./enhancements.js',import.meta.url),'utf8');assert.doesNotMatch(e,/applyUpdate|ACTIVATE_UPDATE|controllerchange/);assert.match(source,/action.id='vistoria-update'/);});
