import { getNodes, getEdges, getNodeById, createNode, updateNode, deleteNode } from '@/lib/graph/queries'
import { todayStr, addDays } from '@/lib/date'
import { fromMinutes, toMinutes, type BusyInterval } from '@/lib/schedule'
import { daysLabel } from '@/lib/days'

/**
 * A quiet memory of when the user can actually do things.
 *
 * Two sources, deliberately kept apart:
 *
 *   learned  ActivitySignal nodes, written as a side effect of normal use —
 *            a task ticked off, a block dragged somewhere else, a block
 *            deleted. Nobody fills anything in; the pattern emerges.
 *   stated   AvailabilityRule nodes, written by the assistant when the user
 *            says something like "I work 9 to 5 on weekdays".
 *
 * Stated beats learned wherever they disagree: what someone tells you about
 * their week is more reliable than what a few weeks of clicks suggest.
 *
 * Nothing here announces itself. The profile feeds the scheduler and the
 * assistant's context, and is visible (and deletable) in Settings.
 */

/**
 * 'batched' records that several things were put in one block together —
 * which is the only way a grouping can ever be noticed. Everything else is
 * about one item at a time, so the app could learn that three habits each
 * happen around 08:00 and still never work out that they are one routine.
 */
export type SignalKind = 'done' | 'moved' | 'skipped' | 'batched' | 'reported'

export interface ActivitySignal {
  kind: SignalKind
  itemType: string
  itemId: number
  name: string
  date: string
  /** Minutes past midnight the thing happened or was placed; null when unknown. */
  minute: number | null
  /** On a 'batched' signal: what it was grouped with. */
  withIds?: number[]
  /**
   * On a 'reported' signal — something the user *said* they did, in chat,
   * rather than clicked. Most of a day never passes through the calendar,
   * so until these existed the learning only ever saw the fraction of life
   * that happened to get ticked off in the UI.
   */
  endMinute?: number | null
  /** "This morning" is not a minute. Approximate reports count for less. */
  approximate?: boolean
  /**
   * When it had been planned for, if it was on the calendar that day.
   * The gap between plan and reality, repeated, is the most useful thing a
   * planner can learn: not when things are scheduled, but where the schedule
   * keeps turning out to be wrong.
   */
  plannedMinute?: number | null
}

/** Unmatched activity reported this often is worth offering as a habit. */
const MIN_ACTIVITY_SIGHTINGS = 3
/** Plan and reality this far apart, repeatedly, is worth mentioning. */
const DIVERGENCE_MINUTES = 60

export interface SuggestedHabit {
  name: string
  times: number
  usualStart: number | null
}

export interface Divergence {
  itemId: number
  name: string
  times: number
  plannedAround: number
  actuallyAround: number
}

/** Two items batched together this often are worth calling a routine. */
const MIN_PAIR_SIGHTINGS = 3

export interface Grouping {
  ids: number[]
  names: string[]
  times: number
  /** Where they tend to sit, when they agree on one. */
  usualStart: number | null
}

export interface AvailabilityRule {
  id?: number
  /** busy: never schedule here. free: good time for anything. prefer: good time for `activity`. */
  kind: 'busy' | 'free' | 'prefer'
  /** 0=Sun … 6=Sat. Empty means every day. */
  days: number[]
  start: string
  end: string
  activity?: string
  note?: string
}

/** How far back learned behaviour counts. Old habits should be allowed to fade. */
const WINDOW_DAYS = 60
/** An item needs this many sightings before its "usual time" is trusted. */
const MIN_ITEM_SIGNALS = 2
/**
 * How fast old evidence stops counting. A sighting a fortnight ago carries
 * half the weight of one today, one from a month ago a quarter.
 *
 * Without this a plain median averages across a change of habit instead of
 * following it: this graph moved Workout from ~21:00 to ~09:30, and the
 * median of the whole history was 13:00 — a time never once chosen.
 */
const HALF_LIFE_DAYS = 14
/**
 * How far either side of a sighting still counts as "the same time of day".
 *
 * Fixed buckets do not work: a thing done between 09:20 and 10:10 straddles
 * the hour, and splitting it in two let five evening sightings outvote six
 * morning ones. A window centred on each sighting has no edges to fall down.
 */
const CLUSTER_WINDOW_MINUTES = 45
/** An hour needs at least this net score to count as a good time. */
const MIN_HOUR_SCORE = 2

export function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

export function dowOf(date: string): number {
  return new Date(date + 'T00:00:00').getDay()
}

/**
 * Records one signal. Never throws: learning is a side effect, and a failed
 * write must not break ticking off a task.
 */
