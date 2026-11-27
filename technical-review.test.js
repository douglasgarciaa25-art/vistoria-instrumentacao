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
 assert.match(s,/entry.hidden=!r\|\|!selectedPoints.has\(currentKey\(r\)\)/);
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
 assert.match(s,/reportManagementStats\(reportPointsAcrossSavedReports\(historyItems,activeReportId,records\)\)/);
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
 assert.match(source,/entry.hidden=!r\|\|!selectedPoints.has\(currentKey\(r\)\)/);
 assert.match(source,/selectedPoints.has\(currentKey\(r\)\)/);
 assert.match(source,/emptySelection.hidden=selectedPoints.size>0/);
 assert.match(source,/\$\('togglePointSelection'\).onclick=/);
 assert.match(source,/selectedSnapshots\(\)/);
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
