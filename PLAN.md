# LifeP — Implementation Plan

A phased build plan for LifeP: a personal life-planning web app built around a knowledge graph + AI feedback loop.

This plan is **the source of truth** for what gets built, in what order, and why. Treat it as a living document — update it when reality teaches you something the plan didn't predict. Don't treat it as a contract.

---

## Guiding principles (apply to every phase)

These were locked in during planning. Re-read before starting any phase.

1. **Local-first, multi-user-ready.** Single user (you) running locally for now, but every architectural choice keeps the door open to small multi-user hosted later.
   - `user_id` on every row from day one (always `1` for now).
   - No filesystem state — everything in the DB.
   - AI calls go through `lib/ai/` — never sprinkled into components.
   - ORM that abstracts SQLite (local) and Postgres (hosted) without code changes.
   - Auth seam: `getCurrentUser()` returns hardcoded user now, real session later.
2. **Hybrid AI autonomy.** AI auto-writes annotations, tags, links, summaries. Structural changes (new goals, deletions, new node types) go through a review queue.
3. **Build vertical slices, not horizontal layers.** Resist building "all of habits" before any other domain works. One domain end-to-end beats five domains half-built.
4. **Don't over-engineer.** No Kubernetes for one user. No queues until they're needed. No auth until you share it. Add complexity only when the absence of it hurts.
5. **Don't under-engineer.** No SQLite-only SQL. No filesystem state. No AI calls outside `lib/ai/`. The cheap-to-add seams now save weeks later.
6. **Schema is data, not code.** Node types and edge types live in the DB. Adding a new domain shouldn't require shipping code.

---

## Phase 0 — Foundation (the dev environment) ✅

**Goal:** an empty but well-architected Next.js app that runs locally with all the right seams in place.

**Status:** Complete.

### Tasks
- [x] Scaffold Next.js (App Router) + TypeScript + Tailwind into `/LifeP` via `create-next-app`.
- [x] Read `node_modules/next/dist/docs/` before writing app code.
- [x] Install runtime deps: `drizzle-orm`, `better-sqlite3`, `ai`, `@ai-sdk/google`, `@ai-sdk/react`, `zod`, `@xyflow/react`.
- [x] Install dev deps: `drizzle-kit`, `@types/better-sqlite3`.
- [x] Initialize `shadcn/ui` and add starter components: `button`, `input`, `card`, `scroll-area`, `dialog`, `badge`, `separator`.
- [x] Create folder structure.
- [x] Add `data/` and `*.db` to `.gitignore`.
- [x] Create `.env.example` with `GOOGLE_GENERATIVE_AI_API_KEY=` placeholder.
- [x] `lib/log.ts`: minimal structured logger.
- [x] Initialize git, first commit.

### Exit criteria
- `npm run dev` boots, blank page renders. ✅
- `npm run lint` passes. ✅
- All planned folders exist. ✅

---

## Phase 1 — Storage layer (the spine) ✅

**Goal:** a working knowledge-graph DB you can read/write to from a script.

**Status:** Complete.

### Tasks
- [x] Drizzle schema: `users`, `nodes`, `edges`, `node_types` with all indexes and FKs.
- [x] `drizzle.config.ts` pointed at `./data/lifep.db`.
- [x] npm scripts: `db:generate`, `db:migrate`, `db:studio`, `db:seed`.
- [x] Generate first migration; run it locally.
- [x] Seed script: user 1, sample Goal/Habit/Task nodes, edges.
- [x] `lib/db/index.ts`: typed Drizzle client.
- [x] `lib/auth/getCurrentUser.ts`: hardcoded user 1 stub.
- [x] `lib/graph/queries.ts`: all CRUD functions, all user-scoped.

### Exit criteria
- Seed script populates data and reads it back. ✅
- TypeScript passes with no `any` in the query layer. ✅

---

## Phase 2 — Chat plumbing (no graph integration yet) ✅

