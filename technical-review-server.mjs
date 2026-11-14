import {FIELD_NAMES,reviewInput,verifiedGoogleIdentity,reviewMessages,extractReview} from './technical-review-core.mjs';

const AI_URL='https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL='openai/gpt-oss-120b';

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 const reply=(status,data)=>res.status(status).json(data);
 if(req.method!=='POST')return reply(405,{error:'Use POST para solicitar a revisão técnica.'});

 // Google é a única forma de entrar. Contas fora da lista configurada não consomem créditos de IA.
 const expectedClient=process.env.VISTORIA_GOOGLE_CLIENT_ID;
 const allowedEmails=process.env.VISTORIA_GOOGLE_ALLOWED_EMAILS;
 if(!expectedClient||!allowedEmails)return reply(503,{error:'A revisão por IA requer cadastrar o Client ID e os e-mails autorizados do Google nas configurações privadas do servidor.'});
 const bearer=String(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9._~-]+)$/i)?.[1];
 if(!bearer)return reply(401,{error:'Conecte sua conta Google Drive e tente novamente.'});
 try{
  const check=await fetch('https://oauth2.googleapis.com/tokeninfo?access_token='+encodeURIComponent(bearer),{
   method:'GET',cache:'no-store',signal:AbortSignal.timeout(8000)
  });
  if(!check.ok)return reply(401,{error:'Seu acesso Google expirou. Reconecte o Drive.'});
  const identity=await check.json();
  if(!verifiedGoogleIdentity(identity,expectedClient,allowedEmails))return reply(403,{error:'Sua conta Google não está autorizada a utilizar a revisão técnica.'});
 }catch(err){
  console.error('Falha ao validar acesso Google:',err?.name||'Unknown');
  return reply(503,{error:'Não foi possível confirmar sua conta Google. Tente novamente.'});
 }

 const headerLength=Number(req.headers['content-length']||0);
 if(headerLength>16000)return reply(413,{error:'Texto enviado excede o limite.'});
 let body=req.body;
 try{if(typeof body==='string')body=JSON.parse(body)}catch{return reply(400,{error:'Formato JSON inválido.'})}
 const input=reviewInput(body);
 if(input.error)return reply(400,{error:input.error});

 const token=process.env.GROQ_API_KEY;
 if(!token)return reply(503,{error:'A revisão por IA ainda não está habilitada no servidor. Configure GROQ_API_KEY no servidor.'});
 const model=DEFAULT_MODEL;
 try{
  const upstream=await fetch(AI_URL,{
   method:'POST',
   headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
   signal:AbortSignal.timeout(40000),
   body:JSON.stringify({
    model,
    messages:reviewMessages(input.field,input.text),
    max_completion_tokens:2048,
    reasoning_effort:'low',
    stream:false
   })
  });
  if(!upstream.ok){
   if(upstream.status===402)return reply(503,{error:'A conta Groq não está disponível para revisão gratuita.'});
   if(upstream.status===401||upstream.status===403)return reply(503,{error:'A chave Groq precisa ser válida e autorizada.'});
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
