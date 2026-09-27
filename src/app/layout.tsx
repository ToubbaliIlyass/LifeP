import type { Metadata, Viewport } from "next";
import { Inter, Geist_Mono, Source_Serif_4, Montserrat } from "next/font/google";
import "./globals.css";

// The sans the app reads in: neutral, clear at small sizes, and with
// numbers that line up — most of this app is times.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Lets env(safe-area-inset-*) resolve, so the floating controls can keep
  // clear of the home indicator instead of sitting under it.
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  title: "Acture",
  description: "Your life, tracked.",
};

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
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${geistMono.variable} ${sourceSerif.variable} ${montserrat.variable} h-full antialiased`}
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
