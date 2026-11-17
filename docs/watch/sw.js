const CACHE='sheepbox-web-99f2ab9bcafc';
const SHELL=['./','./index.html','./styles.css','./manifest.webmanifest','./src/app.mjs','./src/core.mjs','./src/storage.mjs','./src/providers.mjs','./src/sources.mjs','./src/player.mjs','./data/catalog.json','./assets/icon.png','./assets/mascot.png','./assets/home.png','./vendor/hls-1.7.4.min.js'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sheepbox-web-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);const scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||!SHELL.some(path=>new URL(path,scope).pathname===url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached??(event.request.mode==='navigate'?caches.match(new URL('./index.html',scope).href):Response.error()))));
});