export async function recordSignal(userId: number, signal: ActivitySignal): Promise<void> {
  try {
    await createNode(userId, 'ActivitySignal', {
      ...signal,
      dow: dowOf(signal.date),
      at: new Date().toISOString(),
    })
  } catch {
    // Ignored on purpose — see above.
  }
}

function nameOf(p: Record<string, unknown>, fallback: string): string {
  return typeof p.name === 'string' ? p.name : typeof p.title === 'string' ? p.title : fallback
}

/** The Task/Habit a time block is for, if it is for anything. */
export async function blockSource(userId: number, blockId: number) {
  const edge = (await getEdges(userId, { sourceId: blockId, type: 'scheduled-for' }))[0]
  if (!edge) return null
  const node = await getNodeById(userId, edge.targetId)
  if (!node) return null
  return { id: node.id, type: node.type, name: nameOf(node.properties as Record<string, unknown>, `${node.type} #${node.id}`) }
}

/** Start minute of the block that put this item on this date, if there is one. */
export async function blockStartFor(userId: number, itemId: number, date: string): Promise<number | null> {
  const edges = await getEdges(userId, { targetId: itemId, type: 'scheduled-for' })
  if (edges.length === 0) return null
  const ids = new Set(edges.map((e) => e.sourceId))
  const block = (await getNodes(userId, { type: 'TimeBlock' })).find((b) => {
    const p = b.properties as Record<string, unknown>
    return ids.has(b.id) && p.date === date && typeof p.startTime === 'string'
  })
  return block ? toMinutes((block.properties as Record<string, string>).startTime) : null
}

/** Same words, ignoring case, spacing and a trailing full stop. */
const normalise = (s: string | undefined) =>
  (s ?? '').toLowerCase().replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim()

const sameDays = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join()

/**
 * Saves a stated rule, replacing the one it supersedes.
 *
 * Every statement used to append. Say "my CLE shift is on Mondays" twice and
 * there were two rules; say it again with the day corrected and the old day
 * stayed blocked forever alongside the new one. This graph ended up with five
 * duplicated pairs and a Thursday morning blocked by a sentence about Friday.
 *
 * Two things count as the same rule, and the new one wins:
 *
 *   same note     "CLE shift on Fridays" is one fact about the week, so
 *                 restating it corrects the days and times rather than
 *                 adding a second copy
 *   same slot     identical kind, days and times, whatever it is called
 *
 * Anything else is a genuinely separate rule and is left alone. Returns what
 * it replaced so the assistant can say so if asked.
 */
export async function saveRule(
  userId: number,
  rule: Omit<AvailabilityRule, 'id'>,
): Promise<{ id: number; replaced: number[] }> {
  const existing = (await getNodes(userId, { type: 'AvailabilityRule' }))
    .map((n) => ({ node: n, rule: parseRule(n.id, n.properties) }))
    .filter((r): r is { node: typeof r.node; rule: AvailabilityRule } => !!r.rule)

  const note = normalise(rule.note)
  const activity = normalise(rule.activity)

  const superseded = existing.filter(({ rule: other }) => {
    if (other.kind !== rule.kind) return false
    // A note names the fact; the same fact restated replaces itself.
    if (note && normalise(other.note) === note) return true
    // A "prefer" rule is about one activity, so one per activity.
    if (rule.kind === 'prefer' && activity && normalise(other.activity) === activity) return true
    // Otherwise only an exact repeat of the same slot.
    return sameDays(other.days, rule.days) && other.start === rule.start && other.end === rule.end
  })

  const properties = { ...rule }
  if (superseded.length > 0) {
    // The oldest is kept and rewritten, so anything holding its id still
    // points at the live rule; the rest go.
    const [keep, ...rest] = superseded.sort((a, b) => a.node.id - b.node.id)
    await updateNode(userId, keep.node.id, properties)
    for (const dead of rest) await deleteNode(userId, dead.node.id)
    return { id: keep.node.id, replaced: superseded.map((r) => r.node.id) }
  }

  const node = await createNode(userId, 'AvailabilityRule', properties)
  return { id: node.id, replaced: [] }
}

