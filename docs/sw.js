// Service worker. The page, its scripts and the manifest are fetched network-first (so a new deploy shows up on the
// next load; the cache is only the offline fallback). Videos and icons are cache-first: fetched once, kept.
const CACHE = 'icelab-rumble-7614bec';
const PRECACHE = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-180.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url), same = url.origin === location.origin;
  if (!same) return;   // Supabase, relays etc. go straight to the network
  const fresh = e.request.mode === 'navigate' || url.pathname.endsWith('/') || /\.(html|js|webmanifest)$/.test(url.pathname);
  const store = res => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return res; };
  if (fresh) e.respondWith(fetch(e.request).then(store).catch(() => caches.match(e.request)));
  else e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(store)));
});
