import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
test('reordena fotos com legenda, marcação e original preservados',()=>{
 const photos=[
  {src:'data:image/jpeg;base64,AA==',caption:'Antes',originalSrc:'foto-original'},
  {src:'data:image/jpeg;base64,BB==',caption:'Depois',originalSrc:'foto-original-2'},
  {src:'data:image/jpeg;base64,CC==',caption:'Detalhe'}
 ];
 const snapshots=structuredClone(photos),references=[...photos];
 let listener,saveCount=0,callCount=0;const buttons=[];
 const host={
  querySelectorAll:()=>photos.map((photo,i)=>({after:(...b)=>buttons.push(...b)})),
  addEventListener:(name,cb)=>{assert.equal(name,'click');listener=cb;}
 };
 const context={
  photos,busy:0,historyBusy:false,save:()=>saveCount++,
  thumbs:()=>callCount++,$:id=>{assert.equal(id,'thumbs');return host},
  notify:()=>{throw Error('Notificação inesperada')},
  document:{createElement:()=>({dataset:{},setAttribute(){}})}
 };
 vm.runInNewContext(readFileSync('photo-order.js','utf8'),context);
 assert.equal(buttons.length,6);
 assert.equal(buttons[0].disabled,true);
 assert.equal(buttons[5].disabled,true);
 listener({target:{dataset:{photoIndex:'1',photoMove:'-1'}}});
 assert.equal(photos[0],references[1]);
 assert.equal(photos[1],references[0]);
 assert.deepEqual(photos[0],snapshots[1]);
 assert.deepEqual(photos[1],snapshots[0]);
 assert.deepEqual(photos[2],snapshots[2]);
 assert.equal(saveCount,1);
 context.busy=1;
 assert.throws(()=>listener({target:{dataset:{photoIndex:'0',photoMove:'1'}}}),/Notificação inesperada/);
 assert.equal(saveCount,1);
 context.busy=0;
 listener({target:{dataset:{photoIndex:'0',photoMove:'-1'}}});
 assert.equal(saveCount,1);
 assert.ok(callCount>=2);
});
test('interface carrega módulo de ordenação e ele fica disponível offline',()=>{
 const html=readFileSync('index.html','utf8'),sw=readFileSync('sw.js','utf8');
 assert.match(html,/<script src="photo-order\.js"><\/script>/);
 assert.match(sw,/'\/photo-order\.js'/);
});
