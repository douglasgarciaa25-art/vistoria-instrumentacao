import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync('pdf-import.js','utf8');
const ctx=vm.createContext({});
vm.runInContext(src.slice(0,src.indexOf('/* Keep the original')),ctx);
const pdf=(title,subject='')=>({getTitle:()=>title,getSubject:()=>subject});
const row=(id,title,number,sourcePdf='')=>({id,document:{meta:{title,number,sourcePdf}}});
test('referência nativa reabre registro original mesmo com título alterado',()=>{
 const identity=ctx.vistoriaPdfIdentity(pdf('Antigo','VISTORIA-REF-V1:RV-2026-ABC'),'renomeado.pdf');
 assert.equal(identity.native,true);
 assert.equal(ctx.vistoriaPdfMatch(identity,[row('a','Novo','RV-2026-ABC')]).id,'a');
});
test('PDF antigo encontra título único e nunca seleciona continuação importada',()=>{
 const identity=ctx.vistoriaPdfIdentity(pdf('Teste'),'Relatorio-vistoria-2026-11-19-2-pontos-1.pdf');
 assert.equal(identity.native,true);
 assert.equal(ctx.vistoriaPdfMatch(identity,[row('a','Teste','1'),row('b','Teste','2','data')]).id,'a');
 assert.equal(ctx.vistoriaPdfMatch(identity,[row('a','Teste','1'),row('b','Teste','2')]),null);
});
test('continuação antiga e PDF nativo sem registro não geram cópia',()=>{
 const identity=ctx.vistoriaPdfIdentity(pdf('Continuação - Teste'),'renomeado.pdf');
 assert.equal(identity.native,true);
 assert.equal(ctx.vistoriaPdfMatch(identity,[row('a','Teste','1')]),null);
 assert.match(src,/if\(identity.native\)throw Error/);
});
test('exportação não concatena páginas e identifica referência',()=>{
 const exporter=readFileSync('pdf-export.js','utf8');
 assert.doesNotMatch(exporter,/doc\.copyPages\(/);
 assert.match(exporter,/doc\.setSubject\('VISTORIA-REF-V1:'/);
 assert.match(exporter,/Vistoria importada anteriormente como continuação/);
});
