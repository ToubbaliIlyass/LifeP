# "Make it happen": AI plans and reorganises (design, for audit)

Status: DRAFT, not built. Written to be audited before any code.

## What the user asked for

> When I talk to the AI and say I want to do something, it generates the actions I need to
> do to get it done, says whether they repeat, creates areas and projects, and can even
> rearrange what I have so it makes more sense.

Two capabilities, one principle: **the AI proposes, the user approves, one tap undoes.**

1. **Plan it.** "I want to run a marathon in May" → an area (or an existing one), a
   project, headings, dated and repeating to-dos. Shown as a preview tree the user trims.
2. **Tidy it.** "Sort out my to-dos" / "this inbox is a mess" → proposed moves between
   areas and projects, new projects for clusters, duplicates flagged. Shown as a diff.

## What exists today (read before judging the design)

- Assistant tools: `src/lib/ai/tools.ts` (`createNode` immediate for Tasks and one-off
  Events; `batchPropose` queued for Goal/Project/Habit/recurring Event; `deleteNode`
  always queued; `updateNodeProperties` immediate; `planDay`).
- Proposals: table `proposals` (`src/lib/db/schema.ts`), executed by `executeBatch` in
  `src/lib/ai/router.ts`; UI in `src/components/proposals/ProposalQueue.tsx`.
- Vocabulary (system prompt, `src/lib/ai/system-prompt.ts`): **Goal = "area"**, **Project**
  = a list with optional `headings`, **Task** = the only to-do type (repeats via
  `recurrence`), **Event** = fixed time, recurring via `frequency`/`daysOfWeek`. A task
  belongs to a list through a `part-of` edge (`containerOf` in `src/lib/todos.ts`) and to a
  heading through `headingId`.
- Identities: `Identity` nodes with `listIds`, `itemIds`, `tags` that count toward them
  (`src/lib/identity.ts`, `src/lib/identity-match.ts`).
- Undo: `UndoProvider`, and `ExecutionResult` records created ids and previous properties.

## Capability 1: Plan it

### Flow
1. User speaks or types an intention. The assistant decides: a single to-do (today's
   behaviour, unchanged) or a *goal needing a plan*. Rule of thumb for "needs a plan":
   more than one step, or longer than a week, or the user says "I want to / I need to get".
2. If key facts are missing (deadline, how many days a week, starting point), the
   assistant asks **at most two** short questions, voice-friendly. It never blocks: if the
   user says "just do it", it assumes and states the assumptions on the preview.
3. The assistant calls a new tool `proposePlan`. It does not write anything.
4. The app shows a **Plan preview** inline in the chat island and in To review.
5. User trims (untick, rename, change a day) and taps **Add plan**. The server applies it
   in one transaction. A toast offers **Undo**.

### `proposePlan` input (model fills, server validates)
```
{
  intent: string,                     // the user's words
  area:    { existingId } | { name }, // where it lives (optional)
  project: { name, deadline?, headings?: [{ key, title }] },
  items: [{
    title, headingKey?, minutes?, notes?, checklist?: string[],
    when: { offsetDays: n } | { date },       // relative to today; server resolves
    repeats?: { frequency: daily|weekdays|weekly, days?: number[], until?: date },
    kind: 'task' | 'event', time?: HH:MM       // event only if fixed time
  }],
  identityLink?: { existingId } | { name },   // "counts toward being a runner"
  assumptions: string[]               // shown to the user
}
```
Hard caps: 1 project, ≤ 8 headings, ≤ 40 items, ≤ 1 new area. Nothing outside the schema.

### Server compiles, never trusts
The model never emits raw graph operations for plans. A deterministic compiler turns the
validated input into `BatchOperation[]` (createNode, createEdge with `$N` refs), resolving
dates in the **user's** time zone, snapping weekday names, clamping minutes, and refusing
dates in the past. The proposal row stores both the input (for the preview and re-edits)
and the compiled operations.

### Preview UI
Tree: Area → Project → Headings → Items. Each row: checkbox, title (editable inline),
day chip, repeat chip, minutes. Banner: "Assumed: 4 runs a week, starting Monday."
Actions: **Add plan**, **Edit by talking** ("make it three runs, drop the swim"), **Discard**.
"Edit by talking" re-calls the model with the current input and the instruction, returns a
new input; the tree updates. Same pattern as onboarding's spoken answers.