**Goal:** a working chat UI that streams responses from Gemini. No graph mutation yet — just prove the AI plumbing works.

**Status:** Complete. Switched from Gemini to OpenAI `gpt-4o-mini` due to free-tier quota limits.

### Tasks
- [x] `lib/ai/client.ts`: model constant, single swap point. Now using `gpt-4o-mini` via `@ai-sdk/openai`.
- [x] `lib/ai/system-prompt.ts`: v1 system prompt.
- [x] `app/api/chat/route.ts`: POST handler with `streamText`, returns stream.
- [x] Graceful fallback: missing API key returns 503 with clear message.
- [x] `components/chat/ChatPanel.tsx`: `useChat` hook, streaming, send-on-enter.
- [x] Token-cost logging via `lib/log.ts`.

### Exit criteria
- AI responds streaming. ✅
- Token cost logged to dev console. ✅

---

## Phase 3 — Graph view (no AI integration yet) ✅

**Goal:** a working visualization of the graph from the DB. Static reads only; AI doesn't write to it yet.

**Status:** Complete.

### Tasks
- [x] `app/api/graph/route.ts`: GET with `?filter=` and `?focus=` support.
- [x] `lib/graph/layout.ts`: column-grouped deterministic layout by node type.
- [x] `components/graph/GraphView.tsx`: React Flow canvas, loading/empty/error states, auto-refreshes on proposal approval.
- [x] Custom node renderers: `GoalNode`, `HabitNode`, `TaskNode`, `EventNode`, `GenericNode`.
- [x] `components/graph/FilterBar.tsx`: dynamic chip toolbar (loads from `/api/node-types`).
- [x] Split layout: chat 40% left, graph 60% right.

### Exit criteria
- Graph renders seeded data with proper renderers. ✅
- Filter chips work. ✅

---

## Phase 4 — AI writes to the graph (the magic loop) ✅

**Goal:** the chat AI can read the graph and propose mutations. This is the core value of the app.

**Status:** Complete.

### Tasks
- [x] `lib/ai/tools.ts`: `readGraph`, `searchNodes`, `createNode`, `createEdge`, `updateNodeProperties`, `deleteNode`, `batchPropose`, `proposeNodeType`. All use AI SDK v6 `inputSchema`.
- [x] Intent classification: `auto` vs `proposed` per tool call.
- [x] `lib/ai/router.ts`: executes batch operations, resolves `$N` refs for forward-referencing new nodes.
- [x] `proposals` table with `schema_version`.
- [x] `app/api/chat/route.ts` wired with tools + rejection context injected into system prompt.
- [x] System prompt v2.
- [x] `components/proposals/ProposalQueue.tsx`: slide-in panel, expand ops, approve/reject with reason.
- [x] Proposals button always visible in header; polls every 4s for pending count.
- [x] Graph auto-refreshes on approval (no page reload needed).

### Exit criteria
- "I want to learn piano 30min/day" → Goal + Habit + edge as a single proposal. ✅
- Approving updates the graph immediately. ✅
- Rejection reason fed back to AI on next turn. ✅

---

## Phase 5 — Schema evolution (the "learning" loop) ✅

**Goal:** the system grows over time without you hand-coding new node types every week.

**Status:** Complete.

### Tasks
- [x] `Concept` built-in node type seeded in `node_types` on startup (alongside Goal, Habit, Task, Event).
- [x] `lib/db/node-types.ts`: `getNodeTypes`, `createNodeType`, `nodeTypeExists`, `getSchemaVersion`.
- [x] `proposeNodeType` operation in `BatchOperationSchema` + dedicated tool.
- [x] `lib/ai/router.ts` handles `proposeNodeType` on approval — writes to `node_types`, skips if already exists.
- [x] `schema_version` stamped on every proposal; mismatch logged on approval.
- [x] System prompt v3: Concept node instructions, `pattern` field convention, 5-node promotion trigger.
- [x] `GET /api/node-types` endpoint.
- [x] `FilterBar` loads types dynamically — promoted types appear without code changes.

