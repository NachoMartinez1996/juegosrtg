const VERSION_CACHE = "1.1.01";
const CACHE_SHELL = `rosario-shell-${VERSION_CACHE}`;
const CACHE_RUNTIME = `rosario-runtime-${VERSION_CACHE}`;
const APP_SHELL = "./index.html";

const shellFiles = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./manifest.json",
    "./favicon.ico",
    "./apple-touch-icon.png",
    "./android-chrome-192x192.png",
    "./android-chrome-512x512.png",
    "./logo.png",
    "./Logo.png",
    "./castagnino.jpg",
    "./catedral.jpg",
    "./coloso.jpg",
    "./elcirculo.png",
    "./escarapela.png",
    "./estevez.jpg",
    "./gigante.png",
    "./helado.jpg",
    "./independencia.jpg",
    "./monumento.jpg",
    "./puente.jpg",
    "./urquiza.jpg"
];

function isUpdatableResource(request) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    return (
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "document" ||
        path.endsWith("/index.html") ||
        path.endsWith("/script.js") ||
        path.endsWith("/style.css") ||
        path.endsWith("/manifest.json")
    );
}

function getTargetCache(request) {
    const url = new URL(request.url);
    const path = url.pathname.toLowerCase();

    if (
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "document" ||
        path.endsWith("/index.html") ||
        path.endsWith("/script.js") ||
        path.endsWith("/style.css") ||
        path.endsWith("/manifest.json")
    ) {
        return CACHE_SHELL;
    }

    return CACHE_RUNTIME;
}

function isHttpRequest(request) {
    const url = new URL(request.url);
    return url.protocol === "http:" || url.protocol === "https:";
}

function isCacheableResponse(response) {
    return !!response && (response.ok || response.type === "opaque");
}

async function saveResponse(cacheName, request, response) {
    if (!isCacheableResponse(response)) {
        return response;
    }

    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
    return response;
}

async function getOfflineShell() {
    return (
        await caches.match(APP_SHELL, { ignoreSearch: true }) ||
        await caches.match("./", { ignoreSearch: true })
    );
}

function createOfflineFallback() {
    return new Response(
        `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Rosario Te Guio sin conexión</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #fbf4de;
      color: #14324a;
      font-family: "Trebuchet MS", "Gill Sans", "Segoe UI", sans-serif;
      padding: 24px;
      text-align: center;
    }
    main {
      max-width: 30rem;
      padding: 24px;
      border-radius: 20px;
      border: 1px solid rgba(20, 50, 74, 0.12);
      background: rgba(255, 255, 255, 0.92);
      box-shadow: 0 18px 34px rgba(11, 52, 89, 0.12);
    }
    h1 {
      margin: 0 0 12px;
      color: #0b5ea8;
      font-size: 1.6rem;
    }
    p {
      margin: 0;
      line-height: 1.6;
    }
  </style>
</head>
<body>
  <main>
    <h1>Rosario Te Guio</h1>
    <p>No encontramos una copia local completa para abrir esta vez. Volvé a entrar una vez con conexión para guardar los archivos esenciales en este dispositivo.</p>
  </main>
</body>
</html>`,
        {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store"
            }
        }
    );
}

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_SHELL)
            .then(cache => cache.addAll(shellFiles))
    );
});

self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(cacheNames => Promise.all(
                cacheNames.map(cacheName => {
                    const isRosarioCache = cacheName.startsWith("rosario-");
                    const isCurrentCache = cacheName === CACHE_SHELL || cacheName === CACHE_RUNTIME;

                    if (isRosarioCache && !isCurrentCache) {
                        return caches.delete(cacheName);
                    }

                    return Promise.resolve(false);
                })
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const { request } = event;

    if (request.method !== "GET" || !isHttpRequest(request)) {
        return;
    }

    if (request.mode === "navigate") {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(request);
                await saveResponse(CACHE_SHELL, APP_SHELL, networkResponse.clone());
                return networkResponse;
            } catch (error) {
                const offlineShell = await getOfflineShell();
                return offlineShell || createOfflineFallback();
            }
        })());
        return;
    }

    if (request.headers.has("range")) {
        return;
    }

    event.respondWith((async () => {
        if (isUpdatableResource(request)) {
            try {
                const networkResponse = await fetch(request);
                await saveResponse(getTargetCache(request), request, networkResponse.clone());
                return networkResponse;
            } catch (error) {
                const cachedResponse = await caches.match(request, { ignoreSearch: true });
                return cachedResponse || Response.error();
            }
        }

        const cachedResponse = await caches.match(request, { ignoreSearch: true });
        if (cachedResponse) {
            return cachedResponse;
        }

        const networkResponse = await fetch(request);
        await saveResponse(CACHE_RUNTIME, request, networkResponse.clone());
        return networkResponse;
    })().catch(async () => {
        const cachedResponse = await caches.match(request, { ignoreSearch: true });
        return cachedResponse || Response.error();
    }));
});
