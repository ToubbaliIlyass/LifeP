# Keyword map

One primary query per URL. A secondary phrase may not be another URL's primary. Method: free reasoning only (no volume data was bought or invented). Everything here is a hypothesis to check against Google Search Console once it has data (see MONITORING.md); there are no search-volume numbers on purpose.

| URL | Primary query | Intent | Secondary phrases | Owns |
|---|---|---|---|---|
| `/` | acture (brand), "a to-do list you talk to" | Navigational + curiosity: who/what is Acture | calm to-do list, to-do list app that plans your day, things but it listens, photo to to-do list | The brand and the whole story. Holds the FAQ (the only FAQPage markup). |
| `/voice-to-do-list` | voice to-do list app | Commercial investigation: "an app where I speak and tasks appear" | talk to your to-do list, add tasks by voice, speech to to-do, voice notes to tasks, whiteboard photo to to-do list | Voice and photo capture. |
| `/day-planner` | day planner that learns your routine | Commercial investigation: "a planner that adapts to when I really do things" | plan my day automatically, auto schedule to-do list, adaptive daily planner, ai day planner (answered honestly: AI is at the input only) | Planning and learning. |
| `/things-alternative` | things 3 alternative | Comparison: someone leaving or unable to use Things | things app alternative for windows, things 3 for android, apps like things | Comparison page. Only true statements; links back to the other pages. |

## Intent notes
- Head terms ("to do list app", "task manager", "ai planner") are owned by Todoist, TickTick, Notion, Motion and the app stores. No page here targets them. The realistic targets are the specific, lower-competition phrases above, plus the brand.
- "Things 3 alternative" SERPs are mostly listicles and comparison blogs. Acture will not beat them on authority soon; the page exists to convert people who already know Things, and for a clean answer to cite.
- Acture is invite-only for now. Every page says so. The search value today is mostly brand and visibility for a future opening, not signups.

## Checks before adding a page (cheap gate)
1. Primary query not already in this table.
2. Every claim traceable to code (name the file) or the existing FAQ.
3. No numbers, prices, ratings or comparisons you cannot source.
4. One h1, absolute title under 60 chars, description 120-160, canonical, entry in `PAGES` (`src/lib/seo-copy.ts`) and `PUBLIC_PATHS` (`src/lib/site.ts`), 3+ links in from other pages.
5. Do not publish in batches; roughly one page or post a month is enough.

## Ideas, not built (need the owner's real material)
- A post on "how Acture learns when you really do things", with a real anonymised chart from the owner's own use.
- "Plan a day from a photo of a timetable": needs a real screen recording.
- A page for the optional "World" (identity votes, constellation/path/city). Needs the owner's pictures; the psychology claims on the landing already cite their sources.
