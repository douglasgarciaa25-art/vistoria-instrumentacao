const API='https://www.googleapis.com/drive/v3/files';
let cached=null;
async function token(){
 if(cached&&cached.expires>Date.now()+60000)return cached.value;
 const {VISTORIA_GOOGLE_CLIENT_ID:client_id,VISTORIA_DRIVE_CLIENT_SECRET:client_secret,VISTORIA_DRIVE_REFRESH_TOKEN:refresh_token}=process.env;
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
 const id=process.env.VISTORIA_DRIVE_FOLDER_ID;
 if(!id)throw Error('Pasta central não configurada');
 const r=await drive(API+'/'+encodeURIComponent(id)+'?fields=id,mimeType,trashed,capabilities(canAddChildren)');
 const d=await r.json();
 if(d.trashed||d.mimeType!=='application/vnd.google-apps.folder'||!d.capabilities?.canAddChildren)throw Error('Pasta central inválida ou sem permissão');
 return d.id;
}
export async function createPrivateReport(reportId,document){
 const folder=await checkCentralDrive();
 const boundary='vistoria_'+crypto.randomUUID();
 const metadata={name:'vistoria_'+reportId+'.json',mimeType:'application/json',parents:[folder]};
 const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+JSON.stringify(document)+'\r\n--'+boundary+'--\r\n';
 const r=await drive('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
 return (await r.json()).id;
}
export async function readPrivateReport(fileId){
 const r=await drive(API+'/'+encodeURIComponent(fileId)+'?alt=media');return r.json();
}
