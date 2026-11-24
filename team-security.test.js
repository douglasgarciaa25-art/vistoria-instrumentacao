import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './api/team-reports.mjs';
test('API da equipe: autorização, propriedade, lixeira e partes',async()=>{
 const original=globalThis.fetch;const env={...process.env};
 process.env.VISTORIA_GOOGLE_CLIENT_ID='test-client';process.env.my_super_base_secrety_key133='test-only';
 let staged=[],member={google_subject:'tech',role:'technician',status:'approved'},calls=[];
 globalThis.fetch=async(url,opts={})=>{
  url=String(url);calls.push({url,method:opts.method||'GET'});
  if(url.startsWith('https://oauth2.googleapis.com/'))return Response.json({aud:'test-client',email_verified:true,sub:'tech',email:'test@example.invalid'});
  if(url.includes('vistoria_members?'))return Response.json([member]);
  if(url.includes('vistoria_report_index?'))return Response.json([{report_id:'r1',owner_subject:'other',revision:2,deleted_at:null}]);
  if(url.includes('vistoria_upload_parts?')){if(opts.method==='DELETE')return new Response(null,{status:204});return Response.json(staged);}
  throw Error('Unexpected network request '+url);
 };
 async function invoke(method,query={},body={},token=true){let status,payload;await handler({method,query,body,headers:token?{authorization:'Bearer fake-token'}:{}},{setHeader(){},status(s){status=s;return this},json(p){payload=p;return this}});return {status,payload};}
 try{
  assert.equal((await invoke('GET',{}, {},false)).status,403);assert.equal(calls.length,0);
  member.status='blocked';assert.equal((await invoke('GET')).status,403);
  member.status='pending';assert.equal((await invoke('GET')).status,403);
  member.status='approved';assert.equal((await invoke('GET',{trash:'1'})).status,403);
  assert.equal((await invoke('POST',{id:'r1'},{revision:1,document:{meta:{},records:[]}})).status,409);
  assert.equal((await invoke('DELETE',{id:'r1'})).status,403);
  assert.equal((await invoke('POST',{id:'r1'},{action:'upload-part',revision:2})).status,400);
  assert.equal((await invoke('POST',{id:'r1'},{action:'restore',revision:2})).status,403);
  member.role='admin';assert.equal((await invoke('POST',{id:'r1'},{action:'upload-part',upload_id:'invalid',revision:2})).status,400);
  assert.equal((await invoke('POST',{id:'r1'},{action:'upload-status',upload_id:'00000000-0000-4000-8000-000000000000',revision:1})).status,409);
  assert.equal((await invoke('GET',{id:'../bad'})).status,400);
  assert.ok(calls.every(c=>c.method==='GET'));
  const upload_id='00000000-0000-4000-8000-000000000000';
  const base={upload_id,revision:2};
  assert.equal((await invoke('POST',{id:'r1'},{...base,action:'upload-part',part:16,payload:'AAAA'})).status,400);
  assert.equal((await invoke('POST',{id:'r1'},{...base,action:'upload-finish',total:2})).status,409);
  staged=[{part:0,payload:Buffer.from(JSON.stringify({meta:{},records:[]})).toString('base64')}];
  assert.equal((await invoke('POST',{id:'r1'},{...base,action:'upload-finish',total:1,sha256:'wrong'})).status,400);
  assert.deepEqual((await invoke('POST',{id:'r1'},{...base,action:'upload-status'})).payload,{parts:[0]});
 }finally{globalThis.fetch=original;for(const k of ['VISTORIA_GOOGLE_CLIENT_ID','my_super_base_secrety_key133']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
