import type { Todo, TodoList } from '@/lib/todos'

/**
 * The tip bank: short, useful things about the app, shown now and then in the
 * Today banner slot (src/components/todos/TipCard.tsx).
 *
 * KEEP THIS CURRENT. Whenever a feature ships or changes, add a tip for it here
 * (or fix the one that describes it). One idea per tip, a title of a few words
 * and one or two sentences; say where to find the thing. A tip that mentions a
 * shortcut sets `on: 'desktop'`; one that is only useful before the user has
 * tried the feature sets `when`, so people are never told about what they use.
 *
 * Rarity is the point. A tip shows at most once in TIP_GAP visits to Today, and
 * then only by chance, so it stays a pleasant surprise and never turns into nagging.
 */

export interface TipCtx {
  todos: Todo[]
  lists: TodoList[]
  /** How many events there are on the calendar, of any kind. */
  events: number
  /** A touch screen: no keyboard, no right-click. */
  touch: boolean
  /** Already running as an installed app. */
  installed: boolean
}

export type TipAction = { label: string; kind: 'listen' } | { label: string; kind: 'go'; to: string }

export interface Tip {
  /** Stable. Seen tips are remembered by it, so never reuse one for a different tip. */
  id: string
  title: string
  body: string
  action?: TipAction
  /** Only where it makes sense: keyboard tips are for a computer. */
  on?: 'desktop' | 'phone'
  /** False when the user already does this, so it is not worth telling. */
  when?: (ctx: TipCtx) => boolean
}

const real = (ctx: TipCtx) => ctx.todos.filter((t) => !t.prayerKey)

export const TIPS: Tip[] = [
  { id: 'say-it', title: 'Say it, don’t type it', body: 'Press Tell Tuck and say what’s on your plate. It becomes to-dos on the right days.', action: { label: 'Try it', kind: 'listen' } },
  // Things to say to Tuck. Each one is something it really does (src/lib/ai/system-prompt.ts), with the words to say.
  { id: 'say-tidy', title: 'Ask Tuck to tidy up', body: 'Say “Reorganise my lists.” Tuck proposes where loose to-dos belong, you untick what you don’t want, and Undo puts it all back.', action: { label: 'Tell Tuck', kind: 'listen' }, when: (c) => real(c).filter((t) => t.listId === null && !t.done).length >= 5 },
  { id: 'say-areas', title: 'Set up your areas in one go', body: 'Say “Set up my life areas: health, work, money.” Tuck makes the areas and files the projects you mention under them.', action: { label: 'Tell Tuck', kind: 'listen' }, when: (c) => !c.lists.some((l) => l.kind === 'area') },
  { id: 'say-plan', title: 'Turn a wish into a plan', body: 'Say “I want to learn Spanish.” Tuck drafts steps with days that fit your week. Nothing is added until you say yes.', action: { label: 'Tell Tuck', kind: 'listen' } },
  { id: 'say-many', title: 'Add a lot in one breath', body: 'Say “Gym at 7 tomorrow, call Mum, buy milk.” They’re added straight away, with an Undo.', action: { label: 'Tell Tuck', kind: 'listen' } },
  { id: 'say-ask', title: 'Ask what’s coming', body: 'Say “What’s on my plate Thursday?” Tuck reads your lists and answers.', action: { label: 'Tell Tuck', kind: 'listen' } },
  { id: 'say-first-step', title: 'Stuck? Ask for a first step', body: 'Say “What’s the first small step for the report?” Tuck breaks it down into something you can start in minutes.', action: { label: 'Tell Tuck', kind: 'listen' } },
  { id: 'say-teach', title: 'Teach Tuck how you work', body: 'Say “I don’t work on Fridays” or “I like to run in the morning.” Tuck plans around it from then on.', action: { label: 'Tell Tuck', kind: 'listen' } },
  { id: 'say-skip', title: 'Skip just one', body: 'Say “Skip my run today.” Only today’s repeat is skipped and it comes back on its next day.', when: (c) => real(c).some((t) => t.repeats) },
  { id: 'say-went', title: 'Tell Tuck how it went', body: 'Say “I went to the dentist” or “the meeting was cancelled.” That day’s event is settled and stops reminding you.', when: (c) => c.events > 0 },
  { id: 'say-becoming', title: 'Say who you’re becoming', body: 'Say “I want to be a runner, keep track.” Tuck keeps track of who you’re becoming, and the to-dos you finish show it.' },
  { id: 'say-forget', title: 'Tuck can forget, too', body: 'Say “Forget that I don’t work Fridays.” Tuck drops what’s no longer true.' },
  { id: 'attach', title: 'Show Tuck a screenshot', body: 'The paperclip next to Tell Tuck takes a photo, a screenshot or a PDF. Tuck reads it and adds what’s in it.' },
  { id: 'key-n', title: 'N starts a to-do', body: 'On a computer, press N for a new to-do and Shift+N for a new event. No mouse needed.', on: 'desktop' },
  { id: 'type-to-find', title: 'Just start typing', body: 'With nothing selected, typing searches everything. ⌘K or / does the same.', on: 'desktop' },
  { id: 'keys', title: 'Drive the list with keys', body: 'Arrows move, Space ticks, T sends it to today and E to this evening.', on: 'desktop' },
  { id: 'reorder-lists', title: 'Arrange your lists', body: 'Drag a project or area in the sidebar to reorder it, or drop a project on an area to move it in. Right-click (or long-press) for Move up and Move down.' },
  { id: 'sidebar-width', title: 'Make the sidebar fit you', body: 'Drag the sidebar’s edge to make it wider or narrower. Double-click the edge to put it back.', on: 'desktop' },
  { id: 'slim', title: 'Need more room?', body: 'Press ⌘/ to hide the sidebar. Settings can also let the lists run the full width.', on: 'desktop' },
  { id: 'deadline', title: 'A deadline isn’t the day you’ll do it', body: 'Give a to-do a day to do it and, separately, a deadline. The deadline stays in sight without crowding Today.', when: (c) => !real(c).some((t) => t.deadline) },
  { id: 'project', title: 'Group steps into a project', body: 'New List, then New project. Its to-dos can sit under headings, and the project shows what’s left.', when: (c) => c.lists.filter((l) => l.kind === 'project').length < 2 },
  { id: 'area', title: 'Areas hold what never ends', body: 'Use an area for things like Health or Work: no finish line, just projects and to-dos inside.', when: (c) => !c.lists.some((l) => l.kind === 'area') },
  { id: 'hide-list', title: 'Keep a list off Today', body: 'Right-click a list, or press and hold on a phone, and choose Hide from Today. Its to-dos stay in the list.', when: (c) => !c.lists.some((l) => l.hideFromToday) },
  { id: 'checklist', title: 'Checklists inside a to-do', body: 'Open a to-do and add checklist items for the small steps.', when: (c) => !real(c).some((t) => t.checklist.length) },
  { id: 'repeat', title: 'To-dos that come back', body: 'Set Repeat on a to-do: daily, weekdays or weekly. Finishing one brings the next.', when: (c) => !real(c).some((t) => t.repeats) },
  { id: 'reminder', title: 'A nudge at the right time', body: 'Set a reminder on a to-do or event, then turn notifications on in Settings.', action: { label: 'Open Settings', kind: 'go', to: 'settings' }, when: (c) => !real(c).some((t) => t.reminder || t.remindAt) },
  { id: 'attended', title: 'Mark events as gone to', body: 'On a day’s events, tick Went, or say it was cancelled. Your week stays honest.', when: (c) => c.events > 0 },
  { id: 'plan', title: 'Let Tuck give things a time', body: 'The Plan button on Today gives everything left a time that fits around your events.' },
  { id: 'theme', title: 'Make it yours', body: 'Pick a theme in Settings, or choose any colour and the whole app follows.', action: { label: 'Open Settings', kind: 'go', to: 'settings' } },
  { id: 'profile', title: 'Tell Tuck your name', body: 'In Settings, Profile: your name, a line about you, and whether Tuck is gentle, direct or playful.', action: { label: 'Open Settings', kind: 'go', to: 'settings' } },
  { id: 'tuck-grows', title: 'Tuck grows with you', body: 'Every finished to-do helps Tuck grow from seed to sprout to bloom. Nothing is ever taken away.' },
  { id: 'prayers', title: 'Prayer times, if you want them', body: 'Turn them on in Settings and the five prayers show on Today at their times.', action: { label: 'Open Settings', kind: 'go', to: 'settings' } },
  { id: 'install', title: 'Keep Acture one tap away', body: 'Install it like an app: the address bar in Chrome, or Share and Add to Home Screen on an iPhone.', when: (c) => !c.installed },
  { id: 'export', title: 'Your data is yours', body: 'Settings, Data: export everything as one file, or import it back.', action: { label: 'Open Settings', kind: 'go', to: 'settings' } },
]

