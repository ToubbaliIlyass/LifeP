/**
 * Tuck's states: every pose the gardener has, and what it says in each.
 *
 * Tuck is the companion in Acture, a slate-blue mole with a trowel and a
 * sprout on its head. The art is in public/tuck (svg for light surfaces,
 * svg-dark for dark ones, one shared 320x300 canvas); this file is the one
 * list of what exists, so a typo in a state name is a type error rather
 * than a missing picture.
 *
 * The voice is short and kind. Never a guilt line, never a sad face: a hard
 * day is "let's start small", a failure is "let's try again".
 */

export const TUCK_STATES = [
  // Conversation
  'idle', 'greeting', 'listening', 'looking', 'thinking', 'digging', 'found', 'planning', 'replying', 'explaining', 'confirmed',
  // Proposals
  'proposing', 'curious', 'accepted', 'declined',
  // Progress
  'task-done', 'all-done', 'milestone', 'streak', 'level-seed', 'level-sprout', 'level-bloom', 'celebrating', 'welcome-back',
  // Daily rhythm
  'morning-wake', 'focus', 'evening-wrap', 'night-sleepy', 'deep-sleep', 'break-time',
  // Support
  'nudge', 'overwhelmed-support', 'stuck-helper',
  // System
  'loading-1', 'loading-2', 'loading-3', 'loading-4', 'syncing', 'offline', 'error',
  'permission-key', 'permission-mic', 'onboarding-hello', 'onboarding-show-me', 'onboarding-ready',
  'empty-garden', 'empty-inbox', 'empty-world', 'not-found', 'maintenance',
] as const

export type TuckState = (typeof TUCK_STATES)[number]

/** The four frames of the loading loop. */
export const LOADING_FRAMES = ['loading-1', 'loading-2', 'loading-3', 'loading-4'] as const

/** What Tuck says, in the state's own words. */
export const TUCK_LINES: Record<TuckState, string> = {
  'idle': 'I’m here. Tell me what’s on your mind.',
  'greeting': 'Good morning. Shall we see what today looks like?',
  'listening': 'Go ahead, I’m listening.',
  'looking': 'Ooh, let me take a good look at this.',
  'thinking': 'Hm, let me think about where this fits.',
  'digging': 'Digging through what I know about this…',
  'found': 'Found it. These two belong together.',
  'planning': 'Let me find the right spot for this.',
  'replying': 'Got it. Writing that up for you…',
  'explaining': 'See? This connects to that goal.',
  'confirmed': 'Yes, done.',
  'proposing': 'I have an idea. Want to plant this one?',
  'curious': 'Ooh, something new showed up.',
  'accepted': 'Planted! I’ll look after it.',
  'declined': 'No problem, I’ll keep it in my pocket.',
  'task-done': 'One down. Nice.',
  'all-done': 'All clear. The garden is tidy.',
  'milestone': 'Look how much has grown.',
  'streak': 'Days in a row. Watered.',
  'level-seed': 'Just getting started.',
  'level-sprout': 'Growing steadily.',
  'level-bloom': 'Look, it bloomed.',
  'celebrating': 'We did it!',
  'welcome-back': 'Welcome back. Nothing is on fire, let’s start small.',
  'morning-wake': 'Morning. Stretching first, then plans.',
  'focus': 'Focus mode on. I’ll keep quiet.',
  'evening-wrap': 'Let’s look back at the day together.',
  'night-sleepy': 'Getting sleepy. Want me to save the rest for tomorrow?',
  'deep-sleep': 'Nothing due. Sleeping.',
  'break-time': 'Take five. The tea is warm.',
  'nudge': 'Psst, this one is coming up.',
  'overwhelmed-support': 'Big day. Let’s shelter these first and take it one at a time.',
  'stuck-helper': 'Stuck on this one? Take my trowel, we’ll dig together.',
  'loading-1': 'Digging…',
  'loading-2': 'Digging…',
  'loading-3': 'Digging…',
  'loading-4': 'Digging…',
  'syncing': 'Saving, one moment.',
  'offline': 'Offline, but cosy. I’ll keep everything safe.',
  'error': 'Oops, that didn’t work. Let’s try again.',
  'permission-key': 'May I have the key? I’ll be gentle.',
  'permission-mic': 'Can I listen? Only when you tap.',
  'onboarding-hello': 'Hi, I’m Tuck. I look after your to-dos.',
  'onboarding-show-me': 'Just tell me, or show me. I’ll sort it out.',
  'onboarding-ready': 'Ready when you are.',
  'empty-garden': 'Nothing planted here yet. Plant the first one?',
  'empty-inbox': 'Nothing waiting. Enjoy the quiet.',
  'empty-world': 'Your world is still a blank map. Let’s add the first node.',
  'not-found': 'Hmm, wrong tunnel. Let’s head back.',
  'maintenance': 'Fixing something. Back soon.',
}

