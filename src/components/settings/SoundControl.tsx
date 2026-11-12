'use client'

import { useEffect, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { playToast, setSoundOn, soundOn } from '@/lib/toast-sound'

/** The chime a toast makes when it appears (src/lib/toast-sound.ts): on or off, and hear it. */
export function SoundControl() {
  const [on, setOn] = useState(true)
  useEffect(() => { const t = setTimeout(() => setOn(soundOn()), 0); return () => clearTimeout(t) }, [])
  const flip = () => {
    const next = !on
    setOn(next); setSoundOn(next)
    if (next) playToast('success')
  }
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-[length:calc(15px*var(--ts))] font-semibold">{on ? 'Toast sounds are on' : 'Toast sounds are off'}</p>
        <p className="mt-1 text-[length:calc(13px*var(--ts))] text-muted-foreground">A soft chime when a message appears: a different one for a reminder, a success and a problem.</p>
      </div>
      <button
        role="switch" aria-checked={on} aria-label="Toast sounds" onClick={flip}
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 max-md:min-h-11 max-md:px-4 text-[length:calc(13px*var(--ts))] max-md:text-[length:calc(15px*var(--ts))] font-medium ${on ? 'border-primary/40 bg-primary/[0.12]' : 'border-border/80 hover:bg-foreground/[0.05]'}`}
      >
        {on ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}{on ? 'On' : 'Off'}
      </button>
    </div>
  )
}
