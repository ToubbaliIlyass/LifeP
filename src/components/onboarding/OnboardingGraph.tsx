'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTypeColors } from '@/components/graph/useTypeColors'
import { leafCircleStyle, categoryCircleStyle, categoryTextStyle } from '@/components/graph/nodes/typeStyle'
import { pluralize } from '@/lib/graph/layout'
import { typeColorCss } from '@/lib/colors'
import { Plus, Minus, Maximize2 } from 'lucide-react'

/**
 * The graph, filling in while setup is answered.
 *
 * Setup used to be a form that said nothing back: you named six things and
 * found out on the far side what the app had made of them. This is the other
 * half of the screen — every goal, project, commitment, habit, course and
 * task appears as the node it is about to become, on the branch it belongs
 * to, the moment it has a name. By the time anyone presses Finish they have
 * already seen the thing they are being given.
 *
 * It is the app's own graph rather than an illustration of one: the circles
 * come from the same `typeStyle` helpers as GraphView's nodes, at the same
 * sizes, with the same structural edges and the same root → category → leaf
 * shape the real layout builds. What is not shared is the positioning —
 * GraphView runs a d3 force simulation over saved nodes, which settles over
 * a second or so and cannot be asked to hold still while somebody types.
 * Here the ring is arithmetic, so a node lands exactly where the next one
 * will and nothing already on screen jumps.
 *
 * Nothing here has been written. It is what Finish is about to create.
 */

/** A node the user has named, in the type the app will store it as. */
export interface SeedNode {
  /** Lower-cased node type: the key its colour and plural label come from. */
  type: string
  label: string
}

/** One thing said to be in service of another: drawn as the app's own
 *  semantic edge, between the two leaves rather than through the root. */
export interface SeedLink {
  from: SeedNode
  to: SeedNode
  type: string
}

export interface GraphSeed {
  nodes: SeedNode[]
  links: SeedLink[]
  /**
   * Parts of the day, and hours that are spoken for. Not nodes — a span of a
   * day is a setting, not a thing — so they are the dial around the middle
   * rather than circles out on the ring.
   */
  dayParts: { id: string; name: string; start: string; end: string }[]
  busy: { start: string; end: string }[]
  workingHours: { start: string; end: string }
}

/** Categories go round in a fixed order, so a new one never reshuffles the rest. */
const TYPE_ORDER = ['goal', 'project', 'course', 'assignment', 'event', 'habit', 'task', 'note']

/** Past this, a category says "+N" rather than becoming a hedge of labels. */
const MAX_PER_TYPE = 6

/* Circle radii, straight from the real nodes (see ./nodes/*.tsx). */
const ROOT_R = 42
const CAT_R = 32
const LEAF_R = 23
/**
 * Room around every circle for its own glow.
 *
 * The circles carry their halo as a box-shadow, exactly as the real nodes do
 * — and a box-shadow is painted outside the element, while a foreignObject
 * clips to its box. Sized to the circle, each one therefore cut its own glow
 * off at the square, which read as a rectangle of light behind a round node.
 * So the box is bigger than the circle by more than the blur's reach, and
 * the circle is centred inside it.
 */
const GLOW_ROOM = 24

/** The box a leaf takes up: the app's own label width, and two short lines. */
const LEAF_W = 104
const LEAF_H = 34
/** How much further out the second ring of leaves sits than the first. */
const TIER_GAP = 120
/** Where the day dial sits: outside the root circle, inside the categories. */
const DIAL_R = 74

const rad = (deg: number) => (deg * Math.PI) / 180
const polar = (angle: number, radius: number) => ({ x: Math.cos(rad(angle)) * radius, y: Math.sin(rad(angle)) * radius })

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : NaN
}

