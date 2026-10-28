'use client'

import { install, useInstall } from './InstallApp'
import { Tuck } from '@/components/ui/Tuck'

const BUTTON = 'inline-flex items-center gap-1.5 rounded-md border border-border/80 px-2.5 py-1 text-[13px] font-medium hover:bg-foreground/[0.05]'

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
    <div className="flex items-center gap-3" data-install-control>
      <Tuck state="greeting" size={96} decorative className="max-sm:hidden" />
      <div className="min-w-0 space-y-2">
        <p className="text-[13.5px]">Keep Acture one tap away: it opens in a window of its own, like any app.</p>
        {how ? <p className="text-[13px] text-muted-foreground">{how}</p> : <button onClick={install} className={BUTTON}>Install Acture</button>}
      </div>
    </div>
  )
}
