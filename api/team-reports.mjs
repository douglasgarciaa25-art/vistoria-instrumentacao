import {createHash} from 'node:crypto';
import {approvedMember,teamDb} from '../team-auth.mjs';
import {pointChanges} from '../point-audit-core.mjs';
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
 if(req.query?.technician!==undefined){
 const term=String(req.query.technician||'').normalize('NFC').trim();
 if(term.length<3||term.length>80||/[\x00-\x1f*(),]/.test(term))return reply(400,{error:'Informe ao menos 3 letras do nome cadastrado'});
 const query='vistoria_point_audit?actor_name=ilike.'+encodeURIComponent('*'+term+'*')+'&action=eq.completed&select=report_id,point_id,tag_snapshot,work_order_snapshot,actor_name,occurred_at&order=occurred_at.desc&limit=100';
 return reply(200,{matches:await teamDb(query)});
 }
 const trash=req.query?.trash==='1';
 if(trash&&m.role!=='admin')return reply(403,{error:'Somente administrador pode consultar a lixeira'});
 return reply(200,{reports:await teamDb(base+'?deleted_at='+ (trash?'not.is.null':'is.null')+'&select=report_id,owner_subject,revision,updated_at,deleted_at&order=updated_at.desc')});
 }
 if(!valid)return reply(400,{error:'Identificador inválido'});
 const filter=base+'?report_id=eq.'+encodeURIComponent(id);
 const old=(await teamDb(filter))[0];
 if(req.method==='GET'){
 if(!old||(old.deleted_at&&!(m.role==='admin'&&req.query?.history==='1')))return reply(404,{error:'Vistoria não encontrada'});
 if(req.query?.history==='1'){const history=await teamDb('vistoria_audit?report_id=eq.'+encodeURIComponent(id)+'&select=action,revision,occurred_at,actor_subject,actor_name,drive_file_id&order=occurred_at.desc');const pointHistory=await teamDb('vistoria_point_audit?report_id=eq.'+encodeURIComponent(id)+'&select=point_id,action,revision,occurred_at,actor_subject,actor_name,tag_snapshot,work_order_snapshot,previous_status,current_status&order=occurred_at.desc&limit=500');const members=await teamDb('vistoria_members?select=google_subject,email');const names=new Map(members.map(v=>[v.google_subject,v.email]));return reply(200,{history:history.map(({drive_file_id,...event})=>({...event,actor_email:names.get(event.actor_subject)||null,available:!!drive_file_id})),pointHistory:pointHistory.map(event=>({...event,actor_email:names.get(event.actor_subject)||null}))});}
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
 const revision=await teamDb('rpc/vistoria_change_report_state',{method:'POST',body:JSON.stringify({p_report_id:id,p_actor_subject:m.google_subject,p_expected_revision:old.revision,p_action:'delete'})});
 if(!Number.isSafeInteger(revision)||revision<1)return reply(409,{error:'Revisão alterada'});
 return reply(200,{ok:true,revision});
 }
 if(req.method!=='POST')return reply(405,{error:'Método inválido'});
 if(req.body?.action==='restore'){
 if(m.role!=='admin')return reply(403,{error:'Somente administrador pode restaurar'});
 if(!old?.deleted_at)return reply(404,{error:'Vistoria não está na lixeira'});
 if(Number(req.body.revision)!==old.revision)return reply(409,{error:'Revisão alterada'});
 const revision=await teamDb('rpc/vistoria_change_report_state',{method:'POST',body:JSON.stringify({p_report_id:id,p_actor_subject:m.google_subject,p_expected_revision:old.revision,p_action:'restore'})});
 if(!Number.isSafeInteger(revision)||revision<1)return reply(409,{error:'Revisão alterada'});
 return reply(200,{revision});
 }
 let doc=req.body?.document;
 if(['upload-part','upload-finish','upload-status'].includes(req.body?.action)){
 const upload=String(req.body.upload_id||'');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(upload))return reply(400,{error:'Envio inválido'});
 if(old?.deleted_at||Number(req.body.revision)!==(old?.revision||0))return reply(409,{error:'Versão desatualizada'});
 const ownerScope='vistoria_upload_parts?owner_subject=eq.'+encodeURIComponent(m.google_subject);const cutoff=new Date(Date.now()-86400000).toISOString();await teamDb(ownerScope+'&created_at=lt.'+encodeURIComponent(cutoff),{method:'DELETE'});
 const scope='vistoria_upload_parts?owner_subject=eq.'+encodeURIComponent(m.google_subject)+'&report_id=eq.'+encodeURIComponent(id)+'&upload_id=eq.'+upload;
 if(req.body.action==='upload-status'){const parts=await teamDb(scope+'&select=part&order=part.asc');return reply(200,{parts:parts.map(p=>p.part)});}
 if(req.body.action==='upload-part'){
 const {part,payload}=req.body;if(!Number.isInteger(part)||part<0||part>15||typeof payload!=='string'||payload.length>1000000||! /^[A-Za-z0-9+/=]+$/.test(payload))return reply(400,{error:'Parte inválida'});
 const existing=await teamDb(ownerScope+'&select=report_id,upload_id,part&limit=65');if(existing.length>=64&&!existing.some(p=>p.report_id===id&&p.upload_id===upload&&p.part===part))return reply(429,{error:'Limite de envios temporários atingido. Conclua os envios pendentes.'});
 await teamDb('vistoria_upload_parts?on_conflict=owner_subject,report_id,upload_id,part',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({owner_subject:m.google_subject,report_id:id,upload_id:upload,part,payload})});return reply(200,{ok:true});
 }
 const total=req.body.total;if(!Number.isInteger(total)||total<1||total>16)return reply(400,{error:'Quantidade inválida'});
 const parts=await teamDb(scope+'&select=part,payload&order=part.asc');if(parts.length!==total||parts.some((p,i)=>p.part!==i))return reply(409,{error:'Envio incompleto'});
 try{const bytes=Buffer.from(parts.map(p=>p.payload).join(''),'base64');if(req.body.sha256&&createHash('sha256').update(bytes).digest('hex')!==req.body.sha256)return reply(400,{error:'Integridade do envio inválida'});doc=JSON.parse(bytes.toString('utf8'));}catch{return reply(400,{error:'Documento inválido'});}
 }

 if(!doc||typeof doc!=='object'||Array.isArray(doc)||!doc.meta||!Array.isArray(doc.records)||Buffer.byteLength(JSON.stringify(doc),'utf8')>(req.body?.action==='upload-finish'?12000000:3500000))return reply(400,{error:'Documento inválido ou grande demais'});
 if(old?.deleted_at||Number(req.body.revision)!==(old?.revision||0))return reply(409,{error:'Versão desatualizada'});
 // Somente diferenças entre IDs permanentes recebem autoria verificável.
 let events;
 try{const previous=old?.drive_file_id?await readPrivateReport(old.drive_file_id,{withPhotos:false}):null;events=pointChanges(previous,doc);}
 catch(e){return reply(400,{error:'Não foi possível validar os identificadores dos pontos'});}
 const file=await createPrivateReport(id,doc);
 // CAS + auditoria do relatório e dos pontos numa única transação PostgreSQL.
 const revision=await teamDb('rpc/vistoria_commit_report',{method:'POST',body:JSON.stringify({p_report_id:id,p_actor_subject:m.google_subject,p_owner_subject:old?.owner_subject||m.google_subject,p_expected_revision:old?.revision||0,p_drive_file_id:file,p_events:events})});
 if(!Number.isSafeInteger(revision)||revision<1)return reply(409,{error:'Revisão alterada durante o envio'});
 if(req.body?.action==='upload-finish'){try{await teamDb('vistoria_upload_parts?owner_subject=eq.'+encodeURIComponent(m.google_subject)+'&report_id=eq.'+encodeURIComponent(id)+'&upload_id=eq.'+encodeURIComponent(req.body.upload_id),{method:'DELETE'});}catch{}}
 return reply(200,{revision});
 }catch{return reply(503,{error:'Não foi possível concluir a operação da equipe'});}
}
