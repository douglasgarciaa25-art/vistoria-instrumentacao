const CACHE='vistoria-shell-v17-descritivos-guiados';
const FILES=['/trash-actions.js','/export-current.js','/point-actions.js','/pdf-import.js','/analysis-progress.js','/descritivo-core.js','/descritivo-guiado.js','/technical-review.js','/edit-saved.js','/workflow.js','/field-tools.js','/photo-markup.js','/enhancements.js','/layout.css','/layout.js','/google-drive-sync.js','/','/index.html','/history.js','/pdf-export.js','/improvements.js','/pwa.js','/pdf-lib.min.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('vistoria-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
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
