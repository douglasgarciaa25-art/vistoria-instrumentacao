import test from 'node:test';
import assert from 'node:assert/strict';
import {trashSummary} from './api/team-reports.mjs';
test('resumo da lixeira usa revisão excluída, TAG e autor autenticado sem baixar fotos',async()=>{
 const row={report_id:'r1',revision:4,drive_file_id:'file-001'};
 const db=async path=>{assert.match(path,/action=eq.delete&revision=eq.4/);return [{actor_name:'Técnico A'}]};
 const read=async (id,opts)=>{assert.equal(id,'file-001');assert.equal(opts.withPhotos,false);return {meta:{title:'Britagem',number:'RV-1'},records:[{tag:'C210'},{tag:'C210'},{tag:'C221'}],deletedPoints:[{point:{tag:'C222'}}]}};
 const s=await trashSummary(row,{db,read});assert.deepEqual(s.tags,['C210','C221','C222']);assert.equal(s.title,'Britagem');assert.equal(s.number,'RV-1');assert.equal(s.point_count,3);assert.equal(s.deleted_by,'Técnico A');assert.equal(s.partial,false);
});
test('falhas de leitura não inventam título, TAG nem autor',async()=>{const s=await trashSummary({report_id:'r1',revision:4,drive_file_id:'file-001'},{db:async()=>[],read:async()=>{throw Error('offline')}});assert.equal(s.title,'');assert.deepEqual(s.tags,[]);assert.equal(s.deleted_by,null);assert.equal(s.partial,true)});
test('auditoria sem nome histórico usa conta autenticada',async()=>{const s=await trashSummary({report_id:'r1',revision:4},{db:async path=>path.startsWith('vistoria_audit?')?[{actor_subject:'subject-1'}]:[{email:'tecnico@example.invalid'}]});assert.equal(s.deleted_by,'tecnico@example.invalid')});
