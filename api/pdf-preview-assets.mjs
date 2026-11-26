import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const require=createRequire(import.meta.url);
const ASSETS=Object.freeze({
 engine:['legacy/build/pdf.min.mjs','text/javascript; charset=utf-8'],
 worker:['legacy/build/pdf.worker.min.mjs','text/javascript; charset=utf-8'],
 license:['LICENSE','text/plain; charset=utf-8']
});
export default async function handler(req,res){
 if(!['GET','HEAD'].includes(req.method)){res.setHeader('Allow','GET, HEAD');return res.status(405).end()}
 const name=req.query?.asset;
 if(typeof name!=='string'||!Object.hasOwn(ASSETS,name))return res.status(404).end();
 const [file,type]=ASSETS[name];
 try{
  let path;try{path=require.resolve('pdfjs-dist/'+file)}catch{path=resolve(process.cwd(),'node_modules/pdfjs-dist',file)}
  const bytes=await readFile(path);
  res.setHeader('Content-Type',type);res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('Content-Length',String(bytes.length));
  return req.method==='HEAD'?res.status(200).end():res.status(200).end(bytes);
 }catch{res.setHeader('Cache-Control','no-store');return res.status(503).end('Visualizador indisponível')}
}
