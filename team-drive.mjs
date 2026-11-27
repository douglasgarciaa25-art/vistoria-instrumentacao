import {createDecipheriv,createHash} from 'node:crypto';
import {teamDb} from './team-auth.mjs';
async function config(){const rows=await teamDb('vistoria_drive_config?id=eq.1&select=folder_id,credential');return rows[0];}
const API='https://www.googleapis.com/drive/v3/files';
let cached=null;
async function token(){
 if(cached&&cached.expires>Date.now()+60000)return cached.value;
 const {VISTORIA_GOOGLE_CLIENT_ID:client_id,VISTORIA_DRIVE_REFRESH_TOKEN:envRefresh}=process.env;
 const client_secret=process.env.vistoria_drive_client_secret||process.env.VISTORIA_DRIVE_CLIENT_SECRET;
 let refresh_token=envRefresh;
 if(!refresh_token&&client_secret){
 const c=await config();
 if(c){const [iv,tag,data]=c.credential.split('.').map(x=>Buffer.from(x,'base64url'));const d=createDecipheriv('aes-256-gcm',createHash('sha256').update(client_secret).digest(),iv);d.setAuthTag(tag);refresh_token=Buffer.concat([d.update(data),d.final()]).toString('utf8');}
 }
 if(!client_id||!client_secret||!refresh_token)throw Error('Drive central não autorizado');
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id,client_secret,refresh_token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000)});
 if(!r.ok)throw Error('Não foi possível renovar autorização Drive');
 const d=await r.json();if(!d.access_token)throw Error('Token Drive ausente');
 cached={value:d.access_token,expires:Date.now()+Number(d.expires_in||3600)*1000};return cached.value;
}
async function drive(url,options={}){
 const r=await fetch(url,{...options,headers:{...options.headers,Authorization:'Bearer '+await token()},signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Drive central: '+r.status);return r;
}
export async function checkCentralDrive(){
 const id=process.env.VISTORIA_DRIVE_FOLDER_ID||(await config())?.folder_id;
 if(!id)throw Error('Pasta central não configurada');
 const r=await drive(API+'/'+encodeURIComponent(id)+'?fields=id,mimeType,trashed,capabilities(canAddChildren)');
 const d=await r.json();
 if(d.trashed||d.mimeType!=='application/vnd.google-apps.folder'||!d.capabilities?.canAddChildren)throw Error('Pasta central inválida ou sem permissão');
 return d.id;
}
async function createJsonFile(reportId,document,folder){
 folder=folder||await checkCentralDrive();
 const boundary='vistoria_'+crypto.randomUUID();
 const metadata={name:'vistoria_'+reportId+'.json',mimeType:'application/json',parents:[folder]};
 const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(document)+'\r\n--'+boundary+'--\r\n';
 const r=await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 return (await r.json()).id;
}
async function readJsonFile(fileId){
 const r=await drive(API+'/'+encodeURIComponent(fileId)+'?alt=media');return r.json();
}

export async function createPrivateReport(reportId,document){
 const folder=await checkCentralDrive();
 const copy=JSON.parse(JSON.stringify(document));
 const groups=[...copy.records.map(r=>r.photos),...(copy.deletedPoints||[]).map(x=>x.point?.photos),copy.pending?.photos].filter(Array.isArray);
 const refs=[];
 for(const group of groups)for(const photo of group){
  if(typeof photo?.src!=='string'||!/^data:image\/(jpeg|png|webp);base64,/i.test(photo.src))continue;
  const file=await createJsonFile(reportId+'_foto',{src:photo.src},folder);
  refs.push(file);delete photo.src;photo.teamPhotoIndex=refs.length-1;
 }
 return createJsonFile(reportId,{format:'vistoria-team-v2',document:copy,photos:refs},folder);
}
export async function readPrivateReport(fileId,{withPhotos=true}={}){
 const packet=await readJsonFile(fileId);
 if(packet.format!=='vistoria-team-v2')return packet;
 const doc=packet.document;
 const groups=[...doc.records.map(r=>r.photos),...(doc.deletedPoints||[]).map(x=>x.point?.photos),doc.pending?.photos].filter(Array.isArray);
 for(const group of groups)for(const photo of group){
  if(!Number.isInteger(photo.teamPhotoIndex)||!withPhotos)continue;
  const id=packet.photos[photo.teamPhotoIndex];
  if(!id)throw Error('Referência de foto ausente');
  const data=await readJsonFile(id);
  if(typeof data.src!=='string')throw Error('Foto inválida');
  photo.src=data.src;delete photo.teamPhotoIndex;
 }
 return doc;
}

export function validTrashFile(meta,folder,reportId,kind){
 return !!meta&&meta.mimeType==='application/json'&&meta.ownedByMe===true&&meta.capabilities?.canDelete===true&&Array.isArray(meta.parents)&&meta.parents.length===1&&meta.parents[0]===folder&&meta.name==='vistoria_'+reportId+(kind==='photo'?'_foto':'')+'.json';
}
export async function inspectExpiredFile(task){
 if(!/^[A-Za-z0-9_-]{1,100}$/.test(task.report_id)||!['report','photo'].includes(task.kind)||!/^[A-Za-z0-9_-]{8,200}$/.test(task.file_id))throw Error('Identidade inválida');
 const folder=await checkCentralDrive();
 let meta;
 try{meta=await (await drive(API+'/'+encodeURIComponent(task.file_id)+'?fields=id,name,mimeType,ownedByMe,parents,capabilities(canDelete)')).json();}
 catch(e){if(task.verified_at&&e.message==='Drive central: 404')return {missing:true,photos:[]};throw e;}
 if(meta.id!==task.file_id||!validTrashFile(meta,folder,task.report_id,task.kind))throw Error('Arquivo fora do escopo autorizado');
 if(task.kind==='photo')return {photos:[]};
 const packet=await readJsonFile(task.file_id);
 if(packet.format!=='vistoria-team-v2'){if(!packet.meta||!Array.isArray(packet.records))throw Error('Revisão não reconhecida');return {photos:[]};}
 if(!packet.document?.meta||!Array.isArray(packet.document.records)||!Array.isArray(packet.photos)||packet.photos.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{8,200}$/.test(id)||id===task.file_id))throw Error('Referências de fotos inválidas');
 return {photos:[...new Set(packet.photos)]};
}
export async function removeExpiredFile(id){try{await drive(API+'/'+encodeURIComponent(id),{method:'DELETE'});}catch(e){if(e.message!=='Drive central: 404')throw e;}}
