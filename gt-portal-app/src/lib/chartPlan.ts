/** CHOOSING THE CHART, AND BUILDING WHAT GOES IN IT.
 *
 *  Chart type is not a matter of taste and it is not a generation problem. It
 *  follows from the shape of the data: a date against a number is a time
 *  series, two numbers against each other is a scatter, a category against a
 *  number is a comparison of magnitudes and the honest ordering is by value
 *  rather than by whatever order the rows happened to be in. That is a table
 *  of rules, so it is written as one.
 *
 *  EVERY NUMBER HERE COMES OUT OF THE CUSTOMER'S OWN GRID. Nothing is
 *  smoothed, interpolated, extrapolated or filled in. A blank is a blank and
 *  is reported as one.
 *
 *  THE INTERPRETATION DESCRIBES AND NEVER EXPLAINS. It says where the series
 *  starts and ends, where the high and the low sit, and how spread out it is.
 *  It does not say why, because it cannot know why, and a chart tool that
 *  volunteers a cause is the exact failure this product is sold against. The
 *  sentence saying so ships with the chart rather than living in a footnote.
 *
 *  NOTHING IS DROPPED QUIETLY. A capped category list, skipped blank rows and
 *  a dimension that had to be aggregated because its values repeat are all
 *  reported on the screen. A silent cap reads as complete coverage, which is
 *  worse than showing less and saying so.
 */
import type { Aggregate, ChartKind, Intent, Order } from './chartIntent'

export type Cell = string | number | boolean

export interface Point {
  label: string
  /** Position on the x scale. Time for a date, index for a category. */
  x: number
  y: number
  /** How many source rows this point stands for. One means it is a row. */
  n: number
}

export interface Plan {
  kind: ChartKind
  title: string
  xLabel: string
  yLabel: string
  points: Point[]
  aggregate: Aggregate
  /** Why this type and not another, in one sentence. Shown, because somebody
   *  who disagrees should be able to see the reasoning and change it. */
  because: string
  /** Structural only. Direction, extremes, spread. Never a cause. */
  reads: string
  /** Everything left out, capped or combined, each said plainly. */
  notes: string[]
  /** True when x carries dates, so the renderer formats the axis as time. */
  timeAxis: boolean
}

export interface PlanInput {
  intent: Intent
  headers: string[]
  /** Data rows only, header excluded. */
  rows: Cell[][]
  sheetTitle: string
}

/** Past this many bars nobody reads the chart, they read the first six and
 *  give up. The tail is cut and counted rather than summed into an Other bar:
 *  a bar that is forty unrelated things added together sits next to bars that
 *  are one thing each and invites a comparison that means nothing. */
const MAX_CATEGORIES = 20

/* --------------------------------------------------------------- reading -- */

const SERIAL_MIN = 20000, SERIAL_MAX = 60000
const EPOCH = Date.UTC(1899, 11, 30)

/** A cell as a number, or null. Handles the way spreadsheets actually hold
 *  money and percentages: "$1,200" and "12%" are numbers to a person and
 *  strings to a parser. A percent is read as its face value, not divided,
 *  because the axis then reads the way the column does. */
export function toNumber(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'boolean') return v ? 1 : 0
  const s = String(v ?? '').trim()
  if (!s) return null
  const neg = /^\(.*\)$/.test(s)
  const cleaned = s.replace(/[()]/g, '').replace(/[$£€,\s]/g, '').replace(/%$/, '')
  if (!/^[-+]?\d*\.?\d+([eE][-+]?\d+)?$/.test(cleaned)) return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

/** A cell as a moment, or null. Excel serials and ISO strings both arrive
 *  here because sheet.ts normalises dates to ISO but leaves numeric serials
 *  numeric, and a serial only counts when the whole column looks like one. */
