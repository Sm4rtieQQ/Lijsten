/*
 * Lijstjes — service worker (app-shell cache voor de PWA).
 *
 * Doel: de app-shell offline kunnen openen zodra hij op het beginscherm staat.
 * Supabase-verkeer (andere origin) wordt nooit gecacht; de data-laag is toch al
 * offline-first via localStorage (zie AGENTS.md §7).
 *
 * Verhoog CACHE_VERSION bij een release waarin de app-shell verandert, zodat
 * oude caches worden opgeruimd.
 */
const CACHE_VERSION = "lijstjes-v1";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Alleen eigen origin cachen; Supabase en fonts gaan altijd over het netwerk.
  if (url.origin !== self.location.origin) return;

  // Navigaties: netwerk eerst, val terug op de gecachte shell (offline openen).
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./"))),
    );
    return;
  }

  // Overige eigen bestanden: cache eerst, daarna netwerk (en cache bijwerken).
  event.respondWith(
    caches.match(request).then((cached) => {
      const fromNetwork = fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fromNetwork;
    }),
  );
});
