import {googleIdentity,memberFor,teamDb} from '../team-auth.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const reply=(s,b)=>res.status(s).json(b);
 try{
 const identity=await googleIdentity(req);
 if(!identity)return reply(401,{error:'Entre com Google.'});
 let member=await memberFor(identity);
 const admins=String(process.env.VISTORIA_GOOGLE_ALLOWED_EMAILS||'').toLowerCase().split(/[;,\s]+/);
 if(req.method==='POST'&&req.body?.action==='request'){
 if(!member){
 const admin=admins.includes(identity.email);
 await teamDb('vistoria_members',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({google_subject:identity.subject,email:identity.email,role:admin?'admin':'technician',status:admin?'approved':'pending'})});
 member=await memberFor(identity);
 }
 return reply(200,{member});
 }
 if(req.method==='GET'&&req.query?.list!=='1')return reply(200,{member});
 if(member?.status!=='approved'||member.role!=='admin')return reply(403,{error:'Acesso administrativo necessário.'});
 if(req.method==='GET')return reply(200,{members:await teamDb('vistoria_members?select=google_subject,email,role,status,technician_name,requested_at&order=requested_at.desc')});
 if(req.method==='POST'&&req.body?.action==='set-name'){
 const subject=String(req.body.subject||'');
 const name=String(req.body.name||'').normalize('NFC').trim().replace(/\s+/g,' ');
 if(!/^[A-Za-z0-9._-]{8,100}$/.test(subject)||name.length<3||name.length>100||/[\x00-\x1f<>]/.test(name))return reply(400,{error:'Cadastro de técnico inválido'});
 const target=await memberFor({subject});
 if(!target||target.status!=='approved')return reply(404,{error:'Técnico não aprovado'});
 const updated=await teamDb('vistoria_members?google_subject=eq.'+encodeURIComponent(subject)+'&status=eq.approved',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({technician_name:name,name_updated_at:new Date().toISOString(),name_updated_by:identity.subject})});
 if(!updated.length)return reply(409,{error:'Cadastro alterado'});
 return reply(200,{ok:true});
 }
 if(req.method==='POST'&&['approved','blocked'].includes(req.body?.status)){
 const subject=String(req.body.subject||'');
 if(!subject||subject===identity.subject)return reply(400,{error:'Operação inválida.'});
 const target=await memberFor({subject});
 if(!target||target.role==='admin')return reply(403,{error:'Operação não permitida.'});
 await teamDb('vistoria_members?google_subject=eq.'+encodeURIComponent(subject)+'&role=eq.technician',{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({status:req.body.status,decided_at:new Date().toISOString(),decided_by:identity.subject})});
 return reply(200,{ok:true});
 }
 return reply(405,{error:'Operação inválida.'});
 }catch(e){return reply(503,{error:'Não foi possível acessar o cadastro da equipe.'});}
}