/** An arc of the day dial, for one span of the working day. */
function dialArc(startMin: number, endMin: number, dayStart: number, dayEnd: number): string | null {
  const span = dayEnd - dayStart
  if (!(span > 0) || !Number.isFinite(startMin) || !Number.isFinite(endMin)) return null
  const a0 = -90 + ((Math.max(startMin, dayStart) - dayStart) / span) * 360
  const a1 = -90 + ((Math.min(endMin, dayEnd) - dayStart) / span) * 360
  if (!(a1 > a0)) return null
  const p0 = polar(a0, DIAL_R)
  const p1 = polar(a1, DIAL_R)
  return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} A ${DIAL_R} ${DIAL_R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`
}

/**
 * An edge, drawn as a fixed-length line that the transform fits into place.
 *
 * A `<line>`'s endpoints are attributes, and attributes do not transition —
 * so an edge whose node had just glided to a new slot would snap while the
 * circle on the end of it moved smoothly. A CSS transform does transition,
 * so the line is always the same line and only its placement changes. The
 * stroke is held at its real width through the scale by `vector-effect`.
 *
 * The line is EDGE_UNIT long and scaled down, never a unit line scaled up:
 * while a transform transitions the browser composites the line as a bitmap
 * rasterised at its own size, and a 1-unit line stretched hundreds of times
 * smears its ends into long fading tails that run straight through both
 * circles. Shrinking a long one stays sharp.
 */
const EDGE_UNIT = 1000

function edgeTransform(from: { x: number; y: number }, to: { x: number; y: number }, fromR: number, toR: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy) || 1
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI
  const start = { x: from.x + (dx / dist) * fromR, y: from.y + (dy / dist) * fromR }
  const length = Math.max(dist - fromR - toR, 1)
  return `translate(${start.x.toFixed(1)}px, ${start.y.toFixed(1)}px) rotate(${angle.toFixed(2)}deg) scaleX(${(length / EDGE_UNIT).toFixed(4)})`
}

export function OnboardingGraph({ seed, focus }: {
  seed: GraphSeed
  /** The node types the current step is about: they light, the rest dim. */
  focus?: readonly string[]
}) {
  const typeColors = useTypeColors()
  const colorCss = useMemo(() => typeColorCss('.ob-graph', typeColors), [typeColors])

  const layout = useMemo(() => {
    const byType = new Map<string, string[]>()
    for (const node of seed.nodes) {
      const label = node.label.trim()
      if (!label) continue
      byType.set(node.type, [...(byType.get(node.type) ?? []), label])
    }
    const types = [
      ...TYPE_ORDER.filter((t) => byType.has(t)),
      ...[...byType.keys()].filter((t) => !TYPE_ORDER.includes(t)),
    ]
    if (types.length === 0) return null

    /*
     * The ring sizes itself.
     *
     * Each category gets a sector, its leaves are spread across three
     * quarters of it, and they alternate between two distances from the
     * middle so a neighbour is never only an inch away along the same arc.
     * Then the whole thing is grown until no two labels can touch —
     * measured, not estimated, because the angle two leaves end up at
     * depends on how many categories there are, how full the fullest one is
     * and where the boundary between two of them falls, and a formula that
     * got that subtly wrong put two names on top of each other at exactly
     * the densities a real setup produces. The graph therefore opens out as
     * it fills, which on screen reads as zooming out.
     */
    const sector = 360 / types.length
    const widest = Math.min(MAX_PER_TYPE, Math.max(...types.map((t) => byType.get(t)!.length)))
    const step = (sector * 0.76) / Math.max(widest - 1, 1)

    const place = (inner: number) => types.map((type, i) => {
      const angle = -90 + i * sector
      const labels = byType.get(type)!
      const shown = labels.slice(0, MAX_PER_TYPE)
      const leaves = shown.map((label, j) => ({
        key: `${type}-${j}`,
        label,
        ...polar(angle + (j - (shown.length - 1) / 2) * step, j % 2 === 0 ? inner : inner + TIER_GAP),
      }))
      return { type, angle, labels, shown, leaves }
    })

    const touching = (cats: ReturnType<typeof place>) => {
      const all = cats.flatMap((c) => c.leaves)
      for (let a = 0; a < all.length; a++) {
        for (let b = a + 1; b < all.length; b++) {
          if (Math.abs(all[a].x - all[b].x) < LEAF_W && Math.abs(all[a].y - all[b].y) < LEAF_H) return true
        }
      }
      return false
    }

    let inner = 250
    for (let guard = 0; guard < 60 && touching(place(inner)); guard++) inner += 20

    const catDist = Math.max(170, inner * 0.52)
    const placed = place(inner)
    const positionOf = new Map<string, { x: number; y: number }>()
    for (const cat of placed) {
      for (const leaf of cat.leaves) positionOf.set(`${cat.type}|${leaf.label.toLowerCase()}`, { x: leaf.x, y: leaf.y })
    }
    const categories = placed.map((cat) => ({
      type: cat.type,
      leaves: cat.leaves,
      overflow: cat.labels.length - cat.shown.length,
      overflowAt: polar(cat.angle, catDist + 52),
      ...polar(cat.angle, catDist),
    }))

    return {
      categories,
      positionOf,
      extent: inner + TIER_GAP + 78,
      total: [...byType.values()].reduce((n, v) => n + v.length, 0),
    }
  }, [seed.nodes])

  // The dial: the working day, with its named parts lit and its busy hours
  // dimmed. Drawn before a single node exists, because the day is the first
  // thing setup asks about.
  const dayStart = minutes(seed.workingHours.start)
  const dayEnd = minutes(seed.workingHours.end)
  const parts = seed.dayParts
    .map((p) => ({ id: p.id, d: dialArc(minutes(p.start), minutes(p.end), dayStart, dayEnd) }))
    .filter((p): p is { id: string; d: string } => p.d !== null)
  const busy = seed.busy
    .map((b, i) => ({ id: `busy-${i}`, d: dialArc(minutes(b.start), minutes(b.end), dayStart, dayEnd) }))
    .filter((b): b is { id: string; d: string } => b.d !== null)

  const extent = layout?.extent ?? 240
  const centre = { x: 0, y: 0 }

  /*
   * Pan and zoom, because a graph you cannot move is a picture of a graph.
   * The real view gets this from ReactFlow; here it is a transform on one
   * group, which is all that is needed when there is nothing to drop things
   * onto and nothing to select.
   *
   * `view` is in the same user units as everything else: the viewBox is
   * centred on the root, so scaling about the origin scales about the middle
   * of the graph, and a pointer position only has to be converted once.
   */
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const svgRef = useRef<SVGSVGElement>(null)
  const dragging = useRef<{ x: number; y: number; view: { x: number; y: number } } | null>(null)
  /** Only for the cursor: where the drag began is a ref, that it began is not. */
  const [grabbing, setGrabbing] = useState(false)
  const moved = view.x !== 0 || view.y !== 0 || view.k !== 1

  /** A pointer, in the units the viewBox is drawn in. */
  const toUnits = useCallback((clientX: number, clientY: number) => {
    const el = svgRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    // preserveAspectRatio="xMidYMid meet": the smaller ratio is the one used.
    const scale = Math.min(rect.width, rect.height) / (extent * 2) || 1
    return {
      x: (clientX - rect.left - rect.width / 2) / scale,
      y: (clientY - rect.top - rect.height / 2) / scale,
    }
  }, [extent])

  const zoomBy = useCallback((factor: number, at?: { x: number; y: number }) => {
    setView((v) => {
      const k = Math.min(3, Math.max(0.35, v.k * factor))
      // Hold whatever is under the pointer still while the scale changes.
      const p = at ?? { x: 0, y: 0 }
      const graph = { x: (p.x - v.x) / v.k, y: (p.y - v.y) / v.k }
      return { k, x: p.x - graph.x * k, y: p.y - graph.y * k }
    })
  }, [setView])

  /*
   * The wheel listener is attached by hand because React's is passive, and a
   * passive listener cannot stop the page scrolling behind the zoom.
   */
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      zoomBy(Math.exp(-e.deltaY * 0.0016), toUnits(e.clientX, e.clientY))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomBy, toUnits])

  return (
    <div className="ob-graph">
      {/* The user's per-type hues, as the custom properties every circle
          reads — the same stylesheet GraphView publishes, so a Habit is the
          colour here that it will be on the far side of Finish. */}
      <style>{colorCss}</style>

      <svg
        ref={svgRef}
        className="ob-graph-svg"
        viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="The graph your answers are building"
        data-dragging={grabbing}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          dragging.current = { ...toUnits(e.clientX, e.clientY), view: { x: view.x, y: view.y } }
          setGrabbing(true)
        }}
        onPointerMove={(e) => {
          const from = dragging.current
          if (!from) return
          const now = toUnits(e.clientX, e.clientY)
          setView((v) => ({ ...v, x: from.view.x + (now.x - from.x), y: from.view.y + (now.y - from.y) }))
        }}
        onPointerUp={(e) => {
          e.currentTarget.releasePointerCapture(e.pointerId)
          dragging.current = null
          setGrabbing(false)
        }}
        onPointerCancel={() => { dragging.current = null; setGrabbing(false) }}
        onDoubleClick={() => setView({ x: 0, y: 0, k: 1 })}
      >
        {/* Everything the pan and zoom move. The dot grid behind it belongs
            to the pane, so the graph slides over its own background the way
            the real one does. */}
        <g className="ob-viewport" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
        <circle r={DIAL_R} className="ob-dial-base" />
        {busy.map((b) => <path key={b.id} d={b.d} className="ob-dial-busy" />)}
        {parts.map((p) => <path key={p.id} d={p.d} className="ob-dial-part" />)}

        {layout?.categories.map((cat) => (
          <g key={cat.type} className="ob-branch" data-lit={focus?.includes(cat.type) === true}>
            <line
              x1={0} y1={0} x2={EDGE_UNIT} y2={0}
              vectorEffect="non-scaling-stroke"
              className="ob-edge"
              style={{ transform: edgeTransform(centre, cat, ROOT_R, CAT_R) }}
            />
            {cat.leaves.map((leaf) => (
              <line
                key={`e-${leaf.key}`}
                x1={0} y1={0} x2={EDGE_UNIT} y2={0}
                vectorEffect="non-scaling-stroke"
                className="ob-edge"
                style={{ transform: edgeTransform(cat, leaf, CAT_R, LEAF_R) }}
              />
            ))}

            <g className="ob-node" style={{ transform: `translate(${cat.x}px, ${cat.y}px)` }}>
              <foreignObject
                x={-(CAT_R + GLOW_ROOM)}
                y={-(CAT_R + GLOW_ROOM)}
                width={(CAT_R + GLOW_ROOM) * 2}
                height={(CAT_R + GLOW_ROOM) * 2}
              >
                <div
                  className="flex items-center justify-center select-none"
                  style={{ width: (CAT_R + GLOW_ROOM) * 2, height: (CAT_R + GLOW_ROOM) * 2 }}
                >
                  <div
                    className="w-[64px] h-[64px] rounded-full border-2 flex items-center justify-center"
                    style={categoryCircleStyle(cat.type)}
                  >
                    <span
                      className="text-[10px] font-extrabold uppercase tracking-widest text-center leading-none px-1"
                      style={categoryTextStyle(cat.type)}
                    >
                      {pluralize(cat.type)}
                    </span>
                  </div>
                </div>
              </foreignObject>
            </g>

            {cat.leaves.map((leaf, i) => (
              <g
                key={leaf.key}
                className="ob-node"
                style={{ transform: `translate(${leaf.x}px, ${leaf.y}px)`, animationDelay: `${Math.min(i, 5) * 45}ms` }}
              >
                <foreignObject
                  x={-LEAF_W / 2}
                  y={-(LEAF_R + GLOW_ROOM)}
                  width={LEAF_W}
                  height={LEAF_R * 2 + GLOW_ROOM + 44}
                >
                  {/* The top padding is what puts the circle's centre back on
                      the node's own coordinates after the box grew upwards. */}
                  <div
                    className="flex flex-col items-center select-none"
                    style={{ width: LEAF_W, paddingTop: GLOW_ROOM }}
                  >
                    <div className="w-[46px] h-[46px] rounded-full border" style={leafCircleStyle(cat.type)} />
                    <p className="text-[10px] font-medium text-foreground/70 text-center leading-tight mt-1.5 px-1 line-clamp-2 w-full">
                      {leaf.label}
                    </p>
                  </div>
                </foreignObject>
              </g>
            ))}

            {cat.overflow > 0 && (
              <text className="ob-overflow" x={cat.overflowAt.x} y={cat.overflowAt.y}>+{cat.overflow}</text>
            )}
          </g>
        ))}

        {/*
          * What serves what. Drawn last so it sits over the structural
          * edges, in the app's own semantic colour, and only when both ends
          * are actually on screen — a link to a goal that has been pushed
          * past its category's limit has nowhere to land.
          */}
        {layout && seed.links.map((link, i) => {
          const from = layout.positionOf.get(`${link.from.type}|${link.from.label.trim().toLowerCase()}`)
          const to = layout.positionOf.get(`${link.to.type}|${link.to.label.trim().toLowerCase()}`)
          if (!from || !to) return null
          return (
            <line
              key={`link-${i}`}
              x1={0} y1={0} x2={EDGE_UNIT} y2={0}
              vectorEffect="non-scaling-stroke"
              className="ob-edge ob-edge-semantic"
              style={{ transform: edgeTransform(from, to, LEAF_R, LEAF_R) }}
            />
          )
        })}

        {/* The middle. Everything else hangs off it, exactly as it will. */}
        <g className="ob-node">
          <foreignObject
            x={-(ROOT_R + GLOW_ROOM)}
            y={-(ROOT_R + GLOW_ROOM)}
            width={(ROOT_R + GLOW_ROOM) * 2}
            height={(ROOT_R + GLOW_ROOM) * 2}
          >
            <div
              className="flex items-center justify-center"
              style={{ width: (ROOT_R + GLOW_ROOM) * 2, height: (ROOT_R + GLOW_ROOM) * 2 }}
            >
              <div
                className="w-[84px] h-[84px] rounded-full bg-primary flex items-center justify-center"
                style={{ boxShadow: '0 0 0 4px oklch(0.74 0.14 72 / 15%), 0 0 16px oklch(0.74 0.14 72 / 22%)' }}
              >
                <span className="text-[13px] font-extrabold text-primary-foreground tracking-tight">You</span>
              </div>
            </div>
          </foreignObject>
        </g>
        </g>
      </svg>

      <div className="ob-graph-controls">
        <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.25)}><Plus className="w-3.5 h-3.5" /></button>
        <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.8)}><Minus className="w-3.5 h-3.5" /></button>
        <button
          type="button"
          aria-label="Fit the graph"
          onClick={() => setView({ x: 0, y: 0, k: 1 })}
          disabled={!moved}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <p className="ob-graph-caption">
        {layout === null
          ? 'Your graph. Everything you answer appears here as the node it becomes.'
          : `${layout.total} ${layout.total === 1 ? 'node' : 'nodes'} — this is the graph you get, not a picture of one.`}
      </p>
    </div>
  )
}
