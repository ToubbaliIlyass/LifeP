'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Trash2, Save, Pencil } from 'lucide-react'

interface RelatedNode {
  id: number
  type: string
  properties: Record<string, unknown>
  edgeType: string
  direction: 'incoming' | 'outgoing'
}

interface NodeDetail {
  node: {
    id: number
    type: string
    properties: Record<string, unknown>
    createdAt: string
    updatedAt: string
  }
  relatedNotes: RelatedNode[]
  relatedNodes: RelatedNode[]
}

interface NodeDetailPanelProps {
  nodeId: number | null
  onClose: () => void
  onMutated?: () => void
}

const TYPE_BADGE_COLORS: Record<string, string> = {
  Task:        'bg-sky-500/15 text-sky-400',
  Habit:       'bg-emerald-500/15 text-emerald-400',
  Goal:        'bg-violet-500/15 text-violet-400',
  Event:       'bg-amber-500/15 text-amber-400',
  Note:        'bg-zinc-500/15 text-zinc-400',
  JournalEntry:'bg-rose-500/15 text-rose-400',
  Course:      'bg-blue-500/15 text-blue-400',
  Assignment:  'bg-orange-500/15 text-orange-400',
  Exam:        'bg-red-500/15 text-red-400',
  Project:     'bg-purple-500/15 text-purple-400',
  Concept:     'bg-teal-500/15 text-teal-400',
}

// Fields to skip in the generic editor (displayed separately or not editable here)
const SKIP_FIELDS = new Set(['courseNodeId', 'habitNodeId'])

function fieldLabel(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())
}

