/** DRAWING THE CHART.
 *
 *  One accent and nothing else. Every mark on every chart here is the product
 *  amber, because the portal marks one thing per view and a chart that
 *  introduces a second hue quietly breaks that everywhere it is embedded. Two
 *  measures never share an axis: a second scale can be set to make any two
 *  lines cross wherever you like, so a request for one is refused upstream
 *  rather than drawn.
 *
 *  The mark specs are fixed rather than chosen per chart. Two pixel lines,
 *  bars capped at twenty four pixels so the leftover in the band stays air,
 *  four pixel rounded ends on the data end and square at the baseline, end
 *  dots big enough to hit with a mouse and ringed in the surface colour so
 *  they stay legible where they cross the line, a ten percent wash for an
 *  area, and a hairline solid grid that stays behind the data.
 *
 *  Bars start at zero, always. A bar's length is the whole message, so a
 *  truncated baseline is not a style choice, it is a false chart. A line may
 *  start where the data starts, because a line carries shape rather than
 *  magnitude.
 *
 *  THE BOX NARROWS ON A PHONE RATHER THAN BEING SQUEEZED INTO ONE. A viewBox
 *  scales its text along with everything else, so an eight hundred unit
 *  drawing shown at three hundred pixels sets its axis labels at four pixels,
 *  which is not small type, it is unreadable type. Fewer units across means
 *  the same label comes out near the size it was drawn at.
 *
 *  THE TABLE IS NOT OPTIONAL. Amber on white clears about 2.8 to 1, under the
 *  three to one a mark needs to stand on its own, so the numbers have to be
 *  readable without relying on the colour. Direct labels on the extremes and
 *  a full table underneath are how that is paid for, not a nice extra.
 *
 *  Colours come out of the token block at render time rather than being
 *  written here, both because a literal hex in this file is a bug and because
 *  the export needs them resolved: an SVG serialised out of the page takes no
 *  stylesheet with it, so anything left as a variable exports as black.
 */
import React, { useEffect, useRef, useState } from 'react'
import { compact, full, type Plan } from '../lib/chartPlan'
import { onTheme } from '../lib/theme'

interface Ink {
  accent: string; grid: string; axis: string
  text: string; muted: string; surface: string; font: string
}

const FALLBACK: Ink = {
  accent: '#F97316', grid: 'rgba(15,15,14,.09)',
  axis: '#8A857D', text: '#0F0F0E', muted: '#5A564F', surface: '#FFFFFF',
  font: 'ui-sans-serif, system-ui, sans-serif',
}

/** Read once per mount. The values live in one token block and this is the
 *  only place they are turned into attributes. */
function useInk(): Ink {
  const [ink, setInk] = useState<Ink>(FALLBACK)
  useEffect(() => {
    /* Re-read on a theme change. These values are baked into attributes rather
       than left as variables, which is what lets a chart export correctly and
       is also what stops the cascade from restyling it: a chart drawn in light
       and left alone would still be drawing on white after a switch to dark. */
    const read = () => {
    try {
      const cs = getComputedStyle(document.documentElement)
      const v = (n: string, d: string) => (cs.getPropertyValue(n) || '').trim() || d
      setInk({
        accent: v('--amber', FALLBACK.accent),
        grid: v('--border', FALLBACK.grid),
        axis: v('--faint', FALLBACK.axis),
        text: v('--text', FALLBACK.text),
        muted: v('--muted', FALLBACK.muted),
        surface: v('--card', FALLBACK.surface),
        /* A system stack is appended because an exported PNG is painted by the
           canvas, which never loads a web font. Without a real fallback the
           export sets in whatever the browser reaches for last. */
        font: (v('--sans', '') ? v('--sans', '') + ', ' : '') + FALLBACK.font,
      })
    } catch { /* no document, keep the fallback */ }
    }
    read()
    return onTheme(read)
  }, [])
  return ink
}

/* ----------------------------------------------------------------- scales -- */

/** Clean tick values, and never one outside the range. An axis reading 0,
 *  3,333, 6,667 makes a reader do arithmetic; a tick below the floor is drawn
 *  outside the plot box, and since the box keeps its overflow visible so the
 *  end value can sit above the line, that stray gridline lands in the
 *  paragraph underneath the chart. Both of those were bugs. */
