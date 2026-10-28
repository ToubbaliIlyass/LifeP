import { ContentPage } from '@/components/site/ContentPage'
import { PAGES, pageMetadata } from '@/lib/seo-copy'

export const metadata = pageMetadata(PAGES.planner)

export default function DayPlannerPage() {
  return (
    <ContentPage
      seo={PAGES.planner}
      h1="A day planner that learns when you actually do things."
      lede="Most plans fail on one thing: you planned the gym for 7:00 and went at 19:15, every time. Acture notices, and tomorrow’s plan follows you."
      sections={[
        {
          h: 'Plan my day',
          p: ['One press gives every to-do that is left a time, around your events, classes and shifts, and around the five daily prayers if you have turned them on. A time you set yourself never moves, and a day that has already gone can’t be planned.'],
        },
        {
          h: 'It learns your real day',
          p: [
            'Acture keeps two weeks of when each to-do really got done, next to when it was planned. When the two keep disagreeing, the plan moves to where you actually do it. You can open any to-do and see the chart it is learning from.',
          ],
        },
        {
          h: 'Two minutes in the evening',
          p: ['Most of a day never passes through a checkbox, and what does is ticked when you remember it. So once a day, in the evening, Acture asks how it went. Tell it by voice or type it: “went for a walk at seven instead of the gym; didn’t get to the ML notes, I’ll do them tomorrow morning.” That is worth more to the planner than a week of ticking.'],
        },
        {
          h: 'Where AI is, and where it isn’t',
          p: ['The assistant uses an AI model to understand what you say or show. The planning itself is plain logic: it places things in your free time, honours what you fixed, and learns from what you did. That makes it predictable, and you can always move a time by hand.'],
        },
        {
          h: 'Still a really good list',
          list: [
            'Inbox, Today, Upcoming, Anytime and Someday, plus a Logbook.',
            'Projects with headings, habits with streaks, deadlines kept apart from the day.',
            'Keyboard first: N for a new to-do, Space to complete, T for Today, E for This evening.',
          ],
        },
      ]}
    />
  )
}
