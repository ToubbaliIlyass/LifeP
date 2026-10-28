import Link from 'next/link'
import type { ReactNode } from 'react'
import { Mark } from '@/components/landing/story-engine'
import { BreadcrumbJsonLd } from '@/components/seo/JsonLd'
import { PAGES, type PageSeo } from '@/lib/seo-copy'

/*
 * The shell for the small public pages (voice to-do list, day planner, Things
 * alternative). Same ground, type and bar as the landing, none of its
 * machinery: server-rendered, no script, so the words are in the HTML.
 */

export interface Section {
  h: string
  /** Paragraphs. */
  p?: ReactNode[]
  /** A short list, for things that really are a list. */
  list?: ReactNode[]
}

const OTHERS = [PAGES.voice, PAGES.planner, PAGES.things] as const

export function ContentPage({ seo, h1, lede, sections, children }: {
  seo: PageSeo
  h1: string
  lede: string
  sections: Section[]
  /** Extra content after the sections (a comparison table, say). */
  children?: ReactNode
}) {
  const others = OTHERS.filter((o) => o.path !== seo.path)
  return (
    <div className="min-h-dvh bg-[#fefffe] text-[#1b1c1f]" style={{ fontFamily: 'var(--font-inter), Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif' }}>
      <BreadcrumbJsonLd trail={[{ name: PAGES.home.crumb, path: '/' }, { name: seo.crumb, path: seo.path }]} />

      <nav aria-label="Main" className="fixed inset-x-0 top-0 z-40 flex justify-center px-4">
        <div className="mt-5 flex h-12 items-center gap-1 rounded-full border border-[#dcdad5] bg-[#fefffe]/85 pl-3 pr-[7px] shadow-[0_8px_32px_rgba(0,0,0,.06)] backdrop-blur-xl">
          <Link href="/" className="flex items-center gap-2 pr-2.5 text-base font-bold tracking-[-0.02em]"><Mark size={26} />Acture</Link>
          <a href="/app" className="flex h-[34px] items-center whitespace-nowrap rounded-full bg-[#1b1c1f] px-4 text-sm font-semibold text-[#fefffe] hover:opacity-90">Open Acture</a>
        </div>
      </nav>

      <main className="mx-auto max-w-[680px] px-6 pb-24 pt-32">
        <nav aria-label="Breadcrumb" className="text-sm text-[#6b6a66]">
          <ol className="flex flex-wrap gap-x-2">
            <li><Link href="/" className="hover:text-[#1b1c1f]">{PAGES.home.crumb}</Link></li>
            <li aria-hidden>/</li>
            <li aria-current="page">{seo.crumb}</li>
          </ol>
        </nav>

        <h1 className="mt-6 text-[clamp(36px,6vw,56px)] font-bold leading-[1.02] tracking-[-0.04em] text-balance">{h1}</h1>
        <p className="mt-5 text-[clamp(17px,2vw,20px)] leading-relaxed text-[#4a4a48] text-pretty">{lede}</p>
        <div className="mt-7 flex flex-wrap gap-2.5">
          <a href="/app" className="inline-flex h-11 items-center rounded-[10px] bg-[#1b1c1f] px-[18px] text-base font-semibold text-[#fefffe] hover:opacity-90">Open Acture</a>
          <Link href="/#faq" className="inline-flex h-11 items-center rounded-[10px] border border-[#dcdad5] bg-white px-[18px] text-base font-medium hover:bg-[#f7f7f5]">Read the questions</Link>
        </div>

        {sections.map((s) => (
          <section key={s.h} className="mt-14">
            <h2 className="text-[clamp(24px,3vw,30px)] font-bold leading-tight tracking-[-0.03em] text-balance">{s.h}</h2>
            {s.p?.map((para, i) => <p key={i} className="mt-3 text-[17px] leading-[1.65] text-[#4a4a48] text-pretty">{para}</p>)}
            {s.list && (
              <ul className="mt-3 space-y-2.5 text-[17px] leading-[1.6] text-[#4a4a48]">
                {s.list.map((li, i) => (
                  <li key={i} className="flex gap-3"><span aria-hidden className="mt-[0.7em] h-1.5 w-1.5 flex-none rounded-full bg-[#F5A524]" /><span>{li}</span></li>
                ))}
              </ul>
            )}
          </section>
        ))}

        {children}

        <section className="mt-16 rounded-2xl bg-[#141415] px-7 py-9 text-[#f4f3f0]">
          <h2 className="text-2xl font-bold tracking-[-0.03em]">Ready when you are.</h2>
          <p className="mt-2 text-[#bdbab4]">Free while it’s being built. Approved accounts sign in with Google.</p>
          <div className="mt-5 flex flex-wrap gap-2.5">
            <a href="/app" className="inline-flex h-11 items-center rounded-[10px] bg-[#fefffe] px-[18px] text-base font-semibold text-[#1b1c1f] hover:opacity-90">Open Acture</a>
            <a href="/login" className="inline-flex h-11 items-center rounded-[10px] border border-white/20 px-[18px] text-base font-medium hover:bg-white/5">Start today</a>
          </div>
        </section>

        <aside aria-label="More about Acture" className="mt-12 border-t border-[#ebe9e5] pt-6 text-[15px] text-[#6b6a66]">
          <p className="font-semibold text-[#1b1c1f]">More about Acture</p>
          <ul className="mt-2 space-y-1">
            <li><Link href="/" className="underline underline-offset-4 hover:text-[#1b1c1f]">The whole story, in one scroll</Link></li>
            {others.map((o) => <li key={o.path}><Link href={o.path} className="underline underline-offset-4 hover:text-[#1b1c1f]">{o.crumb}</Link></li>)}
          </ul>
        </aside>
      </main>
    </div>
  )
}
