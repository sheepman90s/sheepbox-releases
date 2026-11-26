const CACHE='sheepbox-web-df46ace8ed86';
const SHELL=['./','./index.html','./styles.css','./app-home.css','./world.css','./world-live.css','./player-ads.css','./manifest.webmanifest','./src/app.mjs','./src/watch-party.mjs','./src/revry.mjs','./src/dash.mjs','./src/freetv.mjs','./src/runtime.mjs','./src/provider-libraries.mjs','./src/core.mjs','./src/storage.mjs','./src/maintenance.mjs','./src/guide.mjs','./src/plex.mjs','./src/pluto.mjs','./src/apk-library.mjs','./src/providers.mjs','./src/sources.mjs','./src/player.mjs','./src/ads.mjs','./src/newson.mjs','./src/xumo.mjs','./src/cw.mjs','./src/yupp.mjs','./src/worldtv.mjs','./src/worldtv-extra.mjs','./src/redbull.mjs','./src/filmzie.mjs','./src/roku.mjs','./src/publisher-links.mjs','./src/roku-library.mjs','./src/publishers.mjs','./src/world-view.mjs','./src/world-content.mjs','./src/globe.mjs','./src/world-geometry.mjs','./data/catalog.json','./data/revry.json','./data/pbs.json','./data/freetv.json','./data/runtime.json','./data/plex.json','./data/pluto.json','./data/apk-library.json','./data/roku/catalog.json','./data/webcams.json','./assets/icon.png','./assets/mascot.png','./assets/home.png','./assets/browse.jpg','./vendor/hls-1.7.4.min.js','./vendor/shaka-player-5.3.4.compiled.js'];
const WORLD=['./data/world-countries.json','./assets/world-earth.jpg'];
SHELL.push('./retro.css','./src/retro.mjs','./data/retro-tv.json');
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const scope=new URL(self.registration.scope);
 for(const key of await caches.keys()){
  if(!key.startsWith('sheepbox-web-')||key===CACHE)continue;
  const cache=await caches.open(key);
  for(const request of await cache.keys()){
   const url=new URL(request.url);
   if(url.origin===scope.origin&&url.pathname.startsWith(scope.pathname))await cache.delete(request);
  }
  if(!(await cache.keys()).length)await caches.delete(key);
 }
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);const scope=new URL(self.registration.scope);
 const ownRokuMetadata=/^data\/roku\/(?:series\/[a-f0-9]{32}|index\/[a-f0-9]{2})\.json$/.test(url.pathname.slice(scope.pathname.length));
 if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname)||(![...SHELL,...WORLD].some(path=>new URL(path,scope).pathname===url.pathname)&&!ownRokuMetadata))return;
 event.respondWith(fetch(event.request).then(response=>{if(response.ok&&(!ownRokuMetadata||/application\/json/i.test(response.headers.get('content-type')??''))){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached??(event.request.mode==='navigate'?caches.match(new URL('./index.html',scope).href):Response.error()))));
});
