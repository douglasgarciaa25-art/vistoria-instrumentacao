import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTeamOsQuery,findOsMatches,scanTeamOsPage} from './team-os-search.mjs';

test('OS preserva zeros iniciais, pesquisa exata e parcial sem converter em número',()=>{
 const doc={meta:{workOrder:'00010505291'},records:[
  {pointId:'uuid-abcdef123',pointWorkOrder:'000045',tag:'MC01'},
  {pointId:'uuid-ghijk1234',pointWorkOrder:'000104',tag:'MC02'},
  {pointId:'uuid-ghijk1235',pointWorkOrder:'',tag:'SEM OS'}
 ]};
 assert.deepEqual(findOsMatches(doc,parseTeamOsQuery('000045','exact')).map(x=>x.os),['000045']);
 assert.deepEqual(findOsMatches(doc,parseTeamOsQuery('005','partial')).map(x=>x.os),['00010505291']);
 assert.deepEqual(findOsMatches(doc,parseTeamOsQuery('000','partial')).map(x=>x.scope),['report','point','point']);
 assert.deepEqual(findOsMatches(doc,parseTeamOsQuery('0001','exact')),[]);
});
test('não busca tags, fotos, lixeira, campos de conteúdo nem OS só por posição',()=>{
 const doc={meta:{workOrder:''},records:[{tag:'000045',problem:'000045',photos:[{caption:'000045'}],pointWorkOrder:''}],deletedPoints:[{point:{pointWorkOrder:'000045'}}]};
 assert.deepEqual(findOsMatches(doc,parseTeamOsQuery('000045','partial')),[]);
});
test('validação de pesquisa rejeita caracteres maliciosos e paginação inválida',()=>{
 for(const bad of ['','1','x*','x%','x,evil','x\\ny', 'A'.repeat(81)])assert.throws(()=>parseTeamOsQuery(bad),Error);
 for(const off of [-1,1.2,100001,NaN])assert.throws(()=>parseTeamOsQuery('0001','partial',off),/Página inválida/);
 assert.equal(parseTeamOsQuery(' 000001 ','exact',20).query,'000001');
});
test('busca paginada inclui documentos remotos e não baixa fotos nem persiste dados',async()=>{
 const rows=[{report_id:'r1',drive_file_id:'f1',revision:1},{report_id:'r2',drive_file_id:'f2',revision:2},{report_id:'r3',drive_file_id:'f3',revision:3}];
 const docs={
  f1:{meta:{workOrder:'0000055'},records:[]},
  f2:{meta:{workOrder:''},records:[{tag:'R2',pointWorkOrder:'00000550'}]},
  f3:{meta:{workOrder:'000010'},records:[]}
 };
 const called=[];
 const d=await scanTeamOsPage(rows,parseTeamOsQuery('0000055'),async file=>{called.push(file);return structuredClone(docs[file])});
 assert.equal(d.matches.length,2);
 assert.deepEqual(d.matches.map(x=>x.report_id),['r1','r2']);
 assert.deepEqual(d.matches.map(x=>x.os),['0000055','00000550']);
 assert.equal(d.matches[1].tag,'R2');
 assert.deepEqual(called,['f1','f2','f3']);
 assert.equal(d.truncated,false);
});
test('falha de rede não é mascarada como ausência de OS',async()=>{
 await assert.rejects(()=>scanTeamOsPage([{report_id:'r1',drive_file_id:'f1'}],parseTeamOsQuery('0011'),async()=>{throw Error('Drive indisponível')}),/Drive indisponível/);
});
test('não permite consultas desproporcionais nem documentos inválidos',async()=>{
 await assert.rejects(()=>scanTeamOsPage(Array.from({length:21},(_,i)=>({drive_file_id:String(i)})),parseTeamOsQuery('0011'),async()=>({records:[]})),/Página excedida/);
 assert.throws(()=>findOsMatches({records:null},parseTeamOsQuery('0011')),/Registros inválidos/);
});
