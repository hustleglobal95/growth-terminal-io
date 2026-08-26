/**
 * Cohort retention, on screen.
 *
 * Two components. The heatmap is the whole matrix; the curve is the shape of
 * the drop-off. Both are built on one rule that most retention charts break:
 *
 *   A cell that has not been watched long enough is drawn as unobserved, not
 *   as zero. A young cohort showing 0% at day ninety is the commonest lie in
 *   this kind of report, and it is the one a reader is least equipped to spot,
 *   because an empty cell and a bad cell look identical once they are both
 *   pale.
 *
 * The palette is the portal's: one accent, hairlines, tabular figures. The
 * heat is the accent's own alpha ramp rather than a second hue, so the table
 * still reads as part of the product.
 */

import React, { useMemo, useState } from 'react'
import type { RetentionMatrix, RollingPoint, Cell } from '../lib/retention'

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

const pct = (x: number | null, places = 1): string =>
  x === null ? 'no reading' : (x * 100).toFixed(places) + '%'

const shortCohort = (iso: string): string => {
  const [y, m, d] = iso.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const label = months[Number(m) - 1] ?? m
  return d === '01' ? `${label} ${y}` : `${label} ${Number(d)}`
}

/** The accent's alpha ramp. A rate is compared against the best observed cell
 *  in the same column rather than against 1.0, because every retention table
 *  is dark on the right otherwise and the shape stops being readable. */
function heat(rate: number | null, columnMax: number): { bg: string; fg: string } {
  if (rate === null) return { bg: 'transparent', fg: 'var(--faint)' }
  const t = columnMax > 0 ? Math.max(0, Math.min(1, rate / columnMax)) : 0
  const a = 0.05 + t * 0.5
  return { bg: `rgba(249,115,22,${a.toFixed(3)})`, fg: a > 0.38 ? '#3A1C05' : 'var(--text)' }
}

/* ------------------------------------------------------------------ */
/* Heatmap                                                             */
/* ------------------------------------------------------------------ */

export interface HeatmapProps {
  matrix: RetentionMatrix
  /** Rolling shows the share still returning on or after the period. */
  mode?: 'bounded' | 'rolling'
  /** Cohorts below this are dimmed and excluded from the column maxima. */
  minCohortSize?: number
  onSelectCohort?: (cohort: string) => void
}

