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
 assert.ok(!js.includes('window.VistoriaGoogleDrive'));
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
 const original={client:process.env.VISTORIA_GOOGLE_CLIENT_ID,emails:process.env.VISTORIA_GOOGLE_ALLOWED_EMAILS,key:process.env.AI_GATEWAY_API_KEY};
 process.env.VISTORIA_GOOGLE_CLIENT_ID=CLIENT;
 process.env.VISTORIA_GOOGLE_ALLOWED_EMAILS=EMAIL;
 process.env.AI_GATEWAY_API_KEY='credencial-ficticia-de-testes';
 return ()=>{for(const [k,v] of Object.entries({VISTORIA_GOOGLE_CLIENT_ID:original.client,VISTORIA_GOOGLE_ALLOWED_EMAILS:original.emails,AI_GATEWAY_API_KEY:original.key}))if(v===undefined)delete process.env[k];else process.env[k]=v};
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
   return {ok:true,json:async()=>({aud:CLIENT,email:EMAIL,email_verified:'true',scope:SCOPES})};
  }
  assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer credencial-ficticia-de-testes');
  const body=JSON.parse(options.body);
  assert.equal(body.model,'openai/gpt-5.5');
  assert.ok(body.messages[1].content.includes('Não apresentou leitura no painel.'));
  assert.equal(body.messages[1].content.includes('foto'),false);
  return {ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:'O painel não apresentou leitura.'}}]})};
 };
 try{
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer token.mock'},body:{field:'analysisDraft',text:'Não apresentou leitura no painel.'}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{suggested:'O painel não apresentou leitura.',field:'analysisDraft',fieldLabel:FIELD_NAMES.analysisDraft});
  assert.equal(calls,2);
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
