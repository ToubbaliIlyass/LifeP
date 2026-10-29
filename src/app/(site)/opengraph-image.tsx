import { ImageResponse } from 'next/og'

/*
 * The picture that shows when a link is shared: the Acture mark on its dark
 * tile (a voice becoming a tick), the name and the line. Drawn in code from
 * the brand's own colours; the mark's paths are those of
 * src/components/ui/acture-mark.tsx.
 */
export const alt = 'Acture: Things, but it listens. A calm to-do list you talk to.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 96px', background: '#141415', color: '#f4f3f0', position: 'relative' }}>
        <div style={{ position: 'absolute', right: -200, top: -200, width: 720, height: 720, borderRadius: 720, background: 'rgba(245,165,36,0.07)', display: 'flex' }} />
        <div style={{ position: 'absolute', right: -60, top: -60, width: 440, height: 440, borderRadius: 440, background: 'rgba(245,165,36,0.10)', display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ width: 132, height: 132, borderRadius: 37, background: '#141413', border: '2px solid rgba(255,255,255,0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width={88} height={88} viewBox="0 0 32 32" fill="none" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 14.5v3" stroke="#F5A524" />
              <path d="M9.5 11.5v9" stroke="#F5A524" />
              <path d="M14 16.5l4 4L27.5 10" stroke="#ffffff" />
            </svg>
          </div>
          <div style={{ marginLeft: 36, fontSize: 112, fontWeight: 700, letterSpacing: '-0.04em', display: 'flex' }}>Acture</div>
        </div>
        <div style={{ marginTop: 56, fontSize: 64, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.05, display: 'flex' }}>Things, but it listens.</div>
        <div style={{ marginTop: 20, fontSize: 32, color: '#bdbab4', display: 'flex' }}>A calm to-do list you talk to.</div>
      </div>
    ),
    size,
  )
}
