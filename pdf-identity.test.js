import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const src=readFileSync('pdf-import.js','utf8');
const ctx=vm.createContext({crypto:globalThis.crypto,TextEncoder,TextDecoder,structuredClone,Uint8Array,btoa});
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

test('campos de PDF legado recuperam cabeçalho, pontos, andamento e conclusão',()=>{
 const events=[{size:16,text:'Relatório técnico'},{size:7,text:'DATA DA VISTORIA'},{size:10,text:'19/11/2026'},{size:7,text:'CÓDIGO / REFERÊNCIA'},{size:10,text:'RV-2026-ABC'},{size:8,text:'OBJETIVO DO LEVANTAMENTO'},{size:10,text:'Avaliar os mancais'},{size:12,text:'2.1 Levantamento de campo'},{size:14,text:'MC4510 | Moagem'},{size:9,text:'PRIORIDADE: ALTA'},{size:7,text:'SITUAÇÃO'},{size:10,text:'Em acompanhamento'},{size:8,text:'CONDIÇÃO ENCONTRADA'},{size:10,text:'Oscilação de sinal'},{size:8,text:'ANDAMENTO DA ANÁLISE'},{size:10,text:'Teste na remota'},{size:8,text:'ANDAMENTO DA ANÁLISE (CONT.)'},{size:10,text:'Sensor validado'},{photo:'data:image/jpeg;base64,AAAA'},{size:9,text:'Foto 1.1 - Sensor'},{size:12,text:'3. Conclusão / observações finais'},{size:10,text:'Verificar cabo'},{size:12,text:'Controle do documento'},{size:7,text:'APROVAÇÃO REGISTRADA'},{size:10,text:'Responsável'}];
 const d=ctx.vistoriaPdfLegacyFields(events,{title:'',reference:''});
 assert.equal(d.meta.date,'2026-11-19');assert.equal(d.meta.objective,'Avaliar os mancais');
 assert.equal(d.records[0].tag,'MC4510');assert.equal(d.records[0].area,'Moagem');assert.equal(d.records[0].priority,'Alta');
 assert.equal(d.records[0].analysisHistory,'Teste na remota Sensor validado');assert.equal(d.records[0].photos[0].caption,'Sensor');
 assert.equal(d.meta.conclusion,'Verificar cabo');assert.equal(d.meta.approver,'Responsável');
});
test('PDF editável inclui fotografia, referência e todos os campos de uma vistoria completa',async()=>{
 vm.runInContext(readFileSync('pdf-lib.min.js','utf8'),ctx);
 const result=await vm.runInContext("(async()=>{const p=await PDFLib.PDFDocument.create();p.addPage();const original={version:1,meta:{number:'RV-2026-ABC',title:'Teste',author:'Técnico'},records:[{tag:'MC4510',analysisHistory:'teste',photos:[{src:'data:image/jpeg;base64,AAAA',caption:'Sensor'}]}]};vistoriaPdfEmbed(p,original,'original-id');const restored=vistoriaPdfReadEditable(await PDFLib.PDFDocument.load(await p.save()));return {original,restored};})()",ctx);
 assert.equal(result.restored.id,'original-id');assert.equal(JSON.stringify(result.original),JSON.stringify(result.restored.document));
});
test('exportação individual completa associa o ID real, sem confundir PDF de ponto',()=>{
 const exporter=readFileSync('pdf-export.js','utf8');
 assert.match(exporter,/vistoriaPdfEmbed\(doc,documents\[0\],ids\[0\]\)/);
 assert.match(exporter,/exportReportDocuments\(\[document\],\[activeReportId\]\)/);
 assert.match(src,/document\.exportPointNumber\)return/);
});

test('PDF encontra vistoria na lixeira pelo ID ou referência, nunca por título genérico',()=>{
 const a=row('a','Relatório','RV-2026-A'),b=row('b','Relatório','RV-2026-B');
 assert.equal(ctx.vistoriaPdfTrashMatch({reference:'RV-2026-A'},'outro','pdf',[a,b]).id,'a');
 assert.equal(ctx.vistoriaPdfTrashMatch({reference:'RV-2026-A'},'b','pdf',[a,b]).id,'b');
 assert.equal(ctx.vistoriaPdfTrashMatch({title:'Relatório',reference:''},'outro','pdf',[a,b]),null);
 assert.throws(()=>ctx.vistoriaPdfTrashMatch({reference:'RV-2026-A'},'outro','pdf',[a,row('c','Relatório','RV-2026-A')]),/Mais de uma/);
});
test('lixeira da equipe não pode ser restaurada pela via local',()=>{
 assert.equal(ctx.vistoriaPdfTeamTrash({teamTrash:true},true,false),true);
 assert.equal(ctx.vistoriaPdfTeamTrash(null,{account:'team',revision:3},false),true);
 assert.equal(ctx.vistoriaPdfTeamTrash(null,true,true),true);
 assert.equal(ctx.vistoriaPdfTeamTrash({},true,false),false);
 assert.match(src,/await window\.VistoriaTeamTrash\.restore\(restoreId\)/);
 assert.match(src,/if\(vistoriaPdfTeamTrash\(row,marker\.result,window\.VistoriaTeamTrash\?\.known\(id\)\)\)return/);
});
test('restauração explícita preserva o ID e o documento e limpa o marcador atomicamente',()=>{
 assert.match(src,/restored=\{id,updated:new Date\(\)\.toISOString\(\),document:row\.document\}/);
 assert.match(src,/reports\.add\(restored\);trash\.delete\(id\);draft\.delete\('deleted-report:'\+id\)/);
 assert.match(src,/const recoverDeleted=marker===true&&!teamTrash/);
 assert.match(src,/recoverDeleted&&!packet&&!legacy/);
 assert.match(src,/if\(recoverDeleted\)draft\.delete\('deleted-report:'\+id\)/);
});