export function toTime(v: Cell, serialsLikely: boolean): number | null {
  if (typeof v === 'number') {
    if (!serialsLikely || v < SERIAL_MIN || v > SERIAL_MAX) return null
    return EPOCH + v * 86400000
  }
  const s = String(v ?? '').trim()
  if (!s) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const t = Date.parse(s); return Number.isFinite(t) ? t : null }
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(s)) { const t = Date.parse(s); return Number.isFinite(t) ? t : null }
  return null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** Days when a series covers weeks, months when it covers a year or two,
 *  years past that. The granularity of the label follows the span rather than
 *  being fixed, because "14 Mar" on a five year chart is noise. */
export function timeLabel(t: number, spanDays: number): string {
  const d = new Date(t)
  if (spanDays <= 62) return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]
  if (spanDays <= 800) return MONTHS[d.getUTCMonth()] + ' ' + String(d.getUTCFullYear()).slice(2)
  return String(d.getUTCFullYear())
}

/** Readable without being wrong. Thousands and millions are shortened on the
 *  axis where space is the constraint; the table view underneath carries the
 *  full number, so nothing is rounded away with no way back to it. */
export function compact(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return trim(n / 1e9) + 'B'
  if (a >= 1e6) return trim(n / 1e6) + 'M'
  if (a >= 1e4) return trim(n / 1e3) + 'K'
  if (Number.isInteger(n)) return n.toLocaleString('en-US')
  return trim(n)
}

function trim(n: number): string {
  const r = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10
  return r.toLocaleString('en-US')
}

export const full = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 4 })

/** For a sentence rather than a cell. An average of 32,415.3846 is true and
 *  unreadable, and the table underneath still carries every digit. */
const say = (n: number): string =>
  Number.isInteger(n) ? n.toLocaleString('en-US') : n.toLocaleString('en-US', { maximumFractionDigits: 2 })

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many)

/* --------------------------------------------------------------- shaping -- */

/** Same guard as columnKind, and for the same reason: the Excel serial range
 *  is also the range a year of monthly revenue lives in, so the header has to
 *  agree before a bare number is read as a date. */
const TEMPORAL = /(^|[\s_-])(date|day|days|month|months|week|weeks|year|years|time|period|quarter|qtr|timestamp|when)([\s_-]|$)/i

function looksSerial(header: string, col: Cell[]): boolean {
  if (!TEMPORAL.test(String(header))) return false
  const nums = col.filter(v => typeof v === 'number') as number[]
  if (nums.length < Math.max(2, col.filter(v => v !== '' && v !== null).length * 0.6)) return false
  return nums.every(v => v >= SERIAL_MIN && v <= SERIAL_MAX)
}

interface Bucket { label: string; x: number; sum: number; n: number; min: number; max: number }

function aggregateOf(agg: Aggregate, b: Bucket): number {
  if (agg === 'count') return b.n
  if (agg === 'average') return b.n ? b.sum / b.n : 0
  return b.sum
}

/* ------------------------------------------------------------- the table -- */

/** The decision table. Read it top to bottom; the first row that fits wins.
 *  A type the person named beats all of it, because they can see their own
 *  data and this cannot see their reason. */
function chooseKind(
  named: ChartKind | null, timeAxis: boolean, measures: number,
  categories: number, longestLabel: number,
): { kind: ChartKind; because: string } {
  if (named) return { kind: named, because: 'You asked for it.' }
  if (measures === 2) return { kind: 'scatter', because: 'Two measures and no category to break them down by, so each row is a point and the question is whether they move together.' }
  if (timeAxis) return { kind: 'line', because: 'A date against a number is a series over time, and a line shows the path between the points rather than just the points.' }
  /* Upright only when the labels fit upright. Names like Northlane Supply Co.
     do not, and a column chart truncates them to Northlane Sup and hands the
     reader a chart whose categories they cannot tell apart. Horizontal bars
     give a label the whole left margin. */
  if (categories <= 12 && longestLabel <= 13) return { kind: 'column', because: 'A handful of categories against one number, and the names are short enough to stand under the bars.' }
  if (categories <= 12) return { kind: 'bar', because: 'The names are too long to sit under upright bars without being cut, so the bars run across and the labels get the room.' }
  return { kind: 'bar', because: 'Too many categories to stand them upright without the labels colliding, so the bars run across and the labels get room.' }
}

