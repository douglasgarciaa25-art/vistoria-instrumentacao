import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FIELD_NAMES,MAX_REVIEW_INPUT,reviewInput,verifiedGoogleIdentity,reviewMessages,extractReview} from './technical-review-core.mjs';
import handler from './technical-review-server.mjs';

const CLIENT='123456789-vistoria.apps.googleusercontent.com';
const EMAIL='responsavel@example.com';
const SCOPES='https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

test('aceita somente campos técnicos permitidos, texto manual e limites',()=>{
 assert.deepEqual(reviewInput({field:'analysisDraft',text:'  teste de entrada  '}),{field:'analysisDraft',text:'teste de entrada'});
 assert.equal(reviewInput({field:'password',text:'teste'}).error,'Campo não permitido.');
 assert.ok(reviewInput({field:'problem',text:' '.repeat(20)}).error);
 assert.ok(reviewInput({field:'problem',text:'x'.repeat(MAX_REVIEW_INPUT+1)}).error);
 assert.ok(reviewInput({field:'problem',text:{}}).error);
 assert.ok(Object.hasOwn(FIELD_NAMES,'completionWork'));
});
test('aceita apenas contas Google verificadas, com escopo Drive e autorização explícita',()=>{
 const identity={aud:CLIENT,email:EMAIL,email_verified:'true',scope:SCOPES};
 assert.equal(verifiedGoogleIdentity(identity,CLIENT,EMAIL),true);
 assert.equal(verifiedGoogleIdentity({...identity,aud:'another.apps.googleusercontent.com'},CLIENT,EMAIL),false);
 assert.equal(verifiedGoogleIdentity({...identity,email:'intruso@example.com'},CLIENT,EMAIL),false);
 assert.equal(verifiedGoogleIdentity({...identity,email_verified:'false'},CLIENT,EMAIL),false);
 assert.equal(verifiedGoogleIdentity({...identity,scope:'openid email'},CLIENT,EMAIL),false);
 assert.equal(verifiedGoogleIdentity(identity,CLIENT,''),false);
});
test('prompt técnico proíbe inventar medições e conclusões',()=>{
 const messages=reviewMessages('analysisDraft','Foi checado a valvula. Não foi testado.');
 assert.equal(messages[0].role,'system');
 for(const term of ['Não invente','TAGs','Não transforme','apenas conteúdo a revisar'])assert.ok(messages[0].content.includes(term),term);
 assert.ok(messages[1].content.includes('Não foi testado.'));
});
test('extrai só uma sugestão válida; rejeita respostas incompletas',()=>{
 assert.equal(extractReview({choices:[{finish_reason:'stop',message:{content:'  Foi realizada inspeção visual.  '}}]}),'Foi realizada inspeção visual.');
 assert.throws(()=>extractReview({choices:[{finish_reason:'length',message:{content:'Incompleto'}}]}));
 assert.throws(()=>extractReview({choices:[{finish_reason:'stop',message:{content:''}}]}));
});
test('interface local oferece aprovação e desfazer',()=>{
 const js=readFileSync('technical-review.js','utf8');
 const drive=readFileSync('google-drive-sync.js','utf8');
 const html=readFileSync('index.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 const vercel=JSON.parse(readFileSync('vercel.json','utf8'));
 assert.ok(html.includes('<script src="technical-review.js"></script>'));
 assert.ok(sw.includes("'/technical-review.js'"));
 assert.ok(vercel.routes.some(r=>r.src==='/api/technical-review'));
 assert.ok(js.includes("field.value!==pending.original"));
 assert.ok(js.includes('Usar texto revisado'));
 assert.ok(js.includes('Manter meu texto'));
 assert.ok(js.includes('Desfazer revisão'));
 assert.ok(js.includes('field.dispatchEvent(new Event'));
 assert.ok(js.includes('protectedParts'));
 assert.ok(js.includes('window.VistoriaGoogleDrive'));
 assert.ok(js.includes('Reescrever com IA'));
 assert.ok(drive.includes('reviewTechnical'));
 assert.ok(!js.includes("typeof cloudKey"));
});
function response(){
 return {statusCode:200,body:null,headers:{},
  setHeader(key,value){this.headers[key]=value},
  status(code){this.statusCode=code;return this},
  json(value){this.body=value;return this}
 };
}
function withGoogleConfig(){
 const original={client:process.env.VISTORIA_GOOGLE_CLIENT_ID,emails:process.env.VISTORIA_GOOGLE_ALLOWED_EMAILS,key:process.env.GROQ_API_KEY,db:process.env.my_super_base_secrety_key133};
 process.env.VISTORIA_GOOGLE_CLIENT_ID=CLIENT;
 process.env.VISTORIA_GOOGLE_ALLOWED_EMAILS=EMAIL;
 process.env.my_super_base_secrety_key133='db-test';
 process.env.GROQ_API_KEY='credencial-ficticia-de-testes';
 return ()=>{for(const [k,v] of Object.entries({VISTORIA_GOOGLE_CLIENT_ID:original.client,VISTORIA_GOOGLE_ALLOWED_EMAILS:original.emails,GROQ_API_KEY:original.key,my_super_base_secrety_key133:original.db}))if(v===undefined)delete process.env[k];else process.env[k]=v};
}
test('API exige OAuth Google válido sem enviar o relato a usuário não autorizado',async()=>{
 const restore=withGoogleConfig(),orig=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async url=>{
  calls++;
  assert.ok(String(url).startsWith('https://oauth2.googleapis.com/tokeninfo?'));
  return {ok:true,json:async()=>({aud:CLIENT,email:'intruso@example.com',email_verified:'true',scope:SCOPES})};
 };
 try{
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer token.mock'},body:{field:'analysisDraft',text:'texto'}},res);
  assert.equal(res.statusCode,403);
  assert.equal(calls,1);
 }finally{globalThis.fetch=orig;restore()}
});
test('API revisa somente o campo solicitado após confirmar a conta Google',async()=>{
 const restore=withGoogleConfig(),orig=globalThis.fetch;
 let calls=0;
 globalThis.fetch=async(url,options)=>{
  calls++;
  if(calls===1){
   assert.ok(String(url).startsWith('https://oauth2.googleapis.com/tokeninfo?access_token=token.mock'));
   return {ok:true,json:async()=>({aud:CLIENT,email:EMAIL,sub:'subject-test',email_verified:'true',scope:SCOPES})};
  }
  if(calls===2){assert.ok(String(url).includes('vistoria_members?google_subject=eq.subject-test'));return {ok:true,text:async()=>JSON.stringify([{google_subject:'subject-test',email:EMAIL,role:'technician',status:'approved'}])};}
  assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer credencial-ficticia-de-testes');
  const body=JSON.parse(options.body);
  assert.equal(body.model,'openai/gpt-oss-120b');
  assert.ok(body.messages[1].content.includes('Não apresentou leitura no painel.'));
  assert.equal(body.messages[1].content.includes('foto'),false);
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'O painel não apresentou leitura.'}}]})};
 };
 try{
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer token.mock'},body:{field:'analysisDraft',text:'Não apresentou leitura no painel.'}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{suggested:'O painel não apresentou leitura.',field:'analysisDraft',fieldLabel:FIELD_NAMES.analysisDraft});
  assert.equal(calls,3);
 }finally{globalThis.fetch=orig;restore()}
});

