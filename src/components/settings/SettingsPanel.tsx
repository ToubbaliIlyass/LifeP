'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Download, Upload, LogOut, Eye, EyeOff, Check, Sun, Moon, MapPin } from 'lucide-react'
import { THEMES, applyTheme, storedTheme } from '@/lib/themes'
import { DEFAULT_DAY } from '@/lib/schedule'

export interface Settings {
  hiddenTabs: string[]
  defaultTab: string
  defaultCalendarView: 'day' | 'week'
  theme: string
  weather: { enabled: boolean; lat: number | null; lon: number | null; place: string | null }
  scheduleMode: 'off' | 'suggest' | 'auto'
  workingHours: { start: string; end: string }
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
  // Mode starts false to match the server-rendered markup, then syncs after
  // mount — the same hydration-safety reason as ThemeToggle.
  const [dark, setDark] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)

  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'))
  }, [])

  function setMode(next: boolean) {
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
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
        await save({ weather: { enabled: true, lat, lon, place } })
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
        // saved elsewhere wins over whatever this browser last stored.
        if (s.theme && s.theme !== storedTheme()) applyTheme(s.theme)
      })
      .catch(() => {})
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setAccount(d.user ?? null))
      .catch(() => {})
  }, [])

  useEffect(() => { load() }, [load])

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

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-[12px] font-mono text-muted-foreground/65">loading…</p>
      </div>
    )
  }

  const hidden = new Set(settings.hiddenTabs)

  return (
    <ScrollArea className="h-full">
      <div className="px-8 py-8 max-w-2xl">

        <Section
          title="Appearance"
          description="Mode and theme are separate choices. Every theme comes with both a light and a dark version, so switching palette keeps whichever mode you're in."
        >
          <div className="space-y-5">
            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">Mode</label>
              <div className="flex gap-1">
                {([['light', false], ['dark', true]] as const).map(([label, value]) => (
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
          title="Panels"
          description="Hide the sections you don't use. Nothing is deleted — a hidden panel just stops taking up room in the sidebar, and can be brought back here at any time."
        >
          <div className="space-y-1">
            {allTabs.map((t) => {
              const isHidden = hidden.has(t.id)
              return (
                <div key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20">
                  <span className={`text-[13px] font-serif flex-1 ${isHidden ? 'text-muted-foreground/50' : 'text-foreground/85'}`}>
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
          title="Scheduling"
          description="Habits already place themselves on the calendar. This does the same for tasks that are due or overdue, so deciding when to do them stops being your job."
        >
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-mono text-muted-foreground/50 mb-1.5 block">
                When a due task has no time
              </label>
              <div className="space-y-1.5">
                {([
                  ['off', 'Do nothing', 'Tasks stay unscheduled until you place them.'],
                  ['suggest', 'Suggest times for approval', 'Proposes a plan on the dashboard. Nothing lands on the calendar until you accept it.'],
                  ['auto', 'Schedule them for me', 'Places them straight into free gaps, no approval.'],
                ] as const).map(([value, label, blurb]) => {
                  const active = (settings.scheduleMode ?? 'off') === value
                  return (
                    <button
                      key={value}
                      onClick={() => save({ scheduleMode: value })}
                      className={`flex w-full items-start gap-3 text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        active ? 'border-primary/50 bg-primary/[0.07]' : 'border-border/50 hover:bg-muted/30'
                      }`}
                    >
                      <span
                        className={`mt-1 w-2 h-2 rounded-full shrink-0 ${active ? 'bg-primary' : 'bg-muted-foreground/25'}`}
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-serif text-foreground/85">{label}</span>
                        <span className="block text-[11px] text-muted-foreground/55 mt-0.5">{blurb}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {settings.scheduleMode !== 'off' && (
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
        </Section>

        <Section title="Account">
          <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-muted/20">
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-serif text-foreground/85 truncate">{account?.email ?? '—'}</p>
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
