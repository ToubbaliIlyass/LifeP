#!/usr/bin/env node
/*
 * Crawl the sitemap of a running Acture and check the SEO basics.
 *   node scripts/seo-audit.mjs http://localhost:3055   # a local `next start`
 *   node scripts/seo-audit.mjs https://your-host       # production
 * When auditing localhost, build with NEXT_PUBLIC_SITE_URL=http://localhost:3055
 * so canonicals and the sitemap name the local host; otherwise the host check
 * is skipped with a warning. Free, no dependencies. Exit 1 on any failure.
 */
const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '')
const fails = []
const warns = []
const ok = (c, m) => { if (!c) fails.push(m) }
const get = (p) => fetch(base + p, { redirect: 'manual' })

const sm = await (await get('/sitemap.xml')).text()
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
ok(locs.length > 0, 'sitemap has no URLs')
const origin = locs[0] ? new URL(locs[0]).origin : ''
if (origin !== base) warns.push(`sitemap host ${origin} differs from audited host ${base}: canonical host checks skipped`)

const titles = new Set()
for (const loc of locs) {
  const path = new URL(loc).pathname
  const r = await get(path)
  ok(r.status === 200, `${path}: status ${r.status}`)
  const html = await r.text()
  const canon = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  ok(!!canon, `${path}: no canonical`)
  if (origin === base) ok(canon === loc || canon + '/' === loc, `${path}: canonical ${canon} != ${loc}`)
  ok(!/<meta name="robots" content="[^"]*noindex/.test(html), `${path}: noindex on an indexable page`)
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1] || ''
  ok(title.length > 10 && title.length <= 65, `${path}: title length ${title.length} ("${title}")`)
  ok(!titles.has(title), `${path}: duplicate title`)
  titles.add(title)
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || ''
  ok(desc.length >= 80 && desc.length <= 170, `${path}: description length ${desc.length}`)
  ok((html.match(/<h1[ >]/g) || []).length === 1, `${path}: expected exactly one h1`)
  ok(/property="og:image"/.test(html) && /name="twitter:image"/.test(html), `${path}: og:image / twitter:image missing`)
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1])
  ok(blocks.length > 0, `${path}: no JSON-LD`)
  const types = []
  for (const b of blocks) {
    try { const j = JSON.parse(b); types.push(...(j['@graph'] ?? [j]).map((n) => n['@type'])) } catch { fails.push(`${path}: JSON-LD does not parse`) }
  }
  ok(types.includes('FAQPage') === (path === '/'), `${path}: FAQPage must be on the landing page only (types: ${types})`)
  ok(types.includes('BreadcrumbList') === (path !== '/'), `${path}: BreadcrumbList on sub-pages only (types: ${types})`)
  const img = html.match(/property="og:image" content="([^"]+)"/)?.[1]
  if (img) { const ir = await fetch(base + new URL(img).pathname); ok(ir.status === 200 && /image\//.test(ir.headers.get('content-type')), `${path}: og:image ${img} -> ${ir.status}`) }
  console.log(`${r.status} ${path}  [${types.join(', ')}]  title ${title.length}c desc ${desc.length}c`)
}

// Private routes must not be indexable.
for (const p of ['/login', '/dev/tuck']) {
  const html = await (await get(p)).text()
  ok(/<meta name="robots" content="noindex/.test(html), `${p}: missing noindex meta`)
}
const app = await get('/app'); ok([301, 302, 307, 308].includes(app.status) || app.status === 200, '/app: unexpected status')
const api = await get('/api/todos'); ok(/noindex/.test(api.headers.get('x-robots-tag') || ''), '/api: missing X-Robots-Tag')
const nf = await get('/definitely-not-a-page'); ok(nf.status === 404, `unknown URL status ${nf.status}, expected 404`)
const robots = await (await get('/robots.txt')).text()
ok(robots.includes(`Sitemap: ${origin}/sitemap.xml`), 'robots.txt sitemap line does not match sitemap host')
for (const d of ['/api/', '/login', '/dev/', '/auth/']) ok(robots.includes(`Disallow: ${d}`), `robots.txt: ${d} not disallowed`)
const llms = await get('/llms.txt'); ok(llms.status === 200, 'llms.txt missing')
for (const l of (await llms.text()).matchAll(/\]\((https?:[^)]+)\)/g)) ok(origin === '' || l[1].startsWith(origin), `llms.txt link off-host: ${l[1]}`)

warns.forEach((w) => console.log('WARN', w))
if (fails.length) { console.log('\nFAIL'); fails.forEach((f) => console.log(' -', f)); process.exit(1) }
console.log('\nOK: all checks passed')
