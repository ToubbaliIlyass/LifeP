import type { Metadata } from 'next'
import Link from 'next/link'
import { ActureLogo } from '@/components/ui/acture-mark'
import { Reveal } from '@/components/landing/Reveal'
import { TaglineReveal } from '@/components/landing/TaglineReveal'
import { HeroDemo } from '@/components/landing/HeroDemo'
import { QuickEntryDemo } from '@/components/landing/QuickEntryDemo'
import { FeatureStory } from '@/components/landing/FeatureStory'
import { Conversation } from '@/components/landing/Conversation'
import { InstallSection } from '@/components/install/InstallApp'
import { ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Acture: Things, but it listens',
  description:
    'Say what needs to happen, the way you would tell a friend. Acture turns it into to-dos, finds each one a time, and learns when you actually get things done.',
  openGraph: {
    title: 'Acture: Things, but it listens',
    description: 'A calm to-do list you can talk to. It plans your day and learns how you really spend it.',
    type: 'website',
  },
}

/*
 * The front door. One action — open the app — and everything above it is the
 * argument for pressing it: what it is (a to-do list you talk to), what it
 * does with what you say, and why it gets better the longer you use it.
 *
 * Built from the app's own look on purpose: the same type, the same white,
 * the same square checkboxes. A landing page that looked nothing like the
 * thing it opens would be making a promise the app does not keep.
 */

const CTA = 'inline-flex items-center justify-center rounded-lg bg-foreground px-3 py-2 text-base font-semibold text-background transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-px hover:opacity-90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background'

const FAQ = [
  {
    q: 'Is this Things?',
    a: 'No. Things is wonderful and you should probably buy it. Acture is for when you want that same calm list, but you would rather talk than tap through menus.',
  },
  {
    q: 'Do I have to talk to it?',
    a: 'Never. Press N and type, the old fashioned way, or use the shorthand above. The assistant is there for when your hands are full or your thoughts are a mess.',
  },
  {
    q: 'What if it gets something wrong?',
    a: 'Everything it adds shows up straight away, and one press undoes it. Bigger things, like a class that repeats every week, wait in To review until you say yes.',
  },
  {
    q: 'Where does my stuff go?',
    a: 'Your lists live in Acture’s own database. What you say or attach is sent to an AI model to be read, and that is all it is used for.',
  },
  {
    q: 'Is there an app?',
    a: 'Yes, and it is the same Acture. Install it from your browser on a Mac, an iPhone or an Android phone: it gets its own icon and window and opens straight to your lists. No store, and it updates itself.',
  },
  {
    q: 'Who can use it?',
    a: 'Right now it is a private instance: you sign in with a Google account that has been let in. It is free while it is being built.',
  },
]

