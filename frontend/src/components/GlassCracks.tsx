import { useState } from 'react'

type Pt = [number, number]
type Ray = { r: number; a: number }[]

interface Cracks {
  rays: string[]
  rings: { d: string; ring: number }[]
  branches: string[]
  shards: { d: string; opacity: number }[]
}

const rand = (min: number, max: number) => min + Math.random() * (max - min)
const path = (pts: Pt[]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')

/** Angle of a ray at radius `r`, interpolated between its sampled points. */
function angleAt(ray: Ray, r: number) {
  for (let i = 1; i < ray.length; i++) {
    if (ray[i].r >= r) {
      const t = (r - ray[i - 1].r) / (ray[i].r - ray[i - 1].r)
      return ray[i - 1].a + t * (ray[i].a - ray[i - 1].a)
    }
  }
  return null // the ray stops short of this radius
}

/**
 * A spider-web fracture like a phone screen that's been hit: jagged rays wander out from the impact point,
 * broken rings join them, a few rays fork, and some of the glass between them catches the light.
 */
function makeCracks(w: number, h: number, cx: number, cy: number): Cracks {
  const at = (a: number, r: number): Pt => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + 40
  const count = Math.round(rand(11, 15))
  const start = rand(0, Math.PI * 2)

  const rays: Ray[] = Array.from({ length: count }, (_, i) => {
    // About a third of the rays give out partway; the rest run off the edge of the screen.
    const length = Math.random() < 0.3 ? rand(160, reach * 0.6) : reach
    let a = start + (i * Math.PI * 2) / count + rand(-0.2, 0.2)
    const ray: Ray = [{ r: 0, a }]
    for (let r = rand(6, 14); r < length; r += rand(18, 46)) {
      a += rand(-0.08, 0.08)
      ray.push({ r, a })
    }
    return ray
  })

  const radii = [rand(16, 24), rand(40, 55), rand(75, 100), rand(130, 170), rand(210, 270)]
  const rings: Cracks['rings'] = []
  const shards: Cracks['shards'] = []
  // Which ring segments were drawn, by ring then by ray, so shards only fill closed cells.
  const joined: boolean[][] = radii.map(() => [])

  radii.forEach((R, k) => {
    for (let i = 0; i < count; i++) {
      const a1 = angleAt(rays[i], R)
      const a2 = angleAt(rays[(i + 1) % count], R)
      // Outer rings break up more, like real glass.
      if (a1 === null || a2 === null || Math.random() < 0.08 + k * 0.14) continue
      let b = a2
      if (b < a1) b += Math.PI * 2
      const mid = at((a1 + b) / 2 + rand(-0.05, 0.05), R * rand(0.9, 1.12))
      rings.push({ d: path([at(a1, R), mid, at(b, R)]), ring: k })
      joined[k][i] = true
    }
  })

  // Light catching the broken glass: the crushed centre is brightest, outer shards only glint.
  for (let i = 0; i < count; i++) {
    const n = (i + 1) % count
    const a1 = angleAt(rays[i], radii[0])
    const a2 = angleAt(rays[n], radii[0])
    if (a1 !== null && a2 !== null) shards.push({ d: path([[cx, cy], at(a1, radii[0]), at(a2, radii[0])]) + 'Z', opacity: rand(0.15, 0.35) })
    for (let k = 0; k < radii.length - 1; k++) {
      if (!joined[k][i] || !joined[k + 1][i] || Math.random() < 0.35) continue
      const p = [angleAt(rays[i], radii[k]), angleAt(rays[n], radii[k]), angleAt(rays[n], radii[k + 1]), angleAt(rays[i], radii[k + 1])]
      if (p.some((v) => v === null)) continue
      const [q1, q2, q3, q4] = p as number[]
      shards.push({ d: path([at(q1, radii[k]), at(q2, radii[k]), at(q3, radii[k + 1]), at(q4, radii[k + 1])]) + 'Z', opacity: rand(0.02, 0.1) })
    }
  }

  // Forks splitting off the longer rays
  const branches: string[] = []
  rays.forEach((ray) => {
    const end = ray[ray.length - 1].r
    for (let b = 0; b < (end > 300 ? 2 : 1); b++) {
      const from = rand(50, Math.min(end, 320))
      const a0 = angleAt(ray, from)
      if (a0 === null) continue
      let [x, y] = at(a0, from)
      let a = a0 + (Math.random() < 0.5 ? -1 : 1) * rand(0.35, 0.7)
      const pts: Pt[] = [[x, y]]
      for (let len = 0, total = rand(50, 200); len < total; len += 20) {
        a += rand(-0.15, 0.15)
        x += 20 * Math.cos(a)
        y += 20 * Math.sin(a)
        pts.push([x, y])
      }
      branches.push(path(pts))
    }
  })

  return { rays: rays.map((ray) => path(ray.map(({ r, a }) => at(a, r)))), rings, branches, shards }
}

/** Every crack is drawn twice: a soft dark edge underneath and a bright line on top, like light catching broken glass. */
function Crack({ d, width, delay }: { d: string; width: number; delay: number }) {
  const draw = { animationDelay: `${delay}ms` }
  return (
    <>
      <path d={d} pathLength={1} stroke="rgb(0 0 0 / 0.45)" strokeWidth={width + 1.6} className="crack" style={draw} transform="translate(0.8 0.8)" />
      <path d={d} pathLength={1} stroke="rgb(255 255 255 / 0.9)" strokeWidth={width} className="crack" style={draw} />
    </>
  )
}

/** Full-screen cracked glass, centred on the impact point. Generated once per mount so no two smashes look alike. */
export default function GlassCracks({ x, y }: { x: number; y: number }) {
  const [{ w, h, cracks }] = useState(() => {
    const w = window.innerWidth
    const h = window.innerHeight
    return { w, h, cracks: makeCracks(w, h, x, y) }
  })
  return (
    <svg aria-hidden className="pointer-events-none fixed inset-0 size-full" viewBox={`0 0 ${w} ${h}`} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <defs>
        <radialGradient id="impact">
          <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {cracks.shards.map((s, i) => (
        <path key={i} d={s.d} fill="#fff" fillOpacity={s.opacity} className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300" />
      ))}
      <circle cx={x} cy={y} r="34" fill="url(#impact)" />
      {cracks.rays.map((d, i) => <Crack key={i} d={d} width={1.3} delay={0} />)}
      {cracks.rings.map(({ d, ring }, i) => <Crack key={i} d={d} width={Math.max(0.6, 1.2 - ring * 0.15)} delay={90 + ring * 60} />)}
      {cracks.branches.map((d, i) => <Crack key={i} d={d} width={0.8} delay={180} />)}
    </svg>
  )
}
