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
  const doc={meta:{title:'Simulado'},records:[{tag:'TEST',photos:[photo,photo]}],deletedPoints:[{point:{tag:'EXCLUIDO',pointId:'uuid_11111111',photos:[photo]},deletedAt:'2026-11-18T00:00:00Z'}],pending:{photos:[photo]}};
  const snapshot=structuredClone(doc);const id=await createPrivateReport('test',doc);
  assert.equal(files.size,5);assert.equal(files.get(id).photos.length,4);assert.equal(files.get(id).document.records[0].photos[0].src,undefined);
  assert.deepEqual(await readPrivateReport(id),snapshot);const withoutPhotos=await readPrivateReport(id,{withPhotos:false});assert.equal(withoutPhotos.deletedPoints[0].point.photos[0].src,undefined);assert.equal(withoutPhotos.deletedPoints[0].point.photos[0].teamPhotoIndex,2);assert.deepEqual(doc,snapshot);
  // Oito fotografias sintéticas num único ponto (nenhum dado ou foto real).
  const eight=Array.from({length:8},(_,i)=>({src:'data:image/jpeg;base64,'+'B'.repeat(12000),caption:'Foto '+(i+1)}));
  const large={meta:{title:'Teste de oito fotos',workOrder:'000200'},records:[{tag:'TC_STRESS',pointWorkOrder:'000201',photos:eight}],pending:{photos:[]}};
  const largeId=await createPrivateReport('stress',large);
  const restored=await readPrivateReport(largeId);
  assert.deepEqual(restored,large,'As oito fotos, suas legendas e OS devem ser recuperadas sem perda.');
  assert.equal(files.size,14,'Oito fotos e mais um pacote criados, além do relatório anterior.');
 }finally{globalThis.fetch=original;for(const k of keys){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}}
});
