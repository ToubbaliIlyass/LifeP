/**
 * A line a day.
 *
 * Fixed list, picked by the date — so it is the same line all day however
 * many times the dashboard is opened, and a different one tomorrow. No
 * model: a dashboard should not cost a token to render, and a quote that is
 * occasionally invented is worse than no quote.
 *
 * Attributions are only given where they are actually sound. A good many
 * lines of this kind circulate under a famous name they were never said by,
 * and repeating one every morning is a poor way to be wrong; the unattributed
 * entries below are proverbs or have a disputed origin, so they carry none.
 */
export interface Quote {
  text: string
  author?: string
}

export const QUOTES: Quote[] = [
  { text: 'How we spend our days is, of course, how we spend our lives.', author: 'Annie Dillard' },
  { text: 'It is not that we have a short time to live, but that we waste a lot of it.', author: 'Seneca' },
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', author: 'James Clear' },
  { text: 'Perfection is attained not when there is nothing more to add, but when there is nothing left to take away.', author: 'Antoine de Saint-Exupéry' },
  { text: 'There is nothing so useless as doing efficiently that which should not be done at all.', author: 'Peter Drucker' },
  { text: 'You can do anything, but not everything.', author: 'David Allen' },
  { text: 'It is not the mountain we conquer, but ourselves.', author: 'Edmund Hillary' },
  { text: 'Discipline equals freedom.', author: 'Jocko Willink' },
  { text: 'Do. Or do not. There is no try.', author: 'Yoda' },
  { text: 'If it is important, do it every day. If it is not, do not do it at all.', author: 'Dan Gable' },
  { text: 'We are what we repeatedly do.', author: 'Will Durant' },
  { text: 'The best time to plant a tree was twenty years ago. The second best time is now.' },
  { text: 'Slow is smooth, and smooth is fast.' },
  { text: 'Done is better than perfect.' },
  { text: 'A plan is not a promise. It is somewhere to start.' },
  { text: 'Nobody has ever regretted the walk they went on.' },
  { text: 'The work you are avoiding is usually the work that counts.' },
  { text: 'Start where you are. Use what you have. Do what you can.' },
  { text: 'Small and often beats big and never.' },
  { text: 'A year from now, you will wish you had started today.' },
  { text: 'You cannot get back the hour, but you still have the afternoon.' },
  { text: 'Two things fix most days: a glass of water and a shorter list.' },
  { text: 'Tomorrow is the busiest day of the week. It always is.' },
  { text: 'Finish something. Anything. It is contagious.' },
  { text: 'Progress hides in the days that felt like nothing happened.' },
  { text: 'Rest is part of the work, not a reward for it.' },
]

/**
 * The line for a given day. Deterministic, so it does not change under the
 * reader mid-morning, and it walks the whole list before repeating.
 */
export function quoteFor(dateStr: string): Quote {
  const days = Math.floor(new Date(dateStr + 'T00:00:00').getTime() / 86_400_000)
  return QUOTES[((days % QUOTES.length) + QUOTES.length) % QUOTES.length]
}
