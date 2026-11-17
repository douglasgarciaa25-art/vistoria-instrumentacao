import {createHmac,randomBytes} from 'node:crypto';
import {approvedMember} from '../team-auth.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Método inválido'});
 try{
 const member=await approvedMember(req);
 if(member?.role!=='admin')return res.status(403).json({error:'Somente administrador'});
 const secret=process.env.vistoria_drive_client_secret||process.env.VISTORIA_DRIVE_CLIENT_SECRET;
 const client=process.env.VISTORIA_GOOGLE_CLIENT_ID;
 if(!secret||!client)return res.status(503).json({error:'OAuth não configurado'});
 const nonce=randomBytes(24).toString('hex');
 const payload=Buffer.from(JSON.stringify({sub:member.google_subject,nonce,exp:Date.now()+600000})).toString('base64url');
 const state=payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');
 res.setHeader('Set-Cookie','vistoria_drive_nonce='+nonce+'; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600');
 const params=new URLSearchParams({client_id:client,redirect_uri:'https://vistoria-instrumentacao.vercel.app/api/team-drive-callback',response_type:'code',scope:'https://www.googleapis.com/auth/drive.file openid email',access_type:'offline',prompt:'consent',state,login_hint:member.email});
 return res.status(200).json({url:'https://accounts.google.com/o/oauth2/v2/auth?'+params});
 }catch{return res.status(503).json({error:'Falha ao iniciar autorização'});}
}
