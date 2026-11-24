import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync('pdf-import.js','utf8');
const ctx=vm.createContext({crypto:globalThis.crypto,TextEncoder});
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
 assert.match(src,/Registro editável original não localizado/);
 assert.match(src,/window\.VistoriaGoogleDrive\?\.markPdfLocal\(id\)/);
});
test('exportação não concatena páginas e identifica referência',()=>{
 const exporter=readFileSync('pdf-export.js','utf8');
 assert.doesNotMatch(exporter,/doc\.copyPages\(/);
 assert.match(exporter,/doc\.setSubject\('VISTORIA-REF-V1:'/);
 assert.match(exporter,/Vistoria importada anteriormente como continuação/);
});

test('recuperação de PDF usa ID estável por referência ou conteúdo',async()=>{
 const a=await ctx.vistoriaPdfRecoveryId({native:true,reference:'RV-2026-A'},new Uint8Array([1]));
 const b=await ctx.vistoriaPdfRecoveryId({native:true,reference:'RV-2026-A'},new Uint8Array([2]));
 assert.equal(a,b);
 const c=await ctx.vistoriaPdfRecoveryId({native:false,reference:''},new Uint8Array([1]));
 const d=await ctx.vistoriaPdfRecoveryId({native:false,reference:''},new Uint8Array([2]));
 assert.notEqual(c,d);
 assert.match(a,/^pdf-[0-9a-f]{64}$/);
});
test('busca automática consulta nuvem antes de oferecer continuação e evita publicação',()=>{
 const sync=readFileSync('google-drive-sync.js','utf8');
 assert.match(src,/await window\.VistoriaGoogleDrive\.receiveForPdf\(\)/);
 assert.match(src,/rows\.find\(r=>r\.id===id\|\|r\.document\?\.meta\?\.sourcePdf===src\)/);
 assert.match(src,/deleted-report:/);
 assert.match(sync,/receiveForPdf:async\(\)=>\{await syncTeam\(true\);await sync\(true\);\}/);
 assert.match(sync,/if\(receiveOnly===true\)\{await refreshHistory\(\);return;\}/);
});
