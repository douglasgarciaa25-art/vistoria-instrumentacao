import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function app(){
 let uuid=0;
 const form={onsubmit:null};
 const ctx={
  records:[],editing:null,activeReportId:'report-one',
  crypto:{randomUUID:()=>`uuid-${++uuid}-persistent`},
  window:{}, $:id=>{assert.equal(id,'form');return form},
 };
 ctx.data=()=>({version:1,records:ctx.records});
 ctx.fill=doc=>{ctx.records=doc.records};
 form.onsubmit=()=>{
  const fresh={tag:'TAG editada',photos:[]};
  if(ctx.editing===null)ctx.records.push(fresh);
  else ctx.records[ctx.editing]=fresh;
 };
 vm.runInNewContext(readFileSync('point-identity.js','utf8'),ctx);
 return {ctx,form};
}

test('pontos legados recebem IDs persistentes e diferentes por relatório',()=>{
 const {ctx}=app();
 ctx.fill({records:[{tag:'A',photos:[]},{tag:'B',photos:[]}]});
 const ids=ctx.data().records.map(p=>p.pointId);
 assert.deepEqual(ids,['legacy:report-one:1','legacy:report-one:2']);
 ctx.records.reverse();
 assert.deepEqual(ctx.data().records.map(p=>p.pointId),ids.slice().reverse());
 ctx.activeReportId='report-two';
 ctx.fill({records:[{tag:'A',photos:[]}]});
 assert.equal(ctx.data().records[0].pointId,'legacy:report-two:1');
});

test('editar um equipamento preserva ID e adicionar outro cria UUID',()=>{
 const {ctx,form}=app();
 ctx.fill({records:[{tag:'A',photos:[]}]});
 const original=ctx.data().records[0].pointId;
 ctx.editing=0;
 form.onsubmit({});
 assert.equal(ctx.records[0].pointId,original,'A edição não pode trocar a identidade.');
 ctx.editing=null;
 form.onsubmit({});
 assert.match(ctx.records[1].pointId,/^uuid-/);
 assert.notEqual(ctx.records[1].pointId,original);
});

test('IDs duplicados no mesmo relatório são corrigidos',()=>{
 const {ctx}=app();
 const source={pointId:'uuid-duplicate-value',tag:'A',photos:[]};
 ctx.fill({records:[source,{...source}]});
 const ids=ctx.data().records.map(r=>r.pointId);
 assert.equal(new Set(ids).size,2);
});

test('PWA carrega e guarda módulo de identidade para uso offline',()=>{
 const index=readFileSync('index.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert.match(index,/<script src="point-identity\.js"><\/script>/);
 assert.match(sw,/'\/point-identity\.js'/);
});