/** What a screen reader hears for the picture, which is not the same as what Tuck says. */
export const TUCK_ALT: Record<TuckState, string> = {
  'idle': 'Tuck, waiting with a trowel',
  'greeting': 'Tuck waving hello under the sun',
  'listening': 'Tuck listening, with sound waves',
  'looking': 'Tuck looking at a photo through a magnifier',
  'thinking': 'Tuck thinking',
  'digging': 'Tuck digging with the trowel',
  'found': 'Tuck holding up a glowing node',
  'planning': 'Tuck placing a to-do on a calendar',
  'replying': 'Tuck writing a reply',
  'explaining': 'Tuck pointing at a board with the trowel',
  'confirmed': 'Tuck nodding, with a check mark',
  'proposing': 'Tuck holding up a new idea',
  'curious': 'Tuck curious about a new idea',
  'accepted': 'Tuck with a freshly planted sprout',
  'declined': 'Tuck shrugging, keeping the seed in its pocket',
  'task-done': 'Tuck cheering beside a checked plant',
  'all-done': 'Tuck in a tidy garden with a butterfly',
  'milestone': 'Tuck proud of a grown garden',
  'streak': 'Tuck watering a plant, with a tally of days',
  'level-seed': 'Tuck with a seed on its head',
  'level-sprout': 'Tuck with a young sprout',
  'level-bloom': 'Tuck with a bloom on its head',
  'celebrating': 'Tuck celebrating with confetti',
  'welcome-back': 'Tuck welcoming you back on a mat',
  'morning-wake': 'Tuck stretching at sunrise',
  'focus': 'Tuck focusing, with headphones on',
  'evening-wrap': 'Tuck with a lantern and a checklist',
  'night-sleepy': 'Tuck sleepy under the moon',
  'deep-sleep': 'Tuck fast asleep in a hill',
  'break-time': 'Tuck having a cup of tea',
  'nudge': 'Tuck ringing a small bell',
  'overwhelmed-support': 'Tuck holding an umbrella over a pile of tasks',
  'stuck-helper': 'Tuck offering its trowel',
  'loading-1': 'Tuck digging',
  'loading-2': 'Tuck digging',
  'loading-3': 'Tuck digging',
  'loading-4': 'Tuck digging',
  'syncing': 'Tuck watering while saving',
  'offline': 'Tuck cosy in a burrow with the plug out',
  'error': 'Tuck next to a tipped pot, oops',
  'permission-key': 'Tuck holding up a key',
  'permission-mic': 'Tuck holding a microphone',
  'onboarding-hello': 'Tuck popping up from a hill to say hello',
  'onboarding-show-me': 'Tuck holding a phone',
  'onboarding-ready': 'Tuck ready to start, with a satchel and trowel',
  'empty-garden': 'Tuck with an empty garden bed',
  'empty-inbox': 'Tuck beside an empty inbox tray',
  'empty-world': 'Tuck with a blank map',
  'not-found': 'Tuck confused between three tunnels',
  'maintenance': 'Tuck fixing something behind a barrier',
}

/** Which of the three growth stages a number of finished to-dos is. */
export type TuckLevel = 'seed' | 'sprout' | 'bloom'

/** Finished to-dos it takes to leave the seed, and to bloom. */
export const LEVEL_AT = { sprout: 10, bloom: 100 } as const

export function levelFor(finished: number): TuckLevel {
  return finished >= LEVEL_AT.bloom ? 'bloom' : finished >= LEVEL_AT.sprout ? 'sprout' : 'seed'
}

export const isTuckState = (s: string): s is TuckState => (TUCK_STATES as readonly string[]).includes(s)