### Exit criteria
- Approved `proposeNodeType` proposal adds type to DB and filter bar immediately. ✅
- `GenericNode` renderer handles any unknown type as fallback. ✅

---

## Phase 6 — First real life domains (vertical slices) ✅

**Goal:** dogfood the app on real life data. One domain at a time.

**Status:** Goals + Habits and Tasks + Projects complete. Calendar/School/Notes deferred.

### Domains shipped

**Calendar Events:**
- [x] Enhanced Event type: date, time, location, recurring (none/daily/weekly/monthly)
- [x] `GET /api/events?days=30` — upcoming events grouped by date
- [x] EventsPanel — agenda view with grouping, recurring badge
- [x] Updated EventNode — shows time + location
- [x] AI guidance: date/time formatting, recurring events, location prompts

**School / Coursework:**
- [x] Course, Assignment, Exam node types
- [x] `GET /api/school` — courses with linked assignments + exams (via edges or courseNodeId)
- [x] SchoolPanel — expandable course cards, assignment status, exam dates, grades, overdue highlight
- [x] CourseNode, AssignmentNode, ExamNode renderers
- [x] AI guidance: linking to courses, status transitions, grade recording

**Notes / Journals:**
- [x] Note, JournalEntry node types
- [x] `GET /api/notes` — notes + journal entries sorted newest first
- [x] NotesPanel — expandable list with mood emoji for journal entries
- [x] NoteNode / JournalEntry renderer (shared)
- [x] AI guidance: auto-linking notes to relevant nodes

**Goals + Habits:**
- [x] HabitLog node type — tracks daily completions (habitNodeId, date, completed, notes)
- [x] `GET /api/habits` — habits with today's status + streak calculation
- [x] `PATCH /api/habits/[id]` — toggle completion, creates/updates HabitLog node
- [x] HabitsPanel — daily checklist with progress bar, streaks, check-off UI
- [x] Updated GoalNode — status badge + target date
- [x] Updated HabitNode — streak display
- [x] AI guidance: HabitLog auto-creation when user says "I did X"

**Tasks + Projects:**
- [x] Project node type (name, description, status, dueDate)
- [x] `GET /api/tasks` — tasks sorted by status
- [x] `PATCH /api/tasks/[id]` — cycle status (todo → in-progress → done)
- [x] TasksPanel — grouped task list with clickable status, overdue highlight
- [x] Updated TaskNode — status badge + overdue indicator
- [x] AI guidance: auto status updates when user says "I finished X"

**Schema + Graph:**
- [x] ConceptNode renderer (dashed border, pattern tag)
- [x] Right panel tabs: Graph | Habits | Tasks

### Exit criteria (per domain)
- Actively use it for 2 weeks without hitting walls. (In progress — use it and iterate)

---

## Phase 7 — Polish, persistence guarantees, and trust ✅

**Goal:** an app you trust enough to delete other planning tools.

**Status:** Complete.

### Tasks
- [x] Backups: `scripts/backup.ts` + `npm run db:backup`. Keeps last 30 daily backups, prunes older ones. Add to system crontab for nightly automation.
- [x] Export to JSON: `GET /api/export` — downloads full graph (nodes, edges, node types) as timestamped JSON file. Header button + `⌘E` shortcut.
- [x] Import from JSON: `POST /api/import` — re-creates graph from export file, remaps IDs, imports custom node types. Header file picker.
- [x] Search: `GET /api/search?q=` — text search across all node properties. `⌘K` command-palette overlay with debounced results.
- [x] Undo: `POST /api/proposals/[id]/undo` — creates a reverse proposal (delete created nodes, restore updated props). Execution result stored on every approved proposal.
- [x] Dark mode: ThemeToggle in header, flash-free inline script in layout, persisted to localStorage.
- [x] Keyboard shortcuts: `⌘K` search, `⌘E` export, `1-6` tab switch, `/` focus chat, `p` proposals.

