const CACHE='vistoria-shell-v110-prioridade-tecnico';
importScripts('/background-sync.js');
const FILES=['/background-sync.js','/point-identity.js','/point-trash.js','/management-tools.js','/voice-dictation.js','/trash-actions.js','/export-current.js','/point-actions.js','/pdf-import.js','/analysis-progress.js','/descritivo-core.js','/descritivo-guiado.js','/technical-review.js','/edit-saved.js','/workflow.js','/field-tools.js','/photo-markup.js','/photo-order.js','/enhancements.js','/layout.css','/cloud-dashboard.css','/layout.js','/google-drive-sync.js','/team-merge.mjs','/','/index.html','/history.js','/form-wizard.js','/pdf-export.js','/improvements.js','/pwa.js','/pdf-lib.min.js','/manifest.webmanifest','/vistoria-icon-192.png','/vistoria-icon-512.png','/vistoria-logo.svg'];
const PDF_ASSET_CACHE='vistoria-pdf-preview-5.4.624';
const PDF_ASSETS=['/pdf-preview-assets/5.4.624/engine.mjs','/pdf-preview-assets/5.4.624/worker.mjs'];
self.addEventListener('install',event=>event.waitUntil((async()=>{const cache=await caches.open(CACHE);await cache.addAll(FILES);try{const assets=await caches.open(PDF_ASSET_CACHE);await Promise.allSettled(PDF_ASSETS.map(path=>assets.add(path)))}catch{}})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('vistoria-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 if(PDF_ASSETS.includes(url.pathname)){event.respondWith((async()=>{const cache=await caches.open(PDF_ASSET_CACHE);const saved=await cache.match(url.pathname);if(saved)return saved;const response=await fetch(event.request);if(response.ok)await cache.put(url.pathname,response.clone());return response})());return}
 if(url.pathname.startsWith('/api/')||['/privacidade.html','/termos.html','/sobre.html','/google2fd58006cf13a852.html'].includes(url.pathname))return;
 if(event.request.mode==='navigate'){
  // Online-first for the application shell; still available without network.
  event.respondWith(fetch(event.request).then(response=>{
   if(response.ok){const saved=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put('/index.html',saved)))}
   return response;
  }).catch(async()=>await(await caches.open(CACHE)).match('/index.html')));
  return;
 }
 if(!FILES.includes(url.pathname))return;
 // Com internet, buscar sempre os JS/CSS atuais. Offline, usar a última cópia válida.
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE);
  try{
   const response=await fetch(event.request,{cache:'no-cache'});
   if(response.ok)event.waitUntil(cache.put(url.pathname,response.clone()));
   return response;
  }catch{
   return await cache.match(url.pathname)||Response.error();
  }
 })());
});
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting()});

self.addEventListener('sync',event=>{if(event.tag==='vistoria-resume')event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of windows)client.postMessage({type:'VISTORIA_RESUME'});})());});

self.addEventListener('sync',event=>{if(event.tag==='vistoria-background')event.waitUntil((async()=>{const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});if(windows.length)throw Error('Aguardar fechamento das janelas');await self.VistoriaBackground.run();})());});
