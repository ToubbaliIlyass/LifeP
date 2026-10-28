import { BRAND, url } from '@/lib/site'

/*
 * llms.txt: a plain-text summary for language-model crawlers, answer first.
 * Not a ranking factor and not confirmed to be read by any engine; it is
 * cheap and harmless, so it exists. Built from the site config so its links
 * always name the canonical host. Facts here must match the landing page's
 * questions (src/components/landing/story-engine.tsx).
 */
export const dynamic = 'force-static'

export function GET() {
  const body = `# ${BRAND.name}: ${BRAND.tagline}

> ${BRAND.summary} It is a web app that installs from Chrome on a computer or an Android phone. For now it is a private instance: you sign in with a Google account that has been let in, and it is free while it is being built.

**What is Acture?** A to-do list in the spirit of Things (Inbox, Today, Upcoming, Anytime, Someday, Logbook, projects with headings) that you can talk to. Say or show what needs doing and it adds the to-dos.

**Does it plan my day?** Yes. "Plan my day" gives each remaining to-do a time around your events. Times you set yourself never move. The assistant uses an AI model to understand speech and photos; the scheduling itself is ordinary logic.

**Does it learn?** It keeps two weeks of when each to-do was really done next to when it was planned, and moves the plan towards your real day. A short evening check-in lets you tell it what happened.

**Do I have to talk to it?** No. You can type, or use the keyboard shortcuts. It answers in writing and never talks back.

**Where does my data go?** Lists are stored in Acture's own database. What you say or attach is sent to an AI model to be read, and that is all it is used for. Everything can be exported as one JSON file.

**Is it a Things replacement?** It is an alternative for people who want to talk to their list or are not on Apple devices. Things is a mature native Apple app; Acture is new. Acture is not affiliated with Things or Cultured Code.

## Pages
- [Acture, the whole story](${url('/')}): the landing page, with the questions answered
- [Voice to-do list](${url('/voice-to-do-list')}): talk or show it a photo and get to-dos
- [Day planner that learns](${url('/day-planner')}): Plan my day, and how it learns when you really get things done
- [A Things alternative](${url('/things-alternative')}): an honest side-by-side with Things 3

## Access
The app itself (${url('/app')}) and sign-in require an approved account.
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
