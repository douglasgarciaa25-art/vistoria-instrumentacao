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
 if(member?.status==='pending'&&member.role==='technician'){
  const claim=await teamDb('rpc/vistoria_invite_action',{method:'POST',body:JSON.stringify({p_action:'claim',p_actor:identity.subject,p_email:identity.email,p_name:null})});
  if(claim==='claimed')member=await memberFor(identity);
 }
 return reply(200,{member});
 }
 if(req.method==='GET'&&req.query?.list!=='1')return reply(200,{member});
 if(member?.status!=='approved'||member.role!=='admin')return reply(403,{error:'Acesso administrativo necessário.'});
 if(req.method==='GET'){
  const [members,invites]=await Promise.all([teamDb('vistoria_members?select=google_subject,email,role,status,technician_name,requested_at&order=requested_at.desc'),teamDb('vistoria_user_invites?claimed_at=is.null&revoked_at=is.null&select=email,technician_name,created_at&order=created_at.desc')]);
  return reply(200,{members,invites});
 }
 if(req.method==='POST'&&['invite','revoke-invite'].includes(req.body?.action)){
  const email=String(req.body.email||'').trim().toLowerCase();
  const name=String(req.body.name||'').normalize('NFC').trim().replace(/\s+/g,' ');
  const invite=req.body.action==='invite';
  if(email.length>254||!/^[a-z0-9._+%-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)||(invite&&(name.length<3||name.length>100||/[\x00-\x1f<>]/.test(name))))return reply(400,{error:'Informe e-mail e nome válidos.'});
  const result=await teamDb('rpc/vistoria_invite_action',{method:'POST',body:JSON.stringify({p_action:invite?'invite':'revoke',p_actor:identity.subject,p_email:email,p_name:invite?name:null})});
  if(['invited','revoked'].includes(result))return reply(200,{ok:true});
  return reply(result==='forbidden'?403:result==='invalid'?400:409,{error:({registered:'Usuário já cadastrado. Utilize a lista de usuários para administrar seu acesso.',exists:'E-mail já autorizado previamente.',missing:'Autorização não encontrada ou já utilizada.',forbidden:'Acesso administrativo necessário.'})[result]||'Não foi possível alterar a autorização.'});
 }
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