function ticks(lo: number, hi: number, want = 5): number[] {
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0]
  if (lo === hi) return [lo]
  const raw = (hi - lo) / want
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)))
  const n = raw / mag
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag
  const out: number[] = []
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 1e-6; v += step) {
    if (v < lo - step * 1e-6 || v > hi + step * 1e-6) continue
    out.push(Math.abs(v) < step * 1e-9 ? 0 : v)
    if (out.length > 40) break
  }
  return out.length ? out : [lo, hi]
}

/** The range for one axis. Bars are pinned to zero because their length is the
 *  message; a line gets a little air because its shape is. */
function domain(vals: number[], fromZero: boolean): [number, number] {
  let lo = Math.min(...vals), hi = Math.max(...vals)
  if (fromZero) { lo = Math.min(0, lo); hi = Math.max(0, hi) }
  if (lo === hi) { const p = Math.abs(lo) * 0.1 || 1; lo -= p; hi += p }
  else if (!fromZero) { const p = (hi - lo) * 0.08; lo -= p; hi += p }
  return [lo, hi]
}

/* --------------------------------------------------------------- the box -- */

const PT = 22, PB = 54, PR = 34
const NARROW = 560

/** The width the chart is actually being given, measured rather than assumed. */
function useWide(): [React.MutableRefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement | null>(null)
  const [wide, setWide] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setWide(el.getBoundingClientRect().width >= NARROW)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, wide]
}

function axisLeft(vals: number[]): number {
  const longest = Math.max(...vals.map(v => compact(v).length))
  return Math.max(44, 14 + longest * 7.4)
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s)

/* ------------------------------------------------------------------ chart -- */

export interface ChartViewProps { plan: Plan; svgRef?: React.MutableRefObject<SVGSVGElement | null> }

export function ChartView({ plan, svgRef }: ChartViewProps) {
  const [ref, wide] = useWide()
  const ink = useInk()
  const W = wide ? 840 : 430
  const H = wide ? 420 : 320
  return (
    <div className="gtchartbox" ref={ref}>
      {plan.kind === 'bar'
        ? <Bars plan={plan} ink={ink} W={W} wide={wide} svgRef={svgRef} />
        : plan.kind === 'scatter'
          ? <Dots plan={plan} ink={ink} W={W} H={H} svgRef={svgRef} />
          : plan.kind === 'column'
            ? <Columns plan={plan} ink={ink} W={W} H={H} svgRef={svgRef} />
            : <Lines plan={plan} ink={ink} W={W} H={H} svgRef={svgRef} />}
    </div>
  )
}

interface Common {
  plan: Plan; ink: Ink; W: number
  svgRef?: React.MutableRefObject<SVGSVGElement | null>
}

function Frame({ children, svgRef, label, W, H }: {
  children: React.ReactNode; svgRef?: Common['svgRef']; label: string; W: number; H: number
}) {
  return (
    <svg ref={el => { if (svgRef) svgRef.current = el }} className="gtchart" viewBox={`0 0 ${W} ${H}`}
      xmlns="http://www.w3.org/2000/svg" role="img" aria-label={label}>
      {children}
    </svg>
  )
}

/* ------------------------------------------------------------- line, area -- */

