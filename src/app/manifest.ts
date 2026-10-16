import type { MetadataRoute } from 'next'

/*
 * What makes Acture installable: on a Mac (Chrome, Edge, or Safari's Add to
 * Dock), on Android, and on an iPhone's home screen. Installed, it opens on
 * the lists — never the marketing page — in a window of its own.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/app',
    name: 'Acture',
    short_name: 'Acture',
    description: 'Things, but it listens. Say what needs to happen; Acture turns it into to-dos and finds each one a time.',
    start_url: '/app',
    scope: '/',
    display: 'standalone',
    background_color: '#141415',
    theme_color: '#141415',
    categories: ['productivity'],
    icons: [
      // The rounded tile, with room around it: shown as it is on a Mac's
      // Dock and a desktop's app list.
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Edge to edge, the mark well inside the safe zone: Android cuts it to
      // its own shape (circle, squircle…).
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Today', url: '/app#today', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Inbox', url: '/app#inbox', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
