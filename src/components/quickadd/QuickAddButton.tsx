'use client'

import { useEffect, useState } from 'react'
import { useUndo } from '@/components/undo/UndoProvider'
import { useSpeechInput } from '@/lib/useSpeechInput'
import { todayStr } from '@/lib/date'
import { MicButton } from '@/components/ui/mic-button'
import { Plus, X, CheckSquare, FileText, Calendar, HeartPulse, Target, Repeat, FolderKanban, BookOpen, GraduationCap, ClipboardList } from 'lucide-react'

type QuickType = 'Task' | 'Note' | 'Event' | 'HealthMetric' | 'Goal' | 'Habit' | 'Project' | 'Course' | 'Exam' | 'Assignment'

const TYPES: { id: QuickType; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'Task', label: 'Task', Icon: CheckSquare },
  { id: 'Note', label: 'Note', Icon: FileText },
  { id: 'Event', label: 'Event', Icon: Calendar },
  { id: 'HealthMetric', label: 'Health', Icon: HeartPulse },
  { id: 'Goal', label: 'Goal', Icon: Target },
  { id: 'Habit', label: 'Habit', Icon: Repeat },
  { id: 'Project', label: 'Project', Icon: FolderKanban },
  { id: 'Course', label: 'Course', Icon: BookOpen },
  { id: 'Exam', label: 'Exam', Icon: GraduationCap },
  { id: 'Assignment', label: 'Assignment', Icon: ClipboardList },
]

/** Types that can sensibly belong to a Goal, Project or Course. */
const LINKABLE_TYPES: QuickType[] = ['Task', 'Habit', 'Assignment', 'Exam', 'Event']

interface SecondaryField {
  label: string
  type: 'date' | 'number' | 'text' | 'select'
  placeholder?: string
  options?: string[]
}

interface QuickAddButtonProps {
  onAdded?: () => void
}

