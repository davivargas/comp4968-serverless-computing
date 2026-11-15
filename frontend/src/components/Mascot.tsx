import { cn } from '@/lib/utils'

// Pupils stay dark and eye whites stay white in both themes, so the face reads the same on a dark card.
const INK = '#0f172a'
const pivot = { transformBox: 'view-box', transformOrigin: '32px 42px' } as const
const own = { transformBox: 'fill-box', transformOrigin: 'center' } as const
const bellBase = { transformBox: 'fill-box', transformOrigin: '50% 100%' } as const
// Colours fade slowly, so Tick turns red gradually when it gets angry.
const fade = 'transition-[fill,stroke,opacity] duration-[2500ms]'

/**
 * Tick, the Timely mascot: an alarm clock with googly eyes.
 * - `still`: the logo.
 * - `idle`: blinks and glances around, for the corner buddy.
 * - `busy`: also spins its hands, jiggles its bells and raises its brows in time with the pogo hop, for loaders.
 * - `angry`: turns red, frowns with its hands, scowls and rings its bells hard. Used by the buddy's time-out easter egg.
 * Every animation is motion-safe, so reduced-motion users always get a still face.
 */
export type MascotMode = 'still' | 'idle' | 'busy' | 'angry'

export default function Mascot({ className = 'size-12', mode = 'still', label = 'Tick, the Timely clock' }: { className?: string; mode?: MascotMode; label?: string }) {
  const angry = mode === 'angry'
  const busy = (cls: string) => (mode === 'busy' ? cls : undefined)
  const face = (cls: string) => (mode === 'idle' || mode === 'busy' ? cls : undefined)
  const fill = cn(angry ? 'fill-red-600' : 'fill-primary', fade)
  const stroke = cn(angry ? 'stroke-red-600' : 'stroke-primary', fade)
  // 10:10 reads as a smile; 8:20 is the frown.
  const hand = (deg: number) => ({ ...pivot, rotate: `${deg}deg`, transition: 'rotate 1.2s ease-in-out' })
  return (
    <svg viewBox="0 0 64 64" className={cn('overflow-visible', className)} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })} fill="none">
      {/* Alarm bells: the outer group places each bell, the inner one jiggles (a CSS transform would replace the attribute). */}
      {[{ x: 15, r: -38 }, { x: 49, r: 38 }].map(({ x, r }) => (
        <g key={x} transform={`translate(${x} 14) rotate(${r})`}>
          <g className={angry ? 'motion-safe:animate-[bell_0.35s_linear_infinite]' : busy('motion-safe:animate-bell')} style={bellBase}>
            <path d="M-7 3 A7 7 0 0 1 7 3 Z" className={fill} />
            <circle cx="0" cy="-5.5" r="1.6" className={fill} />
          </g>
        </g>
      ))}
      {/* Legs and feet */}
      <path d="M25.5 55 L23.5 60.5 M38.5 55 L40.5 60.5" className={stroke} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="22.5" cy="61.3" rx="5" ry="2.2" className={fill} />
      <ellipse cx="41.5" cy="61.3" rx="5" ry="2.2" className={fill} />
      {/* Face */}
      <circle cx="32" cy="35" r="22" className={cn(angry ? 'fill-red-100 dark:fill-red-950' : 'fill-card', stroke)} strokeWidth="3.5" />
      <path d="M13 35h3 M48 35h3 M32 51v3" className="stroke-muted-foreground" strokeWidth="2" strokeLinecap="round" />
      <circle cx="19.5" cy="38" r="2.6" fill="#fb7185" className={fade} opacity={angry ? 0.9 : 0.35} />
      <circle cx="44.5" cy="38" r="2.6" fill="#fb7185" className={fade} opacity={angry ? 0.9 : 0.35} />
      {/* Hands sit under the eyes. The outer group sets the time, the inner line spins while busy. */}
      <g style={hand(angry ? 238 : -55)}>
        <line x1="32" y1="42" x2="32" y2="36.5" className={cn('stroke-foreground', busy('motion-safe:animate-spin'))} strokeWidth="2.6" strokeLinecap="round" style={{ ...pivot, animationDuration: '6s' }} />
      </g>
      <g style={hand(angry ? 120 : 60)}>
        <line x1="32" y1="42" x2="32" y2="34.5" className={cn(stroke, busy('motion-safe:animate-spin'))} strokeWidth="2" strokeLinecap="round" style={{ ...pivot, animationDuration: '1s' }} />
      </g>
      <circle cx="32" cy="42" r="2" className="fill-foreground" />
      {/* Eyebrows: arched and friendly, or slanted down into a scowl */}
      <g className={busy('motion-safe:animate-brows')}>
        <path d={angry ? 'M19.5 17 Q24.5 18 29.5 21.5 M34.5 21.5 Q39.5 18 44.5 17' : 'M20 19 Q24.5 16 29 18.5 M35 18.5 Q39.5 16 44 19'}
          className={angry ? 'stroke-red-900 dark:stroke-red-300' : 'stroke-foreground'} strokeWidth={angry ? 2.6 : 2} strokeLinecap="round" />
      </g>
      {/* Eyes */}
      {[25, 39].map((cx) => {
        const inward = cx < 32 ? 1 : -1
        return (
          <g key={cx} className={face('motion-safe:animate-blink')} style={own}>
            <ellipse cx={cx} cy="27" rx="5" ry="6" fill="#fff" stroke={INK} strokeWidth="1.5" />
            <g className={face('motion-safe:animate-glance')}>
              {/* Angry pupils shrink and glare towards the middle. */}
              <circle cx={angry ? cx + 1.6 * inward : cx + 1.2} cy="27.8" r={angry ? 2 : 2.6} fill={INK} />
              <circle cx={angry ? cx + 1.6 * inward + 0.6 : cx + 2} cy="27" r="0.7" fill="#fff" />
            </g>
          </g>
        )
      })}
    </svg>
  )
}
