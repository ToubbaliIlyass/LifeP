'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, ChevronLeft, Download, LogOut, MapPin, Moon, SlidersHorizontal, Sun, Upload } from 'lucide-react'
import { THEMES, applyTheme, applyMode, storedMode, storedTheme } from '@/lib/themes'
import { useMode } from '@/lib/useMode'
import { METHODS } from '@/lib/prayer-times'

// One definition, in src/lib/settings.ts, which is also what the API route
// merges over its defaults. Type-only, so importing it here does not drag
// the database into the client bundle.
export type { Settings } from '@/lib/settings'
import type { Settings } from '@/lib/settings'
import { FIXED_ZONES, setClockZone, wallNow } from '@/lib/wallclock'
import { notifyDataChanged } from '@/lib/dataSignal'

interface SettingsPanelProps {
  onSettingsChanged: (settings: Settings) => void
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void
  /** Opens the lists, on a phone. */
  onOpenMenu: () => void
  /** Lists across the whole window, or one calm column. Kept on this device. */
  stretched: boolean
  onToggleStretched: () => void
  /** Slim Mode: the sidebar put away. Also ⌘/. */
  slim: boolean
  onToggleSlim: () => void
}

/*
 * Drawn as one more list: the same column, the same 22px title, the same
 * coloured rule over each section and the same single left edge as Today or
 * a project (see TodoView). A settings page that looks like a different app
 * is how a small app starts to feel like two.
 */
const FIELD = 'bg-foreground/[0.05] rounded-md px-2 py-1 text-[13.5px] leading-5 outline-none focus:ring-1 focus:ring-primary'
const BUTTON = 'inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1 text-[13px] font-medium hover:bg-foreground/[0.05] disabled:opacity-60'
const LABEL = 'block mb-1 text-[12px] font-medium text-muted-foreground'
const HINT = 'text-[12.5px] text-muted-foreground max-w-[60ch]'

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[14px] font-bold text-primary mt-8 mb-2.5 pb-1.5 border-b border-border/80">{title}</h2>
      {hint && <p className={`${HINT} mb-3`}>{hint}</p>}
      {children}
    </section>
  )
}

/**
 * Only what the one loop needs: how it looks, prayer times and where they
 * are worked out from, and the data itself. A day runs midnight to
 * midnight, and when in it things happen is learned, not set here. Per-type colours, section switches and the integrations went with
 * the things they configured.
 */
