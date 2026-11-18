import {approvedMember,teamDb} from '../team-auth.mjs';
import {createPrivateReport,readPrivateReport} from '../team-drive.mjs';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const reply=(s,b)=>res.status(s).json(b);
 try{
 const m=await approvedMember(req);
 if(!m)return reply(403,{error:'Acesso não aprovado'});
 const id=String(req.query?.id||req.body?.id||'');
 const valid=/^[a-zA-Z0-9_-]{1,100}$/.test(id);
 const base='vistoria_report_index';
 if(req.method==='GET'&&!id)return reply(200,{reports:await teamDb(base+'?deleted_at=is.null&select=report_id,owner_subject,revision,updated_at&order=updated_at.desc')});
 if(!valid)return reply(400,{error:'Identificador inválido'});
 const filter=base+'?report_id=eq.'+encodeURIComponent(id);
 const old=(await teamDb(filter))[0];
 if(req.method==='GET'){
 if(!old||old.deleted_at)return reply(404,{error:'Vistoria não encontrada'});
 if(req.query?.history==='1')return reply(200,{history:await teamDb('vistoria_audit?report_id=eq.'+encodeURIComponent(id)+'&select=action,revision,occurred_at,actor_subject&order=occurred_at.desc')});
 return reply(200,{document:await readPrivateReport(old.drive_file_id),revision:old.revision,owner:old.owner_subject});
 }
 if(old&&old.owner_subject!==m.google_subject&&m.role!=='admin')return reply(403,{error:'Somente o autor ou administrador pode editar'});
 if(req.method==='DELETE'){
 if(m.role!=='admin')return reply(403,{error:'Somente administrador pode excluir'});
 if(!old||old.deleted_at)return reply(404,{error:'Vistoria não encontrada'});
 const rows=await teamDb(filter+'&revision=eq.'+old.revision,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({deleted_at:new Date().toISOString(),revision:old.revision+1})});
 if(!rows.length)return reply(409,{error:'Revisão alterada'});
 await teamDb('vistoria_audit',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_subject:m.google_subject,report_id:id,action:'delete',revision:old.revision+1})});
 return reply(200,{ok:true});
 }
 if(req.method!=='POST')return reply(405,{error:'Método inválido'});
 const doc=req.body?.document;
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||!doc.meta||!Array.isArray(doc.records)||Buffer.byteLength(JSON.stringify(doc),'utf8')>3500000)return reply(400,{error:'Documento inválido ou grande demais'});
 if(old?.deleted_at||Number(req.body.revision)!==(old?.revision||0))return reply(409,{error:'Versão desatualizada'});
 const revision=(old?.revision||0)+1;
 const file=await createPrivateReport(id,doc);
 const row={drive_file_id:file,revision,updated_at:new Date().toISOString()};
 const rows=old?await teamDb(filter+'&revision=eq.'+old.revision+'&deleted_at=is.null',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(row)}):await teamDb(base,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...row,report_id:id,owner_subject:m.google_subject})});
 if(!rows.length)return reply(409,{error:'Revisão alterada'});
 await teamDb('vistoria_audit',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_subject:m.google_subject,report_id:id,action:old?'update':'create',revision})});
 return reply(200,{revision});
 }catch{return reply(503,{error:'Não foi possível concluir a operação da equipe'});}
}
