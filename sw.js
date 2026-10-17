const CACHE='vistoria-shell-v11-4-andamento';
const FILES=['/analysis-progress.js','/edit-saved.js','/workflow.js','/field-tools.js','/photo-markup.js','/auto-cloud.js','/enhancements.js','/layout.css','/layout.js','/','/index.html','/history.js','/pdf-export.js','/improvements.js','/cloud.js','/pwa.js','/pdf-lib.min.js','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('vistoria-shell-')&&name!==CACHE)await caches.delete(name);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!FILES.includes(url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);return await cache.match(url.pathname)||fetch(event.request)})());
});

self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting()});