test('motor offline preserva fatos, identificadores e incerteza',async()=>{
 await import('./technical-review.js');
 const revise=globalThis.VistoriaReviseLocal;
 for(const [input,expected] of [
 ['A valvula tava travada','A válvula estava travada.'],
 ['Não foi testado','Não foi testado.'],
 ['Possível falha no C215_TC01','Possível falha no C215_TC01'],
 ['pressao de 5,2 bar','pressão de 5,2 bar.'],
 ['foi realizado os testes','Foram realizados os testes.'],
 ['perdeu a comunicação','apresentou perda de comunicação.'],
 ['TAG MC4530-LCV203','TAG MC4530-LCV203'],
 ['Não confirmado: 4-20 mA','Não confirmado: 4-20 mA.'],
 ['"valvula" tava travada','"valvula" estava travada.'],
 ['precisa verificar a celula de carga','É necessário verificar a célula de carga.']
 ])assert.equal(revise(input),expected,input);
});

test('relatório: filtros de TAG, OS e situação preservam índices e dados',()=>{
 const s=readFileSync('workflow.js','utf8');
 const code=s.slice(s.indexOf('function reportPointMatches('),s.indexOf('let filterReportId,'));
 const {matches,details}=new Function(code+';return {matches:reportPointMatches,details:reportPointDetails};')();
 const rows=[{tag:'C240 BA01',pointWorkOrder:'000123',status:'Corrigido',action:'Calibração',impact:'<teste>',completionWork:'Executado'},{tag:'C215 BA02',status:'Pendente'},{tag:'C270',status:'Sem pendência'},{tag:'C221',status:'Em acompanhamento'}];
 const original=JSON.stringify(rows);
 assert.deepEqual(rows.map((r,i)=>matches(r,'','finalizados')?i:-1),[0,-1,2,-1]);
 assert.equal(matches(rows[0],'000123','finalizados'),true);
 assert.equal(matches(rows[0],'000123','Pendente'),false);
 assert.equal(matches(rows[0],'CALIBRAÇÃO',''),true);
 assert.equal(matches(rows[3],'','Em acompanhamento'),true);
 assert.ok(details(rows[0]).some(([k,v])=>k==='Impacto'&&v==='<teste>'));
 assert.ok(details(rows[0]).some(([k,v])=>k==='Serviço realizado'&&v==='Executado'));
 assert.deepEqual(details(rows[1]),[]);
 assert.equal(JSON.stringify(rows),original);
 assert.match(s,/dd.textContent=String\(value\)/);
 assert.match(s,/entry.hidden=!r\|\|!selectedPoints.has\(r.pointId\)/);
 assert.match(s,/filterReportId!==activeReportId/);
 assert.match(s,/originalRender\(\);filterReport\(\);addReportDetails\(\);photoButtons\(\)/);
});