function FieldEditor({
  name,
  value,
  onChange,
}: {
  name: string
  value: unknown
  onChange: (val: unknown) => void
}) {
  const strVal = value == null ? '' : String(value)

  if (name === 'status') {
    const opts = ['todo', 'in-progress', 'done', 'active', 'completed', 'paused', 'upcoming', 'taken', 'graded', 'submitted']
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (name === 'frequency') {
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        {['daily', 'weekly', 'weekdays'].map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (name === 'mood') {
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        {['great', 'good', 'okay', 'bad', 'awful'].map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (name === 'recurring') {
    return (
      <select
        value={strVal}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
      >
        {['none', 'daily', 'weekly', 'monthly'].map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  if (name.toLowerCase().includes('date') || name === 'date') {
    return (
      <input
        type="date"
        value={strVal}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
    )
  }

  if (name === 'time') {
    return (
      <input
        type="time"
        value={strVal}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
    )
  }

  if (name === 'durationMinutes' || name === 'credits' || name === 'duration') {
    return (
      <input
        type="number"
        value={strVal}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
    )
  }

  if (name === 'content' || name === 'description') {
    return (
      <textarea
        value={strVal}
        rows={4}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-serif text-foreground/85 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
      />
    )
  }

  return (
    <input
      type="text"
      value={strVal}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-serif text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
    />
  )
}

function relatedNodeLabel(rn: RelatedNode): string {
  const p = rn.properties
  if (typeof p.name === 'string') return p.name
  if (typeof p.title === 'string') return p.title
  if (typeof p.date === 'string') return `${rn.type} · ${p.date}`
  return `${rn.type} #${rn.id}`
}

export function NodeDetailPanel({ nodeId, onClose, onMutated }: NodeDetailPanelProps) {
  const [detail, setDetail] = useState<NodeDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(() => {
    if (!nodeId) return
    setLoading(true)
    setEditing(false)
    setConfirmDelete(false)
    fetch(`/api/nodes/${nodeId}`)
      .then((r) => r.json())
      .then((d: NodeDetail) => {
        setDetail(d)
        setDraft(d.node.properties as Record<string, unknown>)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [nodeId])

  useEffect(() => { load() }, [load])

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleSave() {
    if (!nodeId) return
    setSaving(true)
    await fetch(`/api/nodes/${nodeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    })
    setSaving(false)
    setEditing(false)
    load()
    onMutated?.()
  }

  async function handleDelete() {
    if (!nodeId) return
    setDeleting(true)
    await fetch(`/api/nodes/${nodeId}`, { method: 'DELETE' })
    setDeleting(false)
    onMutated?.()
    onClose()
  }

  if (!nodeId) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="relative z-10 w-full max-w-md mx-4 bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/40 shrink-0">
          {detail && (
            <span className={`text-[10px] font-mono font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${TYPE_BADGE_COLORS[detail.node.type] ?? 'bg-muted/40 text-muted-foreground'}`}>
              {detail.node.type}
            </span>
          )}
          <div className="flex-1" />
          {detail && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
              title="Edit"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading && (
            <p className="text-[12px] text-muted-foreground/50 text-center py-8 font-mono">loading…</p>
          )}

          {!loading && detail && (
            <>
              {/* Properties */}
              <div className="space-y-3">
                {Object.entries(detail.node.properties as Record<string, unknown>)
                  .filter(([k]) => !SKIP_FIELDS.has(k))
                  .map(([key, val]) => (
                    <div key={key}>
                      <p className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-widest mb-1">
                        {fieldLabel(key)}
                      </p>
                      {editing ? (
                        <FieldEditor
                          name={key}
                          value={draft[key]}
                          onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
                        />
                      ) : (
                        <p className="text-[13px] font-serif text-foreground/85 whitespace-pre-wrap">
                          {val == null ? <span className="text-muted-foreground/30 italic">—</span> : String(val)}
                        </p>
                      )}
                    </div>
                  ))}
              </div>

              {/* Related notes */}
              {detail.relatedNotes.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-2">
                    Notes & Logs
                  </p>
                  <div className="space-y-2">
                    {detail.relatedNotes.map((rn) => {
                      const p = rn.properties
                      return (
                        <div key={rn.id} className="bg-muted/20 rounded-xl px-3 py-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-[9px] font-mono text-muted-foreground/40 uppercase tracking-widest">
                              {rn.type} · {rn.edgeType}
                            </span>
                          </div>
                          {typeof p.title === 'string' && (
                            <p className="text-[12px] font-serif font-medium text-foreground/80">{p.title}</p>
                          )}
                          {typeof p.content === 'string' && p.content && (
                            <p className="text-[12px] text-muted-foreground/70 mt-0.5 whitespace-pre-wrap">{p.content}</p>
                          )}
                          {typeof p.date === 'string' && (
                            <p className="text-[11px] font-mono text-muted-foreground/40">{p.date}</p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Related nodes */}
              {detail.relatedNodes.length > 0 && (
                <div>
                  <p className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-2">
                    Related
                  </p>
                  <div className="space-y-1">
                    {detail.relatedNodes.map((rn) => (
                      <div key={rn.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/10">
                        <span className={`text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-full ${TYPE_BADGE_COLORS[rn.type] ?? 'bg-muted/40 text-muted-foreground'}`}>
                          {rn.type}
                        </span>
                        <span className="text-[12px] font-serif text-foreground/70 flex-1 truncate">
                          {relatedNodeLabel(rn)}
                        </span>
                        <span className="text-[9px] font-mono text-muted-foreground/30">
                          {rn.direction === 'outgoing' ? '→' : '←'} {rn.edgeType}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <p className="text-[10px] font-mono text-muted-foreground/25">
                #{detail.node.id} · created {detail.node.createdAt.slice(0, 10)}
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        {detail && (
          <div className="px-5 py-3 border-t border-border/40 shrink-0 flex items-center gap-2">
            {confirmDelete ? (
              <>
                <p className="text-[12px] text-muted-foreground/70 flex-1">Delete this node and its edges?</p>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Confirm'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Delete node"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <div className="flex-1" />
                {editing ? (
                  <>
                    <button
                      onClick={() => { setEditing(false); setDraft(detail.node.properties as Record<string, unknown>) }}
                      className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-1.5 text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button
                    onClick={onClose}
                    className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
                  >
                    Close
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