/* -------------------------------------------------------------- planning -- */

export function plan(inp: PlanInput): Plan | null {
  const { intent, headers, rows } = inp
  if (!intent.measures.length) return null

  const notes: string[] = []
  const idx = (h: string) => headers.indexOf(h)

  const mi = idx(intent.measures[0])
  const mi2 = intent.measures.length > 1 ? idx(intent.measures[1]) : -1
  if (mi < 0) return null

  const di = intent.dimension ? idx(intent.dimension) : -1
  const dimCol = di >= 0 ? rows.map(r => r[di]) : []
  const serials = di >= 0 && looksSerial(intent.dimension || '', dimCol)
  const timeAxis = di >= 0 && dimCol.some(v => toTime(v, serials) !== null)

  /* Two measures against each other. Each row is one point, and a row missing
     either number is not a point at all. */
  if (mi2 >= 0 && intent.kind === 'scatter') {
    const pts: Point[] = []
    let skipped = 0
    rows.forEach((r, rowIndex) => {
      const x = toNumber(r[mi]), y = toNumber(r[mi2])
      if (x === null || y === null) { skipped++; return }
      pts.push({ label: 'Row ' + (rowIndex + 2), x, y, n: 1 })
    })
    if (skipped) notes.push(`${skipped} row${skipped === 1 ? '' : 's'} had a blank in one of the two columns and cannot be a point, so ${skipped === 1 ? 'it is' : 'they are'} not drawn.`)
    if (!pts.length) return null
    return {
      kind: 'scatter',
      title: `${intent.measures[1]} against ${intent.measures[0]}`,
      xLabel: intent.measures[0], yLabel: intent.measures[1],
      points: pts, aggregate: 'none', timeAxis: false,
      because: 'Two measures and no category to break them down by, so each row is a point and the question is whether they move together.',
      reads: readsScatter(pts, intent.measures[0], intent.measures[1]),
      notes,
    }
  }

  /* One measure. Group it by the dimension, or lay it along the rows when
     there is no dimension to group by. */
  const buckets = new Map<string, Bucket>()
  let blankMeasure = 0, blankDim = 0, unparsed = 0

  /* "How many orders" almost always means the orders added up, not the number
     of rows they sit in, because the person named a column that already holds
     a count. Row counting is what somebody means when the thing they named is
     not a number, and this only ever sees numeric measures. The swap is made
     and then said, rather than made quietly. */
  const countingRows = intent.aggregate === 'count' && /\brows?\b/.test(intent.heard.toLowerCase())
  if (intent.aggregate === 'count' && !countingRows) {
    notes.push(`Counted by adding up ${intent.measures[0]}, since it already holds a number. Say "how many rows" if you meant the number of rows instead.`)
  }

  rows.forEach((r, rowIndex) => {
    const yRaw = countingRows ? 1 : toNumber(r[mi])
    if (yRaw === null) {
      if (String(r[mi] ?? '').trim() === '') blankMeasure++; else unparsed++
      return
    }
    let key: string, x: number
    if (di < 0) { key = String(rowIndex + 1); x = rowIndex }
    else if (timeAxis) {
      const t = toTime(r[di], serials)
      if (t === null) { blankDim++; return }
      key = String(t); x = t
    } else {
      key = String(r[di] ?? '').trim() || '(blank)'
      x = 0
    }
    const b = buckets.get(key)
    if (b) { b.sum += yRaw; b.n++; b.min = Math.min(b.min, yRaw); b.max = Math.max(b.max, yRaw) }
    else buckets.set(key, { label: key, x, sum: yRaw, n: 1, min: yRaw, max: yRaw })
  })

  if (blankMeasure) notes.push(`${blankMeasure} ${plural(blankMeasure, 'row was', 'rows were')} blank in ${intent.measures[0]} and ${plural(blankMeasure, 'is', 'are')} not drawn.`)
  if (blankDim) notes.push(`${blankDim} ${plural(blankDim, 'row had', 'rows had')} no readable date in ${intent.dimension}, so ${plural(blankDim, 'it is', 'they are')} not drawn.`)
  if (unparsed) notes.push(`${unparsed} ${plural(unparsed, 'row held', 'rows held')} something in ${intent.measures[0]} that is not a number, so ${plural(unparsed, 'it was', 'they were')} left out.`)
  if (!buckets.size) return null

  /* A dimension whose values repeat has to be combined or the chart draws the
     same category several times. Combining is not a decision to make quietly,
     so it is said. */
  let agg: Aggregate = countingRows ? 'count' : intent.aggregate === 'count' ? 'sum' : intent.aggregate
  const repeated = [...buckets.values()].some(b => b.n > 1)
  if (repeated && agg === 'none') {
    agg = 'sum'
    notes.push(`${intent.dimension || 'The row'} repeats, so rows sharing a value were added together. Say "average" if you meant the average instead.`)
  }

  let list = [...buckets.values()]

  /* Time is ordered by time and never by size. A series over months sorted
     tallest first is not a time series any more, it is a bar chart wearing
     one, and the shape a reader takes from it is false. */
  const order: Order = timeAxis ? 'none' : (intent.order === 'none' ? 'value-desc' : intent.order)
  if (timeAxis) list.sort((a, b) => a.x - b.x)
  else if (order === 'value-desc') list.sort((a, b) => aggregateOf(agg, b) - aggregateOf(agg, a))
  else if (order === 'value-asc') list.sort((a, b) => aggregateOf(agg, a) - aggregateOf(agg, b))
  else if (order === 'label') list.sort((a, b) => a.label.localeCompare(b.label))

  const before = list.length
  const cap = intent.limit !== null ? Math.min(intent.limit, MAX_CATEGORIES) : MAX_CATEGORIES
  if (!timeAxis && list.length > cap) {
    const cutTotal = list.slice(cap).reduce((s, b) => s + aggregateOf(agg, b), 0)
    const allTotal = list.reduce((s, b) => s + aggregateOf(agg, b), 0)
    list = list.slice(0, cap)
    const share = allTotal ? Math.round((cutTotal / allTotal) * 100) : 0
    notes.push(intent.limit !== null && intent.limit <= MAX_CATEGORIES
      ? `You asked for ${intent.limit}. ${before - cap} other ${before - cap === 1 ? 'category is' : 'categories are'} not shown, carrying ${share}% of the total.`
      : `${before} categories is more than a chart can be read at, so this shows the ${cap} largest. The ${before - cap} left out carry ${share}% of the total.`)
  }

  const spanDays = timeAxis && list.length > 1
    ? (list[list.length - 1].x - list[0].x) / 86400000 : 0

  const points: Point[] = list.map((b, i) => ({
    label: timeAxis ? timeLabel(b.x, spanDays) : b.label,
    x: timeAxis ? b.x : i,
    y: aggregateOf(agg, b),
    n: b.n,
  }))

  const longest = points.reduce((m, p) => Math.max(m, p.label.length), 0)
  const picked = chooseKind(intent.kind, timeAxis, 1, points.length, longest)
  const yLabel = agg === 'count' ? 'Rows' : intent.measures[0]
  const xLabel = intent.dimension || 'Row'

  return {
    kind: picked.kind,
    title: titleFor(yLabel, xLabel, agg, intent),
    xLabel, yLabel,
    points, aggregate: agg, timeAxis,
    because: picked.because,
    reads: readsSeries(points, yLabel, timeAxis),
    notes,
  }
}

