'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * One measurement over time.
 *
 * Deliberately one series per chart. Weight and bench press share nothing but
 * an owner — putting them on one pair of axes would need two y-scales, which
 * is the single most misleading thing a chart can do. So the panel shows the
 * series you are looking at, full size, and the rest as sparklines you can
 * switch to.
 *
 * Hand-rolled SVG rather than a charting library: this is a path, a fill and
 * a hover line, all of it theme-token coloured so it follows the palette and
 * both modes for free. A library would be a megabyte to draw the same three
 * elements and would need its own theme kept in sync with the app's.
 *
 * Time is the x-axis in real days, not evenly spaced samples: a metric logged
 * three times in one week and then not for a month should *look* like that,
 * and evenly spacing the points would flatten the gap into a steady trend
 * that never happened.
 */

export interface Point {
  date: string
  value: number
}

const PAD = { top: 16, right: 16, bottom: 22, left: 40 }

const day = (date: string) => new Date(date + 'T00:00:00').getTime()

const shortDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

const longDate = (date: string) =>
  new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

/** Trims float noise without truncating real precision. */
export const fmt = (value: number): string => String(Math.round(value * 1000) / 1000)

/**
 * Round numbers a person would have chosen for the axis, and never more than
 * four of them — a gridline every 2.5 units is noise, not information.
 */
function ticks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min]
  const raw = (max - min) / count
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let t = Math.ceil(min / step) * step; t <= max + step / 1000; t += step) out.push(Number(t.toFixed(6)))
  return out
}

