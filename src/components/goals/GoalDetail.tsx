'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, Plus, Trash2, Link2, Unlink, Check } from 'lucide-react'
import { StatusCheckbox } from '@/components/ui/completion-checkbox'
import { Markdown } from '@/components/notes/Markdown'
import { LinkNodePicker } from './LinkNodePicker'

interface Linked {
  id: number
  label: string
  edgeId: number
  edgeType: string
  direction: 'incoming' | 'outgoing'
}
type Milestone = Linked & { status: 'todo' | 'in-progress' | 'done'; dueDate: string | null }
type LinkedHabit = Linked & { frequency: string; recentlyDone: boolean }
type LinkedNote = Linked & { content: string }
type LinkedOther = Linked & { type: string }

interface GoalDetailData {
  goal: { id: number; properties: Record<string, unknown>; createdAt: string; updatedAt: string }
  progress: number | null
  milestones: Milestone[]
  habits: LinkedHabit[]
  notes: LinkedNote[]
  other: LinkedOther[]
}

/** Fields a Goal is expected to have. Anything else the user adds is custom. */
const KNOWN_FIELDS = ['name', 'description', 'status', 'targetDate', 'tags']
const STATUSES = ['active', 'paused', 'completed']

export function GoalDetail({
  goalId,
  onClose,
  onChanged,
}: {
  goalId: number
  onClose: () => void
  onChanged: () => void
}) {
  const [data, setData] = useState<GoalDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [addingMilestone, setAddingMilestone] = useState(false)
  const [milestoneName, setMilestoneName] = useState('')
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const load = useCallback(() => {
    fetch(`/api/goals/${goalId}`)
      .then((r) => r.json())
      .then((d: GoalDetailData) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [goalId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && !picking) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, picking])

  /** Saves a partial property change; `remove` deletes keys outright. */
  async function patch(changes: Record<string, unknown>, remove?: string[]) {
    setSaving(true)
    await fetch(`/api/nodes/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(remove ? { ...changes, __remove: remove } : changes),
    })
    setSaving(false)
    load()
    onChanged()
  }

  async function toggleMilestone(m: Milestone) {
    await fetch(`/api/tasks/${m.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: m.status === 'done' ? 'todo' : 'done' }),
    })
    load()
    onChanged()
  }

  async function addMilestone(e: React.FormEvent) {
    e.preventDefault()
    const name = milestoneName.trim()
    if (!name) return
    await fetch(`/api/goals/${goalId}/milestones`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setMilestoneName('')
    setAddingMilestone(false)
    load()
    onChanged()
  }

  /** Removes the relationship, never the node itself. */
  async function unlink(edgeId: number) {
    await fetch(`/api/edges?id=${edgeId}`, { method: 'DELETE' })
    load()
    onChanged()
  }

  async function deleteGoal() {
    await fetch(`/api/nodes/${goalId}`, { method: 'DELETE' })
    onChanged()
    onClose()
  }

  const props = data?.goal.properties ?? {}
  const customKeys = Object.keys(props).filter((k) => !KNOWN_FIELDS.includes(k))
  const tags = Array.isArray(props.tags) ? (props.tags as unknown[]).map(String) : []
  const linkedIds = data ? [...data.milestones, ...data.habits, ...data.notes, ...data.other].map((x) => x.id) : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl mx-4 bg-card border border-border/60 rounded-2xl shadow-2xl flex flex-col max-h-[88dvh]">

        {/* Header */}
        <div className="flex items-start gap-2 px-5 py-4 border-b border-border/40 shrink-0">
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-500">
              Goal
            </span>
            <input
              value={typeof props.name === 'string' ? props.name : ''}
              onChange={(e) => setData((d) => d && ({ ...d, goal: { ...d.goal, properties: { ...d.goal.properties, name: e.target.value } } }))}
              onBlur={(e) => patch({ name: e.target.value })}
              placeholder="Goal name"
              className="mt-2 w-full bg-transparent text-[19px] font-serif font-semibold text-foreground focus:outline-none focus:bg-muted/30 rounded px-1 -ml-1"
            />
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading && <p className="text-[12px] text-muted-foreground/50 text-center py-10 font-mono">loading…</p>}

        {!loading && data && (
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

            {/* Progress */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest">Progress</span>
                <span className="text-[11px] font-mono text-muted-foreground/70">
                  {data.progress === null ? 'nothing linked yet' : `${data.progress}%`}
                </span>
              </div>
              <div className="h-1 bg-border/40 rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${data.progress ?? 0}%` }} />
              </div>
              <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                Derived from linked milestones and habits — it is never stored, so it cannot go stale.
              </p>
            </div>

            {/* Core fields */}
            <section className="space-y-3">
              <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest">Details</p>

              <div>
                <label className="text-[10px] font-mono text-muted-foreground/50 mb-1 block">Description</label>
                <textarea
                  defaultValue={typeof props.description === 'string' ? props.description : ''}
                  onBlur={(e) => patch({ description: e.target.value })}
                  rows={3}
                  placeholder="What does reaching this actually look like?"
                  className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-serif resize-y focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground/50 mb-1 block">Status</label>
                  <div className="flex gap-1">
                    {STATUSES.map((s) => (
                      <button
                        key={s}
                        onClick={() => patch({ status: s })}
                        className={`text-[11px] font-mono px-2 py-1.5 rounded-lg border transition-colors flex-1 ${
                          (props.status ?? 'active') === s
                            ? 'bg-primary/15 border-primary/40 text-primary'
                            : 'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-mono text-muted-foreground/50 mb-1 block">Target date</label>
                  <input
                    type="date"
                    defaultValue={typeof props.targetDate === 'string' ? props.targetDate : ''}
                    onChange={(e) => patch({ targetDate: e.target.value || null })}
                    className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-mono text-muted-foreground/50 mb-1 block">Tags</label>
                <input
                  defaultValue={tags.join(', ')}
                  onBlur={(e) => patch({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                  placeholder="health, career, …"
                  className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              </div>
            </section>

            {/* Custom fields — the graph stores free-form properties, so a goal
                can carry whatever the user decides matters about it. */}
            <section className="space-y-2">
              <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest">Custom fields</p>

              {customKeys.length === 0 && (
                <p className="text-[12px] text-muted-foreground/50 font-serif italic">
                  None yet — add anything you want to track about this goal.
                </p>
              )}

              {customKeys.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground/70 w-32 shrink-0 truncate" title={key}>{key}</span>
                  <input
                    defaultValue={typeof props[key] === 'object' ? JSON.stringify(props[key]) : String(props[key] ?? '')}
                    onBlur={(e) => patch({ [key]: e.target.value })}
                    className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button
                    onClick={() => patch({}, [key])}
                    title={`Remove ${key}`}
                    className="p-1.5 rounded-lg text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const k = newKey.trim()
                  if (!k) return
                  patch({ [k]: newValue })
                  setNewKey('')
                  setNewValue('')
                }}
                className="flex items-center gap-2 pt-1"
              >
                <input
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="field name"
                  className="w-32 bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[12px] font-mono focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <input
                  value={newValue}
                  onChange={(e) => setNewValue(e.target.value)}
                  placeholder="value"
                  className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-3 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
                <button
                  type="submit"
                  disabled={!newKey.trim()}
                  className="p-1.5 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40 shrink-0"
                  title="Add field"
                >
                  <Check className="w-3.5 h-3.5" />
                </button>
              </form>
            </section>

            {/* Milestones */}
            <section>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest">
                  Milestones · {data.milestones.length}
                </p>
                <button
                  onClick={() => setAddingMilestone((v) => !v)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground/65 hover:text-foreground transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>

              <div className="space-y-1.5">
                {data.milestones.map((m) => (
                  <div key={m.edgeId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20 group">
                    <button onClick={() => toggleMilestone(m)} className="shrink-0">
                      <StatusCheckbox status={m.status} />
                    </button>
                    <span className={`text-[13px] font-serif flex-1 truncate ${m.status === 'done' ? 'line-through text-muted-foreground/65' : 'text-foreground/85'}`}>
                      {m.label}
                    </span>
                    {m.dueDate && <span className="text-[10px] font-mono text-muted-foreground/55 shrink-0">{m.dueDate}</span>}
                    <button
                      onClick={() => unlink(m.edgeId)}
                      title="Unlink from this goal (keeps the task)"
                      className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                    >
                      <Unlink className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              {addingMilestone && (
                <form onSubmit={addMilestone} className="flex items-center gap-2 mt-2">
                  <input
                    autoFocus
                    value={milestoneName}
                    onChange={(e) => setMilestoneName(e.target.value)}
                    placeholder="What's the next concrete step?"
                    className="flex-1 bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-serif focus:outline-none focus:ring-1 focus:ring-primary/50"
                  />
                  <button type="submit" disabled={!milestoneName.trim()} className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50">
                    Add
                  </button>
                </form>
              )}

              {data.milestones.length === 0 && !addingMilestone && (
                <p className="text-[12px] text-muted-foreground/50 font-serif italic">Break this goal into concrete steps.</p>
              )}
            </section>

            {/* Habits */}
            {data.habits.length > 0 && (
              <section>
                <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-2">
                  Supporting habits · {data.habits.length}
                </p>
                <div className="space-y-1.5">
                  {data.habits.map((h) => (
                    <div key={h.edgeId} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-muted/20 group">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${h.recentlyDone ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} />
                      <span className="text-[13px] font-serif flex-1 truncate text-foreground/85">{h.label}</span>
                      <span className="text-[10px] font-mono text-muted-foreground/55 shrink-0">{h.frequency}</span>
                      <button
                        onClick={() => unlink(h.edgeId)}
                        title="Unlink from this goal (keeps the habit)"
                        className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                      >
                        <Unlink className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Notes */}
            {data.notes.length > 0 && (
              <section>
                <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-2">
                  Notes · {data.notes.length}
                </p>
                <div className="space-y-2">
                  {data.notes.map((n) => (
                    <div key={n.edgeId} className="px-3 py-2.5 rounded-lg bg-muted/20 group">
                      <div className="flex items-start gap-2">
                        <p className="text-[13px] font-serif font-medium text-foreground/85 flex-1">{n.label}</p>
                        <button
                          onClick={() => unlink(n.edgeId)}
                          title="Unlink from this goal (keeps the note)"
                          className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                        >
                          <Unlink className="w-3 h-3" />
                        </button>
                      </div>
                      {n.content && <div className="mt-1"><Markdown>{n.content.slice(0, 400)}</Markdown></div>}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Anything else */}
            {data.other.length > 0 && (
              <section>
                <p className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-2">
                  Also connected · {data.other.length}
                </p>
                <div className="space-y-1.5">
                  {data.other.map((o) => (
                    <div key={o.edgeId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/10 group">
                      <span className="text-[9px] font-mono uppercase tracking-wide text-muted-foreground/60 w-20 shrink-0">{o.type}</span>
                      <span className="text-[12px] font-serif flex-1 truncate text-foreground/75">{o.label}</span>
                      <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">
                        {o.direction === 'outgoing' ? '→' : '←'} {o.edgeType}
                      </span>
                      <button
                        onClick={() => unlink(o.edgeId)}
                        title="Remove this link"
                        className="p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                      >
                        <Unlink className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <p className="text-[10px] font-mono text-muted-foreground/40">
              #{data.goal.id} · created {data.goal.createdAt.slice(0, 10)} · updated {data.goal.updatedAt.slice(0, 10)}
            </p>
          </div>
        )}

        {/* Footer */}
        {!loading && data && (
          <div className="px-5 py-3 border-t border-border/40 shrink-0 flex items-center gap-2">
            {confirmDelete ? (
              <>
                <p className="text-[12px] text-muted-foreground/70 flex-1">Delete this goal and its links?</p>
                <button onClick={() => setConfirmDelete(false)} className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40">
                  Cancel
                </button>
                <button onClick={deleteGoal} className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-destructive text-destructive-foreground hover:opacity-90">
                  Delete
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setConfirmDelete(true)}
                  title="Delete goal"
                  className="p-1.5 rounded-lg text-muted-foreground/65 hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <span className="text-[10px] font-mono text-muted-foreground/45">
                  {saving ? 'saving…' : 'changes save as you go'}
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => setPicking(true)}
                  className="flex items-center gap-1.5 text-[12px] font-medium px-3 py-1.5 rounded-lg border border-border/60 hover:bg-muted/40 transition-colors"
                >
                  <Link2 className="w-3.5 h-3.5" /> Link existing
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {picking && (
        <LinkNodePicker
          targetId={goalId}
          excludeIds={linkedIds}
          onClose={() => setPicking(false)}
          onLinked={() => { load(); onChanged() }}
        />
      )}
    </div>
  )
}
