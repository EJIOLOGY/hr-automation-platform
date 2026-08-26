const CACHE_NAME = "hr-operations-shell-v1";
const SHELL_ROUTES = ["/offline", "/dashboard/analytics", "/dashboard/conversations", "/dashboard/escalations", "/dashboard/hr-requests"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ROUTES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || event.request.mode !== "navigate") return;
  const pathname = new URL(event.request.url).pathname;
  if (!pathname.startsWith("/dashboard")) return;

  event.respondWith(fetch(event.request).catch(async () => (await caches.match(pathname)) || caches.match("/offline")));
});