export function MetricChart({
  points,
  unit,
  height = 240,
}: {
  /** Chronological, oldest first. */
  points: Point[]
  unit: string | null
  height?: number
}) {
  const wrap = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [hover, setHover] = useState<number | null>(null)

  // The width is a fact about the browser, so it is read from the browser
  // rather than assumed: a viewBox stretched to fit would scale the type and
  // the stroke with it, and a 1px gridline would stop being 1px.
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geometry = useMemo(() => {
    if (points.length === 0) return null

    const values = points.map((p) => p.value)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    // A flat series still needs a band to sit in, and a real one gets a
    // little air so the extremes are not welded to the frame.
    const span = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.1, 1)
    const min = rawMin - span * 0.12
    const max = rawMax + span * 0.12

    const t0 = day(points[0].date)
    const t1 = day(points[points.length - 1].date)
    const innerW = Math.max(width - PAD.left - PAD.right, 10)
    const innerH = Math.max(height - PAD.top - PAD.bottom, 10)

    const x = (date: string) => (t1 === t0 ? PAD.left + innerW / 2 : PAD.left + ((day(date) - t0) / (t1 - t0)) * innerW)
    const y = (value: number) => PAD.top + innerH - ((value - min) / (max - min)) * innerH

    const placed = points.map((p) => ({ ...p, x: x(p.date), y: y(p.value) }))
    const line = placed.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    const area = `${line} L ${placed[placed.length - 1].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} L ${placed[0].x.toFixed(1)} ${(PAD.top + innerH).toFixed(1)} Z`

    const best = placed.reduce((a, b) => (b.value > a.value ? b : a))
    const worst = placed.reduce((a, b) => (b.value < a.value ? b : a))

    return {
      placed, line, area, best, worst,
      baseline: PAD.top + innerH,
      gridlines: ticks(min, max).filter((t) => t >= min && t <= max).map((t) => ({ value: t, y: y(t) })),
    }
  }, [points, width, height])

  if (!geometry) {
    return (
      <div ref={wrap} style={{ height }} className="flex items-center justify-center">
        <p className="text-[12px] text-muted-foreground/50">Nothing logged in this range.</p>
      </div>
    )
  }

  const { placed, line, area, best, worst, baseline, gridlines } = geometry
  const active = hover !== null ? placed[hover] : null
  const last = placed[placed.length - 1]
  // A dot per point is fine while you can count them; past that the line is
  // the shape and the dots are just noise on top of it.
  const showDots = placed.length <= 40

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const box = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - box.left
    let nearest = 0
    for (let i = 1; i < placed.length; i++) {
      if (Math.abs(placed[i].x - px) < Math.abs(placed[nearest].x - px)) nearest = i
    }
    setHover(nearest)
  }

  return (
    <div ref={wrap} className="relative w-full select-none" style={{ height }}>
      <svg
        width={width}
        height={height}
        className="block touch-none"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        role="img"
        aria-label={`${placed.length} measurements from ${placed[0].date} to ${last.date}`}
      >
        {/* Grid and axis: present, and quiet enough to read past. */}
        {gridlines.map((g) => (
          <g key={g.value}>
            <line
              x1={PAD.left} x2={width - PAD.right} y1={g.y} y2={g.y}
              stroke="currentColor" strokeWidth={1}
              className="text-border/45"
            />
            <text
              x={PAD.left - 7} y={g.y + 3} textAnchor="end"
              className="fill-muted-foreground/50 text-[10px] font-mono tabular-nums"
            >
              {fmt(g.value)}
            </text>
          </g>
        ))}

        <path d={area} className="fill-primary/10" />
        <path
          d={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        />

        {showDots && placed.map((p, i) => (
          <circle
            key={`${p.date}-${i}`}
            cx={p.x} cy={p.y} r={2.5}
            className="fill-primary"
          />
        ))}

        {/* The two points worth naming without being asked. Everything else
            waits for the pointer. */}
        {placed.length > 2 && best !== worst && (
          <>
            <circle cx={best.x} cy={best.y} r={3.5} className="fill-primary" />
            <text
              x={best.x} y={best.y - 8} textAnchor="middle"
              className="fill-muted-foreground/70 text-[10px] font-mono tabular-nums"
            >
              {fmt(best.value)}
            </text>
            <text
              x={worst.x} y={worst.y + 14} textAnchor="middle"
              className="fill-muted-foreground/70 text-[10px] font-mono tabular-nums"
            >
              {fmt(worst.value)}
            </text>
          </>
        )}

        {/* First and last day, so the axis has ends without a tick forest. */}
        <text x={PAD.left} y={height - 6} className="fill-muted-foreground/45 text-[10px] font-mono">
          {shortDate(placed[0].date)}
        </text>
        {placed.length > 1 && (
          <text x={width - PAD.right} y={height - 6} textAnchor="end" className="fill-muted-foreground/45 text-[10px] font-mono">
            {shortDate(last.date)}
          </text>
        )}

        {active && (
          <g>
            <line
              x1={active.x} x2={active.x} y1={PAD.top} y2={baseline}
              stroke="currentColor" strokeWidth={1} strokeDasharray="3 3"
              className="text-muted-foreground/45"
            />
            {/* A ring in the surface colour, so the marker reads as on top of
                the line rather than punched through it. */}
            <circle cx={active.x} cy={active.y} r={5.5} className="fill-background" />
            <circle cx={active.x} cy={active.y} r={4} className="fill-primary" />
          </g>
        )}
      </svg>

      {active && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 shadow-lg"
          style={{
            left: Math.min(Math.max(active.x - 60, 0), Math.max(width - 130, 0)),
            top: Math.max(active.y - 52, 0),
          }}
        >
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60">
            {longDate(active.date)}
          </p>
          <p className="text-[13px] font-mono tabular-nums text-foreground/90">
            {fmt(active.value)}
            {unit && <span className="text-[10px] text-muted-foreground/65 ml-1">{unit}</span>}
          </p>
        </div>
      )}
    </div>
  )
}

/**
 * The same series at thumbnail size: no axes, no interaction, just the shape.
 * Used in the grid of everything you are not currently looking at.
 */
export function Sparkline({ values, width = 84, height = 26 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return <div className="shrink-0" style={{ width, height }} />

  const pad = 3
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const stepX = (width - pad * 2) / (values.length - 1)

  const points = values.map((v, i) => {
    const x = pad + i * stepX
    const y = max === min ? height / 2 : height - pad - ((v - min) / span) * (height - pad * 2)
    return [x, y] as const
  })
  const last = points[points.length - 1]

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible" aria-hidden>
      <polyline
        points={points.map(([x, y]) => `${x},${y}`).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary/55"
      />
      <circle cx={last[0]} cy={last[1]} r="2" className="fill-primary" />
    </svg>
  )
}