### Exit criteria
- Backup runs and is recoverable. ✅
- Export round-trips without data loss. ✅
- You trust it enough to delete other planning tools. (Use it and find out)

---

## Phase 9 — Iteration 1: AI awareness + daily-use UX

**Goal:** sharpen the AI's graph awareness, refine task organization for real daily use, and add a brand-defining first-visit animation.

**Status:** Not started.

### 9.1 — Today panel: horizontal stretch
- [x] Drop the `max-w-2xl` constraint in `src/components/today/TodayView.tsx:111` so the Habits / Tasks / Events sections fill available horizontal width.

### 9.2 — Tasks panel: regroup by date buckets
Replace the current status-based grouping in `src/components/tasks/TasksPanel.tsx` with date-based buckets.

- [x] Buckets in order: **Overdue** (red) → **Next 3 days** → **Next week** (4–7 days) → **Two weeks** (8–14 days) → **Undated** → **Done** (collapsed).
- [x] Within each bucket, sort by due date ascending.
- [x] Tasks beyond 2 weeks: not shown for now.
- [x] Status dot still cycles status inline (preserve existing behavior).

### 9.3 — AI: relevant-node snapshot + mandatory connection edges
Inject a curated graph snapshot into the chat system prompt and require edges to existing nodes in proposals.

- [x] New `src/lib/ai/context.ts` exporting `buildContextSnapshot(userId, userMessage)`:
  - **Always include:** Goal, Project, Course nodes; active Habits; non-done Tasks.
  - **Plus:** any node whose `name` keyword-matches the user's current message.
  - **Exclude:** HabitLog, JournalEntry (AI can fall back to `readGraph` for those).
  - Format: compact `id · type · name` list grouped by type, capped at a sane size.
- [x] Wire snapshot into `src/app/api/chat/route.ts` alongside `dateContext` + `rejectionContext`.
- [x] Update `src/lib/ai/system-prompt.ts`:
  - Add rule: "Before creating any new node, scan the graph snapshot for relevant existing nodes. Bundle edges to them in the same `batchPropose` so the user reviews the concept + its connections atomically."
  - This is default behavior — not contingent on the user asking to link.

### 9.4 — Opening animation (first visit per session)
Brand intro that resolves into "Acture" before revealing the Today panel.

- [x] Tagline: *"Where **Act**-ion meets struct-**Ure**"* — `Act` and `Ure` in serif, rest sans-serif.
- [x] Animation phases:
  1. Tagline fades in.
  2. The two serif fragments (`Act`, `Ure`) slide toward each other to form `Acture` in the center.
  3. Crossfade into the Today panel.
- [x] Gate on `sessionStorage` flag — plays only on first visit per session.
- [x] Skippable on click or key press.

### Exit criteria
- Today panel uses full horizontal width on wide displays.
- Tasks panel shows date-bucket grouping with the buckets above.
- AI creates new nodes with relevant edges bundled into the same proposal *without being asked*.
- Opening animation plays once per session, is skippable, and crossfades smoothly into Today.

### Deferred (future phase)
- Calendar day-view to arrange tasks/habits across the day.

---

## Phase 10 — Iteration 2: relationship quality, archival, and panel polish

**Goal:** fix the two opposite failure modes in AI-created relationships (spurious links and missing links), give done tasks somewhere to go, fix Today-view bleed-through, and tighten visual hierarchy across panels.

**Status:** Complete ✅.

### Diagnosis (driving this phase)

