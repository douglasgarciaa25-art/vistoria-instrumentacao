import {createHmac,timingSafeEqual,createCipheriv,createHash,randomBytes} from 'node:crypto';
import {teamDb,memberFor} from '../team-auth.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Set-Cookie','vistoria_drive_nonce=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
 try{
 const secret=process.env.vistoria_drive_client_secret||process.env.VISTORIA_DRIVE_CLIENT_SECRET;
 const client=process.env.VISTORIA_GOOGLE_CLIENT_ID;
 const [payload,sig]=String(req.query.state||'').split('.');
 const expected=createHmac('sha256',secret).update(payload).digest();
 const actual=Buffer.from(sig||'','base64url');
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error();
 const state=JSON.parse(Buffer.from(payload,'base64url').toString());
 const nonce=String(req.headers.cookie||'').match(/(?:^|;\s*)vistoria_drive_nonce=([^;]+)/)?.[1];
 if(!nonce||nonce!==state.nonce||state.exp<Date.now())throw Error();
 const member=await memberFor({subject:state.sub});
 if(member?.role!=='admin'||member.status!=='approved')throw Error();
 const t=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:client,client_secret:secret,code:String(req.query.code||''),grant_type:'authorization_code',redirect_uri:'https://vistoria-instrumentacao.vercel.app/api/team-drive-callback'}),signal:AbortSignal.timeout(10000)});
 if(!t.ok)throw Error();
 const tokens=await t.json();if(!tokens.refresh_token)throw Error();
 const headers={Authorization:'Bearer '+tokens.access_token};
 const u=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers});
 if(!u.ok||(await u.json()).sub!==state.sub)throw Error();
 const existing=(await teamDb('vistoria_drive_config?id=eq.1&select=folder_id,owner_subject'))[0];
 if(existing&&existing.owner_subject!==state.sub)throw Error();
 let folder=existing?{id:existing.folder_id}:null;
 if(!folder){
 const f=await fetch('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({name:'Vistoria Técnica — Equipe',mimeType:'application/vnd.google-apps.folder'})});
 if(!f.ok)throw Error();
 folder=await f.json();
 }
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',createHash('sha256').update(secret).digest(),iv);
 const encrypted=Buffer.concat([cipher.update(tokens.refresh_token,'utf8'),cipher.final()]);
 await teamDb('vistoria_drive_config',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:1,folder_id:folder.id,credential:[iv,cipher.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.'),owner_subject:state.sub})});
 return res.redirect(303,'/?driveTeam=authorized');
 }catch{return res.status(400).send('Autorização não concluída. Retorne ao aplicativo e tente novamente.');}
}
