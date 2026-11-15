import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import Mascot from '@/components/Mascot'
import TimeOutScene from '@/components/TimeOutScene'
import { useSession } from '@/components/auth/session-context'
import { Button } from '@/components/ui/button'
import { TIPS, randomTipIndex } from '@/lib/tips'

// Easter egg: poke Tick this many times inside the window and it gets angry and signs you out.
const RAGE_CLICKS = 10
const RAGE_WINDOW_MS = 30_000

/** Tick sits in the bottom-right corner of each portal. Click it and it hops and says a random money tip. */
export default function TipBuddy() {
  const { signOut } = useSession()
  const [tip, setTip] = useState<number | null>(null)
  // Bumped on every click so the one-shot hop replays even when the bubble is already open.
  const [hops, setHops] = useState(0)
  const [hopping, setHopping] = useState(false)
  const clicks = useRef<number[]>([])
  const [angry, setAngry] = useState(false)

  const next = () => {
    setTip((t) => randomTipIndex(t ?? undefined))
    setHops((h) => h + 1)
    setHopping(true)
  }

  const poke = () => {
    if (angry) return
    const now = Date.now()
    clicks.current = [...clicks.current.filter((t) => now - t < RAGE_WINDOW_MS), now]
    if (clicks.current.length >= RAGE_CLICKS) {
      clicks.current = []
      setTip(null)
      setAngry(true)
    } else {
      next()
    }
  }

  useEffect(() => {
    if (tip === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTip(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tip])

  return (
    <>
      {angry && <TimeOutScene clicks={RAGE_CLICKS} seconds={RAGE_WINDOW_MS / 1000} onDone={signOut} />}
      <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3 print:hidden">
        {tip !== null && !angry && (
          <div key={tip} role="status" className="relative w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-4 pr-9 text-sm text-popover-foreground shadow-lg motion-safe:animate-pop">
            <div className="mb-1 text-xs font-semibold text-primary">Tick's money tip</div>
            <p className="leading-relaxed">{TIPS[tip]}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-[11px] text-muted-foreground">General info, not financial advice.</span>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={next}>
                <RefreshCw className="size-3" /> Another
              </Button>
            </div>
            <button type="button" aria-label="Close tip" onClick={() => setTip(null)}
              className="absolute top-2 right-2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
              <X className="size-4" />
            </button>
            {/* Speech-bubble tail pointing down at Tick */}
            <span aria-hidden className="absolute -bottom-[7px] right-7 size-3 rotate-45 border-r border-b bg-popover" />
          </div>
        )}
        {/* Hidden while angry: the time-out scene walks Tick out of this corner. */}
        <button type="button" onClick={poke} disabled={angry} aria-label="Ask Tick for a money tip" title="Need a money tip?"
          className="rounded-full p-1 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:invisible">
          <div key={hops} onAnimationEnd={(e) => e.target === e.currentTarget && setHopping(false)}
            className={hopping ? 'origin-bottom drop-shadow-md motion-safe:animate-[pogo_0.9s_1]' : 'drop-shadow-md'}>
            <Mascot className="size-14" mode={hopping ? 'busy' : 'idle'} label="" />
          </div>
        </button>
      </div>
    </>
  )
}
