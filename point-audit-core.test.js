import test from 'node:test';
import assert from 'node:assert/strict';
import {pointChanges} from './point-audit-core.mjs';
const point=(id,status='Pendente',tag='MC01')=>({pointId:id,tag,status,photos:[]});
test('finalização e reabertura rastreadas pelo mesmo ID após reordenação',()=>{
 const a=[point('uuid_11111111'),point('uuid_22222222')],b=[{...a[1],status:'Corrigido'},a[0]];
 assert.deepEqual(pointChanges({records:a},{records:b}).map(x=>[x.point_id,x.action]),[['uuid_22222222','completed']]);
 assert.equal(pointChanges({records:b},{records:[point('uuid_11111111'),a[1]]})[0].action,'reopened');
});
test('exclusão por ID e edição sem troca de identidade',()=>{
 const a=[point('uuid_11111111'),point('uuid_22222222')];
 const ev=pointChanges({records:a},{records:[{...a[0],tag:'MC02'}]});
 assert.deepEqual(ev.map(x=>x.action).sort(),['deleted','edited']);
 assert.equal(ev.find(e=>e.action==='deleted').point_id,'uuid_22222222');
});
test('não atribui alterações de documentos legados sem IDs',()=>{
 assert.deepEqual(pointChanges({records:[{tag:'MC01',status:'Pendente'}]},{records:[{...point('legacy:report-a:1','Corrigido')}] }),[]);
 assert.deepEqual(pointChanges({records:[{tag:'MC01',status:'Corrigido'}]},{records:[]}),[]);
});
test('não registra edição só por mudar fotos, impede ID duplicado',()=>{
 const a=[point('uuid_11111111')];
 assert.deepEqual(pointChanges({records:a},{records:[{...a[0],photos:[{src:'synthetic'}]}]}),[]);
 assert.throws(()=>pointChanges({records:[]},{records:[a[0],a[0]]}),/duplicado/);
});
test('apenas registros novos têm evento de criação',()=>{
 assert.equal(pointChanges(null,{meta:{workOrder:'000045'},records:[point('uuid_11111111')]} )[0].work_order,'000045');
});

test('inclusão em vistoria já identificada registra autoria sem confundir a TAG',()=>{
 const old={records:[point('uuid_11111111')]};
 const now={records:[point('uuid_11111111'),point('uuid_22222222')]};
 const events=pointChanges(old,now);
 assert.deepEqual(events.map(x=>x.action),['created']);
 assert.equal(events[0].point_id,'uuid_22222222');
});

test('lixeira com mesmo ID registra restauração e preserva foto sintética',()=>{
 const p=point('uuid_11111111','Pendente');p.photos=[{src:'data:image/jpeg;base64,AA==',caption:'Antes'}];
 const previous={records:[],deletedPoints:[{point:p,deletedAt:'2026-11-18T18:00:00Z'}]};
 const next={records:[p],deletedPoints:[]};
 const events=pointChanges(previous,next);
 assert.equal(events.length,1);
 assert.equal(events[0].action,'restored');
 assert.equal(events[0].point_id,p.pointId);
 const drive=readFileSync('team-drive.mjs','utf8');
 assert.match(drive,/deletedPoints/);
});
test('ponto recuperável carregado na interface e cache offline',()=>{
 const html=readFileSync('index.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert.match(html,/<script src="point-trash\.js"><\/script>/);
 assert.match(sw,/'\/point-trash\.js'/);
});
