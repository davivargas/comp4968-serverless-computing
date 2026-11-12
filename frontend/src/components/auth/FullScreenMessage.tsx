import type { ReactNode } from 'react'
import ClockLoader from '@/components/ClockLoader'

export default function FullScreenMessage({ title, loading, children }: { title: string; loading?: boolean; children?: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center px-6" aria-busy={loading || undefined}>
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        {loading && (
          <div className="mb-6 flex flex-col items-center">
            {/* The hop lives on a wrapper so it doesn't fight the hands' own spin animation. */}
            {/* A dark shadow disappears on the dark background, so dark mode uses a faint cyan glow instead. */}
            <div className="origin-bottom drop-shadow-[0_10px_14px_rgb(0_0_0/0.28)] motion-safe:animate-pogo dark:drop-shadow-[0_8px_18px_rgb(0_146_184/0.45)]">
              <ClockLoader className="size-20" />
            </div>
            {/* Floor shadow: shrinks and fades as the clock rises. */}
            <div className="mt-2 h-2.5 w-16 rounded-[50%] bg-black/25 blur-[3px] motion-safe:animate-pogo-shadow dark:bg-primary/45" />
          </div>
        )}
        <h1 className="text-lg font-semibold">{title}</h1>
        {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
      </div>
    </div>
  )
}
