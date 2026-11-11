import {put,get,list,del} from '@vercel/blob';
import {createHash,timingSafeEqual} from 'node:crypto';
const ROOT='vistoria-v1/',UUID=/^[a-f0-9-]{36}$/;
const opts={access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json'};
async function all(prefix){let rows=[],cursor;do{const r=await list({prefix,cursor,limit:1000});rows.push(...r.blobs);cursor=r.hasMore?r.cursor:undefined}while(cursor);return rows}
async function read(path){const r=await get(path,{access:'private',useCache:false});if(!r||r.statusCode!==200)return null;return JSON.parse(await new Response(r.stream).text())}
async function readMany(rows){const items=[];for(let i=0;i<rows.length;i+=8)items.push(...await Promise.all(rows.slice(i,i+8).map(row=>read(row.pathname))));return items.filter(Boolean)}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');const reply=(status,value)=>res.status(status).json(value);
 const expected=process.env.VISTORIA_ACCESS_HASH;if(!expected||!process.env.BLOB_READ_WRITE_TOKEN)return reply(503,{error:'Nuvem ainda não configurada.'});
 const key=String(req.headers.authorization||'').replace(/^Bearer /,'');const hashed=createHash('sha256').update(key).digest();if(!/^[a-f0-9]{64}$/.test(expected)||!timingSafeEqual(hashed,Buffer.from(expected,'hex')))return reply(401,{error:'Chave de acesso inválida.'});
 try{const u=new URL(req.url,'https://vistoria.local'),action=u.searchParams.get('action')||'list',id=u.searchParams.get('id'),part=u.searchParams.get('part');
 if(req.method==='GET'&&action==='check')return reply(200,{ok:true});
 if(req.method==='GET'&&action==='list'){const items=await readMany(await all(ROOT+'manifests/'));return reply(200,{items:items.sort((a,b)=>b.created.localeCompare(a.created))})}
 if(req.method==='GET'&&action==='sync-list'){
 const items=await readMany(await all(ROOT+'sync/'));
 return reply(200,{items});
 }
 if(!id||!UUID.test(id))return reply(400,{error:'Identificador inválido.'});
 const manifestPath=ROOT+'manifests/'+id+'.json',prefix=ROOT+'parts/'+id+'/';
 if(req.method==='GET'&&action==='manifest'){const m=await read(manifestPath);return reply(m?200:404,m||{error:'Cópia não encontrada.'})}
 if(req.method==='GET'&&action==='part'){if(!/^\d{1,3}$/.test(part||'')||+part>299)return reply(400,{error:'Parte inválida.'});const p=await read(prefix+part+'.json');return reply(p?200:404,p||{error:'Parte não encontrada.'})}
 if(req.method==='DELETE'&&action==='delete'){await del(manifestPath);const rows=await all(prefix);if(rows.length)await del(rows.map(r=>r.url));return reply(200,{ok:true})}
 let body=req.body;if(typeof body==='string')body=JSON.parse(body);if(!body)body={};
 if(req.method==='POST'&&action==='part'){if(!/^\d{1,3}$/.test(part||'')||+part>299||typeof body.chunk!=='string'||body.chunk.length>750000)return reply(400,{error:'Parte inválida ou muito grande.'});await put(prefix+part+'.json',JSON.stringify({chunk:body.chunk}),opts);return reply(200,{ok:true})}
 if(req.method==='POST'&&action==='sync-commit'){
 if(!UUID.test(body.reportId||'')||!Array.isArray(body.parents)||body.parents.length>100||!body.parents.every(p=>UUID.test(p))||!Number.isInteger(body.parts)||body.parts<1||body.parts>300||!Number.isInteger(body.length)||body.length<1||body.length>225000000)return reply(400,{error:'Revisão inválida.'});
 const path=ROOT+'sync/'+id+'.json';const existing=await read(path);if(existing)return reply(200,existing);
 let text='';for(let i=0;i<body.parts;i++){const p=await read(prefix+i+'.json');if(!p||typeof p.chunk!=='string')return reply(409,{error:'Envio incompleto.'});text+=p.chunk}
 if(text.length!==body.length)return reply(409,{error:'Envio incompleto.'});
 const value=JSON.parse(text);if(typeof value.deleted!=='boolean'||(!value.deleted&&(!value.document||value.document.version!==1||!Array.isArray(value.document.records))))return reply(400,{error:'Dados inválidos.'});
 for(const parent of body.parents){const previous=await read(ROOT+'sync/'+parent+'.json');if(!previous||previous.reportId!==body.reportId)return reply(409,{error:'Revisão anterior indisponível.'})}
 const m={id,reportId:body.reportId,parents:body.parents,parts:body.parts,length:body.length,created:new Date().toISOString(),deleted:value.deleted};
 await put(path,JSON.stringify(m),opts);return reply(200,m);
 }
 if(req.method==='POST'&&action==='commit'){if(!Number.isInteger(body.parts)||body.parts<1||body.parts>300||!Number.isInteger(body.count)||body.count<1||!Number.isInteger(body.length)||body.length<1||body.length>225000000)return reply(400,{error:'Cópia inválida.'});const rows=await all(prefix);if(rows.length!==body.parts||Array.from({length:body.parts},(_,i)=>prefix+i+'.json').some(p=>!rows.some(r=>r.pathname===p)))return reply(409,{error:'Envio incompleto. Tente salvar uma nova cópia.'});const m={id,created:new Date().toISOString(),parts:body.parts,count:body.count,length:body.length,label:String(body.label||'Vistorias').slice(0,160)};await put(manifestPath,JSON.stringify(m),opts);return reply(200,m)}
 return reply(405,{error:'Operação não permitida.'});
 }catch(e){console.error('Cloud operation failed:',e.name);return reply(500,{error:'Falha na operação. Seus formulários locais foram preservados.'})}
}
