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
 assert.match(sw,/vistoria-shell-v\d+-[a-z0-9-]+/);
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


test('modo campo mantém botões do visualizador de fotos legíveis e com toque de 48px',()=>{
 const css=readFileSync('layout.css','utf8');
 assert.match(css,/@media\(max-width:750px\)\{\.photo-viewer button\{min-height:48px;font-size:14px;line-height:1\.4;padding:12px 14px\}/);
 assert.match(css,/\.photo-viewer \.actions button\{white-space:normal\}/);
});

test('pastas e arrastar preservam a identidade e impedem exclusão de área ocupada',()=>{
 const h=readFileSync('history.js','utf8'),css=readFileSync('layout.css','utf8');
 assert.doesNotThrow(()=>new vm.Script(h));
 assert.match(h,/async function vistoriaMoveArea\(id,destination\)/);
 assert.ok(h.includes('vistoriaMoveArea(id,target)'));
 assert.ok(h.includes("if(historyItems.some(r=>vistoriaAreaKey(vistoriaReportArea(r.document))===key))throw Error"));
 assert.ok(h.includes("store.put({...latest,updated:new Date().toISOString(),document:next})"));
 for(const name of ['data-review-report','data-open-report','data-finalize-report','data-move-report-area','data-duplicate-report','data-remove-report'])assert.ok(h.includes(name));
 assert.ok(h.includes('class="report-more"'));
 assert.ok(css.includes('#historyList{display:flex;flex-direction:column'));
});

test('Mais opções mantém estado por ID e não recria a lista em sincronizações idênticas',()=>{
 const source=readFileSync('history.js','utf8');
 const snippet=source.slice(source.indexOf('const vistoriaMoreOpen=new Set();'),source.indexOf('function vistoriaAreaName'));
 const ctx=vm.createContext({});
 vm.runInContext(snippet+';globalThis.replaceHistory=vistoriaReplaceHistoryMarkup;',ctx);
 const makeMenu=(id,open=false)=>({open,closest:()=>({dataset:{areaReportId:id}})});
 let menus=[],writes=0;
 const host={querySelectorAll:()=>menus,set innerHTML(value){writes++;menus=value==='filtered'?[makeMenu('B')]:[makeMenu('A'),makeMenu('B')]}};
 ctx.replaceHistory(host,'original');
 menus[0].open=true;
 const original=menus[0];
 ctx.replaceHistory(host,'original');
 assert.equal(writes,1);assert.equal(menus[0],original);assert.equal(menus[0].open,true);
 ctx.replaceHistory(host,'updated');
 assert.equal(menus[0].open,true);assert.equal(menus[1].open,false);
 ctx.replaceHistory(host,'filtered');
 ctx.replaceHistory(host,'returned');
 assert.equal(menus[0].open,true);
 menus[0].open=false;
 ctx.replaceHistory(host,'final');
 assert.equal(menus[0].open,false);
 assert.match(source,/vistoriaReplaceHistoryMarkup\(host,markup\)/);
});

test('áreas locais iniciam recolhidas e somente a escolha explícita abre a pasta',()=>{
 const source=readFileSync('history.js','utf8');
 assert.match(source,/vistoriaAreaOpen\.get\(key\)===true\?'open':''/);
 assert.doesNotMatch(source,/query\|\|vistoriaAreaOpen/);
 assert.match(source,/vistoriaAreaOpen\.set\(d\.dataset\.areaGroup,d\.open\)/);
 const expression=source.match(/vistoriaAreaOpen\.get\(key\)===true\?'open':''/)[0];
 const evaluate=new Function('vistoriaAreaOpen','key','return '+expression);
 const state=new Map();
 assert.equal(evaluate(state,'britagem'),'');
 state.set('britagem',true);assert.equal(evaluate(state,'britagem'),'open');
 assert.equal(evaluate(state,'moagem'),'');
 state.set('britagem',false);assert.equal(evaluate(state,'britagem'),'');
});

test('Mostrar finalizadas revela somente áreas com finalizadas visíveis e informa a quantidade',()=>{
 const source=readFileSync('history.js','utf8');
 const snippet=source.slice(source.indexOf('function vistoriaRevealFinalizedAreas'),source.indexOf('function vistoriaVisible'));
 const {reveal,label}=new Function(snippet+';return {reveal:vistoriaRevealFinalizedAreas,label:vistoriaFinalizedLabel};')();
 const card=(done,display='')=>({hidden:false,style:{display},querySelector:()=>done?{}:null});
 const folder=(...cards)=>({open:false,querySelectorAll:()=>cards});
 const a=folder(card(true)),b=folder(card(false)),c=folder(card(true,'none')),d=folder(card(false));d.open=true;
 reveal({querySelectorAll:()=>[a,b,c,d]},'details');
 assert.equal(a.open,true);assert.equal(b.open,false);assert.equal(c.open,false);assert.equal(d.open,true);
 assert.equal(label(2,true),'Mostrar finalizadas (2 pontos)');
 assert.match(label(0,true),/nenhuma encontrada/);
 assert.match(source,/if\(\$\('showFinalizedReports'\)\.checked\)vistoriaRevealFinalizedAreas/);
});

test('filtro de finalizadas reconhece pontos corrigidos antigos sem excluir os dados',()=>{
 const source=readFileSync('history.js','utf8');
 const snippet=source.slice(source.indexOf('function vistoriaAllPointsClosed'),source.indexOf('function refreshVistoriaCloudStatuses'));
 const {visible,status,count,points}=new Function(snippet+';return {visible:vistoriaVisible,status:vistoriaReportStatus,count:vistoriaClosedPointCount,points:vistoriaHistoryPoints};')();
 const docs=[
  {meta:{finalizedAt:'2026-11-24T12:00:00Z'},records:[{status:'Corrigido'}]},
  {meta:{},records:[{status:'Corrigido'}]},
  {meta:{},records:[{status:'Pendente'}]},
  {meta:{finalizedAt:'2026-11-24T12:00:00Z'},records:[{status:'Sem pendência'}]},
  {meta:{},records:[]}
 ];
 const before=JSON.stringify(docs);
 assert.deepEqual(docs.map(d=>status(d).kind),['done','done','pending','done','progress']);
 assert.deepEqual(docs.filter(d=>visible(d,false)),[docs[2],docs[4]]);
 assert.deepEqual(docs.filter(d=>visible(d,true)),docs);
 assert.deepEqual(docs.filter(d=>visible(d,false)),[docs[2],docs[4]]);
 const mixed={meta:{},records:[{status:'Corrigido',tag:'A'},{status:'Pendente',tag:'B'},{status:'Em acompanhamento',tag:'C'}]};
 const original=JSON.stringify(mixed);
 assert.equal(count(mixed),1);
 assert.equal(visible(mixed,false),true);
 assert.deepEqual(points(mixed,false).map(p=>p.tag),['B','C']);
 assert.deepEqual(points(mixed,true).map(p=>p.tag),['A','B','C']);
 assert.equal(JSON.stringify(mixed),original);
 assert.equal(JSON.stringify(docs),before);
});


test('arquivos obrigatórios do cache offline são publicados pelo Vercel',()=>{
 const sw=readFileSync('sw.js','utf8');
 const config=JSON.parse(readFileSync('vercel.json','utf8'));
 const files=sw.match(/const FILES=\[([^\]]+)\]/)[1].match(/'[^']+'/g).map(x=>x.slice(1,-1));
 const statics=config.builds.filter(x=>x.use==='@vercel/static').map(x=>x.src);
 for(const path of files){
  const file=path==='/'?'index.html':path.slice(1);
  assert.ok(statics.some(src=>src===file||(src.startsWith('*.')&&!file.includes('/')&&file.endsWith(src.slice(1)))),file+' precisa ser publicado');
 }
 assert.ok(files.includes('/team-merge.mjs'));
 assert.ok(statics.includes('team-merge.mjs'));
 const html=readFileSync('index.html','utf8');
 for(const [,src] of html.matchAll(/<script[^>]*src=["']([^"']+)["']/g))assert.ok(files.includes('/'+src.replace(/^\//,'')),src+' deve estar no cache');
});

test('indicadores do relatório consolidam todos os pontos existentes, sem depender do relatório aberto',()=>{
 const layout=readFileSync('layout.js','utf8');
 const start=layout.indexOf(' function reportPointsAcrossSavedReports(');
 const end=layout.indexOf(' function updateReportSummary(){',start);
 assert.ok(start>0&&end>start,'Funções de consolidação devem existir');
 const scope=vm.runInNewContext(layout.slice(start,end)+';({collect:reportPointsAcrossSavedReports,stats:reportManagementStats})');
 const rows=[
  {id:'vistoria-a',document:{records:[{tag:'A',status:'Corrigido'},{tag:'B',status:'Pendente'}]}},
  {id:'vistoria-b',document:{records:[{tag:'C',status:'Em acompanhamento'},{tag:'D',status:'Sem pendência'}]}},
  {id:'vistoria-c',document:{records:[{tag:'E',status:'Pendente'}]}}
 ];
 const before=JSON.stringify(rows);
 const all=scope.collect(rows,'vistoria-vazia',[]);
 assert.equal(all.length,5,'Resumo deve incluir pontos mesmo com relatório atual vazio');
 let stats=scope.stats(all);
 assert.equal(stats.total,5);
 assert.equal(stats.done,2);
 assert.equal(stats.progress,1);
 assert.equal(stats.pending,2);
 assert.equal(stats.rate,40);
 assert.equal(JSON.stringify(rows),before,'Consolidar não altera as vistorias');
 const current=[{tag:'A',status:'Corrigido'},{tag:'B',status:'Corrigido'}];
 const adjusted=scope.collect(rows,'vistoria-a',current);
 stats=scope.stats(adjusted);
 assert.equal(stats.total,5,'Não duplica a vistoria em edição');
 assert.equal(stats.done,3,'Usa situação mais recente do ponto atual');
 assert.equal(stats.rate,60);
 assert.equal(scope.collect(rows,'nova',current).length,7,'Inclui nova vistoria ainda não salva no histórico');
 assert.equal(scope.stats([]).rate,null,'Sem registros mantém o estado vazio');
 assert.match(layout,/reportManagementStats\(reportPointsAcrossSavedReports\(historyItems,activeReportId,records\)\)/);
 assert.match(layout,/Indicadores gerais/);
 assert.match(layout,/Acompanhamento de todos os pontos/);
 assert.match(layout,/pontos nesta vistoria/);
 assert.match(layout,/não selecionadas para PDF/);
 assert.match(layout,/\$\('metricPoints'\)\.textContent=points\.length/);
});


test('identidade pública própria e transparência OAuth permanecem acessíveis',()=>{
 const html=readFileSync('index.html','utf8');
 const layout=readFileSync('layout.js','utf8');
 const privacy=readFileSync('privacidade.html','utf8');
 const about=readFileSync('sobre.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 const header=html.match(/<header>[\s\S]*?<\/header>/)[0];
 assert.match(header,/alt="Logotipo Vistoria Técnica"/);
 assert.doesNotMatch(header,/CMOC/);
 const footer=html.match(/<footer id="vistoria-legal"[\s\S]*?<\/footer>/)[0];
 for(const required of ['Google Drive','sincronizar','/sobre.html','/sobre.html#uso-google','/privacidade.html','/termos.html'])assert.ok(footer.includes(required),required);
 assert.doesNotMatch(html,/id="app-public-info"/);
 assert.doesNotMatch(layout,/app-public-info/);
 assert.ok(footer.length<1000,'Rodapé compacto');
 const info=about.match(/<section[^>]*id="app-public-info"[^>]*>[\s\S]*?<\/section>/)[0];
 for(const required of ['Google','drive.file','backup','sincronização','/privacidade.html','/termos.html','id="uso-google"'])assert.ok(info.includes(required),required);
 assert.doesNotMatch(about,/<script/i);
 assert.match(sw,/'\/sobre.html'/);
 assert.match(privacy,/sem login/);
 assert.match(privacy,/Uso Limitado/);
 assert.match(readFileSync('google2fd58006cf13a852.html','utf8'),/google-site-verification: google2fd58006cf13a852.html/);
});


test('Identidade pública própria: ícones PNG, cabeçalho, manifesto e cache coerentes',()=>{
 const manifest=JSON.parse(readFileSync('manifest.webmanifest','utf8'));
 const html=readFileSync('index.html','utf8');
 const about=readFileSync('sobre.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 assert.equal(manifest.id,'/');
 assert.equal(manifest.start_url,'/');
 assert.equal(manifest.scope,'/');
 for(const size of [192,512]){
  const path='/vistoria-icon-'+size+'.png';
  assert.ok(manifest.icons.some(icon=>icon.src===path&&icon.sizes===size+'x'+size&&icon.type==='image/png'));
  const png=readFileSync('.'+path);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),size);
  assert.equal(png.readUInt32BE(20),size);
  assert.ok(sw.includes(path));
 }
 for(const source of [html,about]) assert.ok(source.includes('src="/vistoria-icon-192.png" alt="Logotipo Vistoria Técnica"'));
 assert.ok(html.includes('rel="apple-touch-icon" href="/vistoria-icon-192.png"'));
});


test('modo rápido preserva o formulário e modo guiado é alternável',()=>{
 const source=readFileSync('form-wizard.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 assert.match(source,/Preenchimento rápido/);
 assert.match(source,/Preenchimento guiado/);
 assert.match(source,/localStorage\.setItem\('vistoria\.formMode'/);
 assert.match(source,/if\(quickMode\)\{\s*for\(const node of group\.keys\(\)\)node\.dataset\.wizardHidden='false'/);
 assert.match(source,/if\(!quickMode&&current<steps\.length-1\)/);
});
test('seleção entre vistorias mantém IDs e referências e não exporta pontos não selecionados',()=>{
 const source=readFileSync('workflow.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 const section=source.slice(source.indexOf(' const pointKey='),source.indexOf(' const otherPreview='));
 const snapshot=source.slice(source.indexOf(' function selectedReportSnapshot('),source.indexOf(' function initialPointSelection('));
 const match=source.slice(source.indexOf(' function reportPointMatches('),source.indexOf(' function reportPointDetails('));
 const active={meta:{number:'RV-A',workOrder:'123',title:'Vistoria'},records:[{pointId:'shared',status:'Corrigido'},{pointId:'other',status:'Pendente'}]};
 const other={meta:{number:'RV-B',workOrder:'456',title:'Vistoria'},records:[{pointId:'shared',status:'Pendente'}]};

 const context={data:()=>active,activeReportId:'a',historyItems:[{id:'a',document:active},{id:'b',document:other}],selectedPoints:new Set(),window:{},structuredClone};
 const result=vm.runInNewContext(section+snapshot+match+
  "\nselectedPoints.add(pointKey('b','shared')); const rows=scopedRows(); const docs=selectedSnapshots(); ({total:rows.length,selected:docs.length,ref:docs[0].meta.number,points:docs[0].records.length,pending:rows.filter(row=>reportPointMatches(row.r,'','Pendente')).length})",context);
 assert.equal(result.total,3);assert.equal(result.selected,1);assert.equal(result.ref,'RV-B');assert.equal(result.points,1);assert.equal(result.pending,2);
 assert.doesNotMatch(source,/id="reportScope"/);
 assert.match(source,/Origem: <strong>Todas as vistorias/);
 const legacy={meta:{number:'RV-C',title:'Vistoria'},records:[{tag:'LEGADO'},{pointId:'duplicate-id'},{pointId:'duplicate-id'}]};
 context.historyItems.push({id:'c',document:legacy});
 const before=JSON.stringify(legacy);
 const recovered=vm.runInContext("selectedPoints.clear(); const legacyRows=scopedRows().filter(row=>row.id==='c'); for(const row of legacyRows)selectedPoints.add(row.key); ({count:legacyRows.length,keys:new Set(legacyRows.map(row=>row.key)).size,exported:selectedSnapshots()[0].records.length})",context);
 assert.equal(recovered.count,3);assert.equal(recovered.keys,3);assert.equal(recovered.exported,3);assert.equal(JSON.stringify(legacy),before);
});


test('indicadores usam exclusivamente o cadastro de áreas das vistorias',()=>{
 const source=readFileSync('management-tools.js','utf8');
 assert.doesNotThrow(()=>new vm.Script(source));
 const fn=source.slice(source.indexOf('function indicatorFilter('),source.indexOf('function rows()'));
 const apply=new Function(fn+';return indicatorFilter;')();
 const data=[{area:'BV',p:{area:'Concentração BV',tag:'C210'}},{area:'BV',p:{area:'C240'}},{area:'BVO',p:{area:'Britagem'}},{area:'LX',p:{area:'BV'}}];
 const original=JSON.stringify(data);
 assert.equal(apply(data,'bv').length,2);
 assert.equal(apply(data,'bvo').length,1);
 assert.equal(apply(data,'lx').length,1);
 assert.equal(apply(data,'').length,4);
 assert.equal(apply(data,'c240').length,0);
 assert.equal(JSON.stringify(data),original);
 assert.match(source,/const catalog=vistoriaAreaCatalog\(\)/);
 assert.match(source,/area:vistoriaReportArea\(x.document\)/);
 assert.match(source,/\.\.\.rows\(\)\.map/);
 assert.doesNotMatch(source,/const sub=control|const equipment=control|const status=control/);
});
test('modo rápido organiza seções e mantém os controles originais',()=>{
 const wizard=readFileSync('form-wizard.js','utf8'),css=readFileSync('layout.css','utf8');
 assert.doesNotThrow(()=>new vm.Script(wizard));
 assert.match(wizard,/form.dataset.fillMode=quickMode\?'quick':'guided'/);
 assert.match(wizard,/label.before\(heading\)/);
 assert.match(wizard,/heading.hidden=!quickMode/);
 assert.match(wizard,/submitRow\?\.classList.add\('quick-save-row'\)/);
 assert.match(css,/#view-editor\[data-fill-mode="quick"\]\{max-width:1120px/);
 assert.match(css,/quick-save-row\{position:sticky/);
 assert.match(css,/indicator-grid\{display:grid/);
});
