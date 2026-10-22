const CACHE='lucky-eggs-mobile-v1.0.0';
const FILES=['./','./index.html','./styles.css','./game.js','./assets/arcade-stage.webp','./assets/icon.svg','./manifest.webmanifest'];
self.addEventListener('install', event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate', event=>event.waitUntil(caches.keys().then(names=>Promise.all(names.filter(name=>name!==CACHE).map(name=>caches.delete(name)))).then(()=>self.clients.claim())));
self.addEventListener('fetch', event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request)));
});
