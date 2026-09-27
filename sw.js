// Scope-specific caches: never delete another repository's offline files.
const PREFIX='tenohira-world:'+encodeURIComponent(self.registration.scope)+':';
const CACHE=PREFIX+'v8.1';
const ASSETS=['./','./index.html','./style.css','./main.js','./world.js','./human.js','./settings.js','./resource.js','./navigation.js','./building.js','./family.js','./save.js','./terrain-editor.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const ALLOWED=new Set(ASSETS.map(path=>new URL(path,self.registration.scope).href));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll([...ALLOWED])).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);url.search='';url.hash='';
  if(!ALLOWED.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.href)).then(cached=>cached||fetch(event.request)));
});