export function QuickAddButton({ onAdded }: QuickAddButtonProps) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<QuickType>('Task')
  const [name, setName] = useState('')
  const [secondary, setSecondary] = useState('') // dueDate / value / frequency / code, depending on type
  const [submitting, setSubmitting] = useState(false)
  const [linkTo, setLinkTo] = useState<string>('')
  const [targets, setTargets] = useState<{ id: number; name: string; type: string }[]>([])
  const { record } = useUndo()
  // Dictation writes straight into the name field as the words arrive, so
  // what is heard is visible and correctable before anything is saved.
  const speech = useSpeechInput((text) => setName(text))

  // Loaded once the sheet opens rather than on mount, so the button costs
  // nothing until it is used.
  useEffect(() => {
    if (!open) return
    fetch('/api/link-targets')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { targets?: typeof targets } | null) => setTargets(d?.targets ?? []))
      .catch(() => {})
  }, [open])

  function reset() {
    setName('')
    setSecondary('')
    setType('Task')
    setLinkTo('')
    speech.reset()
  }

  function propertiesFor(): Record<string, unknown> {
    // todayStr, not toISOString: the latter is UTC and hands back the
    // wrong day either side of midnight depending on the offset.
    const today = todayStr()
    switch (type) {
      case 'Task':
        return { name, status: 'todo', dueDate: secondary || null }
      case 'Note':
        return { title: name, content: '' }
      case 'Event':
        return { name, date: secondary || null }
      case 'HealthMetric':
        return { label: name, value: secondary ? Number(secondary) : null, date: today }
      case 'Goal':
        return { name, status: 'active', targetDate: secondary || null }
      case 'Habit':
        return { name, frequency: secondary || 'daily' }
      case 'Project':
        return { name, status: 'active', dueDate: secondary || null }
      case 'Course':
        return { name, code: secondary || null }
      case 'Exam':
        return { name, status: 'upcoming', date: secondary || null }
      case 'Assignment':
        return { name, status: 'todo', dueDate: secondary || null }
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    const res = await fetch('/api/quick-add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, properties: propertiesFor(), linkTo: linkTo ? Number(linkTo) : null }),
    })
    const created = (await res.json().catch(() => null)) as { node?: { id: number } } | null
    setSubmitting(false)

    if (created?.node?.id) {
      const id = created.node.id
      const added = name
      record(`Added "${added}"`, async () => {
        await fetch(`/api/nodes/${id}`, { method: 'DELETE' })
        onAdded?.()
      })
    }
    reset()
    setOpen(false)
    onAdded?.()
  }

  const secondaryField = (): SecondaryField | null => {
    switch (type) {
      case 'Task': return { label: 'Due date', type: 'date' }
      case 'Event': return { label: 'Date', type: 'date' }
      case 'HealthMetric': return { label: 'Value', type: 'number', placeholder: '0' }
      case 'Goal': return { label: 'Target date', type: 'date' }
      case 'Habit': return { label: 'Frequency', type: 'select', options: ['daily', 'weekly', 'weekdays'] }
      case 'Project': return { label: 'Due date', type: 'date' }
      case 'Course': return { label: 'Code', type: 'text', placeholder: 'CS 101' }
      case 'Exam': return { label: 'Date', type: 'date' }
      case 'Assignment': return { label: 'Due date', type: 'date' }
      case 'Note': return null
    }
  }
  const sf = secondaryField()

  if (!open) {
    return (
      // Phones only: on a large screen the chat, the panels and ⌘K are all on
      // screen already, so a floating button only covers content.
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed right-4 sm:right-5 z-40 w-14 h-14 sm:w-12 sm:h-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:opacity-90 active:scale-95 transition-all"
        style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        title="Quick add"
        aria-label="Quick add"
      >
        <Plus className="w-6 h-6 sm:w-5 sm:h-5" />
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />

      <div
        className="relative z-10 w-full sm:max-w-sm sm:mx-4 bg-card border border-border/60 rounded-t-2xl sm:rounded-2xl shadow-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <p className="text-[13px] font-semibold text-foreground">Quick add</p>
          <button onClick={() => setOpen(false)} className="p-1 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/40 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-3 py-2.5 overflow-x-auto border-b border-border/40">
          {TYPES.map((t) => (
            <button
              key={t.id}
              onClick={() => { setType(t.id); setSecondary('') }}
              className={`shrink-0 flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-full border transition-colors ${
                type === t.id
                  ? 'bg-primary/15 border-primary/40 text-primary'
                  : 'border-border/50 text-muted-foreground/70 hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <t.Icon className="w-3 h-3" />
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={submit} className="p-4 space-y-3">
          <div className="flex items-center gap-1.5 bg-muted/40 border border-border/40 rounded-lg pr-1.5 focus-within:ring-1 focus-within:ring-primary/50">
            <input
              autoFocus
              value={speech.listening ? speech.transcript : name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                speech.listening
                  ? 'Listening…'
                  : type === 'Note' ? 'Title…'
                  : type === 'HealthMetric' ? 'e.g. Run, Weight…'
                  : 'Name…'
              }
              className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-[14px] font-serif text-foreground/85 focus:outline-none"
            />
            <MicButton
              supported={speech.supported}
              listening={speech.listening}
              onStart={() => { speech.reset(); speech.start() }}
              onStop={speech.stop}
              className="w-9 h-9"
            />
          </div>
          {speech.error && <p className="text-[11px] text-destructive">{speech.error}</p>}
          {sf && (
            <div>
              <label className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-1 block">{sf.label}</label>
              {sf.type === 'select' ? (
                <select
                  value={secondary || sf.options?.[0] || ''}
                  onChange={(e) => setSecondary(e.target.value)}
                  className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  {sf.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={sf.type}
                  value={secondary}
                  onChange={(e) => setSecondary(e.target.value)}
                  placeholder={sf.placeholder}
                  className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] font-mono text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
                />
              )}
            </div>
          )}
          {/*
            Offered for the types that are genuinely work towards something
            bigger. A Note or a health reading belongs to nothing in
            particular, and an empty dropdown on every capture is noise.
          */}
          {LINKABLE_TYPES.includes(type) && targets.length > 0 && (
            <div>
              <label className="text-[10px] font-mono text-muted-foreground/55 uppercase tracking-widest mb-1 block">
                Part of
              </label>
              <select
                value={linkTo}
                onChange={(e) => setLinkTo(e.target.value)}
                className="w-full bg-muted/40 border border-border/40 rounded-lg px-3 py-2 text-[13px] text-foreground/85 focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">Nothing in particular</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>{t.name} · {t.type}</option>
                ))}
              </select>
            </div>
          )}
          <button
            type="submit"
            disabled={!name.trim() || submitting}
            className="w-full text-[13px] font-semibold py-2.5 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? 'Adding…' : 'Add'}
          </button>
        </form>
      </div>
    </div>
  )
}
