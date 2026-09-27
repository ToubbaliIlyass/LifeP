/**
 * The content hub: a tracker for things the user makes and publishes.
 *
 * An optional module — off by default, switched on in Settings → Modules —
 * because most people using a life planner are not content creators and
 * should never see a "filming" column. When it is off the tab disappears,
 * the assistant is not told about these types, and the calendar ignores
 * publish dates. Nothing is deleted by turning it off.
 *
 *   ContentSeries  a recurring show/format, optionally on a cadence
 *   ContentPiece   one video/post/episode moving through the stages below,
 *                  linked "part-of" its series when it belongs to one
 */

export const CONTENT_STAGES = ['idea', 'scripting', 'recording', 'editing', 'scheduled', 'published'] as const
export type ContentStage = (typeof CONTENT_STAGES)[number]

export const STAGE_LABELS: Record<ContentStage, string> = {
  idea: 'Ideas',
  scripting: 'Scripting',
  recording: 'Recording',
  editing: 'Editing',
  scheduled: 'Scheduled',
  published: 'Published',
}

export const CONTENT_PLATFORMS = ['youtube', 'tiktok', 'instagram', 'x', 'linkedin', 'podcast', 'blog', 'newsletter', 'other'] as const

export const CONTENT_FORMATS = ['video', 'short', 'post', 'thread', 'episode', 'article', 'other'] as const

export function isStage(value: unknown): value is ContentStage {
  return typeof value === 'string' && (CONTENT_STAGES as readonly string[]).includes(value)
}

/** Appended to the assistant's system prompt only while the module is on. */
export const CONTENT_PROMPT = `

## Content hub (enabled for this user)
**ContentSeries** -- { name, description, platform (${CONTENT_PLATFORMS.join('/')}), frequency (daily/weekdays/weekly, optional -- the publishing cadence), daysOfWeek ([0-6]), status (active/paused/ended) } -- a recurring show or format. Structural: create with batchPropose.
**ContentPiece** -- { title, stage (${CONTENT_STAGES.join('/')}), platform, format (${CONTENT_FORMATS.join('/')}), seriesNodeId, episode (number), publishDate (YYYY-MM-DD), publishTime (HH:MM), url, notes } -- one video/post/episode.
- An idea for a video/post is captured instantly with createNode as a ContentPiece at stage "idea" -- no proposal, ideas are cheap. If it belongs to a series, set seriesNodeId, the next episode number, and link it "part-of" the series with createEdge.
- Moving through the pipeline is updateNodeProperties on "stage". When it goes to "published", set publishDate if it is missing.
- Production work that needs time (script episode 4, film on Saturday) is a Task linked "part-of" the ContentPiece, so it can be scheduled like any other task.`
