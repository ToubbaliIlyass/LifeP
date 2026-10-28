/**
 * Tuck's art, ready to animate.
 *
 * A pose is an SVG file in public/tuck. To be moved by CSS it has to be in
 * the page, not behind an <img>, and several Tucks on one page must not
 * trip over each other's ids. So the file is fetched once, rewritten, and
 * kept as text:
 *
 *  - every id becomes unique per instance (the `tk__` prefix is swapped for
 *    a per-instance one when it is drawn), so `url(#glow-grad)` points at
 *    its own gradient;
 *  - every named part gets `data-t="name"`, which is what the animations in
 *    globals.css hang on. The dark files carry a light rim copy of each
 *    part under `rim-name`; both get the same `data-t`, so a limb and its
 *    rim move together;
 *  - a part that already has a `transform` attribute (the head, the sprout,
 *    the trowel) is wrapped in a plain group that takes the data attribute
 *    instead. A CSS transform on the part itself would replace its pose.
 */

import type { TuckLevel, TuckState } from './states'

const NS = 'http://www.w3.org/2000/svg'
/** Swapped for the instance's own prefix when drawn. */
export const ID_PREFIX = 'tk__'

const ready = new Map<string, string>()
const pending = new Map<string, Promise<string>>()

const keyOf = (state: TuckState, dark: boolean, level: TuckLevel | null) =>
  `${dark ? 'd' : 'l'}:${state}:${level ?? ''}`

/** The prepared art, if it has been fetched already. */
export function peekArt(state: TuckState, dark: boolean, level: TuckLevel | null = null): string | null {
  return ready.get(keyOf(state, dark, level)) ?? null
}

async function text(path: string): Promise<string> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`Tuck art ${path}: ${res.status}`)
  return res.text()
}

/** Fetches and prepares one pose. Resolves to '' if the file is unusable, so the picture stays an <img>. */
export function loadArt(state: TuckState, dark: boolean, level: TuckLevel | null = null): Promise<string> {
  const key = keyOf(state, dark, level)
  const hit = pending.get(key)
  if (hit) return hit
  const dir = dark ? 'svg-dark' : 'svg'
  const job = Promise.all([
    text(`/tuck/${dir}/${state}.svg`),
    // A growth stage other than the default swaps the sprout for that stage's.
    level && level !== 'sprout' ? text(`/tuck/${dir}/level-${level}.svg`) : Promise.resolve(null),
  ])
    .then(([body, stage]) => {
      const out = prepare(body, stage)
      if (out) ready.set(key, out)
      return out
    })
    .catch(() => '')
  pending.set(key, job)
  return job
}

function parse(source: string): Document | null {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  return doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg' ? null : doc
}

function prepare(source: string, stage: string | null): string {
  const doc = parse(source)
  if (!doc) return ''
  const svg = doc.documentElement

  if (stage) {
    const from = parse(stage)
    if (from) {
      for (const id of ['sprout', 'rim-sprout']) {
        const old = svg.querySelector(`[id="${id}"]`)
        const next = from.documentElement.querySelector(`[id="${id}"]`)
        if (old && next) old.replaceWith(doc.importNode(next, true))
      }
    }
  }

  svg.querySelector('title')?.remove()
  for (const a of ['width', 'height', 'role', 'aria-label']) svg.removeAttribute(a)
  svg.setAttribute('focusable', 'false')

  for (const el of Array.from(svg.querySelectorAll('[id]'))) {
    const id = el.getAttribute('id')!
    el.setAttribute('id', `${ID_PREFIX}${id}`)
    const part = id.replace(/^rim-/, '')
    if (el.hasAttribute('transform') && el.parentNode) {
      const wrap = doc.createElementNS(NS, 'g')
      wrap.setAttribute('data-t', part)
      el.parentNode.insertBefore(wrap, el)
      wrap.appendChild(el)
    } else {
      el.setAttribute('data-t', part)
    }
  }

  // References follow the ids: gradients, clips, <use>.
  for (const el of Array.from(svg.querySelectorAll('*'))) {
    for (const attr of Array.from(el.attributes)) {
      if (attr.name === 'id') continue
      if (attr.value.includes('url(#')) {
        el.setAttribute(attr.name, attr.value.replace(/url\(#([^)]+)\)/g, `url(#${ID_PREFIX}$1)`))
      } else if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#')) {
        el.setAttribute(attr.name, `#${ID_PREFIX}${attr.value.slice(1)}`)
      }
    }
  }
  return new XMLSerializer().serializeToString(svg)
}
