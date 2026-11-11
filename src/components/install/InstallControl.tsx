'use client'

import { Download } from 'lucide-react'

import { install, useInstall } from './InstallApp'
import { Tuck } from '@/components/ui/Tuck'

const BUTTON = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-border/80 px-2.5 py-1 max-md:min-h-11 text-[length:calc(13px*var(--ts))] font-medium hover:bg-foreground/[0.05]'

/**
 * Settings → Install: Acture on this device, for when the app was opened in
 * a browser tab. Where the browser offers it, one press; elsewhere, the
 * menu it lives in. Not shown at all once it is installed.
 */
export function InstallControl() {
  const state = useInstall()
  if (!state || state.installed) return null

  const how = state.canPrompt ? null
    : state.platform === 'iphone' ? 'Share → Add to Home Screen.'
    : state.safari ? 'File → Add to Dock.'
    : state.platform === 'android' ? 'Chrome: ⋮ → Install app.'
    : 'In Chrome or Edge, press Install in the address bar.'

  return (
    <div className="flex items-center gap-4 max-sm:flex-col max-sm:items-start max-sm:gap-3" data-install-control>
      <Tuck state="greeting" size={120} decorative className="shrink-0 max-sm:self-center max-sm:[zoom:0.8]" />
      <div className="w-full min-w-0 flex-1">
        <p className="text-[length:calc(15px*var(--ts))] font-semibold">Keep Acture one tap away</p>
        <p className="mt-1 text-[length:calc(13px*var(--ts))] text-muted-foreground">{how ?? 'Opens in its own window, like any app.'}</p>
        {!how && <button onClick={install} className={`${BUTTON} mt-3 w-full justify-center`}><Download className="w-3.5 h-3.5" />Install Acture</button>}
      </div>
    </div>
  )
}
