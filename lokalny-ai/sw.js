// Service worker: aplikacja i biblioteka WebLLM działają offline.
// Wagi modeli cache'uje sam WebLLM (Cache API), więc ich tu nie dotykamy.
const CACHE = "lokalny-ai-v3";
const SHELL = ["./", "index.html", "app.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];
const CDN = /^https:\/\/(esm\.run|cdn\.jsdelivr\.net)\//;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("lokalny-ai-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Biblioteka z CDN (wersja przypięta): cache-first.
  if (CDN.test(req.url)) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }
  // Pliki aplikacji: network-first (łatwe aktualizacje), offline z cache.
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match("index.html"))));
  }
});
