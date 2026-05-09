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

## Phase 0 — Foundation (the dev environment)

**Goal:** an empty but well-architected Next.js app that runs locally with all the right seams in place.

**Status:** scaffold partially complete (Next.js 16.2.6 generated, deps not yet installed).

### Tasks
- [x] Scaffold Next.js (App Router) + TypeScript + Tailwind into `/LifeP` via `create-next-app`.
- [ ] **Read `node_modules/next/dist/docs/`** before writing app code. Next.js 16 has breaking changes from earlier versions — the template explicitly flags this.
- [ ] Install runtime deps: `drizzle-orm`, `better-sqlite3`, `ai`, `@ai-sdk/google`, `@ai-sdk/react`, `zod`, `@xyflow/react`.
- [ ] Install dev deps: `drizzle-kit`, `@types/better-sqlite3`.
- [ ] Initialize `shadcn/ui` and add starter components: `button`, `input`, `card`, `scroll-area`, `dialog`, `badge`, `separator`.
- [ ] Create folder structure:
  - `src/lib/{db,ai,auth,graph,log}/`
  - `src/components/{chat,graph,proposals,ui}/`
  - `src/app/api/{chat,graph,proposals}/`
  - `data/` (gitignored — holds the SQLite file)
- [ ] Add `data/` and `*.db` to `.gitignore`.
- [ ] Create `.env.example` with `GOOGLE_GENERATIVE_AI_API_KEY=` placeholder.
- [ ] `lib/log.ts`: minimal structured logger (just a wrapper now, leaves a seam for proper logging later).
- [ ] Initialize git, first commit.

### Exit criteria
- `npm run dev` boots, blank page renders.
- `npm run lint` passes.
- All planned folders exist (even if empty).

---

## Phase 1 — Storage layer (the spine)

**Goal:** a working knowledge-graph DB you can read/write to from a script.

### Tasks
- [ ] Drizzle schema (`src/lib/db/schema.ts`):
  - `users (id, name, created_at)`
  - `nodes (id, user_id FK, type, properties JSON, created_at, updated_at)`
  - `edges (id, user_id FK, source_id FK, target_id FK, type, properties JSON, created_at)`
  - `node_types (id, user_id FK, name, schema JSON, is_builtin, created_at)` — node types live in data, not code.
  - Indexes: `(user_id)`, `(user_id, type)`, `(user_id, source_id)`, `(user_id, target_id)`.
- [ ] `drizzle.config.ts` pointed at `./data/lifep.db`.
- [ ] npm scripts: `db:generate`, `db:migrate`, `db:studio`, `db:seed`.
- [ ] Generate first migration; run it locally.
- [ ] Seed script (`scripts/seed.ts`): creates user 1, a few sample nodes (one Goal, two Habits, one Task), and edges connecting them.
- [ ] `lib/db/index.ts`: typed Drizzle client, exports a single `db` instance.
- [ ] `lib/auth/getCurrentUser.ts`: returns `{ id: 1, name: 'You' }`. Mark with a comment that this is the swap-in point for real auth later.
- [ ] `lib/graph/queries.ts`:
  - `getNodes(userId, filter?)`
  - `getEdges(userId, filter?)`
  - `getNodeWithNeighbors(userId, nodeId, depth?)`
  - `createNode(userId, type, properties)`
  - `createEdge(userId, source, target, type, properties)`
  - `updateNode(userId, nodeId, properties)`
  - `deleteNode(userId, nodeId)` — cascades edges.
  - **Every query takes `userId` and filters on it. No exceptions.**

### Exit criteria
- Seed script populates data and reads it back via typed queries.
- `npm run db:studio` opens Drizzle Studio and shows the seeded data.
- TypeScript passes with no `any` in the query layer.

---

## Phase 2 — Chat plumbing (no graph integration yet)

**Goal:** a working chat UI that streams responses from Gemini. No graph mutation yet — just prove the AI plumbing works.

