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
 if(req.method==='GET'&&!id){
 const trash=req.query?.trash==='1';
 if(trash&&m.role!=='admin')return reply(403,{error:'Somente administrador pode consultar a lixeira'});
 return reply(200,{reports:await teamDb(base+'?deleted_at='+ (trash?'not.is.null':'is.null')+'&select=report_id,owner_subject,revision,updated_at,deleted_at&order=updated_at.desc')});
 }
 if(!valid)return reply(400,{error:'Identificador inválido'});
 const filter=base+'?report_id=eq.'+encodeURIComponent(id);
 const old=(await teamDb(filter))[0];
 if(req.method==='GET'){
 if(!old||old.deleted_at)return reply(404,{error:'Vistoria não encontrada'});
 if(req.query?.history==='1'){const history=await teamDb('vistoria_audit?report_id=eq.'+encodeURIComponent(id)+'&select=action,revision,occurred_at,actor_subject,drive_file_id&order=occurred_at.desc');return reply(200,{history:history.map(({drive_file_id,...event})=>({...event,available:!!drive_file_id}))});}
 let fileId=old.drive_file_id;let selectedRevision=old.revision;
 if(req.query?.version){const version=String(req.query.version);if(!/^\d{1,12}$/.test(version))return reply(400,{error:'Revisão inválida'});const events=await teamDb('vistoria_audit?report_id=eq.'+encodeURIComponent(id)+'&revision=eq.'+version+'&select=drive_file_id');const file=events.find(e=>e.drive_file_id)?.drive_file_id;if(!file)return reply(404,{error:'Conteúdo desta revisão não está indexado'});fileId=file;selectedRevision=Number(version);}
 const document=await readPrivateReport(fileId);
 const bytes=Buffer.from(JSON.stringify(document),'utf8');
 if(req.query?.part!==undefined){const part=Number(req.query.part);const total=Math.ceil(bytes.length/750000);if(String(req.query.revision)!==String(selectedRevision))return reply(409,{error:'Revisão alterada durante download'});if(!Number.isInteger(part)||part<0||part>=total)return reply(400,{error:'Parte inválida'});return reply(200,{payload:bytes.subarray(part*750000,(part+1)*750000).toString('base64'),part,total,revision:selectedRevision});}
 if(bytes.length>3000000)return reply(200,{segmented:true,total:Math.ceil(bytes.length/750000),revision:selectedRevision,owner:old.owner_subject});
 return reply(200,{document,revision:selectedRevision,owner:old.owner_subject});
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
 if(req.body?.action==='restore'){
 if(m.role!=='admin')return reply(403,{error:'Somente administrador pode restaurar'});
 if(!old?.deleted_at)return reply(404,{error:'Vistoria não está na lixeira'});
 if(Number(req.body.revision)!==old.revision)return reply(409,{error:'Revisão alterada'});
 const revision=old.revision+1;
 const rows=await teamDb(filter+'&revision=eq.'+old.revision+'&deleted_at=not.is.null',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({deleted_at:null,revision,updated_at:new Date().toISOString()})});
 if(!rows.length)return reply(409,{error:'Revisão alterada'});
 await teamDb('vistoria_audit',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_subject:m.google_subject,report_id:id,action:'restore',revision,drive_file_id:old.drive_file_id})});
 return reply(200,{revision});
 }
 let doc=req.body?.document;
 if(['upload-part','upload-finish'].includes(req.body?.action)){
 const upload=String(req.body.upload_id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upload))return reply(400,{error:'Envio inválido'});
 if(old?.deleted_at||Number(req.body.revision)!==(old?.revision||0))return reply(409,{error:'Versão desatualizada'});
 const scope='vistoria_upload_parts?owner_subject=eq.'+encodeURIComponent(m.google_subject)+'&report_id=eq.'+encodeURIComponent(id)+'&upload_id=eq.'+upload;
 if(req.body.action==='upload-part'){
 const {part,payload}=req.body;if(!Number.isInteger(part)||part<0||part>15||typeof payload!=='string'||payload.length>1000000||! /^[A-Za-z0-9+/=]+$/.test(payload))return reply(400,{error:'Parte inválida'});
 await teamDb('vistoria_upload_parts?on_conflict=owner_subject,report_id,upload_id,part',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({owner_subject:m.google_subject,report_id:id,upload_id:upload,part,payload})});return reply(200,{ok:true});
 }
 const total=req.body.total;if(!Number.isInteger(total)||total<1||total>16)return reply(400,{error:'Quantidade inválida'});
 const parts=await teamDb(scope+'&select=part,payload&order=part.asc');if(parts.length!==total||parts.some((p,i)=>p.part!==i))return reply(409,{error:'Envio incompleto'});
 try{doc=JSON.parse(Buffer.from(parts.map(p=>p.payload).join(''),'base64').toString('utf8'));}catch{return reply(400,{error:'Documento inválido'});}
 }

 if(!doc||typeof doc!=='object'||Array.isArray(doc)||!doc.meta||!Array.isArray(doc.records)||Buffer.byteLength(JSON.stringify(doc),'utf8')>(req.body?.action==='upload-finish'?12000000:3500000))return reply(400,{error:'Documento inválido ou grande demais'});
 if(old?.deleted_at||Number(req.body.revision)!==(old?.revision||0))return reply(409,{error:'Versão desatualizada'});
 const revision=(old?.revision||0)+1;
 const file=await createPrivateReport(id,doc);
 const row={drive_file_id:file,revision,updated_at:new Date().toISOString()};
 const rows=old?await teamDb(filter+'&revision=eq.'+old.revision+'&deleted_at=is.null',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify(row)}):await teamDb(base,{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({...row,report_id:id,owner_subject:m.google_subject})});
 if(!rows.length)return reply(409,{error:'Revisão alterada'});
 await teamDb('vistoria_audit',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({actor_subject:m.google_subject,report_id:id,action:old?'update':'create',revision,drive_file_id:file})});
 if(req.body?.action==='upload-finish'){try{await teamDb('vistoria_upload_parts?owner_subject=eq.'+encodeURIComponent(m.google_subject)+'&report_id=eq.'+encodeURIComponent(id)+'&upload_id=eq.'+encodeURIComponent(req.body.upload_id),{method:'DELETE'});}catch{}}
 return reply(200,{revision});
 }catch{return reply(503,{error:'Não foi possível concluir a operação da equipe'});}
}
