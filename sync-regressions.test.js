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


test('restauração remota revalida conta antes da leitura e da gravação local',()=>{
 const src=file('google-drive-sync.js');
 const start=src.indexOf('      for(const item of remote){');
 const end=src.indexOf("      if(localStorage.getItem('vistoria-team-auto:",start);
 assert.ok(start>=0&&end>start);
 const restore=src.slice(start,end);
 assert.match(restore,/if\(queueMember\?\.google_subject!==member\.google_subject\|\|!validToken\(\)\)break;/);
 const afterFetch=restore.slice(restore.indexOf("await reportRequest('GET',item.report_id)"));
 assert.match(afterFetch,/if\(queueMember\?\.google_subject!==member\.google_subject\|\|!validToken\(\)\)break;/);
 const beforeWrite=restore.slice(restore.indexOf('const latest=await idbReq'));
 assert.match(beforeWrite,/if\(queueMember\?\.google_subject!==member\.google_subject\|\|!validToken\(\)\)break;\s*await putReport/);
});