### Tasks
- [ ] `lib/ai/client.ts`: Gemini 2.0 Flash via `@ai-sdk/google`, exports a `defaultModel` constant. Single point to swap providers.
- [ ] `lib/ai/system-prompt.ts`: v1 system prompt explaining LifeP at a high level. Keep it short.
- [ ] `app/api/chat/route.ts`: POST handler using `streamText` from the `ai` SDK. Takes message history, returns a stream.
- [ ] Graceful fallback: if `GOOGLE_GENERATIVE_AI_API_KEY` missing, return a structured error the UI can show as "API key not configured" (not a 500).
- [ ] `components/chat/ChatPanel.tsx`: uses `useChat` from `@ai-sdk/react`. Message list, input, send-on-enter.
- [ ] `app/page.tsx`: full-screen chat panel for now (graph view comes in Phase 3).
- [ ] Token-cost logging: log estimated input/output tokens per request via `lib/log.ts` so we can sanity-check spend later.

### Exit criteria
- You type a message, AI responds streaming, conversation persists in component state.
- API key missing case shows a clear UI message, not a crash.
- One round-trip cost is logged to the dev console.

---

## Phase 3 — Graph view (no AI integration yet)

**Goal:** a working visualization of the graph from the DB. Static reads only; AI doesn't write to it yet.

