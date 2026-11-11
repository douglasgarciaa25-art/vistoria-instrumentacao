import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';

test('scripts da interface são válidos e Drive é carregado',()=>{
 const html=readFileSync('index.html','utf8');
 const refs=html.split('<script src="').slice(1).map(part=>part.split('"')[0]);
 assert.ok(refs.length>=10);
 for(const path of refs) assert.ok(existsSync(path),'Arquivo ausente: '+path);
 assert.ok(refs.indexOf('google-drive-sync.js')>refs.indexOf('layout.js'));
 const inline=html.split('<script>')[1]?.split('</script>')[0];
 assert.ok(inline,'Código principal não encontrado');
 assert.doesNotThrow(()=>new vm.Script(inline));
});

test('cache offline inclui a integração Google Drive',()=>{
 const sw=readFileSync('sw.js','utf8');
 assert.ok(sw.includes('/google-drive-sync.js'));
 assert.ok(sw.includes("event.request.mode==='navigate'"));
});

test('dependências batem com lockfile e servidor',()=>{
 const pkg=JSON.parse(readFileSync('package.json','utf8'));
 const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
 assert.equal(pkg.name,lock.name);
 assert.equal(pkg.version,lock.version);
 assert.equal(pkg.dependencies['@vercel/blob'],lock.packages[''].dependencies['@vercel/blob']);
 assert.ok(readFileSync('cloud-server.mjs','utf8').includes("req.method==='DELETE'&&action==='delete'"));
});
