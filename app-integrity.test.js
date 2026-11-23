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


test('assistente compacto em cinco seções mantém controles originais e dados',()=>{
 const html=readFileSync('index.html','utf8');
 const wizard=readFileSync('form-wizard.js','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert.ok(html.includes('<script src="form-wizard.js"></script>'));
 assert.ok(html.indexOf('voice-dictation.js')<html.indexOf('form-wizard.js'),'Guia deve carregar após os complementos');
 assert.match(wizard,/title:'Identificação'/);
 assert.match(wizard,/title:'Condição encontrada'/);
 assert.match(wizard,/title:'Diagnóstico e impacto'/);
 assert.match(wizard,/title:'Plano de ação'/);
 assert.match(wizard,/title:'Fotos e salvar'/);
 assert.ok(wizard.includes('tag:0')&&wizard.includes('problem:1')&&wizard.includes('analysisDraft:2')&&wizard.includes('action:3'));
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
 assert.ok(wizard.includes("index===3&&document.getElementById('status')?.value==='Corrigido'"));
});


test('assistente mostra somente uma seção por vez com opções extras acessíveis',()=>{
 const wizard=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(wizard),'Assistente deve ser JavaScript válido');
 assert.ok(wizard.includes("node.dataset.wizardHidden=String(config.step!==current"));
 assert.ok(wizard.includes("config.optional&&!expanded[current]"));
 assert.ok(wizard.includes("more.setAttribute('aria-expanded',String(expanded[current]))"));
 assert.ok(wizard.includes("more.addEventListener('click'"));
 assert.ok(wizard.includes("const optionalIds=new Set(['pointWorkOrder','equipment','priority','owner','deadline'])"));
 assert.ok(wizard.includes("child.classList.contains('guided-description')"));
 assert.ok(wizard.includes("child.classList.contains('technical-review')"));
 assert.ok(wizard.includes("if(child.classList.contains('photo'))group.set(child,{step:4,optional:false})"));
 assert.ok(wizard.includes("child.classList.contains('completion')"));
 assert.ok(wizard.includes("child.querySelector?.('#inspectionType')"));
 assert.ok(wizard.includes("revealFilledOptions()"));
});

test('campos gerais podem ser abertos e os erros trazem o campo à vista',()=>{
 const wizard=readFileSync('form-wizard.js','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert.ok(wizard.includes('reportFields.hidden=!reportExpanded'));
 assert.ok(wizard.includes('setReportExpanded(true)'));
 assert.ok(wizard.includes('oldSteps.hidden=true'));
 assert.ok(wizard.includes("setReportExpanded(false);return result"));
 assert.ok(wizard.includes("if(!validate(step)){event.preventDefault();event.stopImmediatePropagation();return}"));
 assert.ok(wizard.includes("form.addEventListener('invalid'"));
 assert.ok(wizard.includes("expanded[stage]=true"));
 assert.ok(wizard.includes("input.focus({preventScroll:true})"));
 assert.ok(wizard.includes("index===3&&document.getElementById('status')?.value==='Corrigido'"));
 assert.match(sw,/vistoria-shell-v57-campo-compacto/);
 assert.match(sw,/'\/form-wizard\.js'/);
 assert.ok(!wizard.includes('fetch('),'Assistente não deve depender de rede');
 assert.ok(!wizard.includes('localStorage.clear('),'Assistente não deve limpar dados');
 assert.ok(!wizard.includes('indexedDB.deleteDatabase('),'Assistente não deve excluir a base');
});


test('assistente sinaliza etapas essenciais sem alterar valores dos campos',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/function stageReady\(index\)/);
 assert.match(source,/essentials=\{0:\['tag','area'\],1:\['problem'\]\}/);
 assert.match(source,/ready===true\?' ✓'/);
 assert.match(source,/campos essenciais preenchidos/);
 assert.match(source,/form\.addEventListener\('input'/);
 assert.match(source,/form\.addEventListener\('change'/);
 assert.match(source,/setStep\(index,true\)/);
});

test('assistente localiza campos essenciais pendentes sem alterar conteúdo',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/function requiredFields\(index\)/);
 assert.match(source,/function missingFields\(\)/);
 assert.match(source,/wizardGoPending/);
 assert.match(source,/openField\(target\.id,target\.index\)/);
 assert.match(source,/role="status" aria-live="polite"/);
 assert.match(source,/pending\.find\(item=>item\.index>=current\)\|\|pending\[0\]/);
});

test('assistente detalha pendências por etapa e orienta botão de navegação',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/const stagePending=pending\.filter\(item=>item\.index===current\)\.length/);
 assert.match(source,/Preencher próximo campo desta etapa/);
 assert.match(source,/Ir para próxima etapa pendente/);
 assert.match(source,/const count=pending\.filter\(item=>item\.index===i\)\.length/);
});

test('assistente mantém foco acessível e respeita movimento reduzido',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/id="wizardTitle" tabindex="-1"/);
 assert.match(source,/wizard\.querySelector\('#wizardTitle'\)\.focus\(\{preventScroll:true\}\)/);
 assert.match(source,/prefers-reduced-motion: reduce/);
 assert.match(source,/const required=requiredFields\(index\)/);
});