### After it is added
- New to-dos land where the system prompt already says they land (Today / Upcoming /
  Anytime), repeating ones as Tasks with `recurrence`.
- If `identityLink` was accepted, the project is appended to that identity's `listIds`.
- The assistant says one sentence, never a list.

## Capability 2: Tidy it

### Flow
"Tidy my lists" or an offer after N loose to-dos pile up. The assistant calls
`proposeReorganise`, which reads a *compact* snapshot (lists with titles, loose to-dos,
inbox items, tags) and returns moves only. Nothing is applied.

### `proposeReorganise` output
```
moves:    [{ todoId, toListId | toNewProject: key }]          // part-of edge changes
newLists: [{ key, kind: area|project, name, areaId? }]
headings: [{ projectId, add: [{ title, todoIds }] }]
merges:   [{ keepListId, mergeListId }]                       // flagged, not auto
renames:  [{ listId, name }]
```
No deletes, ever. "Merge" is move-all-then-archive and requires a separate confirm.
Cap: ≤ 30 changes per proposal; larger tidy-ups come back in rounds.

### Preview UI
A before/after diff grouped by destination ("Into *Marathon training*: 5 to-dos"), each
move togglable. Reason line per group, one sentence. **Apply selected** / **Discard**.

### Safety rules (both capabilities)
- One undo covers the whole proposal (uses recorded created ids and previous properties).
- Nothing in Done/Logbook is moved. Nothing with a time on today is moved silently.
- Idempotent: re-running the same proposal does not duplicate (see audit question 3).
- Everything the model sees from attachments or notes is treated as data, not instructions.

## Open product questions

1. Should plans be created straight away for small asks ("plan my week of gym") with undo,
   instead of preview-first? (Lean: preview-first until trust is earned, then a setting.)
2. Should plans be allowed to create an **Event** for fixed-time steps, or only Tasks?
3. How are repeating tasks capped so a plan cannot create hundreds of occurrences?

## Your World: should it change?

Observation: the 3D scene carries almost no information. It is decoration around the
real value, which is *evidence of who you are becoming*. Proposal: the page becomes an
**Identity** overview first and the world second.
- Default view: one card per identity, with votes this week, a short evidence feed
  ("Ran 5k on Tuesday", "Finished Marathon training week 2"), what counts toward it, and
  the AI's suggested next step toward it.
