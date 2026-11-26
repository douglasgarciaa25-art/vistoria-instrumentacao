import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync('pdf-export.js','utf8');
const preview=source.slice(0,source.indexOf('/* Relatório A4'));
function fixture({fail=false}={}){
 const elems=[],revoked=[],downloads=[],pages=[];let destroyed=0,options;
 class Element{
  constructor(tag){this.tag=tag;this.style={};this.children=[];this.listeners={};this.clientWidth=360;elems.push(this)}
  append(...items){this.children.push(...items)}
  replaceChildren(...items){this.children=items}
  setAttribute(){}
  addEventListener(event,cb){this.listeners[event]=cb}
  showModal(){this.open=true}
  close(){this.open=false;this.listeners.close?.()}
  remove(){this.removed=true}
  getContext(){return {}}
 }
 const document={createElement:t=>new Element(t),body:new Element('body')};
 const context=vm.createContext({document,window:{devicePixelRatio:2},Uint8Array,URL:{createObjectURL:()=> 'blob:sample',revokeObjectURL:u=>revoked.push(u)},download:(b,n)=>downloads.push([b,n])});
 vm.runInContext(preview,context);
 const lib={GlobalWorkerOptions:{},getDocument(o){options=o;return {destroy:async()=>{destroyed++},promise:fail?Promise.reject(Error('bad pdf')):Promise.resolve({numPages:3,async getPage(n){pages.push(n);return {getViewport:({scale})=>({width:595*scale,height:842*scale}),render:()=>({promise:Promise.resolve(),cancel(){}}),cleanup(){}}}})}}};
 context.loadPdfPreviewEngine=async()=>lib;
 const blob={arrayBuffer:async()=>new Uint8Array([37,80,68,70]).buffer};
 return {context,blob,elems,revoked,downloads,pages,lib,get options(){return options},get destroyed(){return destroyed},find:t=>elems.find(x=>x.textContent===t),dialog:()=>elems.find(e=>e.tag==='dialog')};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('prévia renderiza o PDF real localmente, navega páginas e preserva download',async()=>{
 const f=fixture();await f.context.previewGeneratedPdf(f.blob,'relatorio.pdf');
 assert.equal(f.elems.filter(x=>x.tag==='iframe').length,0);
 assert.equal(f.elems.filter(x=>x.tag==='canvas').length,1);
 assert.deepEqual(f.pages,[1]);assert.equal(f.options.isEvalSupported,false);
 assert.equal(f.options.useWasm,false);assert.equal(f.lib.GlobalWorkerOptions.workerSrc,'/pdf-preview-assets/5.4.624/worker.mjs');
 assert.equal(f.find('‹ Anterior').disabled,true);assert.equal(f.find('Próxima ›').disabled,false);
 f.find('Próxima ›').onclick();await tick();assert.deepEqual(f.pages,[1,2]);assert.ok(f.find('Página 2 / 3'));
 f.find('+').onclick();await tick();assert.ok(f.find('125%'));
 f.find('Baixar PDF').onclick();assert.equal(f.downloads[0][0],f.blob);assert.equal(f.downloads[0][1],'relatorio.pdf');
 f.dialog().close();assert.equal(f.destroyed,1);assert.deepEqual(f.revoked,['blob:sample']);assert.equal(f.dialog().removed,true);
});
test('falha do motor mantém abrir e baixar PDF sem tela escura',async()=>{
 const f=fixture({fail:true});await f.context.previewGeneratedPdf(f.blob,'relatorio.pdf');
 assert.ok(f.find('Prévia indisponível'));assert.equal(f.find('Abrir PDF').href,'blob:sample');
 f.find('Baixar PDF').onclick();assert.equal(f.downloads.length,1);assert.equal(f.find('Próxima ›').disabled,true);f.dialog().close();
});
test('motor PDF tem versão fixa e recursos locais publicados e preparados para offline',()=>{
 const cfg=JSON.parse(readFileSync('vercel.json','utf8')),pkg=JSON.parse(readFileSync('package.json','utf8')),sw=readFileSync('sw.js','utf8');
 assert.equal(pkg.dependencies['pdfjs-dist'],'5.4.624');
 for(const a of ['engine','worker']){assert.ok(cfg.routes.some(r=>r.dest==='/api/pdf-preview-assets.mjs?asset='+a));assert.ok(sw.includes('/pdf-preview-assets/5.4.624/'+a+'.mjs'))}
 assert.ok(cfg.builds.some(b=>b.src==='api/pdf-preview-assets.mjs'&&b.config.includeFiles.some(f=>f.endsWith('pdf.worker.min.mjs'))));
 assert.ok(sw.includes("vistoria-pdf-preview-5.4.624"));
});
