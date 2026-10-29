# SEO report: organic foundation (branch `seo/organic-foundation`)

Date: 2026-10-28. Free methods only. Nothing pushed or merged.

## 1. What was found (before)
Measured on a production build served locally (baseline, `main`):
- `/robots.txt` and `/sitemap.xml`: 404. No canonical, no JSON-LD, no `og:image`, `twitter:card=summary`, no `metadataBase`.
- Title/description/OG existed on the landing only. `/login` and `/dev/tuck` (a dev playground) returned 200 and were indexable. `/app` redirects to `/login` when signed out (307).
- Crawlability of the pinned scroll story is good: all 8 chapter headings and texts, the whole FAQ (answers included) and the second story's text are in the server HTML (the component renders every chapter with opacity 0 and switches it with scroll). One `<h1>`, but also two decorative `<h3>` inside the aria-hidden app mock (fixed: now `div`).
- three.js (`why-scene`) is dynamically imported only when the section is within 150% of the viewport, so it does not weigh on first load or crawl.
- Images: Tuck art is SVG with alt text; no raster heroes. Fonts: Inter via `next/font` (self-hosted, preloaded).
- Stale copy: the FAQ said "no push notifications", but push exists in the code (Settings, Notifications). Corrected (this is also the text in the FAQ JSON-LD).
- Lighthouse (mobile preset, local, offline cached CLI): home performance 79-80, accessibility 95, best-practices 100, SEO 100; LCP 3.8 s, CLS 0.197 (baseline) vs 0.204 after (same, pre-existing).

## 2. What changed
| Area | File |
|---|---|
| Single origin + `url()` helper, `PUBLIC_PATHS` | `src/lib/site.ts` |
| Titles/descriptions in one place (absolute titles, no doubled brand) | `src/lib/seo-copy.ts` |
| JSON-LD components: Organization+WebSite, SoftwareApplication, FAQPage, BreadcrumbList | `src/components/seo/JsonLd.tsx` |
| Site layout: `metadataBase`, title default/template, OG/Twitter defaults, robots with `max-snippet:-1`, `max-image-preview:large`; Organization+WebSite in body. No canonical in the layout | `src/app/(site)/layout.tsx` |
| Landing: per-page canonical, FAQPage (built from the same `FAQ` array the page shows) and SoftwareApplication | `src/app/(site)/page.tsx` |
| 3 public pages + shared shell | `src/app/(site)/{voice-to-do-list,day-planner,things-alternative}/page.tsx`, `src/components/site/ContentPage.tsx` |
| OG image generated in code (dark tile, the mark, the line); per-page copies because a page that sets `openGraph` hides the parent's image | `src/app/(site)/opengraph-image.tsx` and `*/opengraph-image.tsx` |
| robots.txt, sitemap.xml (no fake `lastModified`) | `src/app/robots.ts`, `src/app/sitemap.ts` |
| llms.txt, answer-first, built from `url()` | `src/app/llms.txt/route.ts` |
| Private routes: `noindex` meta on the whole app root (`/app`, `/login`, `/dev/tuck`); `X-Robots-Tag: noindex` on `/api/*` and `/auth/*` | `src/app/(app)/layout.tsx`, `next.config.ts` |
| Proxy matcher skips robots/sitemap/llms/OG image so crawlers do not trigger a Supabase call | `src/proxy.ts` |
| Landing copy: hero line "A calm to-do list you talk to. It plans your day, learns when you really get things done, and shows you who you're becoming."; chapter 1 "turns your voice into to-dos"; footer links to the 3 pages; FAQ push answer corrected; decorative h3 to div | `src/components/landing/{StoryLanding,story-engine}.tsx` |
| Audit script | `scripts/seo-audit.mjs` |
| Docs | `docs/seo/{keyword-map,MONITORING,SEO-REPORT}.md` |

Not touched: icons, favicon, manifest, `global-not-found.tsx`, the landing design and motion. The h1 stays "Say it. Do it. Become it." (the brand line); the keyword phrases live in the hero line, headings of the new pages, titles and FAQ.

## 3. Production origin
Not set in env, Vercel config or metadata. The only evidence in the repo is `https://app.acture.co` (cron URL in `docs/reminders.md`, VAPID subject in `src/lib/push-server.ts`), and the landing and app are one deployment, so that is the fallback in `src/lib/site.ts`. It can be overridden with `NEXT_PUBLIC_SITE_URL`. No domain was invented. If the real public host is different (for example an apex `acture.co`), set the variable before deploying, or every canonical and sitemap URL will name a host that may redirect (the Atlas lesson).

