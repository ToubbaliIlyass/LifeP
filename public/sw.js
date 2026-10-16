/*
 * Acture's service worker. Deliberately small: it caches one thing, a page
 * to show when a navigation fails for want of a connection, and otherwise
 * stays out of the way. Lists, the assistant and sign-in always come from
 * the network — a cached copy of someone's to-dos going stale on a phone
 * would be worse than an honest "you're offline".
 */
const CACHE = 'acture-offline-v1'
const OFFLINE = '/offline.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE).then((r) => r || Response.error())),
  )
})
