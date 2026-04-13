const CACHE = 'florida-flow-v1'
const OFFLINE_URL = '/offline'

// Cache the shell on install
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      cache.addAll(['/', '/beach'])
    )
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  // Remove old caches
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Only handle same-origin GET requests
  if (request.method !== 'GET' || url.origin !== location.origin) return

  // Network-first for API routes (always want fresh data)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request).catch(() => new Response('{}', { headers: { 'Content-Type': 'application/json' } }))
    )
    return
  }

  // Cache-first for static assets
  if (url.pathname.match(/\.(svg|png|ico|woff2?|css|js)$/)) {
    event.respondWith(
      caches.match(request).then(cached => cached ?? fetch(request).then(res => {
        const clone = res.clone()
        caches.open(CACHE).then(c => c.put(request, clone))
        return res
      }))
    )
    return
  }

  // Network-first for pages (data app — always want current conditions)
  event.respondWith(
    fetch(request).then(res => {
      const clone = res.clone()
      caches.open(CACHE).then(c => c.put(request, clone))
      return res
    }).catch(() =>
      caches.match(request).then(cached => cached ?? caches.match('/'))
    )
  )
})
