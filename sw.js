// Scope-specific caches: never delete another repository's offline files.
const PREFIX='tenohira-world:'+encodeURIComponent(self.registration.scope)+':';
const CACHE=PREFIX+'v30';
const ASSETS=['./','./index.html','./style.css','./main.js','./audio.js','./meteor.js','./black-hole.js','./weather.js','./tornado.js','./animal.js','./era.js','./town.js','./god.js','./world.js','./human.js','./settings.js','./resource.js','./navigation.js','./building.js','./family.js','./save.js','./society.js','./terrain-editor.js','./manifest.webmanifest','./icon-192.png','./icon-512.png','./assets/meteor.png','./assets/meteor-explosion.mp3','./assets/event-close-ricecooker.mp3','./assets/small-town-great-journey.mp3'];
const ALLOWED=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll([...ALLOWED])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);url.search='';url.hash='';
  if(!ALLOWED.has(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),cached=await cache.match(url.href);
    const range=event.request.headers.get('Range');
    if(cached&&range&&url.pathname.endsWith('.mp3')){
      const match=/^bytes=(\d+)-(\d*)$/.exec(range);
      const bytes=await cached.arrayBuffer(),start=match?Number(match[1]):0;
      const end=match&&match[2]?Math.min(Number(match[2]),bytes.byteLength-1):bytes.byteLength-1;
      if(!match||start>end||start>=bytes.byteLength)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${bytes.byteLength}`}});
      return new Response(bytes.slice(start,end+1),{status:206,headers:{
        'Content-Type':'audio/mpeg','Content-Range':`bytes ${start}-${end}/${bytes.byteLength}`,
        'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'
      }});
    }
    return cached||fetch(event.request);
  })());
});
