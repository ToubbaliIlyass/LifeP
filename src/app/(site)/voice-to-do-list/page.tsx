import { ContentPage } from '@/components/site/ContentPage'
import { PAGES, pageMetadata } from '@/lib/seo-copy'

export const metadata = pageMetadata(PAGES.voice)

export default function VoiceTodoPage() {
  return (
    <ContentPage
      seo={PAGES.voice}
      h1="A voice to-do list that just listens."
      lede="Tap Tell Tuck and talk, the way you’d tell a friend. Acture turns what you said into to-dos, each one a line you can see straight away."
      sections={[
        {
          h: 'Say everything at once',
          p: [
            'Say “lab report due Thursday, call the bank at 1, pick up printer ink, and remind me to call mom tonight” and it adds four to-dos, with the dates and times you gave. The one at 1 o’clock stays at 1 o’clock; “tonight” goes to This evening.',
            'It answers in writing, right where you are. It never talks back.',
          ],
        },
        {
          h: 'Or show it',
          p: ['Send a photo of a whiteboard, a timetable, or a screenshot of a message. Acture pulls out what needs doing and adds it the same way. You can say what the photo is about, or just send it.'],
        },
        {
          h: 'If it gets something wrong',
          list: [
            'Everything it adds appears immediately, so you can check it by eye.',
            'One press undoes it.',
            'You never have to talk. Press N and type, or use the shorthand, whenever your hands or your surroundings say no to a microphone.',
          ],
        },
        {
          h: 'Where the voice goes',
          p: [
            'In browsers that can do it, your words appear as you speak. Where they can’t, Acture records a short clip and sends it to be transcribed, which takes one pause at the end instead of streaming.',
            'What you say or attach is sent to an AI model to be read, and that is all it is used for. Your lists live in Acture’s own database, and you can export everything as one JSON file.',
          ],
        },
        {
          h: 'Where it runs',
          p: ['In your browser, and installable from Chrome on a computer or an Android phone, with its own icon and window. Acture is a private instance right now: you sign in with a Google account that has been let in.'],
        },
      ]}
    />
  )
}