function Lines({ plan, ink, W, H, svgRef }: Common & { H: number }) {
  const [hov, setHov] = useState<{ i: number; x: number; y: number } | null>(null)
  const pts = plan.points
  const [lo, hi] = domain(pts.map(p => p.y), false)
  const tk = ticks(lo, hi, W < NARROW ? 4 : 5)
  const PL = axisLeft(tk)
  const iw = W - PL - PR, ih = H - PT - PB

  const xs = pts.map(p => p.x)
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  const X = (v: number) => (x1 === x0 ? PL + iw / 2 : PL + (iw * (v - x0)) / (x1 - x0))
  const Y = (v: number) => PT + ih * (1 - (v - lo) / (hi - lo))

  const d = pts.map((p, i) => (i ? 'L' : 'M') + X(p.x) + ',' + Y(p.y)).join('')
  const area = d + `L${X(pts[pts.length - 1].x)},${PT + ih}L${X(pts[0].x)},${PT + ih}Z`

  const last = pts[pts.length - 1]
  const peak = pts.reduce((a, b) => (b.y > a.y ? b : a), pts[0])
  const showPeak = peak !== last && Math.abs(X(peak.x) - X(last.x)) > 70

  const every = Math.max(1, Math.ceil(pts.length / (W < NARROW ? 4 : 7)))

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * iw + PL
    let best = 0, bd = Infinity
    pts.forEach((p, i) => { const dd = Math.abs(X(p.x) - px); if (dd < bd) { bd = dd; best = i } })
    setHov({ i: best, x: X(pts[best].x), y: Y(pts[best].y) })
  }

  return (
    <Frame svgRef={svgRef} W={W} H={H} label={plan.title + '. ' + plan.reads}>
      <rect x={0} y={0} width={W} height={H} fill={ink.surface} />
      {tk.map(v => (
        <g key={v}>
          <line x1={PL} x2={PL + iw} y1={Y(v)} y2={Y(v)} stroke={ink.grid} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={PL - 9} y={Y(v) + 4} fill={ink.axis} fontSize={11} fontFamily={ink.font}
            textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(v)}</text>
        </g>
      ))}

      {plan.kind === 'area' && <path d={area} fill={ink.accent} fillOpacity={0.1} />}
      <path d={d} fill="none" stroke={ink.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      <circle cx={X(last.x)} cy={Y(last.y)} r={4.5} fill={ink.accent} stroke={ink.surface} strokeWidth={2} />
      <text x={X(last.x) - 8} y={Y(last.y) - 12} fill={ink.text} fontSize={12} fontWeight={600}
        fontFamily={ink.font} textAnchor="end">{compact(last.y)}</text>
      {showPeak && (
        <>
          <circle cx={X(peak.x)} cy={Y(peak.y)} r={4.5} fill={ink.accent} stroke={ink.surface} strokeWidth={2} />
          <text x={X(peak.x)} y={Y(peak.y) - 12} fill={ink.muted} fontSize={11.5}
            fontFamily={ink.font} textAnchor="middle">{compact(peak.y)}</text>
        </>
      )}

      {pts.map((p, i) => (i % every === 0 || i === pts.length - 1) && (
        <text key={i} x={X(p.x)} y={H - PB + 22} fill={ink.axis} fontSize={11} fontFamily={ink.font}
          textAnchor={i === 0 ? 'start' : i === pts.length - 1 ? 'end' : 'middle'}>{p.label}</text>
      ))}
      <text x={PL} y={H - 12} fill={ink.axis} fontSize={11} fontFamily={ink.font}>{plan.xLabel}</text>

      {hov && (
        <g pointerEvents="none">
          <line x1={hov.x} x2={hov.x} y1={PT} y2={PT + ih} stroke={ink.grid} strokeWidth={1} />
          <circle cx={hov.x} cy={hov.y} r={4.5} fill={ink.accent} stroke={ink.surface} strokeWidth={2} />
          <Tip ink={ink} W={W} x={hov.x} y={hov.y} lines={[pts[hov.i].label, full(pts[hov.i].y)]} />
        </g>
      )}
      <rect x={PL} y={PT} width={iw} height={ih} fill="transparent"
        onMouseMove={onMove} onMouseLeave={() => setHov(null)} />
    </Frame>
  )
}

/* ---------------------------------------------------------------- columns -- */