function titleFor(y: string, x: string, agg: Aggregate, intent: Intent): string {
  const lead = agg === 'count' ? 'Rows' : agg === 'average' ? 'Average ' + y : agg === 'sum' ? 'Total ' + y : y
  const by = intent.dimension ? ' by ' + x : ''
  if (intent.limit !== null) {
    const dir = intent.order === 'value-asc' ? 'Lowest' : 'Top'
    const many = /s$/i.test(x) ? x : x + 's'
    return `${dir} ${intent.limit} ${many.toLowerCase()} by ${lead.toLowerCase()}`
  }
  return lead + by
}

/* -------------------------------------------------------- interpretation -- */

/** What the chart shows, in structural terms only. Every sentence here is
 *  arithmetic on the points that are drawn. The last one is not a hedge, it
 *  is the boundary: this can see the shape and cannot see the cause, and the
 *  moment it starts suggesting causes it becomes the thing it replaced. */
function readsSeries(pts: Point[], yLabel: string, timeAxis: boolean): string {
  if (pts.length === 1) return `One point. ${yLabel} is ${say(pts[0].y)} at ${pts[0].label}.`
  const ys = pts.map(p => p.y)
  const hi = pts[ys.indexOf(Math.max(...ys))]
  const lo = pts[ys.indexOf(Math.min(...ys))]
  const first = pts[0], last = pts[pts.length - 1]

  const bits: string[] = []
  bits.push(`${pts.length} points${timeAxis ? `, ${first.label} to ${last.label}` : ''}.`)
  bits.push(`Highest is ${say(hi.y)} at ${hi.label}, lowest is ${say(lo.y)} at ${lo.label}.`)

  if (timeAxis && first.y !== 0) {
    const change = ((last.y - first.y) / Math.abs(first.y)) * 100
    const dir = change > 0 ? 'above' : 'below'
    bits.push(`It ends ${Math.abs(Math.round(change))}% ${dir} where it starts.`)
  } else if (!timeAxis && hi.y !== 0) {
    const ratio = lo.y === 0 ? null : hi.y / lo.y
    bits.push(ratio && Number.isFinite(ratio) && ratio > 1
      ? `The largest is ${ratio >= 10 ? Math.round(ratio) : Math.round(ratio * 10) / 10} times the smallest.`
      : `The spread runs from ${say(lo.y)} to ${say(hi.y)}.`)
  }

  bits.push('That describes the shape and nothing else. Why it looks like this is not something a chart can tell you.')
  return bits.join(' ')
}

