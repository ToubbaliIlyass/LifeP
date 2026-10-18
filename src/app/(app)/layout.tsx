import type { Metadata, Viewport } from 'next'
import { inter } from '../fonts'
import { RegisterServiceWorker } from '@/components/install/RegisterServiceWorker'
import '../globals.css'

/*
 * The app's own root: the lists, and the sign-in in front of them. The
 * marketing site has a root of its own — app/(site)/layout.tsx — so neither
 * carries the other's scripts, and going from one to the other is a full
 * page load: a door, not a tab.
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets env(safe-area-inset-*) resolve, so the floating controls can keep
  // clear of the home indicator instead of sitting under it.
  viewportFit: 'cover',
  // Android: the keyboard shrinks the page rather than covering it, so what
  // sits at the foot of the screen (the assistant's island) rises above it.
  interactiveWidget: 'resizes-content',
  // The window's own colour when installed: the page's ground, light or dark.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fefffe' },
    { media: '(prefers-color-scheme: dark)', color: '#141415' },
  ],
}

export const metadata: Metadata = {
  title: 'Acture',
  description: 'Things, but it listens. Say what needs to happen and Acture turns it into to-dos, finds each one a time, and learns when you actually get things done.',
  // Added to an iPhone's home screen, it opens as an app of its own: no
  // Safari bars, its own name under the icon. The status bar keeps its own
  // band ("default") rather than lying over the lists.
  appleWebApp: {
    capable: true,
    title: 'Acture',
    statusBarStyle: 'default',
  },
}

/*
  Runs before first paint so neither the mode nor the palette can flash the
  wrong colours. Two separate things are restored:

  - `theme` (light/dark mode) → the `.dark` class.
  - `acture-theme` (palette) → the `data-theme` attribute.

  Both are also stored in the database so they follow the user across
  devices, but a fetch cannot be awaited here; localStorage is the copy that
  is readable synchronously, and the database is what a new device falls
  back to.

  The mode rule mirrors `isDark` in src/lib/themes.ts, which this script
  cannot import. An explicit choice always wins; the OS preference is only
  consulted when there is no choice to honour. It previously read

      if (!s || s === 'dark' || d) ...add('dark')

  — so `d` alone forced dark over a stored 'light', and light mode was
  unreachable on any machine whose OS prefers dark.

  Storage access is wrapped because it throws outright on iOS Safari with
  cookies blocked — see src/lib/storage.ts.
*/
const themeScript = `
(function(){
  try {
    var m = localStorage.getItem('theme');
    if (m !== 'light' && m !== 'dark') m = 'system';
    var dark = m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) document.documentElement.classList.add('dark');
  } catch(e){}
  try {
    var p = localStorage.getItem('acture-theme');
    if (p && p !== 'default') document.documentElement.setAttribute('data-theme', p);
  } catch(e){}
})()
`

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/*
        `main` (h-dvh) is meant to own the whole viewport with its own
        internal ScrollAreas doing all the scrolling — but under real
        browser zoom, viewport-unit rounding can still leave a few pixels
        of content taller than the viewport outside of any inner scroll
        region. Blocking the page's own scroll here previously made that
        edge case unreachable rather than just untidy, so this stays a
        working fallback; see the widened scrollbar rule in globals.css
        for why it won't look like content is silently cut off again.
      */}
      <body className="min-h-full flex flex-col">
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
