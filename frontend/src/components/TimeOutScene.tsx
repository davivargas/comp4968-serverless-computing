import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import GlassCracks from '@/components/GlassCracks'
import Mascot from '@/components/Mascot'

const TOTAL_SECONDS = 8
// Tick headbutts the glass when this many seconds are left.
const SMASH_AT = 4
// The crack appears at the peak of the lunge, not when it starts.
const IMPACT_DELAY_MS = 260

/**
 * The easter-egg time-out: Tick marches from its corner to the middle of the screen, growing and turning red,
 * tells the user off in a speech bubble, headbutts the screen hard enough to crack it, then signs them out.
 * Rendered into <body> so nothing in the app can sit on top of it.
 */
export default function TimeOutScene({ clicks, seconds, onDone }: { clicks: number; seconds: number; onDone: () => void }) {
  const [left, setLeft] = useState(TOTAL_SECONDS)
  const lunging = left <= SMASH_AT
  const [red, setRed] = useState(false)
  // Impact point: the middle of Tick's face, measured when it hits.
  const [cracked, setCracked] = useState<{ x: number; y: number } | null>(null)
  const tick = useRef<HTMLDivElement>(null)
  // Offset from the middle of the screen to the corner buddy, so the walk starts from there.
  const [from] = useState(() => ({ x: window.innerWidth / 2 - 48, y: window.innerHeight / 2 - 48 }))

  // Mount calm, then go red a moment later so the colour fades in instead of snapping.
  // (A timer rather than requestAnimationFrame, which never fires in a background tab.)
  useEffect(() => {
    const id = setTimeout(() => setRed(true), 50)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    if (left === 0) {
      onDone()
      return
    }
    const id = setTimeout(() => setLeft(left - 1), 1000)
    return () => clearTimeout(id)
  }, [left, onDone])

  useEffect(() => {
    if (left !== SMASH_AT) return
    const id = setTimeout(() => {
      // Layout position, not getBoundingClientRect: offsets ignore the walk-in and lunge transforms,
      // so this is where Tick ends up even if an animation is running late.
      // The offset parent is the full-screen layer, so these are viewport coordinates.
      const el = tick.current
      // The face is the circle a little above the middle of the mascot (its feet hang below).
      setCracked(el ? { x: el.offsetLeft + el.offsetWidth / 2, y: el.offsetTop + el.offsetHeight * 0.55 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 })
    }, IMPACT_DELAY_MS)
    return () => clearTimeout(id)
  }, [left])

  return createPortal(
    <div role="alertdialog" aria-modal="true" aria-labelledby="time-out-title" className="fixed inset-0 z-[100] overflow-hidden">
      <div className="absolute inset-0 bg-red-700/25 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-1000" />
      {/* The whole scene jolts when Tick hits the glass. */}
      <div className={cracked ? 'absolute inset-0 motion-safe:animate-jolt' : 'absolute inset-0'}>
        <div className="flex h-full flex-col items-center justify-center gap-6 px-4">
          {/* Comic speech bubble with its tail pointing down at Tick */}
          <div className="relative w-full max-w-sm rounded-[28px] border-[3px] border-red-600 bg-white px-6 py-5 text-center text-slate-900 shadow-2xl motion-safe:animate-[pop_0.3s_ease-out_2.2s_both]">
            <h2 id="time-out-title" className="text-lg font-black tracking-wide text-red-600 uppercase">Okay, that's enough!</h2>
            <p className="mt-2 text-sm leading-relaxed font-medium">
              {clicks} pokes in {seconds} seconds? I'm a clock, not a stress ball. You're clearly just playing with me, so I'm giving you a <strong>time out</strong>.
            </p>
            <p className="mt-3 text-sm font-bold text-red-600" aria-live="assertive">
              {left > 0 ? `Signing you out in ${left}…` : 'Bye!'}
            </p>
            <span aria-hidden className="absolute -bottom-[13px] left-1/2 size-6 -translate-x-1/2 rotate-45 rounded-br-md border-r-[3px] border-b-[3px] border-red-600 bg-white" />
          </div>
          {/* Walks in from the bottom-right corner while growing. */}
          <div ref={tick} className="motion-safe:animate-march" style={{ '--from-x': `${from.x}px`, '--from-y': `${from.y}px` } as CSSProperties}>
            <div className={lunging ? 'motion-safe:animate-lunge' : 'motion-safe:animate-shake'}>
              <Mascot className="size-[min(240px,34vh)] drop-shadow-[0_20px_30px_rgb(0_0_0/0.4)]" mode={red ? 'angry' : 'idle'} label="Tick, very angry" />
            </div>
          </div>
        </div>
      </div>
      {cracked && (
        <>
          <GlassCracks x={cracked.x} y={cracked.y} />
          <div aria-hidden className="pointer-events-none absolute inset-0 bg-white motion-safe:animate-flash opacity-0" />
        </>
      )}
    </div>,
    document.body,
  )
}
