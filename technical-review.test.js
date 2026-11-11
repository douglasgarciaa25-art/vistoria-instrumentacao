import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {FIELD_NAMES,MAX_REVIEW_INPUT,reviewInput,isAuthorized,reviewMessages,extractReview} from './technical-review-core.mjs';
import handler from './technical-review-server.mjs';

test('aceita somente campos permitidos, texto manual e limites definidos',()=>{
 assert.deepEqual(reviewInput({field:'analysisDraft',text:'  teste de entrada  '}),{field:'analysisDraft',text:'teste de entrada'});
 assert.equal(reviewInput({field:'password',text:'teste'}).error,'Campo não permitido.');
 assert.ok(reviewInput({field:'problem',text:' '.repeat(20)}).error);
 assert.ok(reviewInput({field:'problem',text:'x'.repeat(MAX_REVIEW_INPUT+1)}).error);
 assert.ok(reviewInput({field:'problem',text:{}}).error);
 assert.ok(Object.hasOwn(FIELD_NAMES,'completionWork'));
});
test('autentica com a mesma chave da nuvem sem comparar segredos em claro',()=>{
 const hash=createHash('sha256').update('chave-ficticia').digest('hex');
 assert.equal(isAuthorized('Bearer chave-ficticia',hash),true);
 assert.equal(isAuthorized('Bearer chave-incorreta',hash),false);
 assert.equal(isAuthorized('Bearer chave-ficticia','hash-invalido'),false);
 assert.equal(isAuthorized('',hash),false);
});
test('prompt técnico proíbe inventar medições e conclusões',()=>{
 const messages=reviewMessages('analysisDraft','Foi checado a valvula. Não foi testado.');
 assert.equal(messages[0].role,'system');
 for(const term of ['Não invente','TAGs','Não transforme','apenas conteúdo a revisar'])assert.ok(messages[0].content.includes(term),term);
 assert.ok(messages[1].content.includes('Não foi testado.'));
});
test('extrai apenas uma sugestão válida; rejeita respostas truncadas',()=>{
 assert.equal(extractReview({choices:[{finish_reason:'stop',message:{content:'  Foi realizada inspeção visual.  '}}]}),'Foi realizada inspeção visual.');
 assert.throws(()=>extractReview({choices:[{finish_reason:'length',message:{content:'Incompleto'}}]}));
 assert.throws(()=>extractReview({choices:[{finish_reason:'stop',message:{content:''}}]}));
});
test('interface preserva entrada manual e exige aprovação explícita',()=>{
 const js=readFileSync('technical-review.js','utf8');
 const html=readFileSync('index.html','utf8');
 const sw=readFileSync('sw.js','utf8');
 const vercel=JSON.parse(readFileSync('vercel.json','utf8'));
 assert.ok(html.includes('<script src="technical-review.js"></script>'));
 assert.ok(sw.includes("'/technical-review.js'"));
 assert.ok(vercel.routes.some(r=>r.src==='/api/technical-review'));
 assert.ok(js.includes("field.value!==original"));
 assert.ok(js.includes('Usar texto revisado'));
 assert.ok(js.includes('Manter meu texto'));
 assert.ok(js.includes('Desfazer revisão'));
 assert.ok(js.includes('field.dispatchEvent(new Event'));
 assert.ok(js.includes('Não inclua informações sigilosas'));
});
function response(){
 return {statusCode:200,body:null,headers:{},
  setHeader(key,value){this.headers[key]=value},
  status(code){this.statusCode=code;return this},
  json(value){this.body=value;return this}
 };
}
test('API impede usuários sem a chave e não envia o texto ao provedor',async()=>{
 const saved=process.env.VISTORIA_ACCESS_HASH;
 const fetchOriginal=globalThis.fetch;
 process.env.VISTORIA_ACCESS_HASH=createHash('sha256').update('chave-testes').digest('hex');
 globalThis.fetch=()=>{throw Error('Requisição externa inesperada.')};
 try{
  const res=response();
  await handler({method:'POST',headers:{authorization:'Bearer errada'},body:{field:'analysisDraft',text:'texto'}},res);
  assert.equal(res.statusCode,401);
 }finally{globalThis.fetch=fetchOriginal;if(saved===undefined)delete process.env.VISTORIA_ACCESS_HASH;else process.env.VISTORIA_ACCESS_HASH=saved}
});
test('API revisa somente o campo solicitado e responde sem alterar registros',async()=>{
 const key='chave-teste';
 const savedHash=process.env.VISTORIA_ACCESS_HASH, savedGateway=process.env.AI_GATEWAY_API_KEY;
 const originalFetch=globalThis.fetch;
 process.env.VISTORIA_ACCESS_HASH=createHash('sha256').update(key).digest('hex');
 process.env.AI_GATEWAY_API_KEY='credencial-ficticia-de-testes';
 let called=0;
 globalThis.fetch=async(url,options)=>{
  called++;
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
  await handler({method:'POST',headers:{authorization:'Bearer '+key},body:{field:'analysisDraft',text:'Não apresentou leitura no painel.'}},res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body,{suggested:'O painel não apresentou leitura.',field:'analysisDraft',fieldLabel:FIELD_NAMES.analysisDraft});
  assert.equal(called,1);
 }finally{
  globalThis.fetch=originalFetch;
  if(savedHash===undefined)delete process.env.VISTORIA_ACCESS_HASH;else process.env.VISTORIA_ACCESS_HASH=savedHash;
  if(savedGateway===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=savedGateway;
 }
});
