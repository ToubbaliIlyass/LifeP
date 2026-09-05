'use client'

import { useCallback, useEffect, useState } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Download, Upload, LogOut, Eye, EyeOff } from 'lucide-react'

export interface Settings {
  hiddenTabs: string[]
  defaultTab: string
  defaultCalendarView: 'day' | 'week'
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

  const load = useCallback(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then(({ settings: s }: { settings: Settings }) => setSettings(s))
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
