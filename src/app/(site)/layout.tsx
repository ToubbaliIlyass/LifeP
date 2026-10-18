import type { Viewport } from 'next'
import { interSite } from '../fonts'
import { RegisterServiceWorker } from '@/components/install/RegisterServiceWorker'
import '../globals.css'

/*
 * The marketing site's own root. It shares the app's type and colours, so
 * the step from one to the other looks like the same thing, but none of the
 * app's machinery: no palette from Settings, no assistant, nothing signed in.
 * See app/(app)/layout.tsx for the other side of the door.
 */

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fefffe' },
    { media: '(prefers-color-scheme: dark)', color: '#141415' },
  ],
}

/*
  Light or dark, before first paint: the mode chosen in the app if this
  browser has one, otherwise the system's. Only the mode — the site always
  wears Acture's own colours, never a palette picked in Settings.
*/
const modeScript = `
(function(){
  try {
    var m = localStorage.getItem('theme');
    if (m !== 'light' && m !== 'dark') m = 'system';
    if (m === 'dark' || (m === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) document.documentElement.classList.add('dark');
  } catch(e){}
})()
`

export default function SiteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${interSite.variable} antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: modeScript }} />
      </head>
      <body>
        {children}
        {/* Registered here too, so the site itself is installable: the
            install button on this page needs it in some browsers. */}
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
