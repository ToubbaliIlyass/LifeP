'use client'

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, GraduationCap, RefreshCw } from 'lucide-react'

/**
 * Settings → Canvas.
 *
 * One address and one access token, pasted once; after that a button that
 * pulls courses, assignments, quizzes and announcements into the school
 * module. The token is written to its own node and never comes back out —
 * nothing here can show it, only replace it.
 */

interface SyncSummary {
  ranAt: string
  courses: number
  assignments: number
  exams: number
  announcements: number
  created: number
  updated: number
}

interface Status {
  connected: boolean
  enabled: boolean
  baseUrl: string | null
  canvasUserName: string | null
  lastSync: string | null
  lastError: string | null
  lastSummary: SyncSummary | null
  schoolEnabled: boolean
}

const sub = 'text-[10px] font-mono text-muted-foreground/50 mb-1.5 block'
const btn = 'flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-50'
const field = 'w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50'

function whenever(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString()} at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function counts(s: SyncSummary): string {
  const parts = [
    `${s.courses} course${s.courses === 1 ? '' : 's'}`,
    `${s.assignments} assignment${s.assignments === 1 ? '' : 's'}`,
    ...(s.exams ? [`${s.exams} exam${s.exams === 1 ? '' : 's'}`] : []),
    `${s.announcements} announcement${s.announcements === 1 ? '' : 's'}`,
  ]
  return `${parts.join(' · ')} — ${s.created} new, ${s.updated} updated`
}

export function CanvasSection() {
  const [status, setStatus] = useState<Status | null>(null)
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(() => {
    fetch('/api/canvas').then((r) => r.json()).then((d: Status) => {
      setStatus(d)
      setUrl((u) => u || d.baseUrl || '')
    }).catch(() => {})
  }, [])

  useEffect(load, [load])

  async function connect() {
    setBusy('Checking…')
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/api/canvas/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: url, token }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Could not connect')
      setToken('')
      setNote(`Connected as ${d.canvasUserName}. Sync to bring your courses in.`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not connect')
    } finally {
      setBusy(null)
    }
  }

  async function sync() {
    setBusy('Syncing…')
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/api/canvas/sync', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Sync failed')
      setNote(`Brought in ${counts(d.summary as SyncSummary)}.`)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
    } finally {
      setBusy(null)
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect Canvas? Your courses and assignments stay — only the token is removed.')) return
    await fetch('/api/canvas/connect', { method: 'DELETE' })
    setNote(null)
    setError(null)
    load()
  }

  // The token page is per-institution, so the link is only useful once there
  // is an address to build it from.
  const tokenPage = status?.baseUrl ? `${status.baseUrl}/profile/settings` : null
  const typedHost = url.trim() ? `https://${url.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '')}/profile/settings` : null

  return (
    <div className="space-y-5">
      <div>
        <label className={sub}>Canvas</label>
        <p className="text-[12px] text-muted-foreground/70 max-w-[60ch]">
          Your courses, assignments, graded quizzes and announcements, pulled in as if you had typed them. Syncing again refreshes them and never undoes anything you have ticked off.
        </p>
      </div>

      {status && !status.schoolEnabled && (
        <p className="text-[12px] text-muted-foreground rounded-lg bg-muted/30 px-3 py-2">
          The School module is switched off, so there is nowhere to put your courses. Switch it on above first.
        </p>
      )}

      {status?.connected ? (
        <div className="space-y-3">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20">
            <GraduationCap className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] truncate">{status.canvasUserName ?? 'Connected'}</p>
              <p className="text-[10px] font-mono text-muted-foreground/60 truncate">
                {status.baseUrl?.replace(/^https?:\/\//, '')} ·{' '}
                {status.lastSync ? `last synced ${whenever(status.lastSync)}` : 'never synced'}
              </p>
            </div>
            <button onClick={disconnect} className="text-[11px] font-mono px-2.5 py-1 rounded-md border border-border/60 text-destructive/80 hover:bg-destructive/10">
              disconnect
            </button>
          </div>

          {status.lastSummary && (
            <p className="text-[11px] text-muted-foreground/60">{counts(status.lastSummary)}</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={sync} disabled={!!busy || !status.schoolEnabled} className={btn}>
              <RefreshCw className={`w-3.5 h-3.5 ${busy === 'Syncing…' ? 'animate-spin' : ''}`} /> Sync now
            </button>
            {tokenPage && (
              <a href={tokenPage} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border border-border/60 hover:bg-muted/40">
                <ExternalLink className="w-3 h-3" /> Canvas tokens
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className={sub}>Your Canvas address</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="myschool.instructure.com"
              spellCheck={false}
              className={field}
            />
          </div>
          <div>
            <label className={sub}>Access token</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="Paste the token from Canvas"
              spellCheck={false}
              className={field}
            />
            <p className="text-[11px] text-muted-foreground/60 mt-1.5 max-w-[60ch]">
              In Canvas, open{' '}
              {typedHost ? (
                <a href={typedHost} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                  Account → Settings
                </a>
              ) : (
                <span className="font-mono">Account → Settings</span>
              )}{' '}
              and press “New Access Token”. It is stored here only, kept out of your export, and never shown to the assistant.
            </p>
          </div>
          <button onClick={connect} disabled={!url.trim() || !token.trim() || !!busy} className={btn}>
            Connect Canvas
          </button>
        </div>
      )}

      {busy && <p className="text-[12px] font-mono text-muted-foreground">{busy}</p>}
      {error && <p className="text-[12px] text-destructive">{error}</p>}
      {!error && note && <p className="text-[12px] text-muted-foreground">{note}</p>}
      {!error && !note && status?.lastError && (
        <p className="text-[12px] text-destructive/80">Last attempt: {status.lastError}</p>
      )}
    </div>
  )
}

export default CanvasSection
