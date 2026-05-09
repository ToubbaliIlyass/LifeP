import { ChatPanel } from '@/components/chat/ChatPanel'

export default function Home() {
  const apiKeyMissing = !process.env.GOOGLE_GENERATIVE_AI_API_KEY

  return (
    <main className="flex flex-col h-screen">
      <header className="flex items-center px-4 h-12 border-b shrink-0">
        <span className="text-sm font-semibold tracking-tight">LifeP</span>
      </header>
      <div className="flex-1 overflow-hidden">
        <ChatPanel apiKeyMissing={apiKeyMissing} />
      </div>
    </main>
  )
}
