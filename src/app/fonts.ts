import { Inter } from 'next/font/google'

// The sans both halves read in — the site and the app share a face on
// purpose, so stepping from one into the other does not change the voice.
// Loaded as a web font rather than left to the system, so it is the same
// sans-serif in every browser.
export const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

// The site's headlines are set very large, where Inter's optical size axis
// draws a tighter, display cut — the design was made with it. The app reads
// at 13–15px, where it would change nothing worth its bytes, so only the
// site loads it.
export const interSite = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  axes: ['opsz'],
})
