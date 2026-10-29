import { StoryLanding } from '@/components/landing/StoryLanding'
import { FAQ } from '@/components/landing/story-engine'
import { FaqJsonLd, SoftwareApplicationJsonLd } from '@/components/seo/JsonLd'
import { PAGES, pageMetadata } from '@/lib/seo-copy'

export const metadata = pageMetadata(PAGES.home)

/*
 * The front door: one scroll, and a day happens — see StoryLanding.tsx,
 * built from the Claude Design file "Acture Landing v4". The questions it
 * shows (FAQ) are the same list the FAQPage markup is made from, so the
 * markup can never say something the page doesn't.
 */
export default function Landing() {
  return (
    <>
      <SoftwareApplicationJsonLd />
      <FaqJsonLd items={FAQ} />
      <StoryLanding />
    </>
  )
}
