'use client'

import { ActureLogo } from '@/components/ui/acture-mark'
import { EASE, useInView } from './useInView'

/**
 * The questions, asked the way they would be asked — to Acture itself. Each
 * question is a bubble on the right, each answer comes back on the left with
 * the mark beside it, arriving in turn as the page reaches them.
 */
export function Conversation({ items }: { items: { q: string; a: string }[] }) {
  return (
    <ol className="space-y-6">
      {items.map((item) => <Exchange key={item.q} {...item} />)}
    </ol>
  )
}

function Exchange({ q, a }: { q: string; a: string }) {
  const { ref, seen } = useInView<HTMLLIElement>('-10%')
  const show = (ms: number) => ({
    style: { transitionDelay: `${ms}ms` },
    className: `transition-all duration-700 ${EASE} ${seen ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`,
  })
  return (
    <li ref={ref} className="space-y-3">
      <div {...show(0)}>
        <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-foreground px-4 py-2 text-sm font-medium text-background">{q}</p>
      </div>
      <div {...show(350)}>
        <div className="flex max-w-[90%] items-start gap-3">
          <ActureLogo className="mt-1 h-6 w-6 shrink-0" />
          <p className="rounded-2xl rounded-tl-md bg-foreground/5 px-4 py-2 text-sm text-foreground/80 [text-wrap:pretty]">{a}</p>
        </div>
      </div>
    </li>
  )
}
