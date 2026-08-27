/** WHAT THE ASSISTANT ALREADY KNOWS.
 *
 *  The customer never restates their business, their dataset or their analysis.
 *  That is the whole requirement, and it is why this is one resolver read by
 *  every part of the assistant rather than each part gathering its own. Two
 *  gatherers drift, and the first time the formula side and the chart side
 *  disagree about which business is selected the product looks broken in a way
 *  that is hard to trace.
 *
 *  THE GRANT IS PER USER AND STANDING. One decision, made once, applying to
 *  everything until the customer withdraws it. Not per workbook: a permission
 *  that has to be given again for every sheet stops being a decision and starts
 *  being a click somebody learns to dismiss.
 *
 *  WHAT THE GRANT ACTUALLY GOVERNS, stated precisely because overstating it
 *  would be its own kind of dishonesty. The engine already holds the cell
 *  values of every analysed workbook: intake.ts sends `raw: workbook` on
 *  ingest and WorkbookPayload carries every cell. So this is not a new
 *  disclosure to the engine. It governs one thing, whether rows may be put in
 *  front of a model, and that is the line the copy should describe.
 *
 *  Minimum necessary still applies after the grant. The assistant is sent the
 *  columns a question is about, not the workbook. A formula has never needed
 *  the customer names or the email column, and having permission is not the
 *  same as having a reason.
 */

/* Structural rather than imported, so the resolver can be tested without the
   xlsx parser, the API client or a browser. Each mirrors a real type: see
   sheet.ts, api.ts and liveData.ts. */

export interface SheetFacts {
  title: string
  headers: string[]
  rows: number
  numericColumns: number
  dateColumns: number
  /** Up to five data rows. sheet.ts collects these for its own preview. They
   *  are the only per column type evidence that exists, because numericColumns
   *  and dateColumns are counts and never say which. */
  sample: (string | number | boolean)[][]
  included: boolean
  reason?: string
}

export interface WorkbookFacts { fileName: string; sheets: SheetFacts[]; totalDataRows: number }

export interface BusinessFacts { id: string; slug: string; name: string; label: string; syncedAt: string | null }

export interface AnalysisFacts {
  id: string
  status: string
  constraintTitle: string | null
  constraintCategory: string | null
  confidence: string | null
  monthlyUpside: string | null
  horizonWeeks: number | null
  rootCauses: string[]
  supporting: string[]
  contradicting: string[]
  limitations: string[]
  gates: { question: string; criteria: string }[]
  indicators: string[]
}

/** The operator's own record of being right. This exists only because the
 *  assistant works for them and nobody else is in the room: an assistant
 *  pointed at a client could never say a forecast has been running optimistic.
 *  It is also the product's own argument turned on the person using it, which
 *  is the most useful thing here and the reason not to leave it out. */
export interface CalibrationFacts {
  predictions: number
  graded: number
  coverage: number
  targetCoverage: number
  sampleSize: number
}

export type ColumnKind = 'number' | 'date' | 'text' | 'empty'

/** A column as the assistant sees it. `values` is present only under a grant,
 *  and only for the columns a question is about. */
export interface ColumnFacts {
  header: string
  letter: string
  kind: ColumnKind
  blanks: number | null
  values?: (string | number | boolean)[]
}

export interface AgentContext {
  user: { name: string; workspace: string; role: string }
  business: BusinessFacts | null
  businesses: BusinessFacts[]
  analysis: AnalysisFacts | null
  workbook: WorkbookFacts | null
  calibration: CalibrationFacts | null
  /** Standing, per user, until withdrawn. */
  valuesGranted: boolean
  /** Resolved columns for the tab in play. Carries values only under a grant. */
  columns: ColumnFacts[]
  /** What the assistant is working without. Sent so the engine can ask for it
   *  rather than guess, and shown so the customer can see why it hedged. */
  blind: string[]
}

/* ------------------------------------------------------------- resolving -- */

export function colLetter(i: number): string {
  if (i < 0 || !Number.isFinite(i)) throw new Error('column index out of range: ' + i)
  let s = '', n = Math.floor(i)
  for (;;) { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; if (n < 0) break }
  return s
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]|$)/
const SERIAL_MIN = 20000, SERIAL_MAX = 60000

/** Judged from the sample rows. A column of order counts in the thousands
 *  looks exactly like a column of nineteen seventies date serials, so a serial
 *  is only called a date when the whole column sits inside a plausible range. */
export function columnKind(sheet: SheetFacts, header: string): ColumnKind {
  const i = sheet.headers.indexOf(header)
  if (i < 0) return 'empty'
  const cells = sheet.sample.map(r => r[i]).filter(v => v !== '' && v !== null && v !== undefined)
  if (!cells.length) return 'empty'
  let n = 0, d = 0, t = 0
  const allSerial = cells.every(v => typeof v === 'number' && v >= SERIAL_MIN && v <= SERIAL_MAX)
  for (const v of cells) {
    if (typeof v === 'number') { if (allSerial) d++; else n++; continue }
    if (typeof v === 'boolean') { t++; continue }
    const s = String(v).trim()
    if (ISO_DATE.test(s)) { d++; continue }
    if (s !== '' && Number.isFinite(Number(s.replace(/[,%$\s]/g, '')))) { n++; continue }
    t++
  }
  if (d >= n && d >= t) return 'date'
  if (n >= t) return 'number'
  return 'text'
}

