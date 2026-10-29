# Monitoring SEO after deploy (free, solo founder)

Everything here costs nothing. Time needed: about 40 minutes on day 0, 10 minutes a week.

## Before you deploy
1. Decide the canonical host. The code defaults to `https://app.acture.co` (the address the repo already uses for the live app). If your public host is different, set `NEXT_PUBLIC_SITE_URL` in Vercel (Production) to it, with no trailing slash, and redeploy. Canonicals, sitemap, robots and llms.txt all follow that one variable. It must be the host that answers 200, not one that redirects.
2. If a second hostname also serves the site (a bare `acture.co`, a `*.vercel.app` URL), make it redirect permanently to the canonical one (Vercel, Domains: set redirect to the main domain; check `curl -sI https://other-host/` shows 308/301, not 307/302).

## Day 0 (after the deploy is live)
1. Check by hand on the live host (not a preview):
   - `curl -s https://HOST/robots.txt` shows `Sitemap: https://HOST/sitemap.xml` and `Disallow: /app$`, `/login`, `/api/`.
   - `curl -s https://HOST/sitemap.xml` lists 4 URLs on your host.
   - `curl -s https://HOST/ | grep canonical` shows your host.
   - Optional, one command: `node scripts/seo-audit.mjs https://HOST` (exit 0 = good).
2. Google Search Console (search.google.com/search-console): Add property. If the site is on a subdomain (app.acture.co), a "Domain" property for acture.co (DNS TXT record at your registrar) covers everything and is best; otherwise "URL prefix" with the exact https host and verify by the HTML tag or file. Add yourself and keep the verification record forever.
3. In GSC, Sitemaps: submit `sitemap.xml`. Status should say Success and 4 discovered pages.
4. GSC, URL Inspection: paste each of the 4 URLs, click "Test live URL", then "Request indexing". (About 10 requests a day are allowed. Do not use ping or submission services.)
5. Bing Webmaster Tools (bing.com/webmasters): sign in, "Import from Google Search Console" (fastest), then submit the sitemap. Bing data also feeds DuckDuckGo and several AI search tools.
6. Share the home URL in WhatsApp or Slack to check the preview card (dark card with the mark). If an old card is cached, use Facebook's Sharing Debugger or LinkedIn Post Inspector to refresh.
7. Rich Results Test (search.google.com/test/rich-results) on `/` and `/day-planner`: the landing should detect FAQ and breadcrumbs only on the right pages. Software application will show as detected but not eligible for a rich result, which is expected (no price or rating, none invented).

## Week 1
- Days 1 to 3, once a day: GSC, Pages (indexing report). New sites often sit at "Discovered, currently not indexed" or "Crawled, currently not indexed" for days to weeks. Do not resubmit repeatedly.
- GSC, Settings, Crawl stats: Googlebot arriving? Any fetch errors?
- Make sure `/app`, `/login`, `/dev/tuck` appear as excluded ("Blocked by robots.txt" or "noindex"). That is correct.
- Vercel, Logs: look at 404s. A real 404 on a URL someone links to is worth a redirect.

## Every week (10 minutes)
1. GSC, Performance: Dates = last 28 days vs previous period. Tabs: Pages (which URL gets impressions), Queries. Judge by pages, read demand from queries. Rare queries are hidden, and data lags 2 to 3 days.
2. GSC, Pages: count of indexed pages (target: 4) and the reasons list.
3. GSC, Enhancements / Breadcrumbs, FAQ: any errors.
4. Write down in a note: date, clicks, impressions, indexed count. Trends over 4 weeks matter; day-to-day does not.
5. Positions: keep a short fixed list of queries from `keyword-map.md`; read their average position in GSC (Queries, filter). Only act on moves of 5+ places sustained over 2 weeks.

## Every month
- URL Inspection on the 4 URLs: still indexed, canonical is the one you chose ("User-declared canonical" = "Google-selected canonical").
- GSC, Security and manual actions: should be empty.
- Pick the page with the most impressions and the fewest clicks and improve its title and description (never change its URL).
- Re-check `keyword-map.md` for two pages competing for one query (GSC, Queries, filter a query, look at Pages).
- Re-run `node scripts/seo-audit.mjs https://HOST` after any deploy that touched pages or config.
- Core Web Vitals (GSC) appears only after real visitor data builds up; PageSpeed Insights (pagespeed.web.dev) gives a free lab run any time.

## What to expect
- Discovery in days; indexing in days to a few weeks for a new site; any ranking beyond your own brand name usually weeks to months. A private, invite-only app with no backlinks will start with brand queries ("acture") only.
- No one can promise rankings. A flat first month is normal, not a failure.
- After a Google "core update" (status.search.google.com), wait for the rollout to finish before judging a change; "no action" is a valid decision.

## When something looks wrong
| Symptom | Likely cause | Look at |
|---|---|---|
| Page missing from Google after 4+ weeks | Not enough links/signals, or noindex | URL Inspection: "Page indexing" and "User-declared canonical" |
| "Alternate page with proper canonical tag" | Host mismatch (www vs non-www, preview URL) | `NEXT_PUBLIC_SITE_URL` vs the real host |
| "Page with redirect" for `/` | Canonical host redirects elsewhere | `curl -sI` the canonical host |
| Share card blank | Image URL 404 or blocked | open the `og:image` URL from view-source |
