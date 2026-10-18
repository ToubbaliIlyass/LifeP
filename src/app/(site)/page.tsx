import type { Metadata } from 'next'
import { StoryLanding } from '@/components/landing/StoryLanding'

export const metadata: Metadata = {
  title: 'Acture: Things, but it listens',
  description:
    'A calm to-do list you talk to. Say it or show it, and Acture turns it into to-dos, finds each one a time, and learns when you really get things done.',
  openGraph: {
    title: 'Acture: Things, but it listens',
    description: 'A calm to-do list you talk to. It plans your day, then learns when you really get things done.',
    type: 'website',
  },
}

/*
 * The front door: one scroll, and a day happens — see StoryLanding.tsx,
 * built from the Claude Design file "Acture Landing v4".
 */
export default function Landing() {
  return <StoryLanding />
}