export default function Landing() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-lg focus:bg-foreground focus:px-3 focus:py-2 focus:text-background">
        Skip to content
      </a>

      {/* A floating pill: the name, two places to jump to, and the one thing to do. */}
      <nav aria-label="Main" className="fixed inset-x-0 top-0 z-40 flex justify-center px-4">
        <div className="mt-6 flex w-max items-center gap-2 rounded-full border border-border bg-background/80 py-2 pl-3 pr-2 shadow-[0_8px_32px_rgb(0_0_0/0.06)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2 rounded-full pr-2 text-base font-bold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-current="page">
            <ActureLogo className="w-6 h-6" />Acture
          </Link>
          <a href="#how" className="hidden rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">What it does</a>
          <a href="#get" className="hidden rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block">Get the app</a>
          <a href="#faq" className="hidden rounded-full px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground md:block">Questions</a>
          {/* The way out of the site and into the app: always here, always the
              same words, set apart from the links that stay on this page. */}
          <span aria-hidden className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <Link href="/app" className="flex items-center gap-1 rounded-full bg-foreground py-1 pl-3 pr-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-90 active:scale-[0.98]">
            Open Acture <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </nav>

      <main id="main">
        {/* ── Hero ── */}
        <section className="mx-auto flex max-w-6xl flex-col items-center px-6 pt-32 pb-16 text-center md:pt-40">
          <Reveal>
            <h1 className="mx-auto max-w-[680px] bg-gradient-to-r from-[#000000] to-[#666666] bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-6xl dark:from-[#FFFFFF] dark:to-[#9B9B9B]">
              Things,<br />but it listens.
            </h1>
          </Reveal>
          <Reveal delay={100}>
            <p className="mx-auto mt-6 max-w-[680px] text-lg text-foreground/70 [text-wrap:pretty]">
              Say what needs to happen, the way you’d tell a friend.
              <br className="hidden md:block" /> Acture turns it into to-dos, finds each one a time,
              and quietly learns when you actually get things done.
            </p>
          </Reveal>
          <Reveal delay={200} className="mt-8 flex flex-col items-center gap-3">
            <div className="flex items-center gap-4">
              <Link href="/app" className={CTA}>Open Acture</Link>
              <a href="#get" className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground">Get the app</a>
            </div>
            <p className="text-sm text-muted-foreground">Built for one very disorganised person first. It worked.</p>
          </Reveal>
          <Reveal delay={300} className="mt-12 flex w-full justify-center">
            <HeroDemo />
          </Reveal>
        </section>

        {/* ── The line ── */}
        <section className="mx-auto flex max-w-6xl justify-center px-6 py-16">
          <TaglineReveal lines={['You will lie to your to‑do list.', 'Acture learns anyway.']} />
        </section>

        {/* ── What it does: one scroll, the picture pinned beside it ── */}
        <section id="how" aria-labelledby="how-title" className="mx-auto max-w-5xl scroll-mt-24 px-6 py-16">
          <h2 id="how-title" className="sr-only">What Acture does</h2>
          <FeatureStory />
        </section>

        {/* ── Typing, for people who like typing ── */}
        <section aria-labelledby="typing" className="mx-auto flex max-w-6xl flex-col items-center px-6 py-16 text-center">
          <Reveal>
            <h2 id="typing" className="mx-auto max-w-[680px] text-2xl font-bold tracking-tight md:text-3xl [text-wrap:balance]">
              Or skip the AI and type like a wizard
            </h2>
            <p className="mx-auto mt-3 max-w-[680px] text-base text-foreground/70 [text-wrap:pretty]">
              One line, a few keywords, done. Go on, change it.
            </p>
          </Reveal>
          <Reveal delay={100} className="mt-8 flex w-full justify-center">
            <QuickEntryDemo />
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-6 text-sm text-muted-foreground">
              <b className="font-semibold text-foreground">do</b> fri · <b className="font-semibold text-foreground">due</b> mon · <b className="font-semibold text-foreground">at</b> 3pm · <b className="font-semibold text-foreground">for</b> 45m · #tag · !! · <b className="font-semibold text-foreground">every</b> tue and thu · x5 · /project · @place
            </p>
          </Reveal>
        </section>

        {/* ── On every device ── */}
        <section id="get" aria-labelledby="get-title" className="mx-auto flex max-w-5xl scroll-mt-24 flex-col items-center px-6 py-16 text-center">
          <Reveal>
            <h2 id="get-title" className="mx-auto max-w-[680px] text-2xl font-bold tracking-tight md:text-3xl [text-wrap:balance]">
              On your Mac, your iPhone, your Android
            </h2>
            <p className="mx-auto mt-3 max-w-[560px] text-base text-foreground/70 [text-wrap:pretty]">
              Install Acture straight from the browser. Its own icon, its own window, straight to your lists. No store, and it keeps itself up to date.
            </p>
          </Reveal>
          <Reveal delay={100} className="mt-8 w-full">
            <InstallSection />
          </Reveal>
        </section>

        {/* ── Questions ── */}
        <section id="faq" aria-labelledby="faq-title" className="mx-auto max-w-2xl scroll-mt-24 px-6 py-16">
          <Reveal>
            <h2 id="faq-title" className="text-center text-2xl font-bold tracking-tight md:text-3xl">You asked. It listened.</h2>
          </Reveal>
          <div className="mt-8">
            <Conversation items={FAQ} />
          </div>
        </section>

        {/* ── Again, at the bottom ── */}
        <section className="mx-auto flex max-w-6xl flex-col items-center px-6 py-16 text-center">
          <Reveal>
            <h2 className="mx-auto max-w-[680px] text-3xl font-bold tracking-tight md:text-4xl [text-wrap:balance]">
              Your to-dos won’t say themselves.
            </h2>
            <p className="mx-auto mt-3 max-w-[680px] text-base text-foreground/70">Free while it’s being built. In the browser, or installed on any of your devices.</p>
          </Reveal>
          <Reveal delay={100} className="mt-6 flex items-center gap-4">
            <Link href="/app" className={CTA}>Open Acture</Link>
            <a href="#get" className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground">Get the app</a>
          </Reveal>
        </section>
      </main>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t border-border px-6 py-8 text-sm text-muted-foreground">
        <span className="flex items-center gap-2"><ActureLogo className="h-5 w-5" />Acture, made in Morocco.</span>
        <span className="flex items-center gap-5">
          <a href="#get" className="font-medium transition-colors hover:text-foreground">Get the app</a>
          <Link href="/app" className="font-medium transition-colors hover:text-foreground">Open Acture</Link>
        </span>
      </footer>
    </div>
  )
}