### Tasks
- [ ] `app/api/graph/route.ts`: GET returns `{ nodes, edges }` for current user. Supports `?filter=type:Habit` and `?focus=nodeId&depth=2`.
- [ ] `lib/graph/layout.ts`: simple deterministic layout (force-directed via `@xyflow/react`'s built-in or a hierarchical layout for tree-like views).
- [ ] `components/graph/GraphView.tsx`: React Flow canvas with custom node renderers per node type.
- [ ] `components/graph/nodes/`: one renderer per built-in type (`GoalNode.tsx`, `HabitNode.tsx`, `TaskNode.tsx`, `EventNode.tsx`, `GenericNode.tsx`). Default to `GenericNode` for unknown types.
- [ ] `components/graph/FilterBar.tsx`: chip toolbar above the graph with filters (All, Goals, Habits, Tasks, Calendar, This Week). Drives the `?filter=` query.
- [ ] Empty state: "No nodes yet — say something to your AI to get started" when graph is empty.
- [ ] Page layout: chat panel left (~40%), graph view right (~60%), responsive on narrow screens.

### Exit criteria
- Graph view renders the seeded data with proper node renderers.
- Filter chips correctly filter the graph.
- Layout is readable (nodes don't overlap on small datasets).

---

## Phase 4 — AI writes to the graph (the magic loop)

**Goal:** the chat AI can read the graph and propose mutations. This is the core value of the app.

### Tasks
- [ ] `lib/ai/tools.ts`: define tool schemas (Zod) used by Gemini's tool-calling:
  - `readGraph(filter?)` — AUTO
  - `searchNodes(query)` — AUTO
  - `createNode(type, properties)` — AUTO if annotation-class node, PROPOSED if structural
  - `createEdge(source, target, type, properties)` — AUTO if linking existing nodes, PROPOSED if creating relationship between top-level entities
  - `updateNodeProperties(nodeId, properties)` — AUTO for tags/notes, PROPOSED for structural fields
  - `deleteNode(nodeId)` — always PROPOSED
  - `proposeNodeType(name, schema, examples)` — always PROPOSED
- [ ] Classification rule: each tool call carries an `intent` field that determines AUTO vs PROPOSED routing. AI must classify; server validates.
- [ ] `lib/ai/router.ts`: dispatches tool calls. AUTO writes execute and return result inline. PROPOSED writes create a row in `proposals` table and return a proposal ID.
- [ ] DB: `proposals (id, user_id, kind, payload JSON, status, created_at, resolved_at)`. Status: pending / approved / rejected.
- [ ] Update `app/api/chat/route.ts` to wire tools.
- [ ] System prompt v2: explain schema, tools, classification rules, examples.
- [ ] `components/proposals/ProposalQueue.tsx`: drawer or sidebar showing pending proposals with approve/reject buttons.
- [ ] Pending-proposal badge in the header so they're never silently waiting.
- [ ] Approve handler: applies the proposal, marks resolved.
- [ ] Reject handler: marks resolved with reason; AI sees rejection reasons in the next turn so it learns from rejections.

### Exit criteria
- Saying "I want to learn piano 30min/day" produces: a `Goal: Learn piano` node, a `Habit: 30min piano daily` node, an edge `Habit -> supports -> Goal`, all surfaced as a single proposal.
- Approving the proposal writes them to the graph and they appear in the graph view.
- Rejecting with a reason results in the AI acknowledging the feedback in the next message.

---

## Phase 5 — Schema evolution (the "learning" loop)

**Goal:** the system grows over time without you hand-coding new node types every week.

### Tasks
- [ ] `Concept` node type: a generic catch-all the AI uses when it sees a recurring pattern that doesn't fit existing types. Stored in `node_types` as a built-in.
- [ ] Promotion proposal: when N (start with 5) Concept nodes share a similar shape, AI calls `proposeNodeType(name, schema, examples)`. User approves → new entry in `node_types`.
- [ ] After promotion: AI can re-tag the originating Concept nodes with the new type via a follow-up batch proposal.
- [ ] Custom node renderers can be added per type, but the GenericNode renderer is always the fallback.
- [ ] Schema-version tracking: every proposal carries a `schema_version` so old proposals don't apply against an evolved schema.

### Exit criteria
- Run a session where the AI sees a new pattern (e.g., "I'm tracking my energy levels each morning"). After several mentions, AI proposes promoting `Concept` → `EnergyLog`.
- After approval, the new type appears in `node_types` and is usable in subsequent conversations without code changes.

---

## Phase 6 — First real life domains (vertical slices)

**Goal:** dogfood the app on real life data. One domain at a time.

### Recommended order (smallest schema and highest immediate value first)
1. **Goals + supporting habits.** Smallest schema. Immediate "is this working?" signal.
2. **Tasks + projects.** Standard PM territory; needed for daily use.
3. **Calendar events.** Adds recurrence handling (start/end, RRULE).
4. **School / coursework.** Has its own structure (courses, assignments, grades, exams).
5. **Notes / journals.** Free-form text linked to other nodes.

### Per-domain task pattern
- Define the node type schema (Zod).
- Add a custom node renderer.
- Extend the AI system prompt with domain-specific guidance.
- Add filter chips to the graph FilterBar.
- Add any domain-specific UI surfaces (e.g., calendar grid view for Events).
- Use it for a week. Note what's missing. Iterate.

### Exit criteria (per domain)
- You actively use it for that domain for at least 2 weeks without losing data or hitting walls that block daily use.

---

## Phase 7 — Polish, persistence guarantees, and trust

**Goal:** an app you trust enough to delete other planning tools.

### Tasks
- [ ] Backups: nightly cron dumps the SQLite file to a separate location (`data/backups/lifep-YYYY-MM-DD.db`).
- [ ] Export to JSON: a button that downloads the full graph as JSON.
- [ ] Import from JSON: round-trip the export.
- [ ] Search: SQLite FTS5 for full-text on node properties (Postgres `tsvector` later).
- [ ] Embeddings (optional but high-value): `sqlite-vec` for semantic search across node text.
- [ ] Undo/redo: every AI mutation is reversible from the proposals log.
- [ ] Dark mode (Tailwind `dark:` classes).
- [ ] Keyboard shortcuts for common actions (focus chat, jump to graph, filter views).

### Exit criteria
- Backup runs and is recoverable.
- Export round-trips without data loss.
- You trust it enough to delete other planning tools.

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