export function SettingsPanel({ onSettingsChanged, onImport, onOpenMenu, stretched, onToggleStretched, slim, onToggleSlim }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [account, setAccount] = useState<{ email: string | null; name: string } | null>(null)
  const [saving, setSaving] = useState(false)
  // Shared with the sidebar's toggle, so pressing that updates this picker
  // too — see src/lib/useMode.ts.
  const { dark, set: setDarkMode } = useMode()
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [startingOver, setStartingOver] = useState(false)
  const [resetting, setResetting] = useState(false)

  function setTheme(id: string) {
    applyTheme(id)          // instant, and remembered locally for the next paint
    save({ theme: id })     // and to the database, so other devices follow
  }

  /**
   * Asks the browser once and stores the result, rather than prompting on
   * every visit. Reverse-geocoded through Open-Meteo's free geocoding
   * endpoint purely to show a recognisable place name.
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
          // A missing place name is cosmetic; the times still work.
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
            ? 'Location permission was denied. Allow it in your browser settings.'
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
   * Wipe everything and go back to setup.
   *
   * `everything: true` takes the Settings node too, so the app comes back at
   * its defaults with setup unanswered — which is what makes it open by
   * itself rather than needing a flag written into the row this just deleted.
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

  if (!settings) return null

  const prayer = settings.prayer ?? { enabled: false, method: 'morocco', madhab: 'standard' as const, habitNodeId: null }
  const located = settings.weather?.lat !== null && settings.weather?.lat !== undefined

  // Shown beside the zone picker so the user can check it against the wall.
  const browserZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'browser' } })()
  const wallTime = wallNow().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full mx-auto max-w-[740px] px-12 max-md:px-[18px] pt-10 max-md:pt-2 pb-16 text-[14px] max-md:text-[15px]">
        <div className="md:hidden flex items-center h-9 -mx-1.5 mb-2">
          <button onClick={onOpenMenu} aria-label="Back to lists" className="grid place-items-center w-9 h-9 rounded-md text-muted-foreground active:bg-foreground/[0.06]">
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>
        <header className="flex items-center gap-2 mb-2">
          <h1 className="min-w-0 flex items-center gap-2.5 text-[22px] font-bold leading-7 tracking-tight">
            <SlidersHorizontal className="w-[22px] h-[22px] shrink-0 text-muted-foreground" />
            Settings
          </h1>
          <span className="flex-1" />
          <span className="text-[12px] text-muted-foreground">{saving ? 'Saving…' : 'Saved as you change it'}</span>
        </header>

        <Section title="Appearance">
          <div className="flex gap-1 mb-3">
            {([['Light', false], ['Dark', true]] as const).map(([label, value]) => (
              <button
                key={label}
                onClick={() => setDarkMode(value ? 'dark' : 'light')}
                aria-pressed={dark === value}
                className={`${BUTTON} ${dark === value ? 'bg-foreground/[0.09] border-foreground/30' : 'text-muted-foreground'}`}
              >
                {value ? <Moon className="w-3.5 h-3.5" /> : <Sun className="w-3.5 h-3.5" />}
                {label}
              </button>
            ))}
          </div>
          {/* Layout, on this device: what the footer's icons used to do. */}
          <div className="flex flex-wrap items-center gap-1 mb-3 max-md:hidden">
            {([['Compact', false], ['Stretched', true]] as const).map(([label, value]) => (
              <button
                key={label}
                onClick={() => { if (stretched !== value) onToggleStretched() }}
                aria-pressed={stretched === value}
                className={`${BUTTON} ${stretched === value ? 'bg-foreground/[0.09] border-foreground/30' : 'text-muted-foreground'}`}
              >
                {label}
              </button>
            ))}
            <label className="ml-3 flex items-center gap-1.5 text-[13px] cursor-pointer">
              <input type="checkbox" checked={slim} onChange={onToggleSlim} className="accent-[var(--primary)]" />
              Hide the sidebar <span className="text-muted-foreground">(⌘/)</span>
            </label>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {THEMES.map((t) => {
              const active = (settings.theme ?? 'default') === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTheme(t.id)}
                  aria-pressed={active}
                  className={`text-left rounded-lg border p-2 ${active ? 'border-primary bg-primary/[0.06]' : 'border-border/70 hover:bg-foreground/[0.04]'}`}
                >
                  {/* Primary, secondary, then the palette's light and dark grounds. */}
                  <span className="flex gap-0.5 mb-1.5">
                    {t.swatch.map((c, i) => (
                      <span key={i} className="h-4 flex-1 first:rounded-l last:rounded-r border border-black/10" style={{ background: c }} />
                    ))}
                  </span>
                  <span className="flex items-center gap-1.5 text-[13px] font-medium">
                    {t.name}
                    {active && <Check className="w-3 h-3 text-primary" />}
                  </span>
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="Prayer times" hint="Puts the five on Today at their times, worked out on your device from your location. Ticking all five completes the day’s prayer.">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={prayer.enabled} onChange={(e) => save({ prayer: { ...prayer, enabled: e.target.checked } })} className="accent-[var(--primary)]" />
            Show prayer times
            {!located && <span className="text-[12.5px] text-muted-foreground">— set a location below first</span>}
          </label>
          {prayer.enabled && (
            <div className="flex flex-wrap gap-4 mt-3">
              <label>
                <span className={LABEL}>Method (decides Fajr and Isha)</span>
                <select value={prayer.method} onChange={(e) => save({ prayer: { ...prayer, method: e.target.value } })} className={FIELD}>
                  {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </label>
              <label>
                <span className={LABEL}>Asr</span>
                <select value={prayer.madhab} onChange={(e) => save({ prayer: { ...prayer, madhab: e.target.value as 'standard' | 'hanafi' } })} className={FIELD}>
                  <option value="standard">Standard (shadow ×1)</option>
                  <option value="hanafi">Hanafi (shadow ×2)</option>
                </select>
              </label>
            </div>
          )}
        </Section>

        <Section title="Location and time" hint="Where you are, for prayer times, and the clock your day is planned by. Asked once and kept across your devices.">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={requestLocation} disabled={locating} className={BUTTON}>
              <MapPin className="w-3.5 h-3.5" />
              {locating ? 'Locating…' : located ? 'Update location' : 'Use my location'}
            </button>
            {settings.weather?.enabled && (
              <button onClick={() => save({ weather: { enabled: false, lat: null, lon: null, place: null } })} className={`${BUTTON} text-muted-foreground`}>
                Forget it
              </button>
            )}
            {settings.weather?.enabled && located && (
              <span className="text-[12.5px] text-muted-foreground tabular-nums">
                {settings.weather.place ?? 'Location set'} · {settings.weather.lat?.toFixed(2)}, {settings.weather.lon?.toFixed(2)}
              </span>
            )}
          </div>
          {locationError && <p className="mt-2 text-[12.5px] text-red-500">{locationError}</p>}

          {/* The browser's own zone data can lag reality — Morocco's return
              to UTC+0 left it an hour ahead — so the zone can be pinned. */}
          <label className="block mt-4">
            <span className={LABEL}>Time zone</span>
            <span className="flex flex-wrap items-center gap-3">
              <select
                value={settings.timeZoneOverride ?? ''}
                onChange={(e) => {
                  const zone = e.target.value || null
                  setClockZone(zone)
                  void save({ timeZoneOverride: zone })
                  notifyDataChanged()
                }}
                className={FIELD}
              >
                <option value="">Automatic — {browserZone}</option>
                {FIXED_ZONES.map((z) => <option key={z.zone} value={z.zone}>{z.label}</option>)}
              </select>
              <span className="text-[12.5px] text-muted-foreground tabular-nums">
                Acture&apos;s clock: <span className="text-foreground font-medium">{wallTime}</span>
              </span>
            </span>
          </label>
          <p className={`${HINT} mt-1.5`}>
            If that isn&apos;t the time on your wall, your browser&apos;s time-zone data is out of date — pick your offset. Morocco is on UTC+0.
          </p>
        </Section>

        <Section title="Data" hint="Everything Acture holds for you, as one JSON file.">
          <div className="flex flex-wrap gap-2">
            <button onClick={() => window.open('/api/export', '_blank')} className={BUTTON}>
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <label className={`${BUTTON} cursor-pointer`}>
              <Upload className="w-3.5 h-3.5" /> Import
              <input type="file" accept=".json" className="sr-only" onChange={onImport} />
            </label>
            {/* The way back into setup after skipping it. Deletes nothing. */}
            <button onClick={() => save({ onboarding: { completed: false, completedAt: null } })} disabled={saving} className={BUTTON}>
              Run setup again
            </button>
          </div>

          {/* Start over: two clicks, and the first downloads the file. A
              fresh start is a reasonable thing to want; losing everything to
              a mis-tap is not. */}
          <div className="mt-3">
            {!startingOver ? (
              <button onClick={() => setStartingOver(true)} className={`${BUTTON} border-red-500/40 text-red-500 hover:bg-red-500/10`}>
                Start over…
              </button>
            ) : (
              <div className="rounded-lg border border-red-500/40 p-3 max-w-[60ch]">
                <p className="font-medium">Delete everything and set up again?</p>
                <p className="mt-0.5 mb-2.5 text-[12.5px] text-muted-foreground">
                  Every to-do, project, event and everything learned about you goes, along with these settings. A backup file downloads first. This cannot be undone.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={startOver} disabled={resetting} className="rounded-md bg-red-500 text-white px-2.5 py-1 text-[13px] font-semibold hover:opacity-90 disabled:opacity-60">
                    {resetting ? 'Clearing…' : 'Back up and delete everything'}
                  </button>
                  <button onClick={() => setStartingOver(false)} className={BUTTON}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </Section>

        <Section title="Account">
          <div className="flex items-center gap-3">
            <span className="flex-1 min-w-0 truncate">{account?.email ?? '—'}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className={BUTTON}>
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </form>
          </div>
        </Section>
      </div>
    </div>
  )
}
