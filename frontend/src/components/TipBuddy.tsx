import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import Mascot from '@/components/Mascot'
import { Button } from '@/components/ui/button'
import { TIPS, randomTipIndex } from '@/lib/tips'

/** Tick sits in the bottom-right corner of each portal. Click it and it hops and says a random money tip. */
export default function TipBuddy() {
  const [tip, setTip] = useState<number | null>(null)
  // Bumped on every click so the one-shot hop replays even when the bubble is already open.
  const [hops, setHops] = useState(0)
  const [hopping, setHopping] = useState(false)

  const next = () => {
    setTip((t) => randomTipIndex(t ?? undefined))
    setHops((h) => h + 1)
    setHopping(true)
  }

  useEffect(() => {
    if (tip === null) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setTip(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tip])

  return (
    <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end gap-3 print:hidden">
      {tip !== null && (
        <div key={tip} role="status" className="relative w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-popover p-4 pr-9 text-sm text-popover-foreground shadow-lg motion-safe:animate-pop">
          <div className="mb-1 text-xs font-semibold text-primary">Tick's money tip 🇨🇦</div>
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
      <button type="button" onClick={next} aria-label="Ask Tick for a money tip" title="Need a money tip?"
        className="rounded-full p-1 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        <div key={hops} onAnimationEnd={(e) => e.target === e.currentTarget && setHopping(false)}
          className={hopping ? 'origin-bottom drop-shadow-md motion-safe:animate-[pogo_0.9s_1]' : 'drop-shadow-md'}>
          {/* Reduced motion never fires animationend, but busy mode is motion-safe too, so nothing moves either way. */}
          <Mascot className="size-14" mode={hopping ? 'busy' : 'idle'} label="" />
        </div>
      </button>
    </div>
  )
}
