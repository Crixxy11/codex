// Gráficas SVG propias: área suavizada, calendario de actividad,
// reloj radial de horas, donut y barras de pétalo para días de semana.
import { useMemo } from 'react'
import { area, line, curveMonotoneX } from 'd3-shape'
import { scaleLinear } from 'd3-scale'

// ---------- área suavizada (minutos por día) ----------

export function SmoothArea({
  data,
  height = 130,
}: {
  data: { day: string; minutes: number }[]
  height?: number
}) {
  const W = 640
  const H = height
  const pad = 6
  const { areaPath, linePath, lastX, lastY } = useMemo(() => {
    const max = Math.max(10, ...data.map((d) => d.minutes))
    const x = scaleLinear([0, data.length - 1], [pad, W - pad])
    const y = scaleLinear([0, max], [H - pad, pad + 12])
    const a = area<{ minutes: number }>()
      .x((_, i) => x(i))
      .y0(H - pad)
      .y1((d) => y(d.minutes))
      .curve(curveMonotoneX)
    const l = line<{ minutes: number }>()
      .x((_, i) => x(i))
      .y((d) => y(d.minutes))
      .curve(curveMonotoneX)
    return {
      areaPath: a(data) ?? '',
      linePath: l(data) ?? '',
      lastX: x(data.length - 1),
      lastY: y(data[data.length - 1]?.minutes ?? 0),
    }
  }, [data, H])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <linearGradient id="areaG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#areaG)" />
      <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="4" fill="var(--accent)" />
      <circle cx={lastX} cy={lastY} r="8" fill="var(--accent)" opacity="0.25" />
    </svg>
  )
}

// ---------- sparkline ----------

export function Sparkline({ values, width = 90, height = 26 }: { values: number[]; width?: number; height?: number }) {
  const path = useMemo(() => {
    if (values.length < 2) return ''
    const max = Math.max(1, ...values)
    const x = scaleLinear([0, values.length - 1], [2, width - 2])
    const y = scaleLinear([0, max], [height - 2, 2])
    const l = line<number>()
      .x((_, i) => x(i))
      .y((d) => y(d))
      .curve(curveMonotoneX)
    return l(values) ?? ''
  }, [values, width, height])
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
    </svg>
  )
}

// ---------- calendario de actividad (16 semanas) ----------

export function ActivityCalendar({ data }: { data: Map<string, number> }) {
  const weeks = 16
  const cell = 13
  const gap = 3.5
  const W = weeks * (cell + gap)
  const H = 7 * (cell + gap)
  const max = Math.max(15, ...data.values())

  const cells = useMemo(() => {
    const out: { x: number; y: number; v: number; key: string }[] = []
    const today = new Date()
    today.setHours(12, 0, 0, 0)
    const monday = new Date(today)
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      if (d > today) continue
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const v = data.get(k) ?? 0
      const row = (d.getDay() + 6) % 7
      const weeksAgo = Math.round((monday.getTime() - (d.getTime() - row * 86400_000)) / (7 * 86400_000))
      const col = weeks - 1 - weeksAgo
      if (col < 0) continue
      out.push({ x: col * (cell + gap), y: row * (cell + gap), v, key: k })
    }
    return out
  }, [data])

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      {cells.map((c) => {
        const t = c.v / max
        const opacity = c.v === 0 ? 0.12 : 0.25 + 0.75 * Math.min(1, t)
        return (
          <rect
            key={c.key}
            x={c.x}
            y={c.y}
            width={cell}
            height={cell}
            rx={4}
            fill={c.v === 0 ? 'var(--ink-faint)' : 'var(--accent)'}
            opacity={opacity}
          >
            <title>{`${c.key}: ${c.v} min`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

// ---------- reloj radial de horas ----------

export function HourClock({ values }: { values: number[] }) {
  const size = 240
  const cx = size / 2
  const cy = size / 2
  const r0 = 42
  const r1 = 108
  const max = Math.max(1, ...values)

  const segs = values.map((v, h) => {
    const a0 = ((h - 6) / 24) * Math.PI * 2 + 0.012
    const a1 = ((h + 1 - 6) / 24) * Math.PI * 2 - 0.012
    const rr = r0 + (r1 - r0) * Math.pow(v / max, 0.7)
    const p = (a: number, r: number) => [cx + Math.cos(a) * r, cy + Math.sin(a) * r]
    const [x0, y0] = p(a0, r0)
    const [x1, y1] = p(a0, rr)
    const [x2, y2] = p(a1, rr)
    const [x3, y3] = p(a1, r0)
    return {
      d: `M${x0},${y0} L${x1},${y1} A${rr},${rr} 0 0 1 ${x2},${y2} L${x3},${y3} A${r0},${r0} 0 0 0 ${x0},${y0}Z`,
      v,
      h,
    }
  })

  return (
    <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', maxWidth: 270, height: 'auto', display: 'block', margin: '0 auto' }}>
      <circle cx={cx} cy={cy} r={r0 - 6} fill="none" stroke="var(--line)" strokeWidth="1" />
      {segs.map((s) => (
        <path key={s.h} d={s.d} fill="var(--accent)" opacity={s.v === 0 ? 0.1 : 0.25 + 0.75 * (s.v / max)}>
          <title>{`${s.h}:00 — ${Math.round(s.v / 60000)} min`}</title>
        </path>
      ))}
      {[0, 6, 12, 18].map((h) => {
        const a = ((h - 6) / 24) * Math.PI * 2 + (Math.PI / 24)
        const x = cx + Math.cos(a) * (r1 + 14)
        const y = cy + Math.sin(a) * (r1 + 14)
        return (
          <text key={h} x={x} y={y + 3} textAnchor="middle" fontSize="10" fill="var(--ink-faint)">
            {h}h
          </text>
        )
      })}
    </svg>
  )
}

// ---------- pétalos para días de la semana ----------

export function WeekdayPetals({ values, labels }: { values: number[]; labels: string[] }) {
  const W = 320
  const H = 120
  const max = Math.max(1, ...values)
  const bw = 30
  const gap = (W - 7 * bw) / 8
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 360, height: 'auto', display: 'block' }}>
      {values.map((v, i) => {
        const h = 8 + (H - 42) * (v / max)
        const x = gap + i * (bw + gap)
        return (
          <g key={i}>
            <rect
              x={x}
              y={H - 26 - h}
              width={bw}
              height={h}
              rx={bw / 2}
              fill="var(--accent)"
              opacity={v === 0 ? 0.12 : 0.3 + 0.7 * (v / max)}
            >
              <title>{`${labels[i]}: ${Math.round(v / 60000)} min`}</title>
            </rect>
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="10.5" fill="var(--ink-faint)">
              {labels[i]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ---------- donut TTS vs visual ----------

export function Donut({ fraction, labelA, labelB }: { fraction: number; labelA: string; labelB: string }) {
  const size = 150
  const r = 56
  const c = 2 * Math.PI * r
  const f = Math.min(1, Math.max(0, fraction))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={120} height={120}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth="15" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="15"
          strokeLinecap="round"
          strokeDasharray={`${c * f} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text x={size / 2} y={size / 2 + 5} textAnchor="middle" fontSize="22" fontFamily="var(--font-display)" fill="var(--ink)">
          {Math.round(f * 100)}%
        </text>
      </svg>
      <div style={{ fontSize: 13, color: 'var(--ink-soft)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: 'var(--accent)', marginRight: 7 }} />{labelA}</span>
        <span><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 5, background: 'var(--line)', marginRight: 7 }} />{labelB}</span>
      </div>
    </div>
  )
}
