'use client'

import { NotificationsControl } from './NotificationsControl'
import { AiBalance } from '@/components/todos/AiBalance'
import { InstallControl } from '@/components/install/InstallControl'
import { useInstall } from '@/components/install/InstallApp'
import { TuckAbout } from '@/components/tuck/TuckAbout'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, Clock, Coins, Database, User, Bell, Heart, Zap, Smile, Palette as PaletteIcon, Globe, Download, LogOut, MapPin, Maximize2, Minimize2, Monitor, Moon, Palette, PanelLeftClose, RotateCcw, X, SlidersHorizontal, Sun, Trash2, Upload } from 'lucide-react'
import { THEMES, CUSTOM_PREFIX, customHex, isCustomTheme, applyTheme, applyMode, storedMode, storedTheme } from '@/lib/themes'
import type { LucideIcon } from 'lucide-react'
import { Select } from '@/components/ui/Select'
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
const FIELD = 'bg-foreground/[0.05] rounded-md px-2 py-1 max-md:min-h-11 max-md:px-3 text-[length:calc(13.5px*var(--ts))] leading-5 outline-none focus:ring-1 focus:ring-primary'
const BUTTON = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border/80 px-2.5 py-1 max-md:min-h-11 max-md:px-4 max-md:text-[length:calc(15px*var(--ts))] text-[length:calc(13px*var(--ts))] font-medium hover:bg-foreground/[0.05] disabled:opacity-60'
const LABEL = 'block mb-1 text-[length:calc(12px*var(--ts))] font-medium text-muted-foreground'
const HINT = 'text-[length:calc(12.5px*var(--ts))] text-muted-foreground max-w-[60ch]'

function Section({ title, hint, icon: Icon, children }: { title: string; hint?: string; icon?: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border/70 bg-foreground/[0.025] p-4 max-md:p-3.5 mb-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/[0.14] text-primary-ink" aria-hidden>
            <Icon className="h-5 w-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[length:calc(15.5px*var(--ts))] font-semibold leading-snug tracking-tight">{title}</h3>
          {hint && <p className={`${HINT} mt-0.5`}>{hint}</p>}
        </div>
      </div>
      <div className="mt-3.5">{children}</div>
    </section>
  )
}

/** An on/off setting as a full-width button, like the others: pressed and ticked when it is on. */
function Toggle({ label, note, icon: Icon, on, onChange }: { label: string; note?: string; icon: LucideIcon; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <>
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={`${BUTTON} w-full justify-center py-2 max-sm:justify-between max-sm:px-4 max-sm:py-3 ${on ? 'bg-foreground/[0.09] border-foreground/30' : 'text-muted-foreground'}`}
    >
      <span className="inline-flex items-center gap-2"><Icon className="w-3.5 h-3.5" />{label}</span>
      <span className={`ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:calc(11.5px*var(--ts))] font-semibold ${on ? 'bg-primary/[0.18] text-primary-ink' : 'bg-foreground/[0.08]'}`}>
        {on && <Check className="h-3 w-3" strokeWidth={3} />}{on ? 'On' : 'Off'}
      </span>
    </button>
    {note && <p className="mt-2 px-1 text-[length:calc(12.5px*var(--ts))] text-muted-foreground">{note}</p>}
    </>
  )
}

