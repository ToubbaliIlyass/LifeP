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
