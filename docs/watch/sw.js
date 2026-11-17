const CACHE='sheepbox-web-8e7048ad6373';
const SHELL=['./','./index.html','./styles.css','./app-home.css','./world.css','./world-live.css','./player-ads.css','./manifest.webmanifest','./src/app.mjs','./src/core.mjs','./src/storage.mjs','./src/providers.mjs','./src/sources.mjs','./src/player.mjs','./src/ads.mjs','./src/newson.mjs','./src/xumo.mjs','./src/cw.mjs','./src/yupp.mjs','./src/worldtv.mjs','./src/worldtv-extra.mjs','./src/redbull.mjs','./src/filmzie.mjs','./src/roku.mjs','./src/publishers.mjs','./src/world-view.mjs','./src/world-content.mjs','./src/globe.mjs','./src/world-geometry.mjs','./data/catalog.json','./data/webcams.json','./assets/icon.png','./assets/mascot.png','./assets/home.png','./assets/browse.jpg','./vendor/hls-1.7.4.min.js'];
const WORLD=['./data/world-countries.json','./assets/world-earth.jpg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('sheepbox-web-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);const scope=new URL(self.registration.scope);
 if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||![...SHELL,...WORLD].some(path=>new URL(path,scope).pathname===url.pathname))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached??(event.request.mode==='navigate'?caches.match(new URL('./index.html',scope).href):Response.error()))));
});
