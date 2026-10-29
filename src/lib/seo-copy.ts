import type { Metadata } from 'next'
import { url } from './site'

/*
 * Titles and descriptions for every public page, in one file, keyed to
 * docs/seo/keyword-map.md. `absolute` titles on purpose: the brand is
 * written into each one, so the root template can never add it twice.
 * Titles aim for ~60 characters, descriptions for 120-160.
 */
export interface PageSeo {
  path: string
  title: string
  description: string
  /** Shown on the page as the short name in the breadcrumb. */
  crumb: string
}

export const PAGES = {
  home: {
    path: '/',
    crumb: 'Home',
    title: 'Acture: a calm to-do list you talk to',
    description:
      'Say it or show it, and Acture turns it into to-dos, finds each one a time, and learns when you really get things done. Things, but it listens.',
  },
  voice: {
    path: '/voice-to-do-list',
    crumb: 'Voice to-do list',
    title: 'Voice To-Do List App: Say It, Get Your To-Dos | Acture',
    description:
      'Talk the way you would to a friend and Acture turns it into to-dos. Add several in one go, send a photo of a whiteboard, or just type. One press undoes.',
  },
  planner: {
    path: '/day-planner',
    crumb: 'Day planner',
    title: 'Day Planner That Learns When You Get Things Done | Acture',
    description:
      'Plan my day gives every to-do a time around your events. Then Acture notices when you really do things, and tomorrow’s plan follows you.',
  },
  things: {
    path: '/things-alternative',
    crumb: 'Things alternative',
    title: 'A Things 3 Alternative You Can Talk To | Acture',
    description:
      'Same calm list (Inbox, Today, Upcoming, projects), but in your browser, on Windows and Android too, and you can talk to it. An honest comparison.',
  },
} as const satisfies Record<string, PageSeo>

/** Metadata for a public page: absolute title, self-referencing canonical, matching social tags. */
export function pageMetadata(p: PageSeo): Metadata {
  return {
    title: { absolute: p.title },
    description: p.description,
    alternates: { canonical: url(p.path) },
    openGraph: { title: p.title, description: p.description, url: url(p.path), type: 'website' },
    twitter: { card: 'summary_large_image', title: p.title, description: p.description },
  }
}