export function RetentionHeatmap({
  matrix, mode = 'bounded', minCohortSize = 20, onSelectCohort,
}: HeatmapProps) {
  const [hover, setHover] = useState<{ cohort: string; cell: Cell } | null>(null)

  const rateOf = (c: Cell) => (mode === 'rolling' ? c.rollingRate : c.rate)
  const countOf = (c: Cell) => (mode === 'rolling' ? c.rolling : c.retained)

  /* One maximum per column, over the cells that are both observable and from a
     cohort big enough to be trusted. */
  const columnMax = useMemo(() => {
    const out = new Map<number, number>()
    for (const p of matrix.checkpoints) {
      let m = 0
      for (const row of matrix.cohorts) {
        if (row.size < minCohortSize) continue
        const cell = row.cells.find(c => c.period === p)
        const r = cell ? rateOf(cell) : null
        if (r !== null && r > m) m = r
      }
      out.set(p, m)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matrix, mode, minCohortSize])

  const unit = matrix.period === 'day' ? 'D' : matrix.period === 'week' ? 'W' : 'M'
  const unobserved = matrix.cohorts.reduce(
    (n, r) => n + r.cells.filter(c => !c.observable).length, 0)

  return (
    <div className="rtwrap">
      <div className="rtscroll">
        <table className="rtmap">
          <thead>
            <tr>
              <th className="rtc">Cohort</th>
              <th className="rtn">Members</th>
              {matrix.checkpoints.map(p => <th key={p} className="rtn">{unit}{p}</th>)}
            </tr>
          </thead>
          <tbody>
            {matrix.cohorts.map(row => {
              const thin = row.size < minCohortSize
              return (
                <tr key={row.cohort} className={thin ? 'thin' : undefined}
                  onClick={onSelectCohort ? () => onSelectCohort(row.cohort) : undefined}>
                  <td className="rtc">{shortCohort(row.cohort)}</td>
                  <td className="rtn rtsize">{row.size.toLocaleString()}</td>
                  {matrix.checkpoints.map(p => {
                    const cell = row.cells.find(c => c.period === p)
                    if (!cell) return <td key={p} className="rtn rtnone"><span className="rtdash" /></td>
                    const r = rateOf(cell)
                    if (!cell.observable) {
                      return (
                        <td key={p} className="rtn rtnone" title={`Not yet observable. This cohort has been watched for ${row.periodsObserved} ${matrix.period}${row.periodsObserved === 1 ? '' : 's'}.`}>
                          <span className="rtdash" aria-label="not yet observable" />
                        </td>
                      )
                    }
                    const { bg, fg } = heat(r, columnMax.get(p) ?? 0)
                    return (
                      <td key={p} className="rtn rtcell" style={{ background: bg, color: fg }}
                        onMouseEnter={() => setHover({ cohort: row.cohort, cell })}
                        onMouseLeave={() => setHover(null)}>
                        {pct(r, 0)}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="rtc">All cohorts</td>
              <td className="rtn rtsize">{matrix.totals.members.toLocaleString()}</td>
              {matrix.checkpoints.map(p => {
                const o = matrix.overall.find(x => x.period === p)
                return (
                  <td key={p} className="rtn"
                    title={o ? `${o.retained} of ${o.denominator} across ${o.cohorts} cohort${o.cohorts === 1 ? '' : 's'} old enough to answer` : ''}>
                    {o && o.rate !== null ? pct(o.rate, 0) : <span className="rtdash" />}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="rtlegend">
        <span className="rtkey">
          <i className="rtswatch" style={{ background: 'rgba(249,115,22,0.08)' }} />
          <i className="rtswatch" style={{ background: 'rgba(249,115,22,0.24)' }} />
          <i className="rtswatch" style={{ background: 'rgba(249,115,22,0.40)' }} />
          <i className="rtswatch" style={{ background: 'rgba(249,115,22,0.55)' }} />
          shaded against the best cohort in each column
        </span>
        {unobserved > 0 && (
          <span className="rtkey"><span className="rtdash" /> not yet observable, {unobserved} cell{unobserved === 1 ? '' : 's'}</span>
        )}
        <span className="rtkey rtmuted">measured through {matrix.observationHorizon.slice(0, 10)}</span>
      </div>

      {hover && (
        <p className="rtread">
          {shortCohort(hover.cohort)} at {unit}{hover.cell.period}: {countOf(hover.cell)} of {hover.cell.denominator} came back
          {mode === 'rolling' ? ' on or after that point' : ' in that period'}.
        </p>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Curve                                                               */
/* ------------------------------------------------------------------ */

export interface CurveProps {
  matrix: RetentionMatrix
  rolling?: RollingPoint[]
  /** Draw one line per cohort behind the pooled line. */
  showCohorts?: boolean
  minCohortSize?: number
  height?: number
}

/**
 * The pooled curve in the accent, every cohort behind it as a neutral hairline.
 * One accent per view is the house rule, and it happens to be the right call
 * here anyway: twelve coloured lines is a plate of spaghetti, twelve grey ones
 * behind a single orange one is a distribution with a summary through it.
 */
export function RetentionCurve({
  matrix, rolling, showCohorts = true, minCohortSize = 20, height = 200,
}: CurveProps) {
  const W = 640
  const H = height
  const padL = 40
  const padR = 54
  const padT = 14
  const padB = 26

  const xs = matrix.checkpoints
  const x = (i: number) => padL + (xs.length === 1 ? 0.5 : i / (xs.length - 1)) * (W - padL - padR)
  const y = (v: number) => padT + (1 - v) * (H - padT - padB)

  const pooled = (rolling ?? matrix.overall).map((o, i) => ({ i, v: o.rate }))
  const line = (pts: { i: number; v: number | null }[]) =>
    pts.filter(p => p.v !== null)
      .map((p, k) => (k ? 'L' : 'M') + x(p.i).toFixed(1) + ' ' + y(p.v as number).toFixed(1))
      .join(' ')

  const last = [...pooled].reverse().find(p => p.v !== null)
  const unit = matrix.period === 'day' ? 'D' : matrix.period === 'week' ? 'W' : 'M'

  return (
    <div className="rtcurve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Retention curve, pooled across cohorts, ${xs.map((p, i) => unit + p + ' ' + pct(pooled[i]?.v ?? null, 0)).join(', ')}`}>
        {[0.25, 0.5, 0.75, 1].map(g => (
          <g key={g}>
            <line className="rtgrid" x1={padL} x2={W - padR} y1={y(g)} y2={y(g)} />
            <text className="rtaxis" x={padL - 8} y={y(g) + 4} textAnchor="end">{(g * 100).toFixed(0)}%</text>
          </g>
        ))}

        {showCohorts && matrix.cohorts.filter(r => r.size >= minCohortSize).map(row => (
          <path key={row.cohort} className="rtthread"
            d={line(xs.map((p, i) => {
              const c = row.cells.find(z => z.period === p)
              return { i, v: c && c.observable ? c.rate : null }
            }))} />
        ))}

        <path className="rtpooled" d={line(pooled)} />
        {pooled.filter(p => p.v !== null).map(p => (
          <circle key={p.i} className="rtpoint" cx={x(p.i)} cy={y(p.v as number)} r={3} />
        ))}
        {last && (
          <text className="rtend" x={x(last.i) + 9} y={y(last.v as number) + 4}>{pct(last.v, 0)}</text>
        )}

        {xs.map((p, i) => (
          <text key={p} className="rtaxis" x={x(i)} y={H - 7} textAnchor="middle">{unit}{p}</text>
        ))}
      </svg>
    </div>
  )
}
