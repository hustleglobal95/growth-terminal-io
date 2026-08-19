import React from 'react'
import { data } from '../lib/api'

/* Chart palette. These were literals for the light theme, where the accent
   was ink and the surface was white. On black the accent goes back to Signal
   Amber and the neutrals invert, so an unlit bar stays visible against the
   card instead of disappearing into it. */
const AMBER = '#FC5802', SURF = '#131110', MUTED = '#9A938B', TEXT = '#F5F1EA'
const NEUTRAL = 'rgba(255,255,255,.16)'   /* unlit bars */
const REFLINE = 'rgba(255,255,255,.30)'   /* reference line, a neutral annotation */
const HAIRLINE = 'rgba(255,255,255,.22)'

export function Spark({ series }: { series: number[] }) {
  const W = 240, H = 34, n = series.length
  const lo = Math.min(...series), hi = Math.max(...series)
  const pad = (hi - lo) * 0.18 || 1
  const x = (i: number) => (W * i) / (n - 1)
  const y = (v: number) => H - (H - 4) * ((v - lo + pad) / (hi - lo + pad * 2)) - 2
  const d = series.map((v, i) => `${x(i)},${y(v)}`).join('L')
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={`M0,${H}L${d}L${W},${H}Z`} fill={AMBER} fillOpacity={0.1} />
      <path d={`M${d}`} fill="none" stroke={AMBER} strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export function GapChart() {
  const { produced, required, months } = data.D
  const W = 460, H = 250, L = 42, R = 64, T = 14, B = 28
  const iw = W - L - R, ih = H - T - B, n = produced.length
  const lo = 1000, hi = 2800
  const x = (i: number) => L + (iw * i) / (n - 1)
  const y = (v: number) => T + ih * (1 - (v - lo) / (hi - lo))
  const line = (s: number[]) => 'M' + s.map((v, i) => `${x(i)},${y(v)}`).join('L')
  const band =
    'M' + required.map((v, i) => `${x(i)},${y(v)}`).join('L') +
    'L' + produced.map((_, i) => `${x(n - 1 - i)},${y(produced[n - 1 - i])}`).join('L') + 'Z'
  const area = `M${x(0)},${y(lo)}L` + produced.map((v, i) => `${x(i)},${y(v)}`).join('L') + `L${x(n - 1)},${y(lo)}Z`
  const mid = (y(required[n - 1]) + y(produced[n - 1])) / 2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
      aria-label="Qualified leads produced each month against the volume required">
      {[1000, 1500, 2000, 2500].map(v => (
        <g key={v}>
          <line x1={L} x2={L + iw} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 9} y={y(v) + 3.5} className="axis" textAnchor="end">{v.toLocaleString()}</text>
        </g>
      ))}
      <path d={band} fill={AMBER} fillOpacity={0.1} />
      <path d={area} fill={AMBER} fillOpacity={0.1} />
      <path d={line(produced)} fill="none" stroke={AMBER} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <path d={line(required)} fill="none" stroke={REFLINE} strokeWidth={1.5} />
      <circle cx={x(n - 1)} cy={y(produced[n - 1])} r={4.5} fill={AMBER} stroke={SURF} strokeWidth={2} />
      <text x={x(n - 1) + 10} y={y(produced[n - 1]) + 4} className="axis" fill={TEXT}>{produced[n - 1].toLocaleString()}</text>
      <text x={x(n - 1) + 10} y={y(required[n - 1]) + 4} className="axis">{required[n - 1].toLocaleString()}</text>
      <text x={x(n - 1) - 8} y={mid + 4} className="axis" fill={MUTED} textAnchor="end">807 short</text>
      <text x={L} y={H - 8} className="axis">{months[0]}</text>
      <text x={L + iw} y={H - 8} className="axis" textAnchor="end">{months[n - 1]}</text>
    </svg>
  )
}

