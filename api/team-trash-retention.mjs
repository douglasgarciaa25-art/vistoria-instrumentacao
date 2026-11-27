import {timingSafeEqual} from 'node:crypto';
import {teamDb} from '../team-auth.mjs';
import {inspectExpiredFile,removeExpiredFile} from '../team-drive.mjs';
export const config={maxDuration:60};
export function authorizedCron(req,secret){
 if(req.method!=='GET'||typeof secret!=='string'||secret.length<32)return false;
 const a=Buffer.from(String(req.headers?.authorization||'')),b=Buffer.from('Bearer '+secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export async function purgeExpired({db=teamDb,inspect=inspectExpiredFile,remove=removeExpiredFile,now=Date.now,budget=40000}={}){
 const start=now(),expired=await db('rpc/vistoria_expire_trash',{method:'POST',body:JSON.stringify({p_limit:5})});
 const tasks=await db('vistoria_trash_purge_files?done_at=is.null&select=report_id,file_id,kind,verified_at&order=report_id.asc,file_id.asc&limit=50');
 let deleted=0,failed=0;
 for(const task of tasks){
  if(now()-start>=budget)break;
  try{
   const id=encodeURIComponent(task.report_id),file=encodeURIComponent(task.file_id);
   const rows=await db('vistoria_report_index?report_id=eq.'+id+'&select=report_id,purged_at,deleted_at,purge_completed_at');
   if(rows.length!==1||!rows[0].purged_at||!rows[0].deleted_at||rows[0].purge_completed_at)throw Error('Vistoria não expirada');
   const others=await db('vistoria_report_index?drive_file_id=eq.'+file+'&report_id=neq.'+id+'&select=report_id&limit=1');
   const audits=await db('vistoria_audit?drive_file_id=eq.'+file+'&report_id=neq.'+id+'&select=report_id&limit=1');
   if(others.length||audits.length)throw Error('Arquivo referenciado por outra vistoria');
   const result=await inspect(task);
   if(result.photos?.length)await db('vistoria_trash_purge_files?on_conflict=report_id,file_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(result.photos.map(file_id=>({report_id:task.report_id,file_id,kind:'photo'})))});
   const filter='vistoria_trash_purge_files?report_id=eq.'+id+'&file_id=eq.'+file+'&done_at=is.null';
   if(!result.missing){await db(filter,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({verified_at:new Date().toISOString()})});await remove(task.file_id);}
   await db(filter,{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({done_at:new Date().toISOString()})});deleted++;
  }catch{failed++;}
 }
 await db('rpc/vistoria_finish_trash',{method:'POST',body:'{}'});
 return {expired,deleted,failed};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!authorizedCron(req,process.env.CRON_SECRET))return res.status(403).json({error:'Acesso não autorizado'});
 try{return res.status(200).json(await purgeExpired());}catch{return res.status(503).json({error:'Limpeza pendente; será retomada na próxima execução'});}
}
