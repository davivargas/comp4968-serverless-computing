/** A clock whose hands sweep round while something loads. Fits the timesheet theme; stills itself for reduced motion. */
export default function ClockLoader({ className = 'size-12' }: { className?: string }) {
  const hand = { transformOrigin: '24px 24px', transformBox: 'view-box' } as const
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Loading" fill="none">
      <circle cx="24" cy="24" r="21" className="stroke-primary" strokeWidth="3" />
      {[0, 90, 180, 270].map((deg) => (
        <line key={deg} x1="24" y1="6.5" x2="24" y2="9.5" className="stroke-muted-foreground" strokeWidth="2" strokeLinecap="round" transform={`rotate(${deg} 24 24)`} />
      ))}
      <line x1="24" y1="24" x2="24" y2="14" className="stroke-foreground motion-safe:animate-spin" strokeWidth="3" strokeLinecap="round" style={{ ...hand, animationDuration: '6s' }} />
      <line x1="24" y1="24" x2="24" y2="9" className="stroke-primary motion-safe:animate-spin" strokeWidth="2" strokeLinecap="round" style={{ ...hand, animationDuration: '1s' }} />
      <circle cx="24" cy="24" r="2.5" className="fill-foreground" />
    </svg>
  )
}