export function OvBars() {
  const vals = [1, 2, 3, 2, 4, 3, 5, 6, 4, 5, 6, 6]
  const W = 460, H = 190, L = 30, B = 26, T = 12
  const iw = W - L - 12, ih = H - T - B, max = 7
  const bw = Math.min(24, iw / vals.length - 8)
  const mo = ['S', 'O', 'N', 'D', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A']
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Analyses run per month">
      {[0, 2, 4, 6].map(v => {
        const yy = T + ih * (1 - v / max)
        return (
          <g key={v}>
            <line x1={L} x2={L + iw} y1={yy} y2={yy} className="grid" />
            <text x={L - 8} y={yy + 3.5} className="axis" textAnchor="end">{v}</text>
          </g>
        )
      })}
      {vals.map((v, i) => {
        const xx = L + (iw * (i + 0.5)) / vals.length - bw / 2
        const yy = T + ih * (1 - v / max)
        return (
          <g key={i}>
            <path d={`M${xx},${T + ih} L${xx},${yy + 4} Q${xx},${yy} ${xx + 4},${yy} L${xx + bw - 4},${yy} Q${xx + bw},${yy} ${xx + bw},${yy + 4} L${xx + bw},${T + ih} Z`}
              fill={i === vals.length - 1 ? AMBER : NEUTRAL} />
            <text x={xx + bw / 2} y={H - 8} className="axis" textAnchor="middle">{mo[i]}</text>
          </g>
        )
      })}
    </svg>
  )
}

export function Gantt({ open }: { open: number }) {
  const W = 900, H = 224, L = 8, R = 8, T = 30, rowH = 26, barH = 13
  const iw = W - L - R
  const wk = (w: number) => L + (iw * (w - 1)) / 12
  const BARS: [number, number, number, string][] = [
    [1, 1, 2, 'Quantify the demand gap'], [2, 3, 4, 'Audit existing sources'],
    [3, 5, 6, 'Select net new channels'], [4, 7, 8, 'Stand up the demand engine'],
    [5, 9, 10, 'Protect lead quality'], [6, 11, 12, 'Measure against target']
  ]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Twelve week schedule of the six phases with decision gates">
      {Array.from({ length: 13 }, (_, k) => k + 1).map(w => (
        <g key={w}>
          <line x1={wk(w)} x2={wk(w)} y1={T - 8} y2={T + 6 * rowH - 4} className="grid" />
          {w < 13 && <text x={wk(w) + 6} y={T - 14} className="axis">Week {w}</text>}
        </g>
      ))}
      {BARS.map((b, i) => {
        const yTop = T + i * rowH
        const x0 = wk(b[1]) + 2, x1 = wk(b[2] + 1) - 2
        const on = b[0] === open
        return (
          <g key={b[0]}>
            <rect x={x0} y={yTop} width={Math.max(6, x1 - x0)} height={barH} rx={4}
              fill={on ? AMBER : NEUTRAL} />
            <text x={x0 + 10} y={yTop + barH + 13} className="axis" fill={on ? TEXT : MUTED}>{b[0]}. {b[3]}</text>
          </g>
        )
      })}
      {[[3, 'Gate 1'], [5, 'Gate 2'], [11, 'Gate 3']].map(([w, lb]) => (
        <g key={lb as string}>
          <line x1={wk(w as number)} x2={wk(w as number)} y1={T - 6} y2={T + 6 * rowH - 6}
            stroke={HAIRLINE} strokeWidth={1} />
          <circle cx={wk(w as number)} cy={T - 6} r={3.5} fill={AMBER} stroke={SURF} strokeWidth={2} />
          <text x={wk(w as number) + 6} y={T + 6 * rowH + 6} className="axis" fill={MUTED}>{lb}</text>
        </g>
      ))}
    </svg>
  )
}

export function SevSegs({ n, total = 10 }: { n: number; total?: number }) {
  return (
    <div className="segs">
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < n ? 'f' : ''} />)}
    </div>
  )
}
