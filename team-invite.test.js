import test from 'node:test';
import assert from 'node:assert/strict';
import handler from './api/team.mjs';
test('convite por e-mail exige administrador; primeiro acesso usa identidade Google verificada',async()=>{
 const original=globalThis.fetch,env={...process.env};process.env.VISTORIA_GOOGLE_CLIENT_ID='test-client';process.env.my_super_base_secrety_key133='test-only';
 let member={google_subject:'subject_admin',role:'admin',status:'approved'},identity={sub:'subject_admin',email:'admin@example.invalid'},rpc=[];
 globalThis.fetch=async(url,opts={})=>{
  url=String(url);
  if(url.startsWith('https://oauth2.googleapis.com/'))return Response.json({aud:'test-client',email_verified:true,...identity});
  if(url.includes('vistoria_members?'))return Response.json([member]);
  if(url.includes('rpc/vistoria_invite_action')){const b=JSON.parse(opts.body);rpc.push(b);if(b.p_action==='claim'){member={...member,status:'approved'};return Response.json('claimed')}return Response.json('invited');}
  throw Error('Unexpected request');
 };
 async function invoke(body){let status,payload;await handler({method:'POST',query:{},body,headers:{authorization:'Bearer fake-token'}},{setHeader(){},status(s){status=s;return this},json(p){payload=p;return this}});return {status,payload}}
 try{
  assert.equal((await invoke({action:'invite',email:'bad',name:'Nome válido'})).status,400);
  assert.equal((await invoke({action:'invite',email:' TECH@EXAMPLE.INVALID ',name:'Nome válido'})).status,200);
  assert.deepEqual(rpc.at(-1),{p_action:'invite',p_actor:'subject_admin',p_email:'tech@example.invalid',p_name:'Nome válido'});
  member={google_subject:'subject_tech',role:'technician',status:'pending'};identity={sub:'subject_tech',email:'tech@example.invalid'};
  assert.equal((await invoke({action:'invite',email:'other@example.invalid',name:'Outro técnico'})).status,403);
  const claim=await invoke({action:'request',email:'other@example.invalid'});assert.equal(claim.payload.member.status,'approved');assert.equal(rpc.at(-1).p_email,'tech@example.invalid');assert.equal(rpc.at(-1).p_actor,'subject_tech');
  member.status='blocked';const before=rpc.length;assert.equal((await invoke({action:'request'})).payload.member.status,'blocked');assert.equal(rpc.length,before);
 }finally{globalThis.fetch=original;for(const k of ['VISTORIA_GOOGLE_CLIENT_ID','my_super_base_secrety_key133']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k]}}
});
