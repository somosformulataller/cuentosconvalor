// Service worker: la app se puede descargar en el teléfono y abre sin conexión
// (con lo último que se vio). La API nunca se guarda: siempre va a la red.
const CACHE = 'cuentos-v1'
const BASE = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  // Las páginas: primero la red, y si no hay, la última guardada.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((r) => {
          const copia = r.clone()
          caches.open(CACHE).then((c) => c.put('/', copia))
          return r
        })
        .catch(() => caches.match('/')),
    )
    return
  }
  e.respondWith(
    caches.match(e.request).then(
      (guardado) =>
        guardado ||
        fetch(e.request).then((r) => {
          if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/'))) {
            const copia = r.clone()
            caches.open(CACHE).then((c) => c.put(e.request, copia))
          }
          return r
        }),
    ),
  )
})
