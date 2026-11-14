import { useEffect, useState, type ReactNode } from 'react'
import Mascot from '@/components/Mascot'
import { TIPS, randomTipIndex } from '@/lib/tips'

const TIP_MS = 7000

/** A random money tip from Tick that changes every few seconds while a page loads. */
function LoadingTip() {
  const [tip, setTip] = useState(() => randomTipIndex())
  useEffect(() => {
    const id = setInterval(() => setTip((t) => randomTipIndex(t)), TIP_MS)
    return () => clearInterval(id)
  }, [])
  return (
    // A fixed minimum height keeps the title from jumping as longer and shorter tips swap in.
    <div className="relative mt-6 flex min-h-28 w-full flex-col justify-center rounded-xl border bg-card px-5 py-4 text-left shadow-xs">
      <span aria-hidden className="absolute -top-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-t border-l bg-card" />
      <div className="mb-1 text-xs font-semibold text-primary">Tick's money tip</div>
      <p key={tip} className="text-sm leading-relaxed text-muted-foreground motion-safe:animate-pop">{TIPS[tip]}</p>
    </div>
  )
}

export default function FullScreenMessage({ title, loading, children }: { title: string; loading?: boolean; children?: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-6" aria-busy={loading || undefined}>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        {loading && (
          <div className="mb-6 flex flex-col items-center">
            {/* The hop lives on a wrapper so it doesn't fight the mascot's own animations. */}
            {/* A dark shadow disappears on the dark background, so dark mode uses a faint cyan glow instead. */}
            <div className="origin-bottom drop-shadow-[0_10px_14px_rgb(0_0_0/0.28)] motion-safe:animate-pogo dark:drop-shadow-[0_8px_18px_rgb(0_146_184/0.45)]">
              <Mascot className="size-24" mode="busy" label="Loading" />
            </div>
            {/* Floor shadow: shrinks and fades as the clock rises. */}
            <div className="mt-1 h-2.5 w-16 rounded-[50%] bg-black/25 blur-[3px] motion-safe:animate-pogo-shadow dark:bg-primary/45" />
          </div>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
        {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
        {loading && <LoadingTip />}
      </div>
    </div>
  )
}
