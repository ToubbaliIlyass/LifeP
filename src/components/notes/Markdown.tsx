'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

// Shared renderer for note/journal `content` — no @tailwindcss/typography
// installed, so formatting is hand-styled here to match the app's serif
// reading style instead of pulling in a generic prose reset.
export function Markdown({ children, className = '' }: { children: string; className?: string }) {
  return (
    <div
      className={`text-[13px] font-serif text-foreground/85 leading-relaxed break-words
        [&>*+*]:mt-2.5
        [&_h1]:text-[16px] [&_h1]:font-sans [&_h1]:font-semibold [&_h1]:text-foreground [&_h1]:mt-4 [&_h1]:first:mt-0
        [&_h2]:text-[14px] [&_h2]:font-sans [&_h2]:font-semibold [&_h2]:text-foreground [&_h2]:mt-3 [&_h2]:first:mt-0
        [&_h3]:text-[13px] [&_h3]:font-sans [&_h3]:font-semibold [&_h3]:text-foreground [&_h3]:mt-2 [&_h3]:first:mt-0
        [&_strong]:font-semibold [&_strong]:text-foreground
        [&_em]:italic
        [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a]:decoration-primary/40
        [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5
        [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5
        [&_li]:pl-0.5
        [&_li>p]:m-0
        [&_blockquote]:border-l-2 [&_blockquote]:border-border/50 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground/80
        [&_code]:font-mono [&_code]:text-[11.5px] [&_code]:bg-muted/50 [&_code]:rounded [&_code]:px-1 [&_code]:py-0.5
        [&_pre]:bg-muted/40 [&_pre]:rounded-lg [&_pre]:p-2.5 [&_pre]:overflow-x-auto [&_pre]:font-mono [&_pre]:text-[11.5px]
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_hr]:border-border/40 [&_hr]:my-3
        [&_table]:w-full [&_table]:text-[12px] [&_table]:border-collapse [&_table]:block [&_table]:overflow-x-auto
        [&_th]:border [&_th]:border-border/40 [&_th]:px-2 [&_th]:py-1 [&_th]:bg-muted/30 [&_th]:text-left [&_th]:font-sans
        [&_td]:border [&_td]:border-border/40 [&_td]:px-2 [&_td]:py-1
        [&_img]:rounded-lg [&_img]:max-w-full
        ${className}`}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  )
}
