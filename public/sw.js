/*
 * Acture's service worker. Deliberately small. It does two things:
 *
 *  - caches one page, shown when a navigation fails for want of a
 *    connection. Lists, the assistant and sign-in always come from the
 *    network — a cached copy of someone's to-dos going stale on a phone
 *    would be worse than an honest "you're offline".
 *  - shows reminders the server pushes (src/lib/push-server.ts), with Done
 *    and Snooze on the notification itself, so a reminder can be dealt
 *    with without opening the app.
 */
const CACHE = 'acture-offline-v2'
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

// ── Reminders ────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let r = {}
  try { r = event.data ? event.data.json() : {} } catch { r = { title: 'Acture', body: event.data && event.data.text() } }
  // Done and Snooze where the platform offers buttons (macOS and Android
  // Chrome do; iOS shows the notification without them).
  const actions = r.kind ? [
    ...(r.kind === 'todo' ? [{ action: 'done', title: 'Done' }] : []),
    { action: 'snooze', title: 'Snooze 10 min' },
  ] : []
  event.waitUntil(self.registration.showNotification(r.title || 'Acture', {
    body: r.body || '',
    tag: r.tag || 'acture',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: r,
    actions,
    requireInteraction: !!r.kind,
  }))
})

/** The route that ticks off or puts off what a notification is about. */
function act(r, action) {
  const json = (url, body) => fetch(url, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (action === 'done' && r.kind === 'todo') {
    return r.itemType === 'Habit' ? json('/api/habits/' + r.id, { completed: true }) : json('/api/todos/' + r.id, { done: true })
  }
  if (action === 'snooze') {
    return json((r.kind === 'event' ? '/api/events/' : '/api/todos/') + r.id, { snoozeMinutes: 10 })
  }
  return Promise.resolve()
}

self.addEventListener('notificationclick', (event) => {
  const r = event.notification.data || {}
  event.notification.close()
  if (event.action) {
    event.waitUntil(act(r, event.action).catch(() => {}))
    return
  }
  // Anywhere else on it: the app, brought forward if it is already open.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).pathname.startsWith('/app'))
      if (open) return open.focus()
      return self.clients.openWindow(r.url || '/app')
    }),
  )
})