function readsScatter(pts: Point[], xLabel: string, yLabel: string): string {
  const n = pts.length
  const mx = pts.reduce((s, p) => s + p.x, 0) / n
  const my = pts.reduce((s, p) => s + p.y, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (const p of pts) { const a = p.x - mx, b = p.y - my; sxy += a * b; sxx += a * a; syy += b * b }
  const denom = Math.sqrt(sxx * syy)

  const bits = [`${n} points, one per row.`]
  if (n < 8 || denom === 0) {
    bits.push('Too few points, or too little variation in them, to say anything about how the two move together.')
  } else {
    const r = sxy / denom
    const strength = Math.abs(r) >= 0.7 ? 'closely' : Math.abs(r) >= 0.4 ? 'loosely' : 'barely'
    bits.push(r >= 0 && Math.abs(r) >= 0.4
      ? `${yLabel} tracks ${xLabel} ${strength} upward, r of ${Math.round(r * 100) / 100}.`
      : Math.abs(r) < 0.4
        ? `The two move together ${strength}, r of ${Math.round(r * 100) / 100}, which is close enough to nothing that the cloud is the honest answer.`
        : `${yLabel} runs ${strength} against ${xLabel}, r of ${Math.round(r * 100) / 100}.`)
    bits.push('That is how they move together, which is not evidence that one causes the other.')
  }
  return bits.join(' ')
}
