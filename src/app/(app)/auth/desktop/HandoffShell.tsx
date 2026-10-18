import { ActureLogo } from '@/components/ui/acture-mark'

/** The quiet page each step of the Mac app's sign-in shows while it works. */
export function HandoffShell({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background text-foreground px-6">
      <div className="w-full max-w-[340px] text-center">
        <ActureLogo className="w-10 h-10 mx-auto mb-5" />
        <h1 className="text-[20px] font-bold tracking-tight">{title}</h1>
        <div className="mt-2 text-[14px] text-foreground/75">{children}</div>
      </div>
    </div>
  )
}
