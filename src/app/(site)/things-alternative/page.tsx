import { ContentPage } from '@/components/site/ContentPage'
import { PAGES, pageMetadata } from '@/lib/seo-copy'

export const metadata = pageMetadata(PAGES.things)

const ROWS: [string, string, string][] = [
  ['The list', 'Inbox, Today, This evening, Upcoming, Anytime, Someday, Logbook, projects with headings.', 'Inbox, Today, This Evening, Upcoming, Anytime, Someday, Logbook, projects with headings.'],
  ['Where it runs', 'In the browser; installs from Chrome on a computer or an Android phone. No store.', 'Native apps for Apple devices.'],
  ['Talking to it', 'Say or show what needs doing; it turns that into to-dos.', 'Built around typing and keyboard shortcuts.'],
  ['Planning the day', 'Plan my day gives to-dos a time, and learns when you really do them.', 'You decide what is for today and the order.'],
  ['Maturity', 'New, and a private instance for now.', 'Years of polish and a large following.'],
]

export default function ThingsAlternativePage() {
  return (
    <ContentPage
      seo={PAGES.things}
      h1="A Things alternative you can talk to."
      lede="Things is wonderful, and you should probably buy it. Acture is for when you want that same calm list, but you would rather talk than tap through menus, or you are not on an Apple device."
      sections={[
        {
          h: 'What is the same',
          p: ['A quiet list that stays out of the way: Inbox, Today with a This evening section, Upcoming, Anytime, Someday and a Logbook, projects with headings, and a keyboard-first way of working. No dashboards, no boards, no noise.'],
        },
        {
          h: 'What is different',
          list: [
            'You can talk to it, or show it a photo, and it writes the to-dos for you.',
            'It can give every to-do a time and then learn when you really get things done.',
            'It runs in a browser and installs from Chrome, so Windows and Android work as well as a Mac.',
          ],
        },
        {
          h: 'Where Things is the better choice',
          p: ['If you live on Apple devices and want a mature, polished native app with years behind it, Things is hard to beat. Acture is new, it is not in any app store, and for now it is a private instance: you sign in with a Google account that has been let in.'],
        },
      ]}
    >
      <section className="mt-14">
        <h2 className="text-[clamp(24px,3vw,30px)] font-bold leading-tight tracking-[-0.03em]">Side by side</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[15px] leading-snug">
            <caption className="sr-only">Acture and Things compared</caption>
            <thead>
              <tr className="border-b border-[#dcdad5] text-[#6b6a66]">
                <th scope="col" className="py-3 pr-4 font-semibold" />
                <th scope="col" className="py-3 pr-4 font-semibold text-[#1b1c1f]">Acture</th>
                <th scope="col" className="py-3 font-semibold text-[#1b1c1f]">Things</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(([k, a, t]) => (
                <tr key={k} className="border-b border-[#ebe9e5] align-top">
                  <th scope="row" className="py-3.5 pr-4 font-semibold">{k}</th>
                  <td className="py-3.5 pr-4 text-[#4a4a48]">{a}</td>
                  <td className="py-3.5 text-[#4a4a48]">{t}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-sm text-[#6b6a66]">Things is a product of Cultured Code. Acture isn’t affiliated with it. The Things column is our understanding of it; check their site for the details.</p>
      </section>
    </ContentPage>
  )
}
