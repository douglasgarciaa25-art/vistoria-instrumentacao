import {createHash,createDecipheriv} from 'node:crypto';
import {memberFor} from '../team-auth.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.headers.origin!=='https://vistoria-instrumentacao.vercel.app')return res.status(403).json({error:'Origem inválida'});
 if(req.method==='DELETE'){res.setHeader('Set-Cookie','vistoria_personal=; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=0');return res.status(200).json({ok:true});}
 if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});
 try{
 const secret=process.env.vistoria_drive_client_secret||process.env.VISTORIA_DRIVE_CLIENT_SECRET;
 const cookie=String(req.headers.cookie||'').match(/(?:^|;\s*)vistoria_personal=([^;]+)/)?.[1];
 if(!cookie||!secret)return res.status(401).json({error:'Sessão não disponível'});
 const [iv,tag,encrypted]=cookie.split('.').map(x=>Buffer.from(x,'base64url'));
 const decipher=createDecipheriv('aes-256-gcm',createHash('sha256').update('personal:'+secret).digest(),iv);decipher.setAuthTag(tag);
 const session=JSON.parse(Buffer.concat([decipher.update(encrypted),decipher.final()]).toString());
 if(!Number.isSafeInteger(session.exp)||session.exp<=Date.now()||!session.sub||!session.refresh)return res.status(401).json({error:'Renove a autorização Google'});
 const member=await memberFor({subject:session.sub});
 if(member?.status!=='approved')return res.status(403).json({error:'Conta não aprovada'});
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:process.env.VISTORIA_GOOGLE_CLIENT_ID,client_secret:secret,refresh_token:session.refresh,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)return res.status(401).json({error:'Renove a autorização Google'});
 const token=await response.json();
 if(!token.access_token)return res.status(401).json({error:'Renove a autorização Google'});
 return res.status(200).json({access_token:token.access_token,expires_in:token.expires_in,email:member.email,subject:member.google_subject});
 }catch{return res.status(401).json({error:'Sessão indisponível'});}
}
