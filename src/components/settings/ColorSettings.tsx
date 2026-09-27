'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw, Shuffle, X } from 'lucide-react'
import { useMode } from '@/lib/useMode'
import { publishTypeColors } from '@/components/graph/useTypeColors'
import { HIDDEN_NODE_TYPES } from '@/lib/graph/layout'
import {
  DEFAULT_TYPE_HUES,
  generatePalette,
  isDistinguishable,
  isMuted,
  normalizeType,
  resolveHue,
  roleColor,
  typeStyleFor,
  type TypeColors,
} from '@/lib/colors'

/**
 * Colour per node type, the way a calendar app does it.
 *
 * What is stored is a hue and nothing else — see src/lib/settings.ts for
 * why — so this picker offers a hue and nothing else. There is deliberately
 * no `<input type="color">`: it would invite a choice of lightness the app
 * is never going to honour, and every value it produced in dark mode would
 * be a lie.
 */

/** Names for the two types the graph draws but the type list writes oddly. */
const DISPLAY_OVERRIDES: Record<string, string> = {
  contentpiece: 'Content',
  journalentry: 'Journal entry',
}

interface TypeRow {
  /** The key in `typeColors`. */
  key: string
  label: string
}

function displayName(name: string): string {
  const override = DISPLAY_OVERRIDES[normalizeType(name)]
  if (override) return override
  // "ContentPiece" → "Content Piece"; a name the user typed is left alone.
  return name.replace(/([a-z])([A-Z])/g, '$1 $2')
}

/** The wheel, as the picker's own track. */
function hueTrack(dark: boolean): string {
  const stops = Array.from({ length: 13 }, (_, i) => `${roleColor(i * 30, 'border', dark)} ${(i / 12) * 100}%`)
  return `linear-gradient(to right, ${stops.join(', ')})`
}

export function ColorSettings() {
  const { dark } = useMode()
  const [rows, setRows] = useState<TypeRow[]>([])
  const [colors, setColors] = useState<TypeColors>({})
  const [saving, setSaving] = useState(false)
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then(({ settings }: { settings?: { typeColors?: TypeColors } }) => setColors(settings?.typeColors ?? {}))
      .catch(() => {})

    fetch('/api/node-types')
      .then((r) => r.json())
      .then(({ nodeTypes }: { nodeTypes?: { name: string }[] }) => {
        const names = (nodeTypes ?? [])
          .map((t) => t.name)
          .filter((name) => !HIDDEN_NODE_TYPES.has(normalizeType(name)))
        // An account whose types have not been seeded yet still gets the
        // built-in list, so the section is never an empty box.
        const source = names.length ? names : Object.keys(DEFAULT_TYPE_HUES).map(displayName)
        const seen = new Set<string>()
        setRows(
          source
            .map((name) => ({ key: normalizeType(name), label: displayName(name) }))
            .filter((row) => (seen.has(row.key) ? false : seen.add(row.key)))
            .sort((a, b) => a.label.localeCompare(b.label)),
        )
      })
      .catch(() => {})
  }, [])

  /**
   * Written straight through, but only once the dragging stops: a hue slider
   * fires on every pixel, and a PATCH per pixel would be a request per pixel.
   */
  const save = useCallback((next: TypeColors, immediate = false) => {
    setColors(next)
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(
      () => {
        // Announced on the same beat, not on every pixel: the graph would
        // otherwise re-render a few hundred nodes per slider frame, and the
        // row's own preview is already showing the answer.
        publishTypeColors(next)
        setSaving(true)
        fetch('/api/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ typeColors: next }),
        })
          .catch(() => {})
          .finally(() => setSaving(false))
      },
      immediate ? 0 : 350,
    )
  }, [])

  useEffect(() => () => { if (pending.current) clearTimeout(pending.current) }, [])

  const hues = useMemo(
    () => rows.map((row) => resolveHue(colors, row.key)).filter((h): h is number => h !== null),
    [rows, colors],
  )
  const crowded = hues.length > 1 && !isDistinguishable(hues)

  function setHue(key: string, hue: number) {
    save({ ...colors, [key]: hue })
  }

  function clearHue(key: string) {
    const next = { ...colors }
    delete next[key]
    save(next, true)
  }

  return (
    <section className="mb-9">
      <h2 className="text-[11px] font-mono text-muted-foreground/65 uppercase tracking-widest mb-1">Colours</h2>
      <p className="text-[12px] text-muted-foreground/60 mb-3 max-w-[58ch]">
        A colour per kind of thing, used everywhere it appears — the graph and the calendar both. You choose the
        hue; how light and how strong it is comes from the theme, so it stays readable in the dark and under
        whichever palette you are using.
      </p>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => save({ ...colors, ...generatePalette(rows.map((r) => r.key), { seed: Date.now() }) }, true)}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/60 transition-colors"
        >
          <Shuffle className="w-3.5 h-3.5" />
          Generate palette
        </button>
        <button
          onClick={() => save({}, true)}
          className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 text-muted-foreground hover:bg-muted/60 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </button>
        {saving && <span className="text-[11px] font-mono text-muted-foreground/60">saving…</span>}
      </div>

      {crowded && (
        <p className="text-[11px] text-muted-foreground/70 mb-3">
          That is more kinds of thing than the colour wheel has room for — some pairs will look alike whatever
          is chosen.
        </p>
      )}

      {/* The track is painted by the element's own background, so the thumb
          has to be drawn here or the browser hides it behind its default. */}
      <style>{`
        .acture-hue-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px; border-radius: 9999px;
          background: var(--background);
          border: 2px solid var(--foreground);
          cursor: pointer;
        }
        .acture-hue-slider::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 9999px;
          background: var(--background);
          border: 2px solid var(--foreground);
          cursor: pointer;
        }
      `}</style>

      <div className="space-y-2">
        {rows.map((row) => {
          const hue = resolveHue(colors, row.key)
          const chosen = typeof colors[row.key] === 'number'
          const style = typeStyleFor(hue ?? 0, dark, hue === null ? false : isMuted(colors, row.key))
          return (
            <div key={row.key} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50">
              {/* A calendar block, at the size it will actually be. */}
              <div
                className="w-[104px] shrink-0 rounded-md px-2 py-1 text-[11px] font-medium truncate"
                style={
                  hue === null
                    ? { background: 'color-mix(in oklch, var(--muted) 80%, transparent)', borderLeft: '3px solid var(--muted-foreground)' }
                    : { background: style.bg, borderLeft: `3px solid ${style.border}`, color: style.text }
                }
              >
                {row.label}
              </div>
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={hue ?? 0}
                aria-label={`${row.label} hue`}
                onChange={(e) => setHue(row.key, Number(e.target.value))}
                className="acture-hue-slider flex-1 h-2 appearance-none rounded-full cursor-pointer"
                style={{ background: hueTrack(dark) }}
              />
              <button
                onClick={() => clearHue(row.key)}
                disabled={!chosen}
                title="Back to the default colour"
                className="shrink-0 p-1 rounded-md text-muted-foreground/60 hover:bg-muted/60 hover:text-foreground transition-colors disabled:opacity-25 disabled:hover:bg-transparent"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
