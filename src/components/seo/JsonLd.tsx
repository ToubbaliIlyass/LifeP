import { BRAND, SITE_ORIGIN, url } from '@/lib/site'

/*
 * Structured data, one small server component per type. All URLs come from
 * src/lib/site.ts. Nothing here is invented: no ratings, no prices, no
 * reviews. `<` is escaped so page text can never close the script tag.
 */
function Script({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}

/** Organization + WebSite, sitewide (the site layout). */
export function OrganizationJsonLd() {
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Organization',
            '@id': `${SITE_ORIGIN}/#organization`,
            name: BRAND.name,
            url: url('/'),
            logo: url('/icons/icon-512.png'),
            description: BRAND.summary,
          },
          {
            '@type': 'WebSite',
            '@id': `${SITE_ORIGIN}/#website`,
            name: BRAND.name,
            url: url('/'),
            description: BRAND.summary,
            inLanguage: 'en',
            publisher: { '@id': `${SITE_ORIGIN}/#organization` },
          },
        ],
      }}
    />
  )
}

/** The product, on the landing page. Only fields that are true; no offers or ratings. */
export function SoftwareApplicationJsonLd() {
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        '@id': `${SITE_ORIGIN}/#app`,
        name: BRAND.name,
        url: url('/'),
        description: BRAND.summary,
        applicationCategory: 'ProductivityApplication',
        operatingSystem: 'Any modern web browser; installable from Chrome on computers and Android',
        inLanguage: 'en',
        publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      }}
    />
  )
}

/** Only on a page that shows these questions and answers. Answers are plain text. */
export function FaqJsonLd({ items }: { items: readonly { q: string; a: string }[] }) {
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: items.map((i) => ({ '@type': 'Question', name: i.q, acceptedAnswer: { '@type': 'Answer', text: i.a } })),
      }}
    />
  )
}

/** Matches the visible breadcrumb on the page. */
export function BreadcrumbJsonLd({ trail }: { trail: readonly { name: string; path: string }[] }) {
  return (
    <Script
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: trail.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.name, item: url(t.path) })),
      }}
    />
  )
}
