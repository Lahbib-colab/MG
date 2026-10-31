// Mode hors ligne : l'application se charge sans connexion.
const CACHE = "mg-ehs-v21";
const OCR = "mg-ocr-v1"; // moteur de lecture optique (gros fichiers) : conservé entre les versions
const FILES = ["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","apple-touch-icon.png","favicon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== OCR).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  // moteur OCR local : cache d'abord (téléchargé une seule fois)
  if (u.pathname.includes("/vendor/tesseract/")) {
    e.respondWith(caches.open(OCR).then(c => c.match(e.request).then(r => r || fetch(e.request).then(resp => { if (resp.ok) c.put(e.request, resp.clone()); return resp; }))));
    return;
  }
  // reste : réseau d'abord (pour recevoir les mises à jour), cache en secours
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
