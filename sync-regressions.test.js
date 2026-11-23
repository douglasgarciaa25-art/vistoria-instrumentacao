import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=name=>readFileSync(name,'utf8');

test('PWA guarda todos os scripts efetivamente usados no modo offline',()=>{
 const scripts=[...file('index.html').matchAll(/<script src="([^"]+)"/g)].map(match=>match[1]);
 const sw=file('sw.js');
 assert.ok(scripts.length>=15);
 for(const src of scripts)assert.ok(sw.includes("'/" + src + "'"),'Script sem cache offline: '+src);
 assert.match(sw,/fetch\(event\.request,\{cache:'no-cache'\}\)/);
 assert.match(sw,/cache\.match\(url\.pathname\)/);
});
test('salvamento local usa fila e captura ID com dados do mesmo formulário',()=>{
 const src=file('history.js');
 assert.match(src,/persistQueue\.catch\(\(\)=>\{\}\)\.then\(task\)/);
 assert.match(src,/structuredClone\(data\(\)\),savingId=activeReportId/);
 assert.match(src,/reportId:savingId/);
});
test('Drive mantém exclusões locais e isola hashes por pasta',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/removedIds\.has\(id\)/);
 assert.match(src,/deleted-report:/);
 assert.match(src,/loadScope\(folderId\)/);
 assert.match(src,/SYNC_KEY\+':'\+syncScope/);
 assert.match(src,/PHOTOS_KEY\+':'\+syncScope/);
 assert.match(src,/doc\.reportId!==expectedReportId/);
});
test('nuvem compartilhada não sobrescreve alterações de outra aba',()=>{
 const src=file('shared-cloud.js');
 assert.match(src,/startingHashes=new Map/);
 assert.match(src,/const latest=await rows\(\)/);
 assert.match(src,/Outra aba alterou as vistorias/);
 assert.match(src,/erasedKeys\.filter/);
 assert.match(src,/\.\.\.trashedIds/);
});

test('PDF registra aviso quando o arquivo de origem falha',()=>{
 const src=file('pdf-export.js');
 assert.match(src,/sourcePdfFailed=true;sourcePdfWarnings\+\+/);
 assert.match(src,/O PDF de origem não pôde ser incorporado/);
});


test('equipe pesquisa OS individual com zeros iniciais e sem confundir com referência',()=>{
 const source=file('google-drive-sync.js');
 assert.match(source,/p\.pointWorkOrder,p\.tag,p\.area/);
 const fixture={meta:{number:'RV-001',workOrder:'0001020'},records:[{tag:'C550_CF02',pointWorkOrder:'00000035',area:'Flotação'}]};
 const haystack=[fixture.meta.title,fixture.meta.number,JSON.stringify(fixture.meta),
  ...fixture.records.map(p=>[p.pointWorkOrder,p.tag,p.area].join(' '))].join(' ').toLocaleLowerCase('pt-BR');
 assert.ok(haystack.includes('00000035'));
 assert.ok(haystack.includes('0001020'));
 assert.ok(!haystack.includes('9999999'));
});
test('logout não limpa a fila global e é limitado à conta autenticada',()=>{
 const drive=file('google-drive-sync.js');
 const background=file('background-sync.js');
 assert.match(drive,/clearFor\(disconnectingSubject\)/);
 assert.doesNotMatch(drive,/VistoriaBackground\?\.clear\(\)/);
 assert.match(background,/keyFor\(job.subject,job.id\)/);
 assert.match(background,/const clearFor=subject/);
 assert.match(background,/leaseUntil/);
});

test('sincronização da equipe recebe revisão da vistoria aberta sem perder o rascunho',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/async function activeMatchesSaved\(id,savedHash\)/);
 assert.match(src,/if\(active&&!await activeMatchesSaved\(item\.report_id,localHash\)\)/);
 assert.match(src,/db\.transaction\(\['reports','draft'\],'readwrite'\)/);
 assert.match(src,/tx\.objectStore\('draft'\)\.put\(\{\.\.\.structuredClone\(d\.document\),reportId:item\.report_id\},'current'\)/);
 assert.match(src,/reset\(\);fill\(structuredClone\(d\.document\)\)/);
 assert.doesNotMatch(src,/if\(typeof activeReportId!=='undefined'&&activeReportId===item\.report_id\)continue;/);
});
test('sincronização da equipe permite envio de alteração em vistoria aberta já salva',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/if\(!await activeMatchesSaved\(item\.report_id,hash\)\)\{teamDeferred\+\+;continue;\}/);
 assert.match(src,/reportRequest\('POST',item\.report_id,\{document:row\.document,revision:previous\.revision\}\)/);
 assert.match(src,/Sincronização parcial/);
 assert.match(src,/Atualizar da nuvem \(preservar cópia local\)/);
 assert.match(src,/\(cópia local preservada\)/);
});
test('guarda de edição ativa bloqueia alterações não salvas mas não bloqueia relatório fechado',async()=>{
 const vm=await import('node:vm');
 const src=file('google-drive-sync.js');
 const found=src.match(/  async function activeMatchesSaved\(id,savedHash\) \{[\s\S]*?\n  \}/);
 assert.ok(found,'função de segurança não encontrada');
 const context={activeReportId:'vistoria-a',saveTimer:null,historyBusy:false,busy:0,historyReady:true,digest:async d=>d.hash,data:()=>({hash:'rev-2'})};
 const decide=vm.runInNewContext('('+found[0].trim()+')',context);
 assert.equal(await decide('vistoria-b','rev-1'),true);
 assert.equal(await decide('vistoria-a','rev-2'),true);
 assert.equal(await decide('vistoria-a','rev-1'),false);
 context.saveTimer=42;
 assert.equal(await decide('vistoria-a','rev-2'),false);
 context.saveTimer=null;context.busy=1;
 assert.equal(await decide('vistoria-a','rev-2'),false);
});

test('Drive pessoal atualiza relatório e rascunho quando chega revisão no editor aberto',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/const active=row\.id===activeReportId;/);
 assert.match(src,/if\(active&&!await activeMatchesSaved\(row\.id,docHash\)\)\{conflicts\+\+;continue;\}/);
 assert.match(src,/tx\.objectStore\('reports'\)\.put\(\{id:row\.id,updated,document:packet\.document\}\)/);
 assert.match(src,/tx\.objectStore\('draft'\)\.put\(\{\.\.\.structuredClone\(packet\.document\),reportId:row\.id\},'current'\)/);
});
test('Drive pessoal não envia cópia antiga após conflito sem baseline',()=>{
 const src=file('google-drive-sync.js');
 assert.match(src,/const marker='conflito:'\+remoteHash\+':'\+docHash/);
 assert.match(src,/if\(syncMap\[row\.id\]===marker\)\{conflicts\+\+;continue;\}/);
 assert.match(src,/syncMap\[row\.id\]=marker;saveMap\(\);conflicts\+\+/);
 assert.doesNotMatch(src,/syncMap\[row\.id\]=remoteHash;saveMap\(\);conflicts\+\+/);
});