- The 3D world becomes a toggle ("See it as a world") for those who like it.
- Plans (capability 1) can be created *from* an identity card ("Make a plan for being a
  runner"), tying the two features together.

## Rollout order (proposed)
1. `proposePlan` + compiler + preview card + undo. Preview-first.
2. Speak-to-edit on the preview.
3. `proposeReorganise` with moves and new lists only.
4. Merges, renames, offers to tidy.
5. Identity overview page.

---

## Update after the first audit (what is now built, and what the compiler must do)

Built, with tests (`src/lib/ai/proposal-exec.test.ts`, 12 cases, and over HTTP):

- **Approve is claimed once.** `claimProposal` is a conditional `pending → executing` update;
  two simultaneous approvals give one 200 and one 409. Only after the batch has run does it
  become `approved`. A rejected, approved or undone proposal cannot be approved or rejected.
- **A failed batch is rolled back.** `executeBatch` throws `BatchExecutionError` carrying what
  it had written; the route calls `rollbackBatch` and releases the proposal to `pending`.
  (libSQL has no transaction support through the app's query layer, so this is compensation,
  not a true transaction. Open risk: a crash between a write and the rollback.)
- **No more merging into the user's data.** Name-dedup now applies only to Goal, Project,
  Habit, Course, never to a finished one; Tasks and Events are never merged. Reused ids are
  recorded in `reusedNodeIds` and undo never deletes them.
- **`updateNode` in a batch merges** instead of replacing every property (it used to wipe the
  other fields). The previous properties are recorded so undo restores them exactly.
- **`deleteEdge` operation** so a move leaves a to-do in exactly one list; deleted nodes record
  their links so undo can restore them.
- **Real undo.** `POST /api/proposals/[id]/undo` removes what was made (including repeats
  spawned from it via `seriesId`), restores changed properties and deleted items, refuses with
  409 when something it made has been edited since (unless `force`), marks the proposal
  `undone`, replans today. A visible **Undo toast** appears after approving, plus Cmd+Z.
- **Stale proposals are not applied.** Anything the proposal would change, delete or unlink
  must be unchanged since it was made; anything it links to must exist; older than 14 days is
  refused. The queue shows why and offers "Dismiss it".
- **Errors are shown** in the queue, not swallowed.
- **System prompt**: stored text and attachments are data, never instructions.

Still required of the (not yet built) plan compiler:

- Repeats: write `recurrence: { frequency, daysOfWeek }`, Sunday = 0; the stop date is the
  Task's `deadline`; `weekly` needs at least one day; first `dueDate` is the first matching
  day on or after the start date in the **user's** zone (`clockIn`/`zoneFor`).
- Resolve `offsetDays` when the plan is **approved**, not when it is proposed.
- Tasks only for the first slice; at most 15 items; one new project; never route a plan
  through name-dedup.
- Missed repeats pile up as one overdue Task, not many: say so on the preview.

Not done on purpose: `proposePlan`, `proposeReorganise`, the preview card, the Identity overview.


---

## Built since the second audit

- **Plan it (first slice):** `proposePlan` (tools.ts) takes a small structured plan; `src/lib/plan-compile.ts`
  turns it into operations in plain code (Tasks only, one project, optionally under one existing or one new
  area, at most 15 steps, repeats stored as `recurrence` with `daysOfWeek`, a stop date as `deadline`). Dates
  are offsets and are worked out again **when approved**; steps can be unticked in To review (`exclude`).
  A newer plan for the same project replaces the one still waiting. Tested (`plan-compile.test.ts`).
- **Safer write path** (second audit): guarded approve/undo, rollback that carries on and reports, closed-as-
  interrupted sweep, ids preserved on restore, undo keeps later edits, field-level staleness, registered node
  types and project children handled. 22 tests in `proposal-exec.test.ts`.
- **Identity:** one Identity page (cards with receipts, next up, what counts, suggestions); the 3D world is a
  lazy second view. One voice button, **Tell Tuck**, everywhere: it works in place on the Identity page, and the
  assistant's new `addIdentity` tool turns "I want to be a runner" into an identity with its sources matched.
  Touchpoints: "+1 a runner" on completing a linked to-do (with milestone words at 1, 5, 10, 25, 50, 100…),
  a dot on linked to-dos, a line in the evening check-in, identity suggestions in setup.

Not built: `proposeReorganise` (still behind the guardrails in the audit), events inside plans, the "next step"
nudge from an identity card, true database transactions.


---

## Built since: transactions, thorough plans, areas, tidying, the full-screen conversation

- **Real transactions.** Every query function reaches the database through `getDb()`; `inTransaction()`
  (src/lib/db/index.ts, AsyncLocalStorage) runs a whole batch plus the note that it was approved as one unit,
  and undo plus marking it undone as one unit. A failure or a crash leaves nothing written, so an interrupted
  proposal simply waits again. Checked under load: two approvals and eight other writes at once, no lock errors.
- **Planning.** Up to 25 steps in phases (headings), priorities, checklists, repeats that can end, one-offs
  spread (at most three a day), load and "nothing soon" warnings. A plan is critiqued before the user sees it
  (`critiquePlan`): all-routines, nothing soon, long with no phases, the same routine overlapping itself or split
  across days are sent back to the assistant to fix (twice at most). One-off checkpoints dressed as repeats are
  stored as one-offs.
- **Areas of life.** `proposeAreas`: areas with their real projects; existing areas and projects are reused and
  said so; each area can be unticked (with everything under it).
- **Rearranging.** `readOrganisation` then `proposeReorganise`: moves only (open plain to-dos, existing or new
  lists), at most 25 moves and 6 new lists, no renames, merges or deletes. A move is two tagged operations; the
  review shows each as where it was and where it goes, each can be unticked; the whole thing is one undo.
- **Full-screen Tell Tuck.** One screen from listening through working to the answer: Tuck, what was said, the
  assistant's sentence or two, and the changes as the same review cards (plans, moves, areas), then the mic to
  carry on. The island is no longer where the conversation happens after a voice message.

Still not built: events inside plans, an identity card's "next step" nudge, merging or renaming lists.