export interface AvailabilityProfile {
  /** Stated busy time on this date — treated like an appointment. */
  unavailable(date: string): BusyInterval[]
  /** Best stretches of this date, stated first, then learned — tried before anything else. */
  preferredWindows(date: string): BusyInterval[]
  /** When this particular item usually happens, if known. */
  usualStart(itemId: number, name: string, dow: number): number | null
  /**
   * Sets of things repeatedly put in one block together, largest first.
   * Empty until the same combination has been seen a few times — a grouping
   * suggested off one afternoon is noise.
   */
  groupings(): Grouping[]
  /** Things reported repeatedly that are not tracked as anything yet. */
  suggestedHabits(): SuggestedHabit[]
  /** Items that keep happening at a different time from when they are planned. */
  divergences(): Divergence[]
  rules: AvailabilityRule[]
  /** For the assistant's context. Empty when there is nothing worth saying. */
  summary(): string
}

const TIME = /^\d{2}:\d{2}$/

function parseRule(id: number, raw: unknown): AvailabilityRule | null {
  const p = (raw ?? {}) as Record<string, unknown>
  if (p.kind !== 'busy' && p.kind !== 'free' && p.kind !== 'prefer') return null
  if (typeof p.start !== 'string' || typeof p.end !== 'string' || !TIME.test(p.start) || !TIME.test(p.end)) return null
  // Overnight ranges ("22:00-06:00") are not supported by a single-day
  // planner; they would read as an empty range, so they are dropped instead.
  if (toMinutes(p.end) <= toMinutes(p.start)) return null
  return {
    id,
    kind: p.kind,
    days: Array.isArray(p.days) ? (p.days as unknown[]).filter((d): d is number => typeof d === 'number') : [],
    start: p.start,
    end: p.end,
    activity: typeof p.activity === 'string' && p.activity.trim() ? p.activity.trim() : undefined,
    note: typeof p.note === 'string' ? p.note : undefined,
  }
}

export async function loadAvailability(userId: number): Promise<AvailabilityProfile> {
  const [signalNodes, ruleNodes] = await Promise.all([
    getNodes(userId, { type: 'ActivitySignal' }),
    getNodes(userId, { type: 'AvailabilityRule' }),
  ])
  const since = addDays(todayStr(), -WINDOW_DAYS)
  const signals = signalNodes
    .map((n) => n.properties as Partial<ActivitySignal>)
    .filter((s): s is ActivitySignal =>
      typeof s.date === 'string' && s.date >= since && typeof s.minute === 'number' && typeof s.itemId === 'number',
    )
  const rules = ruleNodes.map((n) => parseRule(n.id, n.properties)).filter((r): r is AvailabilityRule => !!r)
  return buildProfile(signals, rules)
}