function Columns({ plan, ink, W, H, svgRef }: Common & { H: number }) {
  const [hov, setHov] = useState<number | null>(null)
  const pts = plan.points
  const [lo, hi] = domain(pts.map(p => p.y), true)
  const tk = ticks(lo, hi, W < NARROW ? 4 : 5)
  const PL = axisLeft(tk)
  const iw = W - PL - PR, ih = H - PT - PB
  const Y = (v: number) => PT + ih * (1 - (v - lo) / (hi - lo))

  /* Bars are capped at twenty four pixels, so a handful of them spread over
     the full width reads as sticks marooned in white. The plot narrows to fit
     the bars instead of the bars stretching to fit the plot, and the leftover
     inside a band is the surface gap that separates neighbours without a
     stroke drawn around them. */
  const band = Math.min(iw / pts.length, W < NARROW ? 64 : 96)
  const plotW = band * pts.length
  const bw = Math.max(4, Math.min(24, band - 10))
  const zero = Y(0)

  const ys = pts.map(p => p.y)
  const iMax = ys.indexOf(Math.max(...ys)), iMin = ys.indexOf(Math.min(...ys))
  const every = Math.max(1, Math.ceil(pts.length / (W < NARROW ? 6 : 12)))

  return (
    <Frame svgRef={svgRef} W={W} H={H} label={plan.title + '. ' + plan.reads}>
      <rect x={0} y={0} width={W} height={H} fill={ink.surface} />
      {tk.map(v => (
        <g key={v}>
          <line x1={PL} x2={PL + plotW} y1={Y(v)} y2={Y(v)} stroke={ink.grid} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={PL - 9} y={Y(v) + 4} fill={ink.axis} fontSize={11} fontFamily={ink.font}
            textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(v)}</text>
        </g>
      ))}
      {pts.map((p, i) => {
        const cx = PL + band * (i + 0.5)
        const x = cx - bw / 2
        const up = p.y >= 0
        const top = up ? Y(p.y) : zero
        const h = Math.max(2, Math.abs(zero - Y(p.y)))
        const r = Math.min(4, bw / 2, h)
        const dPath = up
          ? `M${x},${top + h} L${x},${top + r} Q${x},${top} ${x + r},${top} L${x + bw - r},${top} Q${x + bw},${top} ${x + bw},${top + r} L${x + bw},${top + h} Z`
          : `M${x},${top} L${x},${top + h - r} Q${x},${top + h} ${x + r},${top + h} L${x + bw - r},${top + h} Q${x + bw},${top + h} ${x + bw},${top + h - r} L${x + bw},${top} Z`
        return (
          <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
            <path d={dPath} fill={ink.accent} />
            {(i === iMax || i === iMin) && (
              <text x={cx} y={up ? top - 8 : top + h + 16} fill={ink.text} fontSize={11.5} fontWeight={600}
                fontFamily={ink.font} textAnchor="middle">{compact(p.y)}</text>
            )}
            {(i % every === 0 || i === pts.length - 1) && (
              <text x={cx} y={H - PB + 22} fill={ink.axis} fontSize={11} fontFamily={ink.font}
                textAnchor="middle">{clip(p.label, Math.floor(band / 6.2))}</text>
            )}
            <rect x={cx - band / 2} y={PT} width={band} height={ih} fill="transparent" />
          </g>
        )
      })}
      <line x1={PL} x2={PL + plotW} y1={zero} y2={zero} stroke={ink.grid} strokeWidth={1} shapeRendering="crispEdges" />
      <text x={PL} y={H - 12} fill={ink.axis} fontSize={11} fontFamily={ink.font}>{plan.xLabel}</text>
      {hov !== null && (
        <g pointerEvents="none">
          <Tip ink={ink} W={W} x={PL + band * (hov + 0.5)} y={Y(Math.max(0, pts[hov].y))}
            lines={[pts[hov].label, full(pts[hov].y)]} />
        </g>
      )}
    </Frame>
  )
}

/* -------------------------------------------------------------------- bars -- */

