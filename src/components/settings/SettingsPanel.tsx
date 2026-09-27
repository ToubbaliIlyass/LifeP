'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Download, Upload, LogOut, Eye, EyeOff, Check, Sun, Moon, MapPin, X } from 'lucide-react'
import { THEMES, applyTheme, applyMode, storedMode, storedTheme } from '@/lib/themes'
import { useMode } from '@/lib/useMode'
import { DEFAULT_DAY } from '@/lib/schedule'
import { METHODS } from '@/lib/prayer-times'
import { ConnectAISection } from './ConnectAISection'
import { CanvasSection } from './CanvasSection'
import { ColorSettings } from './ColorSettings'

// One definition, in src/lib/settings.ts, which is also what the API route
// merges over its defaults. Type-only, so importing it here does not drag
// the database into the client bundle.
export type { Settings } from '@/lib/settings'
import type { Settings } from '@/lib/settings'
import { MODULES, moduleEnabled } from '@/lib/modules'
import { daysLabel, DAY_LABELS, DAY_NAMES, DAY_ORDER } from '@/lib/days'



/** The same one-of-three control the scheduling section uses. */
function Choice<T extends string>({
  value, options, onChange,
}: { value: T; options: readonly (readonly [T, string, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1.5">
      {options.map(([option, label, blurb]) => {
        const active = value === option
        return (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`flex w-full items-start gap-3 text-left px-3 py-2.5 rounded-lg border transition-colors ${
              active ? 'border-primary/50 bg-primary/[0.07]' : 'border-border/50 hover:bg-muted/30'
            }`}
          >
            <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${active ? 'bg-primary' : 'bg-muted-foreground/25'}`} />
            <span className="min-w-0">
              <span className="block text-[13px] text-foreground/85">{label}</span>
              <span className="block text-[11px] text-muted-foreground/55 mt-0.5">{blurb}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

interface SettingsPanelProps {
  /** Every tab that exists, so panels can be shown or hidden by name. */
  allTabs: { id: string; label: string }[]
  onSettingsChanged: (settings: Settings) => void
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="text-[11px] font-mono text-muted-foreground/65 uppercase tracking-widest mb-1">{title}</h2>
      {description && <p className="text-[12px] text-muted-foreground/60 mb-3 max-w-[58ch]">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </section>
  )
}

export function SettingsPanel({ allTabs, onSettingsChanged, onImport }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [account, setAccount] = useState<{ email: string | null; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // Shared with the sidebar's toggle, so pressing that updates this picker
  // too — see src/lib/useMode.ts.
  const { dark, set: setDarkMode } = useMode()
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [startingOver, setStartingOver] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [sweeping, setSweeping] = useState(false)
  const [sweepNote, setSweepNote] = useState<string | null>(null)

  function setMode(next: boolean) {
    setDarkMode(next ? 'dark' : 'light')
  }

  function setTheme(id: string) {
    applyTheme(id)          // instant, and remembered locally for the next paint
    save({ theme: id })     // and to the database, so other devices follow
  }

  /**
   * Asks the browser once and stores the result, rather than prompting on
   * every dashboard visit. Reverse-geocoded through Open-Meteo's own free
   * geocoding endpoint purely to show a recognisable place name.
   */
  function requestLocation() {
    if (!('geolocation' in navigator)) {
      setLocationError('This browser cannot report a location.')
      return
    }
    setLocating(true)
    setLocationError(null)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4))
        const lon = Number(pos.coords.longitude.toFixed(4))
        let place: string | null = null
        try {
          const r = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?latitude=${lat}&longitude=${lon}&count=1`,
          )
          const d = await r.json()
          place = d?.results?.[0]?.name ?? null
        } catch {
          // A missing place name is cosmetic; the forecast still works.
        }
        // The zone travels with the location: prayer times are local solar
        // times, and the server cannot work out where the reader is.
        const timeZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return null } })()
        await save({ weather: { enabled: true, lat, lon, place }, ...(timeZone ? { timeZone } : {}) })
        setLocating(false)
      },
      (err) => {
        setLocating(false)
        setLocationError(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Allow it in your browser settings to show weather.'
            : 'Could not determine your location.',
        )
      },
      { timeout: 10000, maximumAge: 600000 },
    )
  }

  const load = useCallback(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then(({ settings: s }: { settings: Settings }) => {
        setSettings(s)
        // The database is the source of truth across devices, so a palette
        // or mode saved elsewhere wins over whatever this browser last stored.
        if (s.theme && s.theme !== storedTheme()) applyTheme(s.theme)
        // applyMode writes the class, which the shared hook is watching, so
        // every control picks this up without being told.
        if (s.mode && s.mode !== storedMode()) applyMode(s.mode)
      })
      .catch(() => {})
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setAccount(d.user ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

  /**
   * Wipe everything and go back to the setup interview.
   *
   * `everything: true` takes the Settings node too, so the app comes back at
   * its defaults with onboarding unanswered — which is what makes the wizard
   * open by itself rather than needing a flag written into the very row this
   * just deleted.
   */
  async function startOver() {
    setResetting(true)
    try {
      // Downloaded first, and awaited: if the export fails, nothing is deleted.
      const backup = await fetch('/api/export')
      if (!backup.ok) { alert('Could not make a backup — nothing was deleted.'); return }
      const blob = await backup.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `acture-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)

      const res = await fetch('/api/graph/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ everything: true }),
      })
      if (!res.ok) { alert('Could not clear everything — your data is untouched.'); return }
      window.location.reload()
    } finally {
      setResetting(false)
    }
  }

  async function save(changes: Partial<Settings>) {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(changes),
    })
    const { settings: next } = (await res.json()) as { settings: Settings }
    setSettings(next)
    onSettingsChanged(next)
    setSaving(false)
  }

  /**
   * Runs the tidy-up now, whether or not it is due.
   *
   * The endpoint does the work after it responds, so there is nothing to
   * wait for and nothing to report back except that it started — the result
   * turns up under `lastRun` on the next settings load.
   */
  async function runSweep() {
    if (sweeping) return
    setSweeping(true)
    setSweepNote(null)
    try {
      const res = await fetch('/api/graph/sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true }),
      })
      const d = (await res.json().catch(() => null)) as { ran?: boolean; reason?: string } | null
      setSweepNote(d?.ran ? 'sweeping now — reopen this page shortly for the result' : `not started (${d?.reason ?? 'unknown'})`)
    } catch {
      setSweepNote('could not start the sweep')
    } finally {
      setSweeping(false)
    }
  }

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[12px] font-mono text-muted-foreground/65">loading…</p>
      </div>
    )
  }

  const hidden = new Set(settings.hiddenTabs)
  const simple = settings.simple !== false
  // Older Settings nodes predate this whole section, so every read of it
  // goes through one filled-in copy rather than optional chaining at each use.
  const sweep = settings.graphSweep ?? { enabled: true, intervalDays: 7, lastRun: null }
  const prayer = settings.prayer ?? { enabled: false, method: 'morocco', madhab: 'standard' as const, habitNodeId: null }

  return (
    <ScrollArea className="h-full">
      <div className="px-8 py-8 max-w-2xl">

        {/* First, because it decides how much of everything below is shown. */}
        <Section
          title="Simple mode"
          description="Just the day: Today, Calendar and Goals in the sidebar, with everything else under More. Turn it off to see every panel, section and setting again — nothing is deleted either way."
        >
          <button
            onClick={() => save({ simple: !simple })}
            disabled={saving}
            role="switch"
            aria-checked={simple}
            className="flex items-center gap-3 text-[13px] font-medium disabled:opacity-60"
          >
            <span className={`relative w-9 h-5 rounded-full transition-colors ${simple ? 'bg-primary' : 'bg-muted-foreground/25'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-background shadow transition-all ${simple ? 'left-[18px]' : 'left-0.5'}`} />
            </span>
            {simple ? 'On' : 'Off'}
          </button>
        </Section>

        <Section
          title="Appearance"
          description="Mode and theme are separate choices. Every theme comes with both a light and a dark version, so switching palette keeps whichever mode you're in."
        >
          <div className="space-y-5">
            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Mode</label>
              <div className="flex gap-1">
                {([['Light mode', false], ['Dark mode', true]] as const).map(([label, value]) => (
                  <button
                    key={label}
                    onClick={() => setMode(value)}
                    className={`flex items-center gap-1.5 text-[12px] font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                      dark === value
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    {value ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Theme</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {THEMES.map((t) => {
                  const active = (settings.theme ?? 'default') === t.id
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTheme(t.id)}
                      className={`text-left rounded-xl border p-2.5 transition-colors ${
                        active ? 'border-primary/50 bg-primary/[0.07]' : 'border-border/50 hover:bg-muted/30'
                      }`}
                    >
                      {/* Primary, secondary, then the two grounds the palette
                          uses for light and dark. */}
                      <div className="flex gap-1 mb-2">
                        {t.swatch.map((c, i) => (
                          <span
                            key={i}
                            className="h-6 flex-1 rounded first:rounded-l-md last:rounded-r-md border border-black/10"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[12px] font-medium text-foreground/85">{t.name}</span>
                        {active && <Check className="w-3 h-3 text-primary" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground/55 mt-0.5 leading-snug">{t.description}</p>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Scheduling"
          description="The hours your day is planned inside, and the parts it is made of. Everything you capture is planned into these — Plan and Replan use them too."
        >
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div>
                <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Day starts</label>
                <input
                  type="time"
                  defaultValue={settings.workingHours?.start ?? DEFAULT_DAY.start}
                  onChange={(e) =>
                    save({ workingHours: { start: e.target.value, end: settings.workingHours?.end ?? DEFAULT_DAY.end } })
                  }
                  className="bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Day ends</label>
                <input
                  type="time"
                  defaultValue={settings.workingHours?.end ?? DEFAULT_DAY.end}
                  onChange={(e) =>
                    save({ workingHours: { start: settings.workingHours?.start ?? DEFAULT_DAY.start, end: e.target.value } })
                  }
                  className="bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </div>
            {/* The day, cut into the parts it is really made of. Without
                these, 07:00 to 23:00 is one undifferentiated stretch and the
                planner offers deep work an evening slot and a workout a
                breakfast one, because nothing says they are different hours. */}
            <div>
              <label className="text-[11px] font-mono text-muted-foreground/60 mb-1.5 block">
                Parts of the day
              </label>
              <p className="text-[11px] text-muted-foreground/55 mb-2">
                Name the stretches your day is really made of. A task or habit set to
                a part is only ever planned inside it. With none set, the whole day
                is fair game. Leave the days untouched and a part applies to every
                day; pick some and it only applies then, so two parts can share a
                name and split the week.
              </p>
              <div className="space-y-1.5">
                {(settings.dayParts ?? []).map((part, i) => (
                  <div key={part.id} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input
                      defaultValue={part.name}
                      placeholder="Deep work"
                      aria-label="Name of this part of the day"
                      onChange={(e) => {
                        const next = [...(settings.dayParts ?? [])]
                        next[i] = { ...part, name: e.target.value }
                        save({ dayParts: next })
                      }}
                      className="flex-1 min-w-0 bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                      type="time"
                      defaultValue={part.start}
                      aria-label="Starts"
                      onChange={(e) => {
                        const next = [...(settings.dayParts ?? [])]
                        next[i] = { ...part, start: e.target.value }
                        save({ dayParts: next })
                      }}
                      className="bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <input
                      type="time"
                      defaultValue={part.end}
                      aria-label="Ends"
                      onChange={(e) => {
                        const next = [...(settings.dayParts ?? [])]
                        next[i] = { ...part, end: e.target.value }
                        save({ dayParts: next })
                      }}
                      className="bg-muted/40 border border-border/40 rounded-lg px-2 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                    />
                    <button
                      onClick={() => save({ dayParts: (settings.dayParts ?? []).filter((p) => p.id !== part.id) })}
                      aria-label={`Remove ${part.name || 'this part'}`}
                      title="Remove"
                      className="shrink-0 p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1 pl-0.5">
                    {DAY_ORDER.map((d) => {
                      const on = (part.days ?? []).includes(d)
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${DAY_NAMES[d]}${part.name ? ` for ${part.name}` : ''}`}
                          onClick={() => {
                            const days = on
                              ? (part.days ?? []).filter((x) => x !== d)
                              : [...(part.days ?? []), d].sort((a, b) => a - b)
                            const next = [...(settings.dayParts ?? [])]
                            // Seven days selected is the same thing as none,
                            // stored the way everything else stores it.
                            next[i] = { ...part, days: days.length === 7 ? [] : days }
                            save({ dayParts: next })
                          }}
                          className={`w-7 h-7 rounded-md border text-[10px] font-mono transition-colors ${
                            on
                              ? 'bg-primary border-primary text-primary-foreground'
                              : 'bg-muted/30 border-border/40 text-muted-foreground/70 hover:text-foreground'
                          }`}
                        >
                          {DAY_LABELS[d]}
                        </button>
                      )
                    })}
                    <span className="ml-1.5 text-[11px] text-muted-foreground/50">
                      {(part.days ?? []).length === 0 ? 'every day' : daysLabel(part.days ?? [])}
                    </span>
                  </div>
                  </div>
                ))}
              </div>
              <button
                onClick={() =>
                  save({
                    dayParts: [
                      ...(settings.dayParts ?? []),
                      {
                        // Stable, so renaming a part does not orphan every
                        // task that had been assigned to it.
                        id: `part-${Date.now().toString(36)}`,
                        name: '',
                        start: settings.workingHours?.start ?? DEFAULT_DAY.start,
                        end: settings.workingHours?.end ?? DEFAULT_DAY.end,
                      },
                    ],
                  })
                }
                className="mt-2 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40"
              >
                + Add a part of the day
              </button>
            </div>
          </div>
        </Section>

        <Section
          title="Prayer times"
          description="Puts the five on the Now timeline as fifteen-minute slots, worked out from the same location the weather uses — so they follow you when it changes. Ticking all five completes your prayer habit, which keeps its streak and its goal."
        >
          <div className="space-y-4">
            <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/30 transition-colors">
              <input
                type="checkbox"
                checked={prayer.enabled}
                onChange={(e) => save({ prayer: { ...prayer, enabled: e.target.checked } })}
                className="mt-1"
              />
              <span className="min-w-0">
                <span className="block text-[13px] text-foreground/85">Show prayer times</span>
                <span className="block text-[11px] text-muted-foreground/55 mt-0.5">
                  {settings.weather?.lat === null
                    ? 'Set a location under Weather first — the times are computed from it.'
                    : 'Computed on your device from the sun\u2019s position. No network, and nothing stored per prayer.'}
                </span>
              </span>
            </label>

            {prayer.enabled && (
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Method</label>
                  <select
                    value={prayer.method}
                    onChange={(e) => save({ prayer: { ...prayer, method: e.target.value } })}
                    className="bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                  </select>
                  <p className="text-[10px] font-mono text-muted-foreground/45 mt-1">decides Fajr and Isha</p>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Asr</label>
                  <select
                    value={prayer.madhab}
                    onChange={(e) => save({ prayer: { ...prayer, madhab: e.target.value as 'standard' | 'hanafi' } })}
                    className="bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                  >
                    <option value="standard">Standard (shadow ×1)</option>
                    <option value="hanafi">Hanafi (shadow ×2)</option>
                  </select>
                  <p className="text-[10px] font-mono text-muted-foreground/45 mt-1">about an hour apart</p>
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section
          title="Weather"
          description="Shows today's forecast on the dashboard. The location is stored once so your browser doesn't ask again on every visit, and it follows you across devices."
        >
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={requestLocation}
                disabled={locating}
                className="flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-60"
              >
                <MapPin className="w-3.5 h-3.5" />
                {locating ? 'Locating…' : settings.weather?.lat !== null && settings.weather?.lat !== undefined ? 'Update location' : 'Use my location'}
              </button>
              {settings.weather?.enabled && (
                <button
                  onClick={() => save({ weather: { enabled: false, lat: null, lon: null, place: null } })}
                  className="text-[12px] font-medium px-3 py-2 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors text-muted-foreground"
                >
                  Turn off
                </button>
              )}
            </div>

            {settings.weather?.enabled && settings.weather.lat !== null && (
              <p className="text-[11px] font-mono text-muted-foreground/55">
                {settings.weather.place ?? 'Location set'} · {settings.weather.lat?.toFixed(2)}, {settings.weather.lon?.toFixed(2)}
              </p>
            )}
            {locationError && <p className="text-[12px] text-destructive">{locationError}</p>}
            <p className="text-[10px] font-mono text-muted-foreground/40">
              Forecast by Open-Meteo — free, and needs no account or API key.
            </p>
          </div>
        </Section>

        {/* The specialist settings, folded away in simple mode: every one
            still works, it just is not the first thing anyone has to read. */}
        {(!simple || showAdvanced) && (
          <>

        <Section
          title="Modules"
          description="Extra sections for specific kinds of life. Turning one off hides it everywhere — the tab, the calendar and the assistant — without deleting anything."
        >
          <div className="space-y-1.5">
            {MODULES.map((m) => {
              // Was hard-wired to `content`, so every module would have shared
              // the content hub's switch the moment a second one existed.
              const on = moduleEnabled(settings, m.id)
              return (
                <button
                  key={m.id}
                  onClick={() => save({ modules: { ...(settings.modules ?? {}), [m.id]: !on } })}
                  className={`flex w-full items-start gap-3 text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    on ? 'border-primary/50 bg-primary/[0.07]' : 'border-border/50 hover:bg-muted/30'
                  }`}
                >
                  <span className={`mt-0.5 w-8 h-[18px] rounded-full shrink-0 relative transition-colors ${on ? 'bg-primary' : 'bg-muted-foreground/25'}`}>
                    <span className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-background transition-all ${on ? 'left-[16px]' : 'left-[2px]'}`} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] text-foreground/85">{m.label}</span>
                    <span className="block text-[11px] text-muted-foreground/55 mt-0.5">{m.blurb}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </Section>

        <Section
          title="Panels"
          description="Hide the sections you don't use. Nothing is deleted — a hidden panel just stops taking up room in the sidebar, and can be brought back here at any time."
        >
          <div className="space-y-1">
            {allTabs.map((t) => {
              const isHidden = hidden.has(t.id)
              return (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20">
                  <span className={`text-[13px] flex-1 ${isHidden ? 'text-muted-foreground/50' : 'text-foreground/85'}`}>
                    {t.label}
                  </span>
                  <button
                    onClick={() => {
                      const next = isHidden
                        ? settings.hiddenTabs.filter((x) => x !== t.id)
                        : [...settings.hiddenTabs, t.id]
                      save({ hiddenTabs: next })
                    }}
                    className={`flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                      isHidden
                        ? 'border-border/50 text-muted-foreground/60 hover:text-foreground hover:bg-muted/40'
                        : 'bg-primary/15 border-primary/40 text-primary'
                    }`}
                  >
                    {isHidden ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {isHidden ? 'hidden' : 'shown'}
                  </button>
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="Startup" description="What you see when the app opens.">
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Open on</label>
              <select
                value={settings.defaultTab}
                onChange={(e) => save({ defaultTab: e.target.value })}
                className="bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                {allTabs.filter((t) => !hidden.has(t.id)).map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Calendar opens in</label>
              <div className="flex gap-1">
                {(['day', 'week'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => save({ defaultCalendarView: v })}
                    className={`text-[12px] font-mono px-3 py-1.5 rounded-lg border transition-colors ${
                      settings.defaultCalendarView === v
                        ? 'bg-primary/15 border-primary/40 text-primary'
                        : 'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="Connections"
          description="A thing with no links to anything is invisible in the graph and forgotten everywhere else. This is the assistant's standing job of joining them up — and of handing back what has gone quiet."
        >
          <div className="space-y-5">
            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">
                When you add something by hand
              </label>
              <Choice
                value={settings.autoLink ?? 'auto'}
                onChange={(autoLink) => save({ autoLink })}
                options={([
                  ['off', 'Leave it unlinked', 'Nothing is connected unless you connect it.'],
                  ['suggest', 'Suggest links for approval', 'Queues them in Proposals. Nothing is written until you accept.'],
                  ['auto', 'Link it for me', 'Writes the obvious links straight into the graph. Any link can be removed from the item itself.'],
                ] as const)}
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">
                Regular tidy-up
              </label>
              <label className="flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border/50 cursor-pointer hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={settings.graphSweep?.enabled ?? true}
                  onChange={(e) => save({ graphSweep: { ...sweep, enabled: e.target.checked } })}
                  className="mt-1"
                />
                <span className="min-w-0">
                  <span className="block text-[13px] text-foreground/85">Go back over the graph every so often</span>
                  <span className="block text-[11px] text-muted-foreground/55 mt-0.5">
                    Drops duplicate links, and gives everything still unconnected another look now that there is more for it to connect to. It never deletes or rewrites your things.
                  </span>
                </span>
              </label>

              {(settings.graphSweep?.enabled ?? true) && (
                <div className="flex flex-wrap items-end gap-3 mt-3">
                  <div>
                    <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Every</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={90}
                        defaultValue={sweep.intervalDays}
                        onChange={(e) => {
                          const intervalDays = Math.min(90, Math.max(1, Number(e.target.value) || 7))
                          save({ graphSweep: { ...sweep, intervalDays } })
                        }}
                        className="w-20 bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                      />
                      <span className="text-[12px] text-muted-foreground/60">days</span>
                    </div>
                  </div>
                  <button
                    onClick={runSweep}
                    disabled={sweeping}
                    className="text-[12px] font-medium px-3 py-2 rounded-lg border border-border/60 hover:bg-muted/40 disabled:opacity-50"
                  >
                    {sweeping ? 'Sweeping…' : 'Sweep now'}
                  </button>
                  <p className="text-[11px] font-mono text-muted-foreground/50 basis-full">
                    {sweepNote ?? (sweep.lastRun
                      ? `last run ${sweep.lastRun.ranAt.slice(0, 10)} · ${sweep.lastRun.linked} linked · ${sweep.lastRun.tidied} tidied${sweep.lastRun.remaining ? ` · ${sweep.lastRun.remaining} still loose` : ''}`
                      : 'not run yet')}
                  </p>
                </div>
              )}
            </div>

            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">
                Resurface things left alone for
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={3}
                  max={365}
                  defaultValue={settings.resurfaceDays ?? 21}
                  onChange={(e) =>
                    save({ resurfaceDays: Math.min(365, Math.max(3, Number(e.target.value) || 21)) })
                  }
                  className="w-20 bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <span className="text-[12px] text-muted-foreground/60">days</span>
              </div>
              <p className="text-[11px] text-muted-foreground/55 mt-1.5 max-w-[58ch]">
                Goals, projects, notes and open tasks nothing has happened to in this long come back for review on the dashboard and in Activity.
              </p>
            </div>
          </div>
        </Section>

        <Section
          title="Colours"
          description="A colour per kind of thing, used by both the calendar and the graph. Only the hue is yours — the rest comes from the theme, so your choice survives a palette change and stays readable in both modes."
        >
          <ColorSettings />
        </Section>

        <Section
          title="Canvas"
          description="Bring your courses, assignments and announcements in from your school's Canvas, and keep them up to date."
        >
          <CanvasSection />
        </Section>

        <Section
          title="Connect your AI"
          description="Bring in what ChatGPT or Claude already know about you, see what Acture remembers, and let your own chatbot work with Acture directly."
        >
          <ConnectAISection />
        </Section>

          </>
        )}
        {simple && (
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="mb-9 text-[12px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            {showAdvanced ? 'Hide advanced settings' : 'Advanced settings — modules, panels, connections, colours, Canvas, AI…'}
          </button>
        )}

        {/* The way back into the interview after skipping it. Unlike Start
            over this deletes nothing: marking onboarding unanswered is all it
            takes for the page to open the wizard again, and whatever is
            answered there is added to what already exists. */}
        <Section
          title="Setup"
          description="Go through the setup interview again. Nothing is deleted — whatever you answer is added to what's already here."
        >
          <button
            onClick={() => save({ onboarding: { completed: false, completedAt: null } })}
            disabled={saving}
            className="text-[13px] font-medium px-3.5 py-2 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-60"
          >
            Run setup again
          </button>
        </Section>

        <Section title="Data" description="Your graph as a single JSON file — every node, edge and type.">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => window.open('/api/export', '_blank')}
              className="flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export everything
            </button>
            <label className="flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors cursor-pointer">
              <Upload className="w-3.5 h-3.5" /> Import
              <input type="file" accept=".json" className="sr-only" onChange={onImport} />
            </label>
          </div>

          {/* Start over.

              Two clicks, and the first one downloads the file: a fresh start
              is a reasonable thing to want, and losing a year of notes to a
              mis-tap is not. The export happens whether or not the browser
              was going to remind them — nothing here is recoverable
              afterwards, and the backup costs a second. */}
          <div className="mt-4 pt-4 border-t border-border/40">
            {!startingOver ? (
              <button
                onClick={() => setStartingOver(true)}
                className="text-[13px] font-medium px-3.5 py-2 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
              >
                Start over
              </button>
            ) : (
              <div className="rounded-lg border border-destructive/30 p-3">
                <p className="text-[13px] text-foreground/85 mb-1">
                  Delete everything and set up again?
                </p>
                <p className="text-[12px] text-muted-foreground/65 mb-3">
                  Every goal, task, habit, note, block and memory goes, along with your
                  settings and any API token you pasted elsewhere. A backup file
                  downloads first. This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={startOver}
                    disabled={resetting}
                    className="text-[13px] font-medium px-3.5 py-2 rounded-lg bg-destructive text-white hover:opacity-90 disabled:opacity-60"
                  >
                    {resetting ? 'Clearing…' : 'Back up and delete everything'}
                  </button>
                  <button
                    onClick={() => setStartingOver(false)}
                    className="text-[13px] font-medium px-3.5 py-2 rounded-lg border border-border/60 hover:bg-muted/40"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section title="Account">
          <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-foreground/85 truncate">{account?.email ?? '—'}</p>
              <p className="text-[10px] font-mono text-muted-foreground/50 mt-0.5">
                Signed in with Google. Only approved accounts can reach this instance.
              </p>
            </div>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex items-center gap-2 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors whitespace-nowrap"
              >
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </form>
          </div>
        </Section>

        <p className="text-[10px] font-mono text-muted-foreground/40">
          {saving ? 'saving…' : 'settings save as you change them, and sync across your devices'}
        </p>
      </div>
    </ScrollArea>
  )
}