test('indicadores da vistoria contam situações reais e conclusão sem alterar pontos',()=>{
 const s=readFileSync('layout.js','utf8');
 const body=s.slice(s.indexOf('function reportManagementStats('),s.indexOf('function updateReportSummary('));
 const stats=new Function(body+';return reportManagementStats;')();
 const points=[...Array.from({length:7},()=>({status:'Corrigido'})),{status:'Sem pendência'},...Array.from({length:2},()=>({status:'Em acompanhamento'})),...Array.from({length:5},()=>({status:'Pendente'}))];
 const before=JSON.stringify(points);
 assert.deepEqual(stats(points),{total:15,done:8,progress:2,pending:5,other:0,rate:53.3});
 assert.deepEqual(stats([]),{total:0,done:0,progress:0,pending:0,other:0,rate:null});
 assert.equal(stats([{status:'Sem pendência'}]).rate,100);
 assert.deepEqual(stats([{status:'Legado'}]),{total:1,done:0,progress:0,pending:0,other:1,rate:0});
 assert.equal(JSON.stringify(points),before);
 assert.match(s,/reportManagementStats\(records\)/);
 assert.match(s,/function update\(\)\{updateReportSummary\(\)/);
});


test('PDF parcial contém somente IDs selecionados, fotos e números originais, sem alterar a vistoria',()=>{
 const source=readFileSync('workflow.js','utf8');
 const body=source.slice(source.indexOf('function selectedReportSnapshot('),source.indexOf('function updatePointSelection('));
 const snapshot=new Function(body+';return selectedReportSnapshot;')();
 const doc={meta:{title:'Vistoria',workOrder:'000123',sourcePdf:'PDF completo',sourcePdfName:'original.pdf',conclusion:'Conclusão geral'},records:[{pointId:'point-001',tag:'A',photos:[{src:'a'}]},{pointId:'point-002',tag:'B',photos:[{src:'b'}]},{pointId:'point-003',tag:'C',photos:[{src:'c'}]}],pending:{fields:{tag:'Rascunho'}}};
 const before=JSON.stringify(doc);
 const partial=snapshot(doc,new Set(['point-003','point-001','missing']));
 assert.deepEqual(partial.records.map(r=>r.tag),['A','C']);
 assert.deepEqual(partial.exportPointNumbers,[1,3]);
 assert.deepEqual(partial.records.map(r=>r.photos[0].src),['a','c']);
 assert.equal(partial.meta.workOrder,'000123');assert.equal(partial.meta.sourcePdf,'');assert.equal(partial.meta.conclusion,'');assert.equal(partial.pending,undefined);
 assert.equal(snapshot(doc,new Set()),null);
 partial.records[0].tag='alterado';assert.equal(JSON.stringify(doc),before);
 assert.match(source,/selectedPoints.clear\(\);\$\('onlySelectedPoints'\).checked=true/);
 assert.match(source,/await exportReportDocuments\(snapshots\)/);
 assert.match(readFileSync('pdf-export.js','utf8'),/reportDocument.exportPointNumbers\?\.\[i\]/);
});


test('prévia inicia vazia e exibe somente os pontos marcados; seleção permanece acessível',()=>{
 const source=readFileSync('workflow.js','utf8');
 assert.match(source,/id="onlySelectedPoints" checked hidden/);
 assert.match(source,/selectionDialog.showModal\(\)/);
 assert.match(source,/entry.hidden=!r\|\|!selectedPoints.has\(r.pointId\)/);
 assert.match(source,/selectedPoints.has\(r.pointId\)/);
 assert.match(source,/emptySelection.hidden=!preview\|\|selectedPoints.size>0/);
 assert.match(source,/\$\('togglePointSelection'\).onclick=/);
 assert.match(source,/const snapshots=selectedSnapshots\(\)/);
});

test('resumo executivo exclui pontos não selecionados e não inclui conclusão geral em seleção parcial',()=>{
 const source=readFileSync('field-tools.js','utf8');
 const body=source.slice(source.indexOf(" $('makeSummary').onclick="),source.indexOf("\n $('copySummary').onclick="));
 const records=[{tag:'A',status:'Pendente',priority:'Alta',problem:'Falha A',action:'Corrigir A'},{tag:'B',status:'Corrigido',problem:'Falha B',completionWork:'Corrigido B'}];
 const output={value:''},button={};
 const generate=new Function('$','data','records','window','datefmt','notify',body+";return $('makeSummary').onclick;")(id=>id==='makeSummary'?button:output,()=>({meta:{date:'2026-11-24',conclusion:'Conclusão geral'}}),records,{VistoriaReportSelection:()=>[records[0]]},v=>v,()=>{});
 generate();assert.match(output.value,/RESUMO EXECUTIVO/);assert.match(output.value,/Falha A/);assert.doesNotMatch(output.value,/Falha B|Corrigido B|Conclusão geral/);
});


test('seleção inicial automática apenas para ponto único, sem reativar seleção limpa',()=>{
 const source=readFileSync('workflow.js','utf8');
 const code=source.slice(source.indexOf('function initialPointSelection('),source.indexOf('function updatePointSelection('));
 const initial=new Function(code+';return initialPointSelection;')();
 const ids=new Set();assert.equal(initial([],ids,true),true);assert.equal(initial([{}],ids,true),true);assert.equal(initial([{pointId:'one'}],ids,true),false);assert.deepEqual([...ids],['one']);ids.clear();assert.equal(initial([{pointId:'one'}],ids,false),false);assert.equal(ids.size,0);assert.equal(initial([{pointId:'one'},{pointId:'two'}],ids,true),false);assert.equal(ids.size,0);
});
test('diálogo e opções recolhíveis mantêm os controles existentes',()=>{
 const source=readFileSync('workflow.js','utf8');const css=readFileSync('layout.css','utf8');
 assert.match(source,/selectionDialog.showModal\(\)/);assert.match(source,/selectionDialogList/);assert.match(source,/details.append\(tools\)/);assert.match(source,/extras.append\(trash\)/);assert.match(source,/extras.append\(audit\)/);assert.match(source,/report.insertBefore\(dock,review\)/);assert.match(css,/report-export-dock\{position:sticky/);
});

 test('prévia real reutiliza o PDF serializado e preserva opções na auditoria',()=>{const pdf=readFileSync('pdf-export.js','utf8'),flow=readFileSync('workflow.js','utf8');assert.match(pdf,/const pdfBlob=new Blob\(\[await doc.save\(\)\]/);assert.match(pdf,/options.preview\?previewGeneratedPdf:download/);assert.match(pdf,/save.onclick=\(\)=>download\(blob,name\)/);assert.match(flow,/return exportPdf\(documents,ids,options\)/);assert.match(flow,/exportReportDocuments\(snapshots,\[\],\{preview:true\}\)/);});

test('seletor de relatório recupera pontos legados sem ID antes de filtrar e permite retornar a todos',()=>{
 const source=readFileSync('workflow.js','utf8');
 const matcher=source.slice(source.indexOf('function reportPointMatches('),source.indexOf('function reportPointDetails('));
 const rowsCode=source.slice(source.indexOf('function selectableRows('),source.indexOf('function renderSelectionDialog('));
 const records=[{tag:'A',status:'Corrigido'},{tag:'B',status:'Pendente',pointId:'point-002'}];
 const controls={reportSearch:{value:''},reportStatusFilter:{value:''}};
 const window={VistoriaPointIds:{ensure(points,id){for(const [i,r] of points.entries())if(!r.pointId)r.pointId='legacy:'+id+':'+(i+1);}}};
 const getRows=new Function('records','activeReportId','window','$','allSelectionRows',matcher+rowsCode+';return selectableRows;')(records,'report-one',window,id=>controls[id],()=>records.map((r,i)=>({r,i,key:r.pointId,source:{meta:{}}})));
 assert.deepEqual(getRows().map(x=>x.r.tag),['A','B']);assert.equal(records[0].pointId,'legacy:report-one:1');
 controls.reportStatusFilter.value='Pendente';assert.deepEqual(getRows().map(x=>x.r.tag),['B']);
 controls.reportStatusFilter.value='finalizados';assert.deepEqual(getRows().map(x=>x.r.tag),['A']);
 controls.reportStatusFilter.value='';assert.deepEqual(getRows().map(x=>x.r.tag),['A','B']);assert.equal(records[1].pointId,'point-002');
 assert.match(source,/function updatePointSelection\(\)\{[\s\S]*?const available=new Set\(allSelectionRows\(\)/);
 assert.match(source,/togglePointSelection'\)\.onclick=\(\)=>\{\$\('reportSearch'\)\.value='';\$\('reportStatusFilter'\)\.value='';filterReport\(\);selectionDialog\.showModal\(\);renderSelectionDialog\(\)/);
 assert.match(source,/Mostrar todos os pontos/);
});

test('seleção filtrada substitui pontos de outras situações e todos inclui o relatório completo',()=>{
 const source=readFileSync('workflow.js','utf8');
 const matcher=source.slice(source.indexOf('function reportPointMatches('),source.indexOf('function reportPointDetails('));
 const rowsCode=source.slice(source.indexOf('function selectableRows('),source.indexOf('function renderSelectionDialog('));
 const replace=source.slice(source.indexOf('function replaceReportSelection('),source.indexOf('function applyReportSelection('));
 const records=[{tag:'A',pointId:'point-001',status:'Pendente'},{tag:'B',pointId:'point-002',status:'Em acompanhamento'},{tag:'C',pointId:'point-003',status:'Corrigido'},{tag:'D',pointId:'point-004',status:'Sem pendência'}];
 const before=JSON.stringify(records),selectedPoints=new Set(['point-001','point-002','point-003','point-004']),controls={reportSearch:{value:''},reportStatusFilter:{value:''}};
 const {rows,apply}=new Function('records','activeReportId','window','$','selectedPoints','allSelectionRows',matcher+rowsCode+replace+';return {rows:selectableRows,apply:replaceReportSelection};')(records,'report-one',{},id=>controls[id],selectedPoints,()=>records.map((r,i)=>({r,i,key:r.pointId,source:{meta:{}}})));
 controls.reportStatusFilter.value='Pendente';apply(selectedPoints,rows());assert.deepEqual([...selectedPoints],['point-001']);
 controls.reportStatusFilter.value='Em acompanhamento';apply(selectedPoints,rows());assert.deepEqual([...selectedPoints],['point-002']);
 controls.reportStatusFilter.value='finalizados';apply(selectedPoints,rows());assert.deepEqual([...selectedPoints],['point-003','point-004']);
 controls.reportStatusFilter.value='selecionados';assert.deepEqual(rows().map(x=>x.r.tag),['C','D']);
 controls.reportStatusFilter.value='';apply(selectedPoints,rows());assert.equal(selectedPoints.size,4);
 controls.reportSearch.value='B';apply(selectedPoints,rows());assert.deepEqual([...selectedPoints],['point-002']);assert.equal(JSON.stringify(records),before);
 assert.match(source,/selectAllReportPoints/);assert.match(source,/fora do filtro/);
 const editor=readFileSync('edit-saved.js','utf8');assert.match(editor,/addPoints\(records,activeReportId,true,/);assert.doesNotMatch(editor,/VistoriaReportSelection|reportStatusFilter|selectedPoints/);
});

test('editor oferece pontos de todas as vistorias salvas, sem misturar IDs nem ignorar rascunhos',()=>{
 const source=readFileSync('edit-saved.js','utf8');
 const other=source.slice(source.indexOf('function otherSavedReports('),source.indexOf('function refreshPicker('));
 const index=source.slice(source.indexOf('function pointIndex('),source.indexOf('async function openSavedReportPoint('));
 const {reports,find}=new Function(other+index+';return {reports:otherSavedReports,find:pointIndex};')();
 const items=[{id:'current',document:{records:[{tag:'A'}]}},{id:'another',document:{records:[{tag:'B'}]}},{id:'empty',document:{records:[]}}];
 assert.deepEqual(reports(items,'current').map(r=>r.id),['another']);
 const points=[{pointId:'point-001',tag:'X'},{pointId:'point-002',tag:'X'}];assert.equal(find(points,{pointId:'point-002'}),1);assert.equal(find(points,{pointId:'missing'}),-1);assert.equal(find(points,{}),-1);
 assert.match(source,/fragment.append\(option\)/);assert.doesNotMatch(source,/createElement\('optgroup'\)/);assert.match(source,/await persistCurrent\(\);[\s\S]*?objectStore\('reports'\)\.get\(target.reportId\)/);
 assert.match(source,/reset\(\);activeReportId=row.id;fill\(doc\);\s*if\(hasPendingDraft\(\)\)/);assert.match(source,/if\(editing!==i\)notify/);assert.match(source,/document.addEventListener\('vistoria-saved',refreshPicker\)/);
});

test('seletor de edição exibe somente TAG e mantém identidade de registros repetidos',()=>{
 const source=readFileSync('edit-saved.js','utf8');const code=source.slice(source.indexOf('function pointLabel('),source.indexOf('function otherSavedReports('));const label=new Function(code+';return pointLabel;')();
 assert.equal(label({tag:'C260 BA01',area:'BV',status:'Pendente'}),'C260 BA01');assert.equal(label({tag:'  MC4530_FI015  '}),'MC4530_FI015');assert.equal(label({}),'TAG não informada');
 assert.match(source,/option.textContent=p.tag/);assert.match(source,/nextChoices.set\(key,\{reportId,pointId:r.pointId,index:i,current,tag/);assert.match(source,/Existem registros com a mesma TAG/);
});

test('seletor não reconstrói opções durante foco ou salvamentos sem alteração',()=>{
 const source=readFileSync('edit-saved.js','utf8');
 const code=source.slice(source.indexOf('function pointLabel('),source.indexOf('function hasPendingDraft('));
 const records=[{pointId:'point-001',tag:'B'}],historyItems=[{id:'other',document:{meta:{},records:[{pointId:'point-002',tag:'A'}]}}];
 let rebuilds=0;const select={value:'',replaceChildren(fragment){rebuilds++;this.options=fragment.children}};
 const document={createElement(){return {}},createDocumentFragment(){return {children:[],append(o){this.children.push(o)}}}};
 const run=new Function('records','historyItems','activeReportId','window','$','document','select','picker','pickerTitle','editing',`let choices=new Map(),pickerSignature='',pickerFocused=false; `+code+`;return {refreshPicker,focus(v){pickerFocused=v},choices(){return choices}};`)(records,historyItems,'current',{},()=>({value:'RV'}),document,select,{}, {},null);
 run.refreshPicker();assert.equal(rebuilds,1);const first=select.options.map(o=>[o.value,o.textContent]);assert.deepEqual(first.map(x=>x[1]),['Selecione um ponto salvo','A','B']);
 run.refreshPicker();assert.equal(rebuilds,1);
 run.focus(true);historyItems[0].document.records.push({pointId:'point-003',tag:'C'});run.refreshPicker();assert.equal(rebuilds,1);assert.equal(run.choices().size,2);
 run.focus(false);run.refreshPicker();assert.equal(rebuilds,2);assert.equal(run.choices().size,3);assert.deepEqual(select.options.slice(0,3).map(o=>[o.value,o.textContent]),first);
 run.refreshPicker();assert.equal(rebuilds,2);
 assert.match(source,/select.addEventListener\('focus'/);assert.match(source,/select.addEventListener\('blur'/);assert.match(source,/if\(signature!==pickerSignature\)/);
});

test('seletor global filtra situações e OS entre vistorias, mantendo IDs e metadados de origem no PDF',()=>{
 const s=readFileSync('workflow.js','utf8');
 const matcher=s.slice(s.indexOf('function reportPointMatches('),s.indexOf('function reportPointDetails('));
 const rows=s.slice(s.indexOf('function selectionRows('),s.indexOf('function allSelectionRows('));
 const filter=s.slice(s.indexOf('function selectableRows('),s.indexOf('function renderSelectionDialog('));
 const snapshot=s.slice(s.indexOf('function selectedReportSnapshot('),s.indexOf('function initialPointSelection('));
 const snapshots=s.slice(s.indexOf('function selectedSnapshots('),s.indexOf('function generateSelectedPdf('));
 const sources=[{id:'a',current:true,meta:{number:'RV-A'},records:[{pointId:'same-id-1',tag:'A',status:'Pendente'}]},{id:'b',current:false,meta:{number:'RV-B',workOrder:'123'},records:[{pointId:'same-id-1',tag:'B',status:'Em acompanhamento'},{pointId:'point-003',tag:'C',status:'Corrigido'}]}];
 sources[1].document={meta:sources[1].meta,records:sources[1].records};
 const controls={reportSearch:{value:''},reportStatusFilter:{value:''}},ids=new Set(),records=sources[0].records;
 const api=new Function('sources','records','activeReportId','window','$','selectedPoints','data',matcher+rows+filter+snapshot+snapshots+';function selectionSources(){return sources}function allSelectionRows(){return selectionRows(sources)}return {rows:selectableRows,pdf:selectedSnapshots};')(sources,records,'a',{},id=>controls[id],ids,()=>({meta:sources[0].meta,records}));
 assert.equal(api.rows().length,3);controls.reportStatusFilter.value='Em acompanhamento';assert.deepEqual(api.rows().map(x=>x.r.tag),['B']);ids.add(api.rows()[0].key);controls.reportStatusFilter.value='';controls.reportSearch.value='123';assert.deepEqual(api.rows().map(x=>x.r.tag),['B','C']);controls.reportSearch.value='';ids.add(api.rows()[0].key);const docs=api.pdf();assert.deepEqual(docs.map(d=>d.meta.number),['RV-A','RV-B']);assert.deepEqual(docs.map(d=>d.records.map(r=>r.tag)),[['A'],['B']]);assert.equal(sources[1].records.length,2);
 assert.match(s,/renderExternalPreview\(\)/);assert.match(s,/exportReportDocuments\(snapshots,\[\],\{preview:true\}\)/);
});
