import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './api/team-reports.mjs';

test('API: busca remota da OS exige Google aprovado, não carrega fotos nem altera dados',async()=>{
 const original=globalThis.fetch;
 const envKeys=['VISTORIA_GOOGLE_CLIENT_ID','VISTORIA_DRIVE_CLIENT_SECRET','VISTORIA_DRIVE_REFRESH_TOKEN','my_super_base_secrety_key133'];
 const env=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 for(const k of envKeys)process.env[k]='synthetic-only';
 let allowed=true;
 const calls=[];
 const docs={
  f1:{format:'vistoria-team-v2',document:{meta:{workOrder:'00000100'},records:[{tag:'TC01',pointWorkOrder:'000045',photos:[{teamPhotoIndex:0}]}]},photos:['photo-private']},
  f2:{format:'vistoria-team-v2',document:{meta:{workOrder:'00000200'},records:[{tag:'TC02',pointWorkOrder:'000045',photos:[]}]},photos:[]},
 };
 globalThis.fetch=async (url,opts={})=>{
  url=String(url);calls.push({url,method:opts.method||'GET'});
  if(url.startsWith('https://oauth2.googleapis.com/tokeninfo?'))return Response.json({aud:'synthetic-only',email_verified:true,sub:'synthetic-google-subject',email:'synthetic@example.invalid'});
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fake-only',expires_in:3600});
  if(url.includes('vistoria_members?'))return Response.json([{google_subject:'synthetic-google-subject',role:'technician',email:'synthetic@example.invalid',status:allowed?'approved':'blocked'}]);
  if(url.includes('vistoria_report_index?')){
   assert.match(url,/deleted_at=is.null/,'Nunca pesquisar registros excluídos');
   const offset=Number(new URL(url).searchParams.get('offset'));
   const rows=[{report_id:'r1',drive_file_id:'f1',revision:2},{report_id:'r2',drive_file_id:'f2',revision:3}];
   return Response.json(rows.slice(offset,offset+20));
  }
  if(url.startsWith('https://www.googleapis.com/drive/v3/files/')){
   const id=url.split('/').pop().split('?')[0];
   if(!docs[id])throw Error('Tentou baixar foto ou arquivo não autorizado: '+id);
   return Response.json(docs[id]);
  }
  throw Error('Requisição imprevista: '+url);
 };
 async function invoke(query,token=true){
  let status,payload;
  await handler({method:'GET',query,headers:token?{authorization:'Bearer fake-oauth'}:{}},{
   setHeader(){},status(s){status=s;return this},json(p){payload=p;return this}
  });
  return {status,payload};
 }
 try{
  assert.equal((await invoke({os:'000045'},false)).status,403);
  allowed=false;assert.equal((await invoke({os:'000045'})).status,403);
  allowed=true;
  assert.equal((await invoke({os:'%*'})).status,400);
  assert.equal((await invoke({os:'000045',offset:'-10'})).status,400);
  assert.equal((await invoke({os:'000045',match:'invalido'})).status,400);
  const exact=await invoke({os:'000045',match:'exact'});
  assert.equal(exact.status,200);
  assert.deepEqual(exact.payload.matches.map(v=>v.report_id),['r1','r2']);
  assert.deepEqual(exact.payload.matches.map(v=>v.os),['000045','000045']);
  assert.equal(exact.payload.next_offset,null);
  assert.equal(exact.payload.scanned,2);
  const partial=await invoke({os:'000001',match:'partial'});
  assert.equal(partial.status,200);
  assert.deepEqual(partial.payload.matches.map(v=>v.os),['00000100']);
  const next=await invoke({os:'000045',offset:'20'});
  assert.equal(next.status,200);
  assert.equal(next.payload.scanned,0);
  assert.equal(next.payload.matches.length,0);
  assert.ok(!calls.some(c=>c.url.includes('photo-private')),'Não deve acessar nenhuma foto na busca');
  assert.ok(!calls.some(c=>c.url.includes('vistoria_report_index?')&&c.method!=='GET'),'Consulta não pode modificar registros');
 }finally{
  globalThis.fetch=original;
  for(const k of envKeys){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}
 }
});
test('interface dispõe de busca OS global e não mistura com a pesquisa local',async()=>{
 const {readFileSync}=await import('node:fs');
 const ui=readFileSync('google-drive-sync.js','utf8');
 assert.match(ui,/Pesquisar OS em todas as vistorias da equipe/);
 assert.match(ui,/Criar cópia local para consultar/);
 assert.match(ui,/match='\+mode\+'&offset=/);
 assert.match(ui,/teamRequest\(\)/);
});
