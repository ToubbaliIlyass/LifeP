'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Copy, KeyRound, Trash2, Upload } from 'lucide-react'
import { buildDigest, readExportFile } from '@/lib/chat-export'

/**
 * Settings → Connect your AI.
 *
 *  1. Import: a ChatGPT/Claude export (or a pasted summary) becomes memories,
 *     reviewed and ticked by the user before anything is saved.
 *  2. Memory: everything the app has quietly remembered, deletable.
 *  3. MCP: tokens that let an outside chatbot read and write Acture.
 *
 * Step-by-step instructions for each live in docs/connect-your-ai.md.
 */

interface Candidate { text: string; category: string; keep: boolean }
interface Memory { id: number; text: string; category: string; source: string }
interface Rule { id?: number; kind: string; days: number[]; start: string; end: string; activity?: string; note?: string }
interface Token { id: number; name: string; preview: string; createdAt: string; lastUsedAt: string | null }

const SUMMARY_PROMPT =
  'Based on everything you know about me from our conversations, write a plain bullet list of lasting facts that would help a personal planning app: my goals, ongoing projects, weekly routine and schedule (when I work, study, train, sleep), how and when I like to work, constraints, and anything I create. One fact per bullet, no commentary.'

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true)
          setTimeout(() => setDone(false), 1500)
        }).catch(() => {})
      }}
      className="flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1 rounded-md border border-border/60 hover:bg-muted/40 shrink-0"
    >
      {done ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />} {done ? 'Copied' : label}
    </button>
  )
}

const sub = 'text-[10px] font-mono text-muted-foreground/50 mb-1.5 block'
const btn = 'flex items-center gap-2 text-[13px] font-medium px-3.5 py-2 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors disabled:opacity-50'

