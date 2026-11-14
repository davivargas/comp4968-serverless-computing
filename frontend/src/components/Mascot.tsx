import { cn } from '@/lib/utils'

// Pupils stay dark and eye whites stay white in both themes, so the face reads the same on a dark card.
const INK = '#0f172a'
const pivot = { transformBox: 'view-box', transformOrigin: '32px 42px' } as const
const own = { transformBox: 'fill-box', transformOrigin: 'center' } as const
const bellBase = { transformBox: 'fill-box', transformOrigin: '50% 100%' } as const

/**
 * Tick, the Timely mascot: an alarm clock with googly eyes.
 * - `still`: the logo.
 * - `idle`: blinks and glances around, for the corner buddy.
 * - `busy`: also spins its hands, jiggles its bells and raises its brows in time with the pogo hop, for loaders.
 * Every animation is motion-safe, so reduced-motion users always get the still logo.
 */
export type MascotMode = 'still' | 'idle' | 'busy'

export default function Mascot({ className = 'size-12', mode = 'still', label = 'Tick, the Timely clock' }: { className?: string; mode?: MascotMode; label?: string }) {
  const a = (cls: string) => (mode === 'busy' ? cls : undefined)
  const face = (cls: string) => (mode === 'still' ? undefined : cls)
  return (
    <svg viewBox="0 0 64 64" className={cn('overflow-visible', className)} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} fill="none">
      {/* Alarm bells: the outer group places each bell, the inner one jiggles (a CSS transform would replace the attribute). */}
      {[{ x: 15, r: -38 }, { x: 49, r: 38 }].map(({ x, r }) => (
        <g key={x} transform={`translate(${x} 14) rotate(${r})`}>
          <g className={a('motion-safe:animate-bell')} style={bellBase}>
            <path d="M-7 3 A7 7 0 0 1 7 3 Z" className="fill-primary" />
            <circle cx="0" cy="-5.5" r="1.6" className="fill-primary" />
          </g>
        </g>
      ))}
      {/* Legs and feet */}
      <path d="M25.5 55 L23.5 60.5 M38.5 55 L40.5 60.5" className="stroke-primary" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="22.5" cy="61.3" rx="5" ry="2.2" className="fill-primary" />
      <ellipse cx="41.5" cy="61.3" rx="5" ry="2.2" className="fill-primary" />
      {/* Face */}
      <circle cx="32" cy="35" r="22" className="fill-card stroke-primary" strokeWidth="3.5" />
      <path d="M13 35h3 M48 35h3 M32 51v3" className="stroke-muted-foreground" strokeWidth="2" strokeLinecap="round" />
      <circle cx="19.5" cy="38" r="2.6" fill="#fb7185" opacity="0.35" />
      <circle cx="44.5" cy="38" r="2.6" fill="#fb7185" opacity="0.35" />
      {/* Hands, set to 10:10 so they read as a smile. They sit under the eyes. */}
      <g transform="rotate(-55 32 42)">
        <line x1="32" y1="42" x2="32" y2="36.5" className={cn('stroke-foreground', a('motion-safe:animate-spin'))} strokeWidth="2.6" strokeLinecap="round" style={{ ...pivot, animationDuration: '6s' }} />
      </g>
      <g transform="rotate(60 32 42)">
        <line x1="32" y1="42" x2="32" y2="34.5" className={cn('stroke-primary', a('motion-safe:animate-spin'))} strokeWidth="2" strokeLinecap="round" style={{ ...pivot, animationDuration: '1s' }} />
      </g>
      <circle cx="32" cy="42" r="2" className="fill-foreground" />
      {/* Eyebrows */}
      <g className={a('motion-safe:animate-brows')}>
        <path d="M20 19 Q24.5 16 29 18.5 M35 18.5 Q39.5 16 44 19" className="stroke-foreground" strokeWidth="2" strokeLinecap="round" />
      </g>
      {/* Eyes */}
      {[25, 39].map((cx) => (
        <g key={cx} className={face('motion-safe:animate-blink')} style={own}>
          <ellipse cx={cx} cy="27" rx="5" ry="6" fill="#fff" stroke={INK} strokeWidth="1.5" />
          <g className={face('motion-safe:animate-glance')}>
            <circle cx={cx + 1.2} cy="27.8" r="2.6" fill={INK} />
            <circle cx={cx + 2} cy="26.9" r="0.8" fill="#fff" />
          </g>
        </g>
      ))}
    </svg>
  )
}
