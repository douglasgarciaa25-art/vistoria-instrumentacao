import {FIELD_NAMES,reviewInput,isAuthorized,reviewMessages,extractReview} from './technical-review-core.mjs';

const AI_URL='https://ai-gateway.vercel.sh/v1/chat/completions';
const DEFAULT_MODEL='openai/gpt-5.5';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const reply=(status,data)=>res.status(status).json(data);
 if(req.method!=='POST')return reply(405,{error:'Use POST para solicitar a revisão técnica.'});

 const expected=process.env.VISTORIA_ACCESS_HASH;
 if(!expected)return reply(503,{error:'A autenticação da Vistoria Técnica ainda não foi configurada.'});
 if(!isAuthorized(req.headers.authorization||'',expected))return reply(401,{error:'Conecte a chave da nuvem na Vistoria Técnica para usar a revisão.'});

 const headerLength=Number(req.headers['content-length']||0);
 if(headerLength>16000)return reply(413,{error:'Texto enviado excede o limite.'});
 let body=req.body;
 try{if(typeof body==='string')body=JSON.parse(body)}catch{return reply(400,{error:'Formato JSON inválido.'})}
 const input=reviewInput(body);
 if(input.error)return reply(400,{error:input.error});

 const token=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
 if(!token)return reply(503,{error:'A revisão por IA ainda não está habilitada no servidor. Configure a autenticação do Vercel AI Gateway.'});
 const model=process.env.VISTORIA_AI_MODEL||DEFAULT_MODEL;
 try{
  const upstream=await fetch(AI_URL,{
   method:'POST',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   signal:AbortSignal.timeout(40000),
   body:JSON.stringify({
    model,
    messages:reviewMessages(input.field,input.text),
    max_completion_tokens:1400,
    stream:false
   })
  });
  if(!upstream.ok){
   if(upstream.status===402)return reply(503,{error:'A conta Vercel AI Gateway está sem créditos disponíveis para revisão.'});
   if(upstream.status===401||upstream.status===403)return reply(503,{error:'A credencial da IA precisa ser autorizada no projeto Vercel.'});
   if(upstream.status===429)return reply(429,{error:'Limite temporário da IA atingido. Tente novamente mais tarde.'});
   console.error('Technical review provider error:',upstream.status);
   return reply(502,{error:'A IA não conseguiu revisar agora. Seu texto original continua salvo.'});
  }
  const response=await upstream.json();
  const suggested=extractReview(response);
  return reply(200,{suggested,field:input.field,fieldLabel:FIELD_NAMES[input.field]});
 }catch(err){
  if(err?.name==='TimeoutError'||err?.name==='AbortError')return reply(504,{error:'A revisão demorou além do limite. Tente novamente.'});
  console.error('Technical review error:',err?.name||'Unknown');
  return reply(502,{error:'Não foi possível concluir a revisão. Seu texto original foi mantido.'});
 }
}