/** Visits to Today between tips, at the least. */
export const TIP_GAP = 5
/** After the gap, the chance on each visit that this is the one. */
export const TIP_CHANCE = 0.4

export interface TipState {
  /** Visits to Today so far. */
  opens: number
  /** The visit a tip was last shown on. */
  lastAt: number
  /** Tips already shown, so each comes once before any repeats. */
  seen: string[]
}

export const EMPTY_TIP_STATE: TipState = { opens: 0, lastAt: 0, seen: [] }

/**
 * One visit to Today. Counts it, and says whether a tip goes in the banner.
 * Pure: pass the random in, and the same state gives the same answer.
 * `free` is false when something more important already holds the slot.
 */
export function chooseTip(prev: TipState, ctx: TipCtx, random: () => number, free = true): { tip: Tip | null; state: TipState } {
  const opens = prev.opens + 1
  const state = { ...prev, opens }
  if (!free || opens - prev.lastAt < TIP_GAP || random() >= TIP_CHANCE) return { tip: null, state }

  const eligible = TIPS.filter((t) => (t.on !== 'desktop' || !ctx.touch) && (t.on !== 'phone' || ctx.touch) && (t.when?.(ctx) ?? true))
  if (!eligible.length) return { tip: null, state }
  // Everything unseen first; once all have been seen the round starts again.
  const unseen = eligible.filter((t) => !prev.seen.includes(t.id))
  const pool = unseen.length ? unseen : eligible
  const tip = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  return { tip, state: { opens, lastAt: opens, seen: unseen.length ? [...prev.seen, tip.id] : [tip.id] } }
}