function Bars({ plan, ink, W, wide, svgRef }: Common & { wide: boolean }) {
  const [hov, setHov] = useState<number | null>(null)
  const pts = plan.points
  const rowH = 30, barH = Math.min(20, rowH - 10)
  const H = PT + pts.length * rowH + 46
  /* The label margin is a share of the box rather than a fixed two hundred,
     which on a phone would be a third of the chart. */
  const PL = wide ? 200 : 118
  const iw = W - PL - (wide ? 96 : 58)
  const [lo, hi] = domain(pts.map(p => p.y), true)
  const X = (v: number) => PL + (iw * (v - lo)) / (hi - lo)
  const zero = X(0)
  const ys = pts.map(p => p.y)
  const iMax = ys.indexOf(Math.max(...ys)), iMin = ys.indexOf(Math.min(...ys))

  return (
    <Frame svgRef={svgRef} W={W} H={H} label={plan.title + '. ' + plan.reads}>
      <rect x={0} y={0} width={W} height={H} fill={ink.surface} />
      {ticks(lo, hi, wide ? 4 : 3).map(v => (
        <g key={v}>
          <line x1={X(v)} x2={X(v)} y1={PT - 6} y2={PT + pts.length * rowH} stroke={ink.grid} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={X(v)} y={PT + pts.length * rowH + 20} fill={ink.axis} fontSize={11} fontFamily={ink.font}
            textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(v)}</text>
        </g>
      ))}
      {pts.map((p, i) => {
        const y = PT + i * rowH + (rowH - barH) / 2
        const w = Math.max(2, Math.abs(X(p.y) - zero))
        const x = p.y >= 0 ? zero : zero - w
        const r = Math.min(4, barH / 2, w)
        const dPath = p.y >= 0
          ? `M${x},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + barH - r} Q${x + w},${y + barH} ${x + w - r},${y + barH} L${x},${y + barH} Z`
          : `M${x + w},${y} L${x + r},${y} Q${x},${y} ${x},${y + r} L${x},${y + barH - r} Q${x},${y + barH} ${x + r},${y + barH} L${x + w},${y + barH} Z`
        return (
          <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
            <text x={PL - 12} y={y + barH / 2 + 4} fill={ink.muted} fontSize={11.5} fontFamily={ink.font}
              textAnchor="end">{clip(p.label, wide ? 28 : 15)}</text>
            <path d={dPath} fill={ink.accent} />
            {(i === iMax || i === iMin) && (
              <text x={(p.y >= 0 ? x + w : x) + (p.y >= 0 ? 9 : -9)} y={y + barH / 2 + 4}
                fill={ink.text} fontSize={11.5} fontWeight={600} fontFamily={ink.font}
                textAnchor={p.y >= 0 ? 'start' : 'end'}>{compact(p.y)}</text>
            )}
            <rect x={0} y={PT + i * rowH} width={W} height={rowH} fill="transparent" />
          </g>
        )
      })}
      <line x1={zero} x2={zero} y1={PT - 6} y2={PT + pts.length * rowH} stroke={ink.grid} strokeWidth={1} shapeRendering="crispEdges" />
      <text x={PL} y={H - 8} fill={ink.axis} fontSize={11} fontFamily={ink.font}>{plan.yLabel}</text>
      {hov !== null && (
        <g pointerEvents="none">
          <Tip ink={ink} W={W} x={Math.min(W - 90, X(pts[hov].y) + 40)} y={PT + hov * rowH + 12}
            lines={[pts[hov].label, full(pts[hov].y)]} />
        </g>
      )}
    </Frame>
  )
}

/* ----------------------------------------------------------------- scatter -- */

function Dots({ plan, ink, W, H, svgRef }: Common & { H: number }) {
  const [hov, setHov] = useState<number | null>(null)
  const pts = plan.points
  /* Both axes take their range from the data and then get ticks inside it.
     Taking the range from the ticks instead put every point below the first
     tick outside the plot, drawn to the left of the axis it belongs to. */
  const [ylo, yhi] = domain(pts.map(p => p.y), false)
  const [xlo, xhi] = domain(pts.map(p => p.x), false)
  const xt = ticks(xlo, xhi, W < NARROW ? 3 : 5)
  const yt = ticks(ylo, yhi, W < NARROW ? 4 : 5)
  const PL = axisLeft(yt)
  const iw = W - PL - PR, ih = H - PT - PB
  const X = (v: number) => (xhi === xlo ? PL + iw / 2 : PL + (iw * (v - xlo)) / (xhi - xlo))
  const Y = (v: number) => PT + ih * (1 - (v - ylo) / (yhi - ylo))

  return (
    <Frame svgRef={svgRef} W={W} H={H} label={plan.title + '. ' + plan.reads}>
      <rect x={0} y={0} width={W} height={H} fill={ink.surface} />
      {yt.map(v => (
        <g key={'y' + v}>
          <line x1={PL} x2={PL + iw} y1={Y(v)} y2={Y(v)} stroke={ink.grid} strokeWidth={1} shapeRendering="crispEdges" />
          <text x={PL - 9} y={Y(v) + 4} fill={ink.axis} fontSize={11} fontFamily={ink.font}
            textAnchor="end" style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(v)}</text>
        </g>
      ))}
      {xt.map(v => (
        <text key={'x' + v} x={X(v)} y={H - PB + 22} fill={ink.axis} fontSize={11} fontFamily={ink.font}
          textAnchor="middle" style={{ fontVariantNumeric: 'tabular-nums' }}>{compact(v)}</text>
      ))}
      {pts.map((p, i) => (
        <circle key={i} cx={X(p.x)} cy={Y(p.y)} r={4.5} fill={ink.accent}
          fillOpacity={pts.length > 120 ? 0.55 : 0.85} stroke={ink.surface} strokeWidth={2}
          onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)} />
      ))}
      <text x={PL} y={H - 12} fill={ink.axis} fontSize={11} fontFamily={ink.font}>{plan.xLabel}</text>
      <text x={PL - 9} y={PT - 8} fill={ink.axis} fontSize={11} fontFamily={ink.font}>{plan.yLabel}</text>
      {hov !== null && (
        <g pointerEvents="none">
          <Tip ink={ink} W={W} x={X(pts[hov].x)} y={Y(pts[hov].y)}
            lines={[plan.xLabel + ' ' + full(pts[hov].x), plan.yLabel + ' ' + full(pts[hov].y)]} />
        </g>
      )}
    </Frame>
  )
}