/** A named stretch of the page, so a long list of cards reads as a few topics. */
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-9">
      <h2 className="mb-2.5 px-1 text-[length:calc(12px*var(--ts))] font-bold uppercase tracking-wider text-primary-ink">{title}</h2>
      {children}
    </div>
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
  const [saveError, setSaveError] = useState<string | null>(null)
  // Shared with the sidebar's toggle, so pressing that updates this picker
  // too — see src/lib/useMode.ts.
  const { set: setDarkMode } = useMode()
  const [modeChoice, setModeChoice] = useState(() => (typeof window === 'undefined' ? 'system' : storedMode()))
  const [locating, setLocating] = useState(false)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [startingOver, setStartingOver] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [resetting, setResetting] = useState(false)
  /** What the Data buttons are doing or did, shown beside them: a press must never look like nothing happened. */
  const [dataNote, setDataNote] = useState<{ kind: 'busy' | 'ok' | 'error'; text: string } | null>(null)
  const install = useInstall()
  /** Opened in a browser tab, not yet installed: worth saying how. */
  const installable = !!install && !install.installed

  /** While dragging in the picker the page follows at once; the database hears about it once it settles. */
  const colourTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function pickColour(hex: string) {
    const id = `${CUSTOM_PREFIX}${hex.toLowerCase()}`
    applyTheme(id)
    setSettings((cur) => (cur ? { ...cur, theme: id } : cur))
    if (colourTimer.current) clearTimeout(colourTimer.current)
    colourTimer.current = setTimeout(() => save({ theme: id }), 450)
  }

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
        if (s.mode && s.mode !== storedMode()) { applyMode(s.mode); setModeChoice(s.mode) }
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
  /** The whole graph as a file on disk. Throws with a reason a person can read. */
  async function downloadBackup(): Promise<void> {
    const res = await fetch('/api/export')
    if (!res.ok) throw new Error(`something went wrong`)
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = `acture-backup-${new Date().toISOString().slice(0, 10)}.json`
    // In the page, not floating: some browsers ignore a click on a detached link.
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function exportData() {
    setDataNote({ kind: 'busy', text: 'Preparing your export…' })
    try {
      await downloadBackup()
      setDataNote({ kind: 'ok', text: 'Exported. Check your downloads.' })
    } catch (e) {
      setDataNote({ kind: 'error', text: `Could not export: ${e instanceof Error ? e.message : 'unknown error'}.` })
    }
  }

  async function startOver() {
    setResetting(true)
    setDataNote({ kind: 'busy', text: 'Saving a backup first…' })
    try {
      // Downloaded first, and awaited: if the backup fails, nothing is deleted.
      try {
        await downloadBackup()
      } catch (e) {
        setDataNote({ kind: 'error', text: `Could not make a backup (${e instanceof Error ? e.message : 'unknown error'}), so nothing was deleted.` })
        return
      }

      setDataNote({ kind: 'busy', text: 'Deleting everything…' })
      const res = await fetch('/api/graph/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ everything: true }),
      }).catch(() => null)
      if (!res?.ok) {
        setDataNote({ kind: 'error', text: `Could not delete everything${res ? ` (something went wrong)` : ' (no connection)'}. Your data is untouched.` })
        return
      }
      setDataNote({ kind: 'ok', text: 'Done. Starting setup…' })
      // A fresh load of the app itself, so setup opens from the emptied settings.
      window.location.assign('/app')
    } finally {
      setResetting(false)
    }
  }

  async function save(changes: Partial<Settings>) {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
      if (!res.ok) throw new Error('save failed')
      const { settings: next } = (await res.json()) as { settings: Settings }
      setSettings(next)
      onSettingsChanged(next)
      setSaveError(null)
    } catch {
      setSaveError('I couldn’t save that. Try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) return null

  const profile: Settings['profile'] = settings.profile ?? { name: '', about: '', tone: 'gentle' }
  const prayer = settings.prayer ?? { enabled: false, method: 'morocco', madhab: 'standard' as const }
  const located = settings.weather?.lat !== null && settings.weather?.lat !== undefined

  // Shown beside the zone picker so the user can check it against the wall.
  const browserZone = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone } catch { return 'browser' } })()
  const wallTime = wallNow().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="h-full overflow-y-auto">
      <div className={`w-full mx-auto ${stretched ? 'max-w-none' : 'max-w-[740px]'} px-12 max-md:px-[18px] pt-10 max-md:pt-2 pb-16 text-[length:calc(14px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))]`}>
        <div className="md:hidden flex items-center h-9 -mx-1.5 mb-2">
          <button onClick={onOpenMenu} aria-label="Back to lists" className="grid place-items-center w-9 h-9 rounded-md text-muted-foreground active:bg-foreground/[0.06]">
            <ChevronLeft className="w-6 h-6" />
          </button>
        </div>
        <header className="flex items-center gap-2 mb-2">
          <h1 className="min-w-0 flex items-center gap-2.5 text-[length:calc(22px*var(--ts))] font-bold leading-7 tracking-tight">
            <SlidersHorizontal className="w-[22px] h-[22px] shrink-0 text-muted-foreground" />
            Settings
          </h1>
          <span className="flex-1" />
          <span className="text-[length:calc(12px*var(--ts))] text-muted-foreground">{saveError ?? (saving ? 'Saving…' : 'Saved as you change it')}</span>
        </header>

        <div className="mt-5"><TuckAbout /></div>

        <Group title="About you">
        <Section title="Profile" icon={User}>
          <label className="block">
            <span className={LABEL}>What should Tuck call you?</span>
            <input
              key={`n-${settings.profile?.name ?? ''}`}
              defaultValue={settings.profile?.name ?? ''}
              maxLength={40}
              placeholder={account?.name?.split(' ')[0] || 'Your name'}
              autoComplete="given-name"
              onBlur={(e) => { const name = e.target.value.trim(); if (name !== (settings.profile?.name ?? '')) save({ profile: { ...profile, name } }) }}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
              className={`${FIELD} w-full`}
            />
          </label>
          <label className="mt-3 block">
            <span className={LABEL}>Anything Tuck should know?</span>
            <textarea
              key={`a-${settings.profile?.about ?? ''}`}
              defaultValue={settings.profile?.about ?? ''}
              maxLength={300}
              rows={2}
              placeholder="I study at night. Mornings are for family."
              onBlur={(e) => { const about = e.target.value.trim(); if (about !== (settings.profile?.about ?? '')) save({ profile: { ...profile, about } }) }}
              className={`${FIELD} w-full resize-none`}
            />
          </label>
          <span className={`${LABEL} mt-3`}>How should Tuck sound?</span>
          <div className="grid grid-cols-3 gap-2">
            {([['Gentle', 'gentle', Heart], ['Direct', 'direct', Zap], ['Playful', 'playful', Smile]] as const).map(([label, value, Icon]) => (
              <button
                key={value}
                onClick={() => save({ profile: { ...profile, tone: value } })}
                aria-pressed={profile.tone === value}
                className={`${BUTTON} justify-center ${profile.tone === value ? 'bg-foreground/[0.09] border-foreground/30' : 'text-muted-foreground'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>
        </Section>
        </Group>

        <Group title="Look and feel">
        <Section title="Appearance" icon={PaletteIcon}>
          <div className="grid grid-cols-[1fr_1fr_1.8fr] gap-2 mb-2">
            {([['Light', 'light', Sun], ['Dark', 'dark', Moon], ['Match device', 'system', Monitor]] as const).map(([label, value, Icon]) => (
              <button
                key={label}
                onClick={() => { setModeChoice(value); setDarkMode(value) }}
                aria-pressed={modeChoice === value}
                className={`${BUTTON} justify-center ${modeChoice === value ? 'bg-foreground/[0.09] border-foreground/30' : 'text-muted-foreground'}`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label === 'Match device' ? <><span className="sm:hidden">Device</span><span className="max-sm:hidden">Match device</span></> : label}
              </button>
            ))}
          </div>
          {/* Layout, on this device: what the footer's icons used to do. */}
          <div className="grid grid-cols-[1fr_1fr_1.8fr] gap-2 mb-4 max-md:hidden">
            {([['Compact', false, Minimize2], ['Stretched', true, Maximize2]] as const).map(([label, value, LayoutIcon]) => (
              <button
                key={label}
                onClick={() => { if (stretched !== value) onToggleStretched() }}
                aria-pressed={stretched === value}
                className={`${BUTTON} justify-center ${stretched === value ? 'bg-foreground/[0.09] border-foreground/30' : 'text-muted-foreground'}`}
              >
                <LayoutIcon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
            <button
              onClick={onToggleSlim}
              aria-pressed={slim}
              title="Shortcut: ⌘/"
              className={`${BUTTON} justify-center ${slim ? 'bg-foreground/[0.09] border-foreground/30' : 'text-muted-foreground'}`}
            >
              <PanelLeftClose className="w-3.5 h-3.5" /> Hide sidebar
            </button>
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
                  <span className="flex items-center gap-1.5 text-[length:calc(13px*var(--ts))] font-medium">
                    {t.name}
                    {active && <Check className="w-3 h-3 text-primary-ink" />}
                  </span>
                </button>
              )
            })}
            {/* One colour in, the whole palette out. */}
            {(() => {
              const current = settings.theme ?? 'default'
              const active = isCustomTheme(current)
              const hex = active ? customHex(current) : (THEMES.find((t) => t.id === current)?.swatch[0] ?? '#bd8b2c')
              return (
                <label className={`relative col-span-full flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${active ? 'border-primary bg-primary/[0.06]' : 'border-border/70 hover:bg-foreground/[0.04]'}`}>
                  {/* The colour in use, then the whole spectrum to pick from. */}
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-black/15 shadow-inner" style={{ background: hex }}>
                    <Palette className="h-4 w-4 text-white mix-blend-difference" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[length:calc(14px*var(--ts))] font-semibold">
                      Pick your theme
                      {active && <Check className="w-3.5 h-3.5 text-primary-ink" />}
                    </span>
                    <span
                      className="mt-1.5 block h-3 rounded-full border border-black/10"
                      style={{ background: 'linear-gradient(90deg, #ef4444, #f59e0b, #eab308, #84cc16, #22c55e, #14b8a6, #06b6d4, #3b82f6, #6366f1, #a855f7, #ec4899, #ef4444)' }}
                    />
                  </span>
                  <input
                    type="color"
                    value={hex}
                    aria-label="Pick your theme colour"
                    onInput={(e) => pickColour((e.target as HTMLInputElement).value)}
                    onChange={(e) => pickColour(e.target.value)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              )
            })()}
          </div>
        </Section>
        </Group>

        <Group title="Reminders and app">
        <Section title="Notifications" icon={Bell}>
          <NotificationsControl />
        </Section>

        {installable && (
          <Section title="Install" icon={Download}>
            <InstallControl />
          </Section>
        )}
        </Group>

        <Group title="Your day">
        <Section title="Prayer times" icon={Clock}>
          <Toggle icon={Clock} label="Show prayer times" note={located ? undefined : 'Needs a location'} on={prayer.enabled} onChange={(on) => save({ prayer: { ...prayer, enabled: on } })} />
          {prayer.enabled && (
            <div className="grid grid-cols-2 gap-3 mt-3 max-sm:grid-cols-1">
              <label>
                <span className={LABEL}>Method (decides Fajr and Isha)</span>
                <Select value={prayer.method} onChange={(v) => save({ prayer: { ...prayer, method: v } })} options={METHODS.map((m) => ({ value: m.id, label: m.label }))} ariaLabel="Prayer time method" className={FIELD} />
              </label>
              <label>
                <span className={LABEL}>Asr</span>
                <Select value={prayer.madhab} onChange={(v) => save({ prayer: { ...prayer, madhab: v as 'standard' | 'hanafi' } })} options={[{ value: 'standard', label: 'Standard (shadow ×1)' }, { value: 'hanafi', label: 'Hanafi (shadow ×2)' }]} ariaLabel="Asr calculation" className={FIELD} />
              </label>
            </div>
          )}
        </Section>

        <Section title="Location and time" icon={MapPin}>
          {settings.weather?.enabled && located && (
            <p className="mb-2 flex items-center gap-2 text-[length:calc(13.5px*var(--ts))] font-medium">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
              {settings.weather.place ?? 'Location set'}
              <span className="font-normal text-muted-foreground tabular-nums">{settings.weather.lat?.toFixed(2)}, {settings.weather.lon?.toFixed(2)}</span>
            </p>
          )}
          <div className={`grid gap-2 ${settings.weather?.enabled ? 'grid-cols-2 max-sm:grid-cols-1' : 'grid-cols-1'}`}>
            <button onClick={requestLocation} disabled={locating} className={`${BUTTON} justify-center`}>
              <MapPin className="w-3.5 h-3.5" />
              {locating ? 'Locating…' : located ? 'Update location' : 'Use my location'}
            </button>
            {settings.weather?.enabled && (
              <button onClick={() => save({ weather: { enabled: false, lat: null, lon: null, place: null } })} className={`${BUTTON} justify-center text-muted-foreground`}>
                <X className="w-3.5 h-3.5" /> Forget my location
              </button>
            )}
          </div>
          {locationError && <p className="mt-2 text-[length:calc(12.5px*var(--ts))] text-destructive">{locationError}</p>}

          {/* The browser's own zone data can lag reality — Morocco's return
              to UTC+0 left it an hour ahead — so the zone can be pinned. */}
          <div className="mt-4">
            <span className={LABEL}>Time zone</span>
            <Select
              value={settings.timeZoneOverride ?? ''}
              onChange={(v) => {
                const zone = v || null
                setClockZone(zone)
                void save({ timeZoneOverride: zone })
                notifyDataChanged()
              }}
              options={[{ value: '', label: `Automatic — ${browserZone}` }, ...FIXED_ZONES.map((z) => ({ value: z.zone, label: z.label }))]}
              ariaLabel="Time zone"
              className={FIELD}
            />
            <p className="mt-1.5 flex items-center gap-1.5 text-[length:calc(12.5px*var(--ts))] text-muted-foreground tabular-nums">
              <Globe className="h-3.5 w-3.5" /> Acture&apos;s clock: <span className="text-foreground font-medium">{wallTime}</span>
            </p>
          </div>
        </Section>
        </Group>

        <Group title="Your data">
        <Section title="Setup" icon={RotateCcw} hint="Nothing is deleted.">
          <div className="grid">
              {/* The way back into setup after skipping it. Deletes nothing. */}
              <button onClick={async () => { setDataNote({ kind: 'busy', text: 'Opening setup…' }); await save({ onboarding: { completed: false, completedAt: null } }); setDataNote(null) }} disabled={saving} className={`${BUTTON} justify-center`}>
                <RotateCcw className="w-3.5 h-3.5" /> Run setup again
              </button>
          </div>
        </Section>

        <Section title="AI usage" icon={Coins} hint="An estimate, not the bill.">
          <div className="flex"><AiBalance /></div>
        </Section>

        <Section title="Data" icon={Database} hint="One JSON file.">
          <div className="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
            <button onClick={exportData} disabled={resetting} className={`${BUTTON} justify-center`}>
              <Download className="w-3.5 h-3.5" /> Export
            </button>
            <label className={`${BUTTON} justify-center cursor-pointer`}>
              <Upload className="w-3.5 h-3.5" /> Import
              <input type="file" accept=".json" className="sr-only" onChange={onImport} />
            </label>
            <button
              onClick={() => { setConfirmText(''); setStartingOver((v) => !v) }}
              aria-expanded={startingOver}
              className={`${BUTTON} justify-center border-destructive/40 text-destructive hover:bg-destructive/10 ${startingOver ? 'bg-destructive/10' : ''}`}
            >
              <Trash2 className="w-3.5 h-3.5" /> Start over
            </button>
          </div>

          {dataNote && (
            <p role="status" className={`mt-3 text-[length:calc(13px*var(--ts))] ${dataNote.kind === 'error' ? 'text-destructive' : dataNote.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{dataNote.text}</p>
          )}

          {/* Start over, behind three guards: the button only opens this, a
              backup file downloads first, and nothing is deleted until the
              word is typed. A mis-tap cannot cost anyone their progress. */}
          {startingOver && (
            <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/[0.04] p-3.5">
              <p className="font-semibold">Delete everything and set up again?</p>
              <p className="mt-0.5 mb-3 text-[length:calc(12.5px*var(--ts))] text-muted-foreground">
                Every to-do, project, event and everything learned about you goes. A backup file downloads first. This cannot be undone.
              </p>
              <label className={LABEL} htmlFor="confirm-delete">Type DELETE to confirm</label>
              <input
                id="confirm-delete"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="DELETE"
                className={`${FIELD} w-full mb-3`}
              />
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => { setStartingOver(false); setConfirmText('') }} className={`${BUTTON} justify-center`}><X className="w-3.5 h-3.5" /> Cancel</button>
                <button
                  onClick={startOver}
                  disabled={resetting || confirmText.trim().toUpperCase() !== 'DELETE'}
                  className="inline-flex items-center justify-center rounded-md bg-red-600 text-white px-2.5 py-1 max-md:min-h-11 text-[length:calc(13px*var(--ts))] font-semibold hover:opacity-90 disabled:bg-foreground/[0.1] disabled:text-muted-foreground"
                >
                  <Trash2 className="mr-1.5 w-3.5 h-3.5" />{resetting ? 'Clearing…' : 'Back up and delete'}
                </button>
              </div>
            </div>
          )}
        </Section>
        </Group>

        <Group title="You">
        <Section title="Account" icon={User}>
          <p className="mb-2 truncate text-[length:calc(14px*var(--ts))] font-medium">{account?.email ?? '—'}</p>
          <form action="/auth/signout" method="post" className="grid">
            <button type="submit" className={`${BUTTON} justify-center`}>
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </form>
        </Section>
        </Group>
      </div>
    </div>
  )
}