- The current `buildContextSnapshot` in `src/lib/ai/context.ts` lists nodes but **never includes edges**. The AI makes relationship decisions blind to existing structure, producing both over-linking (e.g. grooming Habits attached to a "$500/month" Goal) and under-linking (Projects that obviously belong to a Goal aren't connected).
- The system-prompt rule *"never create a structural node in isolation when related nodes exist"* pushes the AI to attach new nodes to whatever's salient in context, regardless of whether the relationship is real.
- `TodayView` filters Tasks and Events to today, but shows **all** Habits regardless of `frequency` — weekly habits leak into every day. The `Habit` schema has no day-of-week field, so filtering is impossible without a schema addition.
- Done tasks accumulate forever in the panel. No archival, no log.
- Group headers in `TasksPanel` (and elsewhere) are visually too uniform — the eye doesn't latch onto bucket boundaries.

### 10.1 — Done tasks: archive with a log

Mental model: tasks live in three tiers — **Active** (todo/in-progress), **Recently done** (≤7 days, collapsed in panel), **Archived** (>7 days, hidden from panel, visible in a log view). Nothing is ever deleted.

- [x] In `PATCH /api/tasks/[id]/route.ts`, set `completedAt` (ISO datetime) on transition to `done`; clear it on transition away from `done`. No schema change — lives in the existing `properties` JSON.
- [x] In `GET /api/tasks/route.ts`, derive `archived = completedAt && (now - completedAt) > 7d` and include it on each row.
- [x] In `src/components/tasks/TasksPanel.tsx`, filter archived tasks out of the Done bucket by default. Add a small "Show archived (N)" toggle at the bottom of the Done group.
- [x] New "Activity" view (decision below) that lists all archived tasks chronologically. Unify with other completion events (done Assignments, taken Exams) so it's a "what did I do this month" log, not just a tasks bin.
- [x] Add a sidebar tab for the Activity view or fold it into Today as a section.

**Decision needed before building:** scope of the log — tasks-only vs unified completion log. Default to unified; revisit if it gets noisy.

### 10.2 — Edges in the snapshot + verbalize-before-create

Combining three changes so the AI *reasons* about relationships instead of just following a stricter rule. Ship in order A → C → B.

#### Phase A — Surface edges in the snapshot

- [x] In `src/lib/ai/context.ts`, after the `relevant` node set is built:
  - Call `getEdges(userId)`.
  - Filter to edges where both endpoints are in `relevant`.
  - Build a node-id → name lookup from `relevant`.
- [x] Render a new section in the snapshot after the nodes:
  ```
  ## Existing relationships
  - 14 (Project: Twitter content) --supports--> 8 (Goal: Make $500/month)
  - 22 (Habit: Daily writing) --supports--> 8 (Goal: Make $500/month)
  - 31 (Task: Draft thread) --part-of--> 14 (Project: Twitter content)
  ```
  Both IDs (for tool calls) and names (for reasoning) on each line.
- [x] If edge count is large, cap at ~30 edges, prioritizing edges that touch Goals/Projects/Courses over Task/Habit-only edges.

#### Phase C — Soften but keep the bundling rule

- [x] In `src/lib/ai/system-prompt.ts`, replace the current "always bundle / never in isolation" sentence with:
  > "When existing nodes in the snapshot are clearly relevant (e.g. a new Task that contributes to a visible Goal, a Habit that supports a visible Project), bundle the supporting edges in the same `batchPropose`. If no existing node has a clear, defensible relationship to the new one, leave it standalone — orphan nodes are fine and can be linked later. Use the `reasoning` field to articulate each edge; if you can't articulate it in one sentence, don't create it."

#### Phase B — Verbalization in batchPropose

- [x] Extend the `batchPropose` input schema in `src/lib/ai/tools.ts` with a required `reasoning` field — short paragraph explaining each new edge. Persist it on the `proposals` row (schema already has flexible `operations`/`summary`; add to summary or extend the schema with a dedicated column if cleaner).
- [x] In `src/components/proposals/ProposalQueue.tsx`, render the reasoning prominently above the operations so the user sees the AI's justification before approving.
- [x] System-prompt note: "If you cannot write a one-sentence reason for an edge, do not create it."

**On custom user types:** this whole plan operates at the prompt/snapshot layer, so any user-promoted type (via `proposeNodeType`) flows through unchanged. No allow-list to maintain.

### 10.3 — Today view: filter weekly/non-today habits

Underlying problem: `Habit` schema has no day-of-week, so "weekly" can't be filtered to a specific day.

- [x] Extend `Habit` node properties with optional `daysOfWeek: number[]` — integers 0-6 (Sun-Sat). Conventions:
  - `daily` → empty array or `[0,1,2,3,4,5,6]`
  - `weekdays` → `[1,2,3,4,5]`
  - `weekly` → single day the user specifies (e.g. `[0]` for Sunday)
- [x] Update `src/lib/ai/system-prompt.ts`: when creating a weekly habit, the AI must ask which day if not stated and populate `daysOfWeek`. Extract from phrases like "each Sunday" → `[0]`.
- [x] `GET /api/habits` and `TodayView` filter habits by `daysOfWeek.includes(today.getDay())`. Habits with **no** `daysOfWeek` keep current behavior (show every day) — backwards-compatible with existing data.
- [x] Surface `daysOfWeek` in `NodeDetailPanel` as a 7-checkbox row so existing weekly habits without it can be fixed by the user.

### 10.4 — Panel grouping: stronger visual hierarchy

Apply across `TasksPanel`, `EventsPanel`, and the new Activity log. Aim for clear bucket boundaries without loud color.

- [x] **Stronger group headers**: bump from 9px mono uppercase to 11px medium-weight; keep mono only for the timestamp/count metadata.
- [x] **Visible separators**: hairline rule (`border-t border-border/30`) above each group header. Replaces the `space-y-5` gap as the structural cue.
- [x] **Semantic color accents**: 2px colored left bar on each group container — red for Overdue, amber for Next 3 days, neutral for further-out, green for Done. Subtle, not loud.
- [x] **Sticky group headers** on scroll for long sections (especially `EventsPanel` where a single day can have many entries).
- [x] Add grouping to `NotesPanel` (by week or by tagged subject) and `HabitsPanel` (by `frequency`: daily / weekdays / weekly).

### Order to ship

1. **10.3** Today view fix — smallest, most annoying bug.
2. **10.1** Done task archive — medium effort, answers "where did things go."
3. **10.2** Edges plan, in order A → C → B.
4. **10.4** Panel grouping polish — visual, low risk, do last.

### Exit criteria

- AI snapshot includes existing edges; `batchPropose` requires reasoning; spurious-edge proposals visibly drop and missing-edge cases (e.g. Projects → goal they obviously support) get caught more often.
- Done tasks disappear from the panel after 7 days but are recoverable via the Activity log.
- Today view shows only what is for **today** — no Sunday-only habits on a Tuesday.
- Panel group boundaries are immediately legible at a glance.

---

## Phase 11 — Calendar / time-blocking view

**Goal:** a day-view calendar that lets the user drag Tasks and Habits onto a 24-hour timeline. Time-blocks are first-class graph nodes, so the AI can read/create them and we can query history.

**Status:** Not started.

### Design decisions (locked in)

- **Calendar replaces the main panel, not chat.** Chat stays accessible on the right; AI scheduling ("block 90 min for deep work this afternoon") works from the same view.
- **TimeBlock as a new node type, linked via edge.** Not a property on Task/Habit. Lets the same Task have multiple blocks across the day, preserves history, keeps source nodes clean.
- **Day view only for v1.** Week view, recurrence, and AI scheduling helpers go to phase 12.
- **24-hour grid**, 30-minute snap.

### 11.1 — Data model

- [ ] Register `TimeBlock` as a built-in node type seeded in `node_types` on startup.
- [ ] TimeBlock properties shape: `{ date: YYYY-MM-DD, startTime: HH:MM, endTime: HH:MM }`. No source-node reference in properties — that's an edge.
- [ ] New canonical edge type: `scheduled-for` (TimeBlock -> Task/Habit/Project/etc.). A TimeBlock with no `scheduled-for` edge is a raw block (lunch, break, free time). That's a feature, not a bug.
- [ ] Add optional `defaultTime: HH:MM` to Habit properties. Not used by the calendar in v1 — reserved for phase 12 auto-render.

### 11.2 — API

- [ ] `GET /api/calendar?date=YYYY-MM-DD` — returns `{ blocks, events }` for that date. Blocks are joined with their source node via the `scheduled-for` edge.
- [ ] `POST /api/calendar/blocks` — body `{ date, startTime, endTime, sourceNodeId? }`. Creates the TimeBlock node and (if `sourceNodeId` provided) the `scheduled-for` edge atomically. **Direct, no proposal queue** — scheduling is not a structural change.
- [ ] `PATCH /api/calendar/blocks/[id]` — body `{ startTime?, endTime?, date? }`. Used for moving and resizing.
- [ ] `DELETE /api/calendar/blocks/[id]` — cascade removes its edges.

### 11.3 — Components

Folder: `src/components/calendar/`

- [ ] `CalendarView.tsx` — main container. Left rail (unscheduled today) + right grid.
- [ ] `UnscheduledRail.tsx` — left rail showing today's eligible items that aren't yet time-blocked:
  - Tasks where `dueDate <= today` AND status !== 'done' AND no TimeBlock for today
  - Habits scheduled for today (via daysOfWeek/frequency) AND no completion log AND no TimeBlock
  - Each item draggable via `@dnd-kit/core`.
- [ ] `TimeGrid.tsx` — 24h × 2 slots × 32px tall (~1536px). Scrollable. Auto-scrolls to current hour on first mount. Renders a soft "now" line, updated every minute.
- [ ] `Block.tsx` — single block. Different styling per source type (Task = sky, Habit = emerald, raw = neutral; Events keep their existing amber). Includes a bottom-edge resize handle and a delete control.

### 11.4 — Drag-and-drop interactions (@dnd-kit/core)

- [ ] **Rail item -> grid slot**: creates new TimeBlock + `scheduled-for` edge. Drop Y determines `startTime`; default duration 30 min.
- [ ] **Existing block -> different slot**: PATCH new time range.
- [ ] **Resize handle drag**: PATCH `endTime`.
- [ ] **Click block**: opens `NodeDetailPanel` for the source Task/Habit (not the TimeBlock itself — the user wants to edit what they're working on, not the slot metadata).
- [ ] **Delete control on block**: removes the TimeBlock, releases the source back to the rail.

### 11.5 — Existing Events on the grid

- [ ] `GET /api/calendar` merges Events for the date into the response.
- [ ] Events render alongside TimeBlocks but with their amber styling, distinguishing external commitments from self-scheduled blocks.
- [ ] Events are **not** draggable in v1 — edit via `NodeDetailPanel` (right-click or click-through).

### 11.6 — Tab + page wiring

- [ ] Add `Calendar` sidebar tab (CalendarRange icon) right after `Today`.
- [ ] `tab === 'calendar' && <CalendarView />` in `src/app/page.tsx`.

### 11.7 — AI integration (minimal)

- [ ] Update `src/lib/ai/system-prompt.ts` to list `TimeBlock` as a node type and `scheduled-for` as a canonical edge.
- [ ] Add `TimeBlock` to a new `DIRECT_CREATE_TYPES` set in `src/lib/ai/tools.ts` so `createNode` permits it directly (it's not structural). No proposal queue for scheduling.
- [ ] System prompt note: "When user says 'block out 90 min for X tomorrow morning', create a TimeBlock directly with `createNode` + `createEdge`. Do not use batchPropose for scheduling existing tasks."

### Order to ship

1. Seed `TimeBlock` into `node_types`.
2. Calendar API: GET / POST / PATCH / DELETE.
3. Static `TimeGrid` rendering existing blocks (no interaction yet).
4. `UnscheduledRail` with `useDraggable`.
5. Drop-to-create flow end-to-end.
6. Move and resize.
7. Click-to-edit via `NodeDetailPanel`; delete control.
8. Calendar tab in sidebar.
9. System-prompt update + `DIRECT_CREATE_TYPES`.

### Exit criteria

- Drag a Task from the rail to 14:00 -> appears as a TimeBlock, persists across reloads.
- Drag an existing TimeBlock from 09:00 to 11:00 -> time updates.
- Resize a TimeBlock from 30 min to 90 min -> endTime updates.
- Ask the AI "block out 2 hours for deep work this afternoon" -> it creates a TimeBlock directly, no proposal queue.
- Existing Events appear on the grid in amber and are not movable.

### Deferred (phase 12+)

- Week view.
- Recurring TimeBlocks ("repeat every Tuesday at 9 AM").
- Auto-render of habits with `defaultTime` as soft pending blocks.
- Dedicated AI scheduling tool (`scheduleBlock(taskId, time)`) wrapping the primitives with smarter defaults.
- Calendar import/export (.ics).
- Mobile / touch support.

---

## Phase 8 — Multi-user migration (only if/when needed)

**Don't do this until you have actual users beyond yourself.** Premature deployment is the most common way personal projects die.

### Tasks (in order)
- [ ] Provision Postgres (Neon or Supabase free tier).
- [ ] Add Drizzle Postgres dialect; verify schema parity.
- [ ] Test migration locally: copy SQLite → Postgres via a script.
- [ ] Add Auth.js or Clerk; wire to `getCurrentUser()`.
- [ ] Replace hardcoded user with session lookup.
- [ ] Background jobs: Inngest or Trigger.dev for AI calls so one user's heavy task doesn't block others.
- [ ] Per-user rate limiting (Upstash Redis) to control AI spend.
- [ ] Deploy to Vercel/Fly/Railway.
- [ ] Add Sentry + basic analytics (Plausible or PostHog).
- [ ] Privacy/terms pages, data deletion endpoint.

### Exit criteria
- 5 friends use it without you babysitting.
- Per-user data is fully isolated.
- AI cost per active user is tracked and bounded.

---

## Cross-cutting concerns (apply throughout, not a phase)

- **Testing.** Unit tests for graph queries (Phase 1+) and integration tests for AI tool routing (Phase 4+). Don't test trivial things; do test the routing logic that determines AUTO vs PROPOSED.
- **Type safety.** Zod schemas are the single source of truth — shared between AI tool I/O, API route validation, and forms. Never duplicate type definitions.
- **Cost discipline.** Log AI tokens per request from Phase 2 onward. Show a `$/month estimate` in dev mode.
- **Observability.** `lib/log.ts` from day one even if it's just a console wrapper. Easy to swap for proper logging later.
- **Skills (Claude Code).** Defer until Phase 4 patterns are stable. Then write `/add-node-type`, `/add-ai-tool`, `/lifep-conventions` skills to encode the repeated workflows.

---

## Anti-goals (things explicitly out of scope)

Naming what you're *not* building keeps scope honest:

- A team-collaboration tool. LifeP is single-user-per-account.
- A mobile app. Web-responsive only, until and unless real demand emerges.
- A marketplace of templates / shared graphs. Not until Phase 8+.
- An "agent" that takes actions in the outside world (sending emails, adjusting calendars, etc.). LifeP organizes thinking; it doesn't act on the world. (Add later if it earns its place.)
- Encryption-at-rest beyond what the OS provides. Trust model: it's your machine.

---

## How to use this plan

- Work one phase at a time. Don't skip ahead.
- At the start of each phase, re-read the guiding principles and exit criteria.
- When something in the plan turns out to be wrong, **edit the plan first**, then write code.
- If a phase is taking 3× longer than expected, stop and re-scope rather than push through.
