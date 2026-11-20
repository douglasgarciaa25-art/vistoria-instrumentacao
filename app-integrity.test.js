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


test('OS textual opcional e seletores de fotos independentes',()=>{
 const html=readFileSync('index.html','utf8');
 const history=readFileSync('history.js','utf8');
 const pdf=readFileSync('pdf-export.js','utf8');
 assert.match(html, /id="workOrder" inputmode="numeric"/);
 assert.match(html, /id="pointWorkOrder" inputmode="numeric"/);
 assert.match(html, /id="photos" multiple accept=/);
 assert.match(html, /id="camera" accept="image\/\*" capture="environment"/);
 assert.ok(history.includes('v.pointWorkOrder'));
 assert.ok(pdf.includes('r.pointWorkOrder||m.workOrder'));
 const keys=['workOrder','pointWorkOrder'];
 const fixture={workOrder:'00010505291',pointWorkOrder:'00002'};
 assert.deepEqual(JSON.parse(JSON.stringify(fixture)),fixture);
 for(const key of keys) assert.equal(typeof fixture[key],'string');
});


test('preenchimento em quatro etapas mantém controles originais e só altera apresentação',()=>{
 const html=readFileSync('index.html','utf8');
 const wizard=readFileSync('form-wizard.js','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert.ok(html.includes('<script src="form-wizard.js"></script>'));
 assert.ok(html.indexOf('voice-dictation.js')<html.indexOf('form-wizard.js'),'Guia deve carregar após os complementos');
 assert.match(wizard,/title:'Identificação'/);
 assert.match(wizard,/title:'Condição e análise'/);
 assert.match(wizard,/title:'Ações e conclusão'/);
 assert.match(wizard,/title:'Fotos e salvar'/);
 assert.ok(wizard.includes('tag:0')&&wizard.includes('problem:1')&&wizard.includes('action:2'));
 assert.ok(wizard.includes("const oldReset=reset")&&wizard.includes("const oldFill=fill"),'Troca de vistoria deve reiniciar etapa sem apagar dados');
 assert.ok(wizard.includes("event.preventDefault();event.stopImmediatePropagation()"),'Não pode salvar antes da última etapa');
 assert.ok(wizard.includes("form.addEventListener('invalid'"),'Campo obrigatório de outra etapa precisa ficar visível');
 assert.ok(sw.includes("'/form-wizard.js'"));
 assert.ok(!wizard.includes('indexedDB.deleteDatabase('));
 assert.ok(!wizard.includes('localStorage.clear('));
 assert.ok(!wizard.includes('fetch('));
});

test('guia por etapas não altera módulos da equipe nem PDF',()=>{
 const wizard=readFileSync('form-wizard.js','utf8');
 assert.ok(!wizard.includes('team-reports'));
 assert.ok(!wizard.includes('VistoriaGoogleDrive'));
 assert.ok(!wizard.includes('exportReportDocuments'));
 assert.ok(wizard.includes("form.querySelector('.photo')"));
 assert.ok(wizard.includes("document.getElementById('savedPointPicker')"));
 assert.ok(wizard.includes("step===2&&document.getElementById('status')?.value==='Corrigido'"));
});