test('assistente anuncia mudança de etapa para leitores de tela',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/id="wizardCounter" role="status" aria-live="polite" aria-atomic="true"/);
 assert.match(source,/setAttribute\('aria-valuetext','Etapa '/);
 assert.match(source,/id="wizardTitle" tabindex="-1"/);
});

test('seletor de etapas aceita setas e Home/End sem salvar dados',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/\.wizard-steps'\)\.addEventListener\('keydown'/);
 assert.match(source,/event\.key==='ArrowRight'/);
 assert.match(source,/event\.key==='ArrowLeft'/);
 assert.match(source,/event\.key==='Home'/);
 assert.match(source,/event\.key==='End'/);
 assert.match(source,/stepButtons\[target\]\.focus\(\)/);
});

test('assistente revela metadados inválidos e preserva OS textual no resumo',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/reportToggle\.setAttribute\('aria-controls','meta'\)/);
 assert.match(source,/const os=document\.getElementById\('workOrder'\)\?\.value\.trim\(\)/);
 assert.match(source,/os\?' · OS '\+os/);
 assert.match(source,/reportFields\?\.contains\(event\.target\)\|\|reportExtra\?\.contains\(event\.target\)/);
 assert.match(source,/setReportExpanded\(true\);\s*return;/);
});

test('assistente identifica campo essencial pendente e limpa alerta após correção',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/input\.setAttribute\('aria-invalid','true'\)/);
 assert.match(source,/if\(String\(event\.target\.value\|\|''\)\.trim\(\)\)event\.target\.removeAttribute\('aria-invalid'\)/);
 assert.match(source,/form\.querySelectorAll\('\[aria-invalid="true"\]'\)/);
});

test('assistente limpa erros de ponto anterior ao carregar outro ponto',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/fill=function\(\)\{const result=oldFill\.apply\(this,arguments\);form\.querySelectorAll\('\[aria-invalid="true"\]'\)\.forEach\(el=>el\.removeAttribute\('aria-invalid'\)\)/);
});


test('relatório mantém PDF principal e Word acessível em formatos recolhíveis',()=>{
 const source=readFileSync('layout.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/\$\('pdf'\)\.innerHTML=icon\('report'\)\+'Baixar relatório em PDF'/);
 assert.match(source,/document\.createElement\('details'\)/);
 assert.match(source,/formatsSummary\.textContent='Outros formatos de exportação'/);
 assert.match(source,/formatsActions\.append\(wordButton\)/);
 assert.match(source,/const wordButton=\$\('word'\)/);
 assert.ok(!source.includes('wordButton.remove()'));
});


test('formatos recolhíveis do relatório têm toque amplo e foco visível no Android',()=>{
 const css=readFileSync('layout.css','utf8');
 assert.match(css,/#view-review \.report-formats>summary\{[^}]*min-height:48px/);
 assert.match(css,/#view-review \.report-formats>summary:focus-visible\{[^}]*outline:3px/);
 assert.match(css,/#view-review \.report-formats>\.actions button\{[^}]*min-height:46px/);
 assert.match(css,/@media\(max-width:750px\)\{#view-review \.report-formats>\.actions\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
});


test('início recolhe indicadores no modo campo sem perder contagens nem acessibilidade',()=>{
 const js=readFileSync('layout.js','utf8');
 const css=readFileSync('layout.css','utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/home\.querySelector\('\.metrics'\)/);
 assert.match(js,/metricsDisclosure=document\.createElement\('details'\)/);
 assert.match(js,/metricsDisclosure\.append\(homeMetrics\)/);
 assert.match(js,/metricsDisclosure\.open=!window\.matchMedia\('\(max-width:750px\)'\)\.matches/);
 assert.match(js,/\$\('metricReports'\)\.textContent=docs\.length/);
 assert.match(css,/\.home-metrics-disclosure>summary:focus-visible/);
 assert.match(css,/\.home-metrics-disclosure>summary\{[^}]*min-height:48px/);
});


test('navegação entre telas respeita movimento reduzido sem perder foco',()=>{
 const js=readFileSync('layout.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(js));
 assert.match(js,/window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches\?'instant':'smooth'/);
 assert.match(js,/heading\.focus\(\{preventScroll:true\}\)/);
});

test('atalho acessível pula navegação sem alterar dados ou estado da vistoria',()=>{
 const js=readFileSync('layout.js','utf8');
 const css=readFileSync('layout.css','utf8');
 assert.match(js,/main\.id='main-content'/);
 assert.match(js,/skip\.href='#main-content'/);
 assert.match(js,/skip\.textContent='Pular para o conteúdo principal'/);
 assert.match(js,/header\.before\(skip\)/);
 assert.match(css,/\.skip-to-content:focus-visible/);
 assert.match(css,/\.skip-to-content\{[^}]*translateY\(-180%\)/);
});