export function ConnectAISection() {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [source, setSource] = useState<'chatgpt' | 'claude' | 'paste'>('paste')
  const [pasted, setPasted] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [memories, setMemories] = useState<Memory[]>([])
  const [rules, setRules] = useState<Rule[]>([])
  const [showAll, setShowAll] = useState(false)

  const [tokens, setTokens] = useState<Token[]>([])
  const [newToken, setNewToken] = useState<string | null>(null)
  const [origin, setOrigin] = useState('')

  const loadMemory = useCallback(() => {
    fetch('/api/memory').then((r) => r.json()).then((d: { memories: Memory[]; availability: Rule[] }) => {
      setMemories(d.memories)
      setRules(d.availability)
    }).catch(() => {})
  }, [])
  const loadTokens = useCallback(() => {
    fetch('/api/mcp/tokens').then((r) => r.json()).then((d: { tokens: Token[] }) => setTokens(d.tokens)).catch(() => {})
  }, [])

  useEffect(() => {
    loadMemory()
    loadTokens()
    // Read in an effect: the address this page is served from is only known in the browser.
    Promise.resolve(window.location.origin).then(setOrigin)
  }, [loadMemory, loadTokens])

  async function extract(text: string, from: typeof source, detail: string) {
    setBusy('Reading…')
    setError(null)
    setNote(null)
    try {
      const res = await fetch('/api/memory/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error ?? 'Import failed')
      setSource(from)
      setCandidates((d.candidates as { text: string; category: string }[]).map((c) => ({ ...c, keep: true })))
      setNote(d.candidates.length ? `${detail} Untick anything that is wrong, then save.` : `${detail} Nothing new worth remembering was found.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setBusy(null)
    }
  }

  async function onFile(file: File) {
    setBusy('Unpacking…')
    setError(null)
    try {
      const parsed = await readExportFile(file)
      const digest = buildDigest(parsed)
      if (!digest.text) throw new Error('No messages of yours were found in that export.')
      await extract(
        digest.text,
        parsed.source,
        `Read your messages from the ${digest.conversationsUsed} most recent of ${digest.totalConversations} ${parsed.source === 'chatgpt' ? 'ChatGPT' : 'Claude'} conversations.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file')
      setBusy(null)
    }
  }

  async function saveCandidates() {
    if (!candidates) return
    setBusy('Saving…')
    const res = await fetch('/api/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, items: candidates.filter((c) => c.keep) }),
    })
    const d = await res.json()
    setBusy(null)
    setCandidates(null)
    setPasted('')
    setNote(`Saved ${d.saved} memor${d.saved === 1 ? 'y' : 'ies'}${d.skipped ? ` (${d.skipped} already known)` : ''}.`)
    loadMemory()
  }

  async function removeMemory(id: number) {
    setMemories((m) => m.filter((x) => x.id !== id))
    setRules((r) => r.filter((x) => x.id !== id))
    await fetch(`/api/memory?id=${id}`, { method: 'DELETE' })
  }

  async function createToken() {
    const name = window.prompt('Name this connection (e.g. "Claude desktop")', 'Chatbot')
    if (name === null) return
    const res = await fetch('/api/mcp/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const d = await res.json()
    setNewToken(d.token)
    loadTokens()
  }

  async function revokeToken(id: number) {
    if (!window.confirm('Revoke this token? Anything using it stops working immediately.')) return
    await fetch(`/api/mcp/tokens?id=${id}`, { method: 'DELETE' })
    loadTokens()
  }

  const mcpUrl = `${origin}/api/mcp`
  const shown = showAll ? memories : memories.slice(0, 8)

  return (
    <div className="space-y-7">
      {/* ── 1. Import ─────────────────────────────── */}
      <div>
        <label className={sub}>Bring in what your chatbot knows</label>
        <div className="flex flex-wrap gap-2">
          <label className={`${btn} cursor-pointer ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            <Upload className="w-3.5 h-3.5" /> Upload ChatGPT or Claude export
            <input
              type="file"
              accept=".zip,.json,application/zip,application/json"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onFile(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
        <p className="text-[11px] text-muted-foreground/60 mt-2 max-w-[60ch]">
          The zip is unpacked on this device and only your own messages from recent conversations are sent — never the assistant&apos;s replies or attachments. Nothing is saved until you approve it.
        </p>

        <div className="mt-4">
          <label className={sub}>…or paste a summary</label>
          <div className="flex items-start gap-2 mb-2 rounded-lg bg-muted/30 px-3 py-2">
            <p className="text-[11px] text-muted-foreground/80 flex-1">Ask your chatbot: “{SUMMARY_PROMPT}”</p>
            <CopyButton text={SUMMARY_PROMPT} label="Copy prompt" />
          </div>
          <textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={4}
            placeholder="Paste the answer here"
            className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <button
            onClick={() => extract(pasted, 'paste', 'Read your pasted summary.')}
            disabled={!pasted.trim() || !!busy}
            className={`${btn} mt-2`}
          >
            Find memories
          </button>
        </div>

        {busy && <p className="text-[12px] font-mono text-muted-foreground mt-3">{busy}</p>}
        {error && <p className="text-[12px] text-destructive mt-3">{error}</p>}
        {note && <p className="text-[12px] text-muted-foreground mt-3">{note}</p>}

        {candidates && candidates.length > 0 && (
          <div className="mt-3 rounded-xl border border-border/60 p-2">
            <div className="max-h-[320px] overflow-y-auto space-y-1">
              {candidates.map((c, i) => (
                <label key={i} className="flex items-start gap-2.5 px-2 py-1.5 rounded-md hover:bg-muted/30 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={c.keep}
                    onChange={() => setCandidates((all) => all!.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))}
                    className="mt-1"
                  />
                  <span className="text-[13px] flex-1">{c.text}</span>
                  <span className="text-[10px] font-mono text-muted-foreground/60 mt-0.5">{c.category}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 mt-2 px-1">
              <button onClick={saveCandidates} disabled={!!busy || !candidates.some((c) => c.keep)} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground disabled:opacity-40">
                Save {candidates.filter((c) => c.keep).length} selected
              </button>
              <button onClick={() => { setCandidates(null); setNote(null) }} className="text-[12px] px-3 py-1.5 rounded-lg border border-border/60">
                Discard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 2. Memory ─────────────────────────────── */}
      <div>
        <label className={sub}>What Acture remembers · {memories.length + rules.length}</label>
        {memories.length + rules.length === 0 ? (
          <p className="text-[12px] text-muted-foreground/60">Nothing yet. It fills in as you chat, import, and use the calendar.</p>
        ) : (
          <div className="space-y-1">
            {rules.map((r) => (
              <div key={`r${r.id}`} className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-mono text-primary/80 w-[70px] shrink-0">{r.kind === 'prefer' ? 'prefers' : r.kind}</span>
                <span className="text-[13px] flex-1 min-w-0">
                  {r.activity ? `${r.activity}, ` : ''}{r.days.length ? r.days.map((d) => DAY[d]).join(' ') : 'every day'} {r.start}–{r.end}
                  {r.note ? <span className="text-muted-foreground"> · {r.note}</span> : null}
                </span>
                <button onClick={() => r.id && removeMemory(r.id)} aria-label="Forget" className="p-1 text-muted-foreground/60 hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {shown.map((m) => (
              <div key={m.id} className="group flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/20">
                <span className="text-[10px] font-mono text-muted-foreground/60 w-[70px] shrink-0">{m.category}</span>
                <span className="text-[13px] flex-1 min-w-0">{m.text}</span>
                <button onClick={() => removeMemory(m.id)} aria-label="Forget" className="p-1 text-muted-foreground/60 hover:text-destructive">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {memories.length > 8 && (
              <button onClick={() => setShowAll((s) => !s)} className="text-[11px] font-mono text-primary px-3 py-1">
                {showAll ? 'show fewer' : `show all ${memories.length}`}
              </button>
            )}
          </div>
        )}
        <p className="text-[10px] font-mono text-muted-foreground/40 mt-2">
          Times you get things done are also learned from the calendar and used when scheduling. That learning is not listed here.
        </p>
      </div>

      {/* ── 3. MCP ────────────────────────────────── */}
      <div>
        <label className={sub}>Use Acture from your chatbot (MCP)</label>
        <p className="text-[12px] text-muted-foreground/70 mb-3 max-w-[60ch]">
          Lets Claude, ChatGPT or Cursor see your day, look things up, save what they learn about you, and suggest tasks and events — which still wait for your approval here.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <code className="text-[12px] font-mono bg-muted/40 rounded-md px-2 py-1 break-all">{mcpUrl}</code>
          <CopyButton text={mcpUrl} label="Copy URL" />
        </div>

        {newToken && (
          <div className="rounded-xl border border-primary/40 bg-primary/[0.06] p-3 mb-3">
            <p className="text-[12px] font-medium mb-1.5">Copy this token now — it will not be shown again.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="text-[12px] font-mono break-all flex-1 min-w-0">{newToken}</code>
              <CopyButton text={newToken} />
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">
              Clients that only take a URL: <code className="font-mono break-all">{mcpUrl}?token={newToken.slice(0, 11)}…</code>
            </p>
            <div className="flex gap-2 mt-2">
              <CopyButton text={`${mcpUrl}?token=${newToken}`} label="Copy URL with token" />
              <button onClick={() => setNewToken(null)} className="text-[11px] font-mono px-2.5 py-1 rounded-md border border-border/60">Done</button>
            </div>
          </div>
        )}

        <div className="space-y-1">
          {tokens.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/20">
              <KeyRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] truncate">{t.name}</p>
                <p className="text-[10px] font-mono text-muted-foreground/60 truncate">
                  {t.preview} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleDateString()}` : 'never used'}
                </p>
              </div>
              <button onClick={() => revokeToken(t.id)} className="text-[11px] font-mono px-2.5 py-1 rounded-md border border-border/60 text-destructive/80 hover:bg-destructive/10">
                revoke
              </button>
            </div>
          ))}
        </div>
        <button onClick={createToken} className={`${btn} mt-2`}>
          <KeyRound className="w-3.5 h-3.5" /> Create token
        </button>
        <p className="text-[10px] font-mono text-muted-foreground/40 mt-2">
          Setup for each chatbot: docs/connect-your-ai.md in the Acture repository.
        </p>
      </div>
    </div>
  )
}
