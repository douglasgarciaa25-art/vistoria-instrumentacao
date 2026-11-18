import test from 'node:test';
import assert from 'node:assert/strict';
import {createCipheriv,createHash,randomBytes} from 'node:crypto';
import handler from './api/personal-session.mjs';
test('sessão persistente: origem, expiração, bloqueio e identidade',async()=>{
 const original=globalThis.fetch;const key='vistoria_drive_client_secret',old=process.env[key];process.env[key]='test-secret';
 const dbKey='my_super_base_secrety_key133',oldDb=process.env[dbKey];process.env[dbKey]='test-only';
 let status='approved',calls=0;
 globalThis.fetch=async(url)=>{calls++;if(String(url).includes('vistoria_members'))return Response.json([{google_subject:'test-sub',email:'test@example.invalid',status}]);if(String(url).includes('oauth2.googleapis.com/token'))return Response.json({access_token:'fake',expires_in:3600});throw Error('Unexpected request');};
 function cookie(exp){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',createHash('sha256').update('personal:test-secret').digest(),iv);const encrypted=Buffer.concat([c.update(JSON.stringify({sub:'test-sub',refresh:'fake',exp})),c.final()]);return 'vistoria_personal='+[iv,c.getAuthTag(),encrypted].map(b=>b.toString('base64url')).join('.');}
 async function invoke(cookie,origin='https://vistoria-instrumentacao.vercel.app'){let code,payload;await handler({method:'POST',headers:{cookie,origin}},{setHeader(){},status(s){code=s;return this},json(p){payload=p;return this}});return {code,payload};}
 try{assert.equal((await invoke(cookie(Date.now()+60000),'https://example.invalid')).code,403);assert.equal((await invoke(cookie(Date.now()-1))).code,401);assert.equal((await invoke(cookie(undefined))).code,401);assert.equal(calls,0);status='blocked';assert.equal((await invoke(cookie(Date.now()+60000))).code,403);status='approved';const result=await invoke(cookie(Date.now()+60000));assert.equal(result.code,200);assert.equal(result.payload.subject,'test-sub');}finally{globalThis.fetch=original;if(oldDb===undefined)delete process.env[dbKey];else process.env[dbKey]=oldDb;if(old===undefined)delete process.env[key];else process.env[key]=old;}
});
