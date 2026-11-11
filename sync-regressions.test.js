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
 assert.match(src,/packet\.reportId!==expectedReportId/);
});
test('nuvem compartilhada não sobrescreve alterações de outra aba',()=>{
 const src=file('shared-cloud.js');
 assert.match(src,/startingHashes=new Map/);
 assert.match(src,/const latest=await rows\(\)/);
 assert.match(src,/Outra aba alterou as vistorias/);
});

test('PDF registra aviso quando o arquivo de origem falha',()=>{
 const src=file('pdf-export.js');
 assert.match(src,/sourcePdfFailed=true;sourcePdfWarnings\+\+/);
 assert.match(src,/O PDF de origem não pôde ser incorporado/);
});
