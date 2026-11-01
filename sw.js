/* NOVA AI service worker: makes the app work offline.
   When you change any file, change the number below (v1 -> v2) so phones refresh. */
const CACHE = "nova-ai-v1";
const FILES = ["./", "./index.html", "./style.css", "./script.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;   // only our own files
  e.respondWith(
    fetch(req, { cache: "no-cache" })                 // online: always get the newest file
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))   // offline: use saved copy
  );
});
