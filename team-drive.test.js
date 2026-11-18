import test from 'node:test';
import assert from 'node:assert/strict';
import {createPrivateReport,readPrivateReport} from './team-drive.mjs';
test('Drive: relatório com fotos separadas e reconstrução integral',async()=>{
 const original=globalThis.fetch;const keys=['VISTORIA_GOOGLE_CLIENT_ID','VISTORIA_DRIVE_CLIENT_SECRET','VISTORIA_DRIVE_REFRESH_TOKEN','VISTORIA_DRIVE_FOLDER_ID'];const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)process.env[k]='test-only';
 const files=new Map();let next=0;
 globalThis.fetch=async(url,opts={})=>{
  url=String(url);
  if(url==='https://oauth2.googleapis.com/token')return Response.json({access_token:'fake',expires_in:3600});
  if(url.includes('fields=id,mimeType'))return Response.json({id:'folder',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}});
  if(url.includes('uploadType=multipart')){const parts=opts.body.split('\r\n');const payload=JSON.parse(parts[7]);const id='file'+(++next);files.set(id,payload);return Response.json({id});}
  if(url.includes('?alt=media'))return Response.json(files.get(url.split('/').pop().split('?')[0]));
  throw Error('Unexpected request');
 };
 try{
  const photo={src:'data:image/jpeg;base64,'+'A'.repeat(800000),caption:'Teste'};
  const doc={meta:{title:'Simulado'},records:[{tag:'TEST',photos:[photo,photo]}],pending:{photos:[photo]}};
  const snapshot=structuredClone(doc);const id=await createPrivateReport('test',doc);
  assert.equal(files.size,4);assert.equal(files.get(id).photos.length,3);assert.equal(files.get(id).document.records[0].photos[0].src,undefined);
  assert.deepEqual(await readPrivateReport(id),snapshot);assert.deepEqual(doc,snapshot);
 }finally{globalThis.fetch=original;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
