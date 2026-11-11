import test from 'node:test';
import assert from 'node:assert/strict';
import {validUuid,validPart,validPartUpload,validSyncCommit,validBackupCommit,validSyncPayload} from './cloud-rules.js';
const id='c64beac0-68b1-4ad7-a1fe-541a3da29b16';
const parent='6ab3f511-191f-4ddb-93e2-7d2d5f8c24ba';
test('IDs e índices de partes bloqueiam formatos indevidos',()=>{
 assert.equal(validUuid(id),true);assert.equal(validUuid('../segredo'),false);
 assert.equal(validUuid('a'.repeat(36)),false);
 assert.equal(validPart('0'),true);assert.equal(validPart('299'),true);
 for(const p of ['-1','030','300','1/../3','','abc'])assert.equal(validPart(p),false);
});
test('partes vazias, maiores que limite ou com dados inválidos são recusadas',()=>{
 assert.equal(validPartUpload('0',{chunk:'abc'}),true);
 assert.equal(validPartUpload('0',{chunk:''}),false);
 assert.equal(validPartUpload('0',{chunk:'x'.repeat(750001)}),false);
 assert.equal(validPartUpload('0',{chunk:{}}),false);
});
test('sincronização exige pais únicos e tamanho consistente',()=>{
 const v={reportId:id,parents:[parent],parts:2,length:750001};
 assert.equal(validSyncCommit(v),true);
 assert.equal(validSyncCommit({...v,parents:[parent,parent]}),false);
 assert.equal(validSyncCommit({...v,parts:1}),false);
 assert.equal(validSyncCommit({...v,reportId:'123'}),false);
});
test('cópia exige contagem e limites válidos',()=>{
 const v={parts:1,count:4,length:120};
 assert.equal(validBackupCommit(v),true);
 assert.equal(validBackupCommit({...v,count:0}),false);
 assert.equal(validBackupCommit({...v,parts:300,length:1}),false);
});
test('não aceita revisão sem formato de relatório',()=>{
 assert.equal(validSyncPayload({deleted:true}),true);
 assert.equal(validSyncPayload({deleted:false,document:{version:1,meta:{},records:[]}}),true);
 assert.equal(validSyncPayload({deleted:false,document:{version:1,records:[]}}),false);
 assert.equal(validSyncPayload({deleted:false,document:{version:2,meta:{},records:[]}}),false);
});