/* --------------------------------------------------------------- fittings -- */

/** Measured rather than guessed, so a long label never spills out of its own
 *  box, and kept inside the frame at both edges. */
function Tip({ ink, W, x, y, lines }: { ink: Ink; W: number; x: number; y: number; lines: string[] }) {
  const w = Math.max(...lines.map(l => l.length)) * 6.6 + 20
  const h = lines.length * 16 + 12
  const bx = Math.min(W - w - 6, Math.max(6, x - w / 2))
  const by = Math.max(6, y - h - 14)
  return (
    <g>
      <rect x={bx} y={by} width={w} height={h} rx={8} fill={ink.surface} stroke={ink.grid} strokeWidth={1} />
      {lines.map((l, i) => (
        <text key={i} x={bx + 10} y={by + 20 + i * 16} fill={i ? ink.text : ink.muted}
          fontSize={11.5} fontWeight={i ? 600 : 400} fontFamily={ink.font}>{l}</text>
      ))}
    </g>
  )
}

/* ------------------------------------------------------------------ table -- */

/** The chart's numbers, in full. Not a fallback: the accent does not clear
 *  three to one against white on its own, so this is how the values stay
 *  readable to somebody the colour does not reach. */
export function ChartTable({ plan }: { plan: Plan }) {
  const rows = plan.points
  const counted = plan.aggregate !== 'none' && plan.kind !== 'scatter'
  return (
    <div className="gttablewrap">
      <table className="gttable">
        <thead>
          <tr>
            <th>{plan.kind === 'scatter' ? 'Row' : plan.xLabel}</th>
            {plan.kind === 'scatter' && <th className="num">{plan.xLabel}</th>}
            <th className="num">{plan.yLabel}</th>
            {counted && <th className="num">Rows</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i}>
              <td>{p.label || 'Row ' + (i + 2)}</td>
              {plan.kind === 'scatter' && <td className="num">{full(p.x)}</td>}
              <td className="num">{full(p.y)}</td>
              {counted && <td className="num">{p.n}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ----------------------------------------------------------------- export -- */

export const safeName = (s: string): string =>
  s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'chart'

/** The chart as a PNG, painted at twice the size so it holds up in a deck.
 *  Everything travels inside the SVG already: the colours were resolved at
 *  render time rather than left as variables, because a serialised SVG takes
 *  no stylesheet with it and every var would export as black. */
export async function toPng(svg: SVGSVGElement, name: string): Promise<void> {
  const box = svg.viewBox.baseVal
  const w = box.width || 840, h = box.height || 420
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('width', String(w))
  clone.setAttribute('height', String(h))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const xml = new XMLSerializer().serializeToString(clone)
  const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)

  await new Promise<void>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = w * 2; c.height = h * 2
      const ctx = c.getContext('2d')
      if (!ctx) { reject(new Error('This browser would not give up a canvas to draw on.')); return }
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      c.toBlob(b => {
        if (!b) { reject(new Error('The chart could not be turned into an image here.')); return }
        const a = document.createElement('a')
        a.href = URL.createObjectURL(b)
        a.download = safeName(name) + '.png'
        document.body.appendChild(a); a.click(); a.remove()
        setTimeout(() => URL.revokeObjectURL(a.href), 4000)
        resolve()
      }, 'image/png')
    }
    img.onerror = () => reject(new Error('The chart could not be turned into an image here.'))
    img.src = url
  })
}

/** The same numbers as a CSV, for somebody who wants them back in a sheet
 *  rather than in a slide. */
export function toCsv(plan: Plan): string {
  const q = (s: string) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s)
  const head = plan.kind === 'scatter'
    ? ['Row', plan.xLabel, plan.yLabel]
    : [plan.xLabel, plan.yLabel, 'Rows']
  const body = plan.points.map((p, i) => (plan.kind === 'scatter'
    ? [String(i + 2), String(p.x), String(p.y)]
    : [p.label, String(p.y), String(p.n)]))
  return [head, ...body].map(r => r.map(c => q(String(c))).join(',')).join('\n')
}
