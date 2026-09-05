import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Geist_Mono, Source_Serif_4, Montserrat } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
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

export const metadata: Metadata = {
  title: "Acture",
  description: "Your life, tracked.",
};

/*
  Runs before first paint so neither the mode nor the palette can flash the
  wrong colours. Two separate things are restored:

  - `theme` (light/dark mode) → the `.dark` class, as before.
  - `acture-theme` (palette) → the `data-theme` attribute. The palette is also
    stored in the database so it follows the user across devices, but a fetch
    cannot be awaited here; localStorage is the copy that is readable
    synchronously, and the database is what a new device falls back to.

  Storage access is wrapped because it throws outright on iOS Safari with
  cookies blocked — see src/lib/storage.ts.
*/
const themeScript = `
(function(){
  try {
    var s = localStorage.getItem('theme');
    var d = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (!s || s === 'dark' || d) document.documentElement.classList.add('dark');
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
      className={`${plusJakarta.variable} ${geistMono.variable} ${sourceSerif.variable} ${montserrat.variable} h-full antialiased`}
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