## 4. Checks after (production build, `NEXT_PUBLIC_SITE_URL=http://localhost:3055`)
- `npm test`: 96 pass. `npx tsc --noEmit -p .`: clean. ESLint on all touched files: clean. `npm run build`: passes.
- `node scripts/seo-audit.mjs http://localhost:3055`: all passes. It checks per sitemap URL: 200, self-referencing canonical, no noindex, title 10-65 chars and unique, description 80-170, exactly one h1, og:image and twitter:image present and returning an image, JSON-LD parses (`JSON.parse` on each block) with FAQPage only on `/` and BreadcrumbList only on sub-pages; plus `/login` and `/dev/tuck` noindex, `/api` X-Robots-Tag, unknown URL = 404, robots sitemap line matches sitemap host and disallows the private paths, llms.txt links all on-host.
- Lighthouse after: home perf 79 / a11y 95 / BP 100 / SEO 100; `/things-alternative` perf 95 / a11y 100 / BP 100 / SEO 100 (CLS 0, LCP 2.9 s under mobile throttling).
- Internal links: each public page has 3 inbound links (landing footer plus the other two pages' "More about Acture").

## 5. What could not be verified
- Behaviour on the real host (canonical host, redirects of other hostnames, Vercel headers). Nothing was deployed.
- Google's Rich Results Test, Schema validator, and real indexing: need the live URL. The JSON-LD was only syntax-checked.
- Real search volumes and SERPs: no free tool was run (no network keyword data); the keyword map is reasoning only.
- Share-card rendering in WhatsApp/LinkedIn. The PNG was viewed locally (1200x630).
- Lighthouse was run on a local server in a headless Chrome with the simulated throttling; field Core Web Vitals do not exist yet.

## 6. Risks for the live deploy
1. **Host assumption**: `app.acture.co` is inferred. If wrong, set `NEXT_PUBLIC_SITE_URL` first. This is the single highest risk.
2. **`app.` subdomain for a marketing page** is unusual; search engines are fine with it, but consider whether the landing should live on the apex later (that would be a move: needs redirects and Change of Address, do not do it casually).
3. **Private access**: the product is invite-only. Pages are honest about it, which limits conversion from search. Opening sign-ups is the biggest SEO multiplier, not code.
4. **robots Disallow + noindex**: `/login` and `/app` are disallowed in robots.txt, so Google may never see their noindex meta; that is fine (they will not be crawled). If a blocked URL gets linked from elsewhere it can show as "indexed, though blocked" without a snippet. The `/dev/tuck` playground is public in production: consider removing the route from production builds.
5. **Proxy still runs Supabase `getUser()` on `/` and the three pages** (the matcher only skips assets). This adds latency for every crawler hit and a hard dependency on Supabase for the public pages. Consider excluding the public paths from the matcher (needs a decision, it touches the auth gate).
6. **Canonical of `/`**: Next emits `https://host` (no slash) for the root while the sitemap says `https://host/`; they are the same URL for Google.
7. **Performance, not fixed (design)**: LCP 3.8 s and CLS 0.20 on the landing on mobile. Cause: the page is laid out from JS-measured sizes (`useLayoutEffect` sets viewport size after hydration, so the server HTML is the desktop layout and mobile shifts), and the 5.8 s intro animation keeps the hero text at opacity 0 for about 3 s. Googlebot sees the text in HTML either way. Ideas: shorten or skip the intro for repeat visits (sessionStorage), render the narrow layout via CSS first. Not done: the user asked to keep the design intact.
8. **Claims**: every sentence on the new pages was checked against code or the existing FAQ (voice capture, photo import, Plan my day, two-week rhythm, evening check-in, keys, install, JSON export, allowlist sign-in). The Things column is from general knowledge (Apple-only native apps, same list structure); the page says so and links no price. Re-read it if Things changes.
9. `SoftwareApplication` has no offers or rating on purpose; it is machine-readable context, not a rich-result candidate.

## 7. Owner to-do (prioritised; only you can do these)
1. Confirm the public host; set `NEXT_PUBLIC_SITE_URL` in Vercel if it is not `https://app.acture.co`; make any other hostname redirect permanently to it. Deploy.
2. Verify Google Search Console and Bing Webmaster, submit the sitemap, request indexing for the 4 URLs (steps in `MONITORING.md`). Do this the same day: GSC has no history before verification.
3. Decide whether sign-ups should open. Without that, organic traffic cannot become users.
4. Legitimate links, a few good ones: Product Hunt launch (when open), Hacker News "Show HN", relevant subreddits where you can be useful (r/productivity, r/ADHD tools threads, r/selfhosted not relevant), Indie Hackers, AlternativeTo.net (list as an alternative to Things, free), the Product directories like Toolfinder/SaaSHub (free tiers), a short write-up on dev.to or your own blog. No bought links, no bulk submissions.
5. Add real material: 20 s screen recording of "say it, get to-dos", a screenshot of the learning chart, a short founder note ("why I built it", the Morocco angle if you like). Put the recording on the voice page; that is what makes those pages better than a competitor's text.
6. Write one post a month, one query each (ideas in `keyword-map.md`), registered in the keyword map first. Link up to the page that owns the topic.
7. After 4 weeks, read GSC Queries and Pages and improve the 3 pages with impressions but few clicks (titles first).
8. Decide on the points in section 6 (4, 5, 7).