/** Columns that never travel, grant or no grant. Not a privacy theatre list:
 *  a formula, a chart and a page have never needed any of these, so sending
 *  them would be collection without a reason. Matched on the header, loosely,
 *  because a header is what there is. */
const NEVER = /(^|[\s_-])(e?mail|phone|mobile|address|postcode|zip|ssn|nino?|passport|dob|birth|password|card|iban|account\s*number)([\s_-]|$)/i

export function neverSend(header: string): boolean { return NEVER.test(String(header)) }

export interface ResolveOptions {
  /** Only the columns a question is about. Empty means every column's shape,
   *  which is structure, never values. */
  wanted?: string[]
  fullValues?: boolean
}

/** Build the column facts for one tab. Values ride along only when the grant is
 *  standing, the column was asked for, and it is not on the never list. */
export function resolveColumns(
  sheet: SheetFacts, granted: boolean, opts: ResolveOptions = {},
): ColumnFacts[] {
  const wanted = opts.wanted && opts.wanted.length ? new Set(opts.wanted) : null
  return sheet.headers.map((header, i) => {
    const kind = columnKind(sheet, header)
    const asked = !wanted || wanted.has(header)
    const allowed = granted && asked && !neverSend(header)
    const col: ColumnFacts = { header, letter: colLetter(i), kind, blanks: null }
    if (!allowed) return col
    const rows = opts.fullValues ? sheet.sample : sheet.sample
    const values = rows.map(r => (r[i] === undefined || r[i] === null ? '' : r[i]))
    col.values = values
    col.blanks = values.filter(v => v === '').length
    return col
  })
}

/** What it could not see, in the words the copy should use. This is the list
 *  that turns a caveat into a check: without values the assistant writes
 *  "assumes no blank rows", with them it writes "row 47 is blank and here is
 *  the formula that handles it". */
export function blindSpots(ctx: Omit<AgentContext, 'blind'>): string[] {
  const out: string[] = []
  if (!ctx.workbook) out.push('No workbook is loaded, so nothing can be written against real columns.')
  if (!ctx.analysis) out.push('No analysis is selected, so there is no constraint, plan or falsifier to draw on.')
  if (!ctx.business) out.push('No business is selected.')
  if (!ctx.valuesGranted) {
    out.push('Cell values were not shared, so column types are judged from a five row sample and may be wrong.')
    out.push('Cell values were not shared, so the exact wording inside a column is unknown. A count that has to match a word cannot be written without asking.')
    out.push('Cell values were not shared, so blank rows inside a column cannot be detected, and a gap changes a count.')
  }
  const dropped = ctx.workbook?.sheets.filter(s => !s.included) ?? []
  for (const s of dropped) out.push(`The tab ${s.title} was not read${s.reason ? ': ' + s.reason : '.'}`)
  const held = ctx.columns.filter(c => neverSend(c.header))
  if (ctx.valuesGranted && held.length)
    out.push(`Held back regardless of the grant, because nothing here needs them: ${held.map(c => c.header).join(', ')}.`)
  return out
}

export interface BuildContextInput {
  user: { name: string; workspace: string; role: string }
  business: BusinessFacts | null
  businesses: BusinessFacts[]
  analysis: AnalysisFacts | null
  workbook: WorkbookFacts | null
  calibration: CalibrationFacts | null
  valuesGranted: boolean
  /** Which tab the question is about. Defaults to the first included tab. */
  sheetTitle?: string
  wantedColumns?: string[]
}

export function buildContext(inp: BuildContextInput): AgentContext {
  const sheets = inp.workbook?.sheets.filter(s => s.included) ?? []
  const sheet = inp.sheetTitle
    ? sheets.find(s => s.title === inp.sheetTitle) ?? null
    : sheets[0] ?? null
  const columns = sheet ? resolveColumns(sheet, inp.valuesGranted, { wanted: inp.wantedColumns }) : []
  const base = {
    user: inp.user, business: inp.business, businesses: inp.businesses,
    analysis: inp.analysis, workbook: inp.workbook, calibration: inp.calibration,
    valuesGranted: inp.valuesGranted, columns,
  }
  return { ...base, blind: blindSpots(base) }
}

/** Proof that no value left the client without a grant. Called on the request
 *  body immediately before it is sent, so the guarantee is enforced at the wire
 *  rather than asserted in a comment. */
export function assertNoValuesWithoutGrant(ctx: AgentContext): void {
  if (ctx.valuesGranted) {
    const leaked = ctx.columns.filter(c => c.values && neverSend(c.header))
    if (leaked.length) throw new Error('Held back columns carried values: ' + leaked.map(c => c.header).join(', '))
    return
  }
  const withValues = ctx.columns.filter(c => c.values !== undefined)
  if (withValues.length) throw new Error('Values present without a grant: ' + withValues.map(c => c.header).join(', '))
}