/** Pure, so it can be reasoned about (and tested) without a database. */
export function buildProfile(signals: ActivitySignal[], rules: AvailabilityRule[]): AvailabilityProfile {
  // Weekdays and weekends are scored separately: most lives have two rhythms,
  // and seven separate ones would need months of data before saying anything.
  const scores = { weekday: new Array<number>(24).fill(0), weekend: new Array<number>(24).fill(0) }
  const sightingsByItem = new Map<number, { minute: number; weight: number }[]>()
  /** Reported activity that matched nothing in the graph, by normalised name. */
  const unmatched = new Map<string, { name: string; minutes: number[] }>()
  const today = todayStr()

  for (const s of signals) {
    if (s.minute === null) continue
    const bucket = dowOf(s.date) % 6 === 0 ? scores.weekend : scores.weekday
    const hour = Math.min(23, Math.floor(s.minute / 60))
    // Done or deliberately placed counts for an hour; deleting a block there counts against it.
    bucket[hour] += s.kind === 'skipped' ? -1 : s.approximate ? 0.5 : 1

    if (s.kind === 'skipped') continue

    // A report with no item is still evidence of when the day has room for
    // things — it counted above — but it has no usual time of its own to
    // learn until it becomes something. Collected so it can be suggested.
    if (s.itemId <= 0) {
      const key = normalise(s.name)
      if (!key) continue
      const entry = unmatched.get(key) ?? { name: s.name, minutes: [] }
      entry.minutes.push(s.minute)
      unmatched.set(key, entry)
      continue
    }

    const ageDays = Math.max(0, (new Date(today + 'T00:00:00').getTime() - new Date(s.date + 'T00:00:00').getTime()) / 86_400_000)
    const list = sightingsByItem.get(s.itemId) ?? []
    list.push({
      minute: s.minute,
      weight: 0.5 ** (ageDays / HALF_LIFE_DAYS) * (s.approximate ? 0.5 : 1),
    })
    sightingsByItem.set(s.itemId, list)
  }

  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }

  const learnedWindows = (kind: 'weekday' | 'weekend'): (BusyInterval & { score: number })[] => {
    const arr = scores[kind]
    const top = Math.max(...arr)
    if (top < MIN_HOUR_SCORE) return []
    const threshold = Math.max(MIN_HOUR_SCORE, top * 0.5)
    const out: (BusyInterval & { score: number })[] = []
    for (let h = 0; h < 24; h++) {
      if (arr[h] < threshold) continue
      const last = out[out.length - 1]
      if (last && last.end === h * 60) { last.end += 60; last.score += arr[h] }
      else out.push({ start: h * 60, end: (h + 1) * 60, score: arr[h] })
    }
    // Strongest stretch first, so it gets first refusal on the day's work.
    return out.sort((a, b) => b.score - a.score)
  }

  const rulesOn = (dow: number) => rules.filter((r) => r.days.length === 0 || r.days.includes(dow))
  const span = (r: AvailabilityRule): BusyInterval => ({ start: toMinutes(r.start), end: toMinutes(r.end) })

  return {
    rules,

    unavailable(date) {
      return rulesOn(dowOf(date)).filter((r) => r.kind === 'busy').map(span)
    },

    preferredWindows(date) {
      const dow = dowOf(date)
      const stated = rulesOn(dow).filter((r) => r.kind === 'free').map(span)
      const busy = rulesOn(dow).filter((r) => r.kind === 'busy').map(span)
      const learned = learnedWindows(dow % 6 === 0 ? 'weekend' : 'weekday')
        .map(({ start, end }) => ({ start, end }))
        // A learned window that overlaps something stated as busy loses.
        .filter((w) => !busy.some((b) => w.start < b.end && w.end > b.start))
      return [...stated, ...learned]
    },

    usualStart(itemId, name, dow) {
      const lower = name.toLowerCase()
      const stated = rulesOn(dow).find(
        (r) => r.kind === 'prefer' && r.activity && (lower.includes(r.activity.toLowerCase()) || r.activity.toLowerCase().includes(lower)),
      )
      if (stated) return toMinutes(stated.start)

      const seen = sightingsByItem.get(itemId)
      if (!seen || seen.length < MIN_ITEM_SIGNALS) return null

      /*
       * The time it clusters around, not the middle of its range.
       *
       * A median is wrong twice over. Something moved from evening to morning
       * averages out at lunchtime, and something genuinely done early on some
       * days and late on others averages to a time it is never done at all.
       *
       * So instead: centre a window on each sighting, add up how much recent
       * evidence falls inside it, and answer with the middle of whichever
       * window holds the most. Ties go to the fresher cluster, which is what
       * makes a changed routine win over the one it replaced.
       */
      let best: { weight: number; freshest: number; minutes: number[] } | null = null
      for (const centre of seen) {
        const near = seen.filter((o) => Math.abs(o.minute - centre.minute) <= CLUSTER_WINDOW_MINUTES)
        const weight = near.reduce((sum, o) => sum + o.weight, 0)
        const freshest = Math.max(...near.map((o) => o.weight))
        if (!best || weight > best.weight || (weight === best.weight && freshest > best.freshest)) {
          best = { weight, freshest, minutes: near.map((o) => o.minute) }
        }
      }
      if (!best || best.minutes.length === 0) return null

      const sorted = [...best.minutes].sort((a, b) => a - b)
      const middle = sorted[Math.floor(sorted.length / 2)]
      return Math.round(middle / 5) * 5
    },

    groupings() {
      // Counted pairwise and then grown, so "Make Bed + Brush Teeth" seen on
      // Monday and "Make Bed + Brush Teeth + Weigh Myself" on Tuesday still
      // recognise the pair they share instead of being two unrelated sets.
      const pairs = new Map<string, { ids: [number, number]; times: number; minutes: number[] }>()
      for (const s of signals) {
        if (s.kind !== 'batched' || !s.withIds?.length) continue
        for (const other of s.withIds) {
          if (other === s.itemId) continue
          const [a, b] = [s.itemId, other].sort((x, y) => x - y)
          const key = `${a}~${b}`
          const entry = pairs.get(key) ?? { ids: [a, b] as [number, number], times: 0, minutes: [] }
          entry.times += 1
          if (s.minute !== null) entry.minutes.push(s.minute)
          pairs.set(key, entry)
        }
      }

      // Each signal names the pair from both ends, so every sighting is
      // counted twice.
      const strong = [...pairs.values()]
        .map((p) => ({ ...p, times: Math.round(p.times / 2) }))
        .filter((p) => p.times >= MIN_PAIR_SIGHTINGS)
      if (strong.length === 0) return []

      // Merge overlapping pairs into the largest set they agree on.
      const sets: { ids: Set<number>; times: number; minutes: number[] }[] = []
      for (const p of strong.sort((a, b) => b.times - a.times)) {
        const joined = sets.find((s) => s.ids.has(p.ids[0]) || s.ids.has(p.ids[1]))
        if (joined) {
          joined.ids.add(p.ids[0]); joined.ids.add(p.ids[1])
          joined.times = Math.min(joined.times, p.times)
          joined.minutes.push(...p.minutes)
        } else {
          sets.push({ ids: new Set(p.ids), times: p.times, minutes: [...p.minutes] })
        }
      }

      const nameById = new Map<number, string>()
      for (const s of signals) nameById.set(s.itemId, s.name)

      return sets
        .map((s) => {
          const sorted = [...s.minutes].sort((a, b) => a - b)
          return {
            ids: [...s.ids],
            names: [...s.ids].map((id) => nameById.get(id) ?? `#${id}`),
            times: s.times,
            usualStart: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] / 5) * 5 : null,
          }
        })
        .sort((a, b) => b.ids.length - a.ids.length || b.times - a.times)
    },

    suggestedHabits() {
      // Only reports that matched nothing reach here, so anything already
      // tracked is excluded by construction — provided matching worked. A
      // report of a tracked thing under a different name would show up as a
      // suggestion; the logger matches by id first to keep that rare.
      return [...unmatched.values()]
        .filter((a) => a.minutes.length >= MIN_ACTIVITY_SIGHTINGS)
        .map((a) => ({ name: a.name, times: a.minutes.length, usualStart: Math.round(median(a.minutes) / 5) * 5 }))
        .sort((a, b) => b.times - a.times)
    },

    divergences() {
      const byItem = new Map<number, { name: string; planned: number[]; actual: number[] }>()
      for (const s of signals) {
        if (s.itemId <= 0 || s.minute === null || typeof s.plannedMinute !== 'number') continue
        if (s.kind !== 'reported' && s.kind !== 'done') continue
        const entry = byItem.get(s.itemId) ?? { name: s.name, planned: [], actual: [] }
        entry.planned.push(s.plannedMinute)
        entry.actual.push(s.minute)
        byItem.set(s.itemId, entry)
      }
      return [...byItem.entries()]
        .map(([itemId, e]) => ({
          itemId,
          name: e.name,
          times: e.actual.length,
          plannedAround: Math.round(median(e.planned) / 5) * 5,
          actuallyAround: Math.round(median(e.actual) / 5) * 5,
        }))
        // Once is an exception; twice in the same direction is the plan
        // being wrong.
        .filter((d) => d.times >= 2 && Math.abs(d.actuallyAround - d.plannedAround) >= DIVERGENCE_MINUTES)
        .sort((a, b) => b.times - a.times)
    },

    summary() {
      const lines: string[] = []
      for (const r of rules) {
        const what = r.kind === 'busy' ? 'busy' : r.kind === 'free' ? 'free' : `prefers ${r.activity ?? 'this'}`
        lines.push(`- [${r.id}] ${what} ${daysLabel(r.days)} ${r.start}–${r.end}${r.note ? ` (${r.note})` : ''}`)
      }
      for (const kind of ['weekday', 'weekend'] as const) {
        const windows = learnedWindows(kind)
        if (windows.length === 0) continue
        const ranges = [...windows]
          .sort((a, b) => a.start - b.start)
          .map((w) => `${fromMinutes(w.start)}–${fromMinutes(w.end)}`)
          .join(', ')
        lines.push(`- learned: on ${kind}s things usually get done ${ranges}`)
      }
      for (const g of this.groupings()) {
        const when = g.usualStart !== null ? ` around ${fromMinutes(g.usualStart)}` : ''
        lines.push(`- learned: ${g.names.join(', ')} are usually done together${when} (${g.times} times) -- offer to make this a routine if it comes up`)
      }
      for (const d of this.divergences()) {
        lines.push(`- learned: "${d.name}" is planned around ${fromMinutes(d.plannedAround)} but actually happens around ${fromMinutes(d.actuallyAround)} (${d.times} times) -- plan it where it really happens`)
      }
      for (const h of this.suggestedHabits()) {
        const when = h.usualStart !== null ? ` around ${fromMinutes(h.usualStart)}` : ''
        lines.push(`- learned: the user keeps doing "${h.name}"${when} (${h.times} times) but does not track it -- offer to make it a habit if it comes up`)
      }
      if (lines.length === 0) return ''
      return [
        '## When the user can do things',
        'Stated rules (with ids) and patterns learned from what actually gets done. Use them when choosing times; stated rules win over learned ones. Do not mention this section unless asked.',
        ...lines,
      ].join('\n')
    },
  }
}
