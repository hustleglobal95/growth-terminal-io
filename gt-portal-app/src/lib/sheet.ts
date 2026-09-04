/** READING A SPREADSHEET IN THE BROWSER.
 *
 * This is a deliberate port of serializeSheets() from the Sheets add-on, and
 * it is a port rather than a fresh implementation for one reason: the engine
 * must not be able to tell the difference between a workbook that arrived
 * through the add-on and one that was dragged onto this screen.
 *
 * The last time an upload path existed it fed the engine anything it was
 * given, and the analyses came back wrong for a while. The failure was never
 * in the engine. It was that the add-on's safety lives in five checks that
 * run before anything is sent, and the upload path did not have them. All
 * five are below, with the same constants the add-on uses.
 *
 * If you change a limit here, change it in Code.gs too, or the two intakes
 * start disagreeing about what a workbook is.
 *
 * ── 3 September 2026 ────────────────────────────────────────────────────────
 * The claim in the second paragraph was not true. The engine could tell the
 * difference, easily, because this file sent `values` and nothing else.
 *
 * `AddonSheetPayload` carries `numberFormats`, `formulas`, `mergedRanges`,
 * `frozenRows` and `hidden`, and the interpreter is written to use all of
 * them. An uploaded workbook arrived with every one of them missing or
 * hardcoded, so on the upload path:
 *
 *   - `readCellValue` had no format to read, which is what separates a
 *     percent from a fraction, money from a bare number, and a date serial
 *     from a quantity. The regression case proving serials become dates
 *     passes `numberFormats` explicitly. Uploads had none.
 *   - `detectHeaders` takes `mergedRanges` and `frozenRows`. Both were
 *     absent, so a stacked two row header could never be merged and the
 *     strongest structural header signal was thrown away before sending.
 *   - a sheet cut at MAX_ROWS_PER_SHEET arrived looking complete, because
 *     `rowCount` was set to the number of rows sent rather than the number
 *     of rows in the sheet. Every total, count and trend over a large sheet
 *     was silently computed over part of it.
 *
 * All four are fixed below. The reading now walks cells rather than going
 * through sheet_to_json, because sheet_to_json returns values only and the
 * formats are on the cell objects.
 *
 * Measured, not assumed: `cellNF: true` puts the number format on `cell.z`,
 * merges are on `ws['!merges']`, and per sheet visibility is on
 * `wb.Workbook.Sheets[i].Hidden`. Frozen panes are NOT exposed by SheetJS on
 * read, so `frozenRows` stays 0 and says so here rather than pretending.
 */

/* Loaded on demand, not at boot. The parser is roughly 350KB and only the
people who actually drop a file need it; charging that to every page load,
including the ones that never see this screen, is a tax on the whole app
for one feature. */
type XLSXModule = typeof import('xlsx')
let xlsxPromise: Promise<XLSXModule> | null = null
const loadXLSX = (): Promise<XLSXModule> => (xlsxPromise ||= import('xlsx'))

/* The add-on's constants, verbatim. The server truncates past these anyway. */
export const MAX_ROWS_PER_SHEET = 2000
export const MAX_COLS_PER_SHEET = 50
export const MAX_SHEETS = 10

/* Growth Terminal writes its plan back into the workbook as a tab with this
prefix. Skipping it is what stops a second run analysing the first result. */
const PLAN_SHEET_BASE = 'Growth Terminal'

/** The v2 AddonWorkbookPayload. Key order and names match Code.gs exactly,
 * because an unexpected key is the cheapest way to fail a schema.
 *
 * The optional signal layers are the same shape as `values`: one entry per
 * cell, empty string where there is nothing. That is the add-on's convention
 * and the normaliser expects it. A ragged layer is worse than no layer,
 * because the interpreter indexes into it by row and column. */
export type SheetPayload = {
  sheetId: number
  title: string
  index: number
  hidden: boolean
  frozenRows: number
  frozenColumns: number
  tabColor: string | null
  rowCount: number // rows in the SHEET, not rows sent. See truncation below.
  columnCount: number
  values: (string | number | boolean)[][] // values[0] is the header
  numberFormats?: string[][]
  formulas?: string[][]
  mergedRanges?: string[]
}

export type WorkbookPayload = {
  version: '2.0'
  spreadsheetId: string
  title: string
  sheets: SheetPayload[]
}

export type Truncation = { sheet: string; total: number; used: number }

/** A tab that was read, and one that was not, with the reason. Skipped tabs
 * are reported rather than dropped silently: a customer who uploads a
 * workbook with a tab missing from the analysis should be told which and
 * why, not left to notice on their own. */
export type SheetSummary = {
  title: string
  rows: number // data rows sent, header excluded
  columns: number
  included: boolean
  reason?: string
  headers: string[]
  sample: (string | number | boolean)[][] // up to 5 data rows, for preview
  numericColumns: number
  dateColumns: number
  /** true when this tab was cut at the row limit. The screen says so, and
   * the payload carries it too through rowCount. */
  truncated?: boolean
}

export type ReadResult = {
  workbook: WorkbookPayload
  truncated: Truncation[]
  summaries: SheetSummary[]
  hasNumbers: boolean
  fileName: string
  totalDataRows: number
  /** What was and was not recoverable from this file, so the screen can say
   * it and the engine is not left to infer it from absence. */
  signals: {
    numberFormats: boolean
    mergedRanges: boolean
    formulas: boolean
    frozenPanes: false
  }
}

const isPlanSheet = (n: string) => String(n || '').indexOf(PLAN_SHEET_BASE) === 0

/** Dates to ISO, blanks to empty string. The add-on does the same, and the
 * normaliser downstream expects it. */
function normalizeCell(cell: unknown): string | number | boolean {
  if (cell instanceof Date) return cell.toISOString()
  if (cell === null || cell === undefined) return ''
  if (typeof cell === 'number' || typeof cell === 'boolean') return cell
  return String(cell)
}

/** At least one numeric cell below a header row, anywhere. The add-on refuses
 * before spending a credit rather than failing after, and so does this. */
export function hasNumericData(sheets: SheetPayload[]): boolean {
  for (const s of sheets)
    for (let r = 1; r < s.values.length; r++)
      for (const c of s.values[r])
        if (typeof c === 'number' && isFinite(c)) return true
  return false
}

/** Looks like a date, for the readiness panel only. Never used to decide what
 * is sent: the server does its own typing, and a second opinion here would
 * be a second source of truth. */
function looksLikeDate(v: unknown): boolean {
  if (typeof v !== 'string') return false
  return /^\d{4}-\d{2}-\d{2}/.test(v) || /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(v)
}

function columnStats(values: (string | number | boolean)[][], colCount: number) {
  let numeric = 0, dates = 0
  for (let c = 0; c < colCount; c++) {
    let nums = 0, dts = 0, seen = 0
    for (let r = 1; r < values.length; r++) {
      const v = values[r]?.[c]
      if (v === '' || v === undefined) continue
      seen++
      if (typeof v === 'number' && isFinite(v)) nums++
      else if (looksLikeDate(v)) dts++
    }
    if (seen > 0 && nums / seen > 0.6) numeric++
    else if (seen > 0 && dts / seen > 0.6) dates++
  }
  return { numeric, dates }
}

/** Read a File the customer dropped, and produce the same payload the add-on
 * produces. Throws only on a file the parser cannot open at all; everything
 * else is reported in the result so the screen can explain it. */
export async function readWorkbook(file: File): Promise<ReadResult> {
  const XLSX = await loadXLSX()
  const buf = await file.arrayBuffer()

  /* cellNF puts the number format on cell.z, which is the whole point of this
     rewrite. cellStyles is what makes SheetJS populate visibility and tab
     colour on wb.Workbook.Sheets. cellDates stays: a cell the spreadsheet
     itself considers a date arrives as a real Date and leaves here as an ISO
     string, which is what the engine relies on. */
  const wb = XLSX.read(buf, { type: 'array', cellDates: true, cellNF: true, cellStyles: true })
  const meta = wb.Workbook?.Sheets ?? []

  const sheets: SheetPayload[] = []
  const truncated: Truncation[] = []
  const summaries: SheetSummary[] = []

  let sawFormats = false, sawMerges = false, sawFormulas = false

  for (let i = 0; i < wb.SheetNames.length; i++) {
    const name = wb.SheetNames[i]

    if (isPlanSheet(name)) {
      summaries.push(blankSummary(name, 'This is a Growth Terminal output tab, so it is not analysed.'))
      continue
    }
    if (sheets.length >= MAX_SHEETS) {
      summaries.push(blankSummary(name, 'Past the ten tab limit.'))
      continue
    }

    const ws = wb.Sheets[name]
    if (!ws || !ws['!ref']) {
      summaries.push(blankSummary(name, 'Empty.'))
      continue
    }

    /* A hidden tab is reported rather than silently analysed. Somebody hid it
       for a reason and it is usually working notes, but the decision belongs
       to the customer, so it is sent with the flag set rather than dropped. */
    const hidden = (meta[i]?.Hidden ?? 0) !== 0

    const range = XLSX.utils.decode_range(ws['!ref'])
    const lastRow = range.e.r + 1
    const lastCol = Math.min(range.e.c + 1, MAX_COLS_PER_SHEET)
    if (lastRow < 2 || lastCol < 1) {
      summaries.push(blankSummary(name, lastRow < 2 ? 'Header row only, no data under it.' : 'No columns.'))
      continue
    }

    const readRows = Math.min(lastRow, MAX_ROWS_PER_SHEET)
    const wasCut = lastRow > MAX_ROWS_PER_SHEET

    /* Walk the cells rather than going through sheet_to_json. sheet_to_json
       returns values only, and the formats are on the cell objects, so the
       old path could not have carried them however it was configured.
       Walking also guarantees the layers are rectangular and aligned, which
       matters because the interpreter indexes into them by row and column. */
    const values: (string | number | boolean)[][] = []
    const numberFormats: string[][] = []
    const formulas: string[][] = []
    let formatCount = 0, formulaCount = 0

    for (let r = 0; r < readRows; r++) {
      const vRow: (string | number | boolean)[] = new Array(lastCol)
      const fRow: string[] = new Array(lastCol)
      const xRow: string[] = new Array(lastCol)
      for (let c = 0; c < lastCol; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })] as
          | { v?: unknown; z?: string | number; f?: string }
          | undefined
        vRow[c] = normalizeCell(cell?.v)
        const z = cell?.z === undefined ? '' : String(cell.z)
        fRow[c] = z
        if (z) formatCount++
        const f = cell?.f ?? ''
        xRow[c] = f
        if (f) formulaCount++
      }
      values.push(vRow)
      numberFormats.push(fRow)
      formulas.push(xRow)
    }

    /* A1 notation, which is what the add-on sends and what detectHeaders
       parses. Merges outside the read window are dropped rather than sent
       pointing at rows that were never included. */
    const merges = (ws['!merges'] ?? [])
      .filter(m => m.s.r < readRows && m.s.c < lastCol)
      .map(m => XLSX.utils.encode_range({
        s: { r: m.s.r, c: m.s.c },
        e: { r: Math.min(m.e.r, readRows - 1), c: Math.min(m.e.c, lastCol - 1) }
      }))

    if (formatCount) sawFormats = true
    if (merges.length) sawMerges = true
    if (formulaCount) sawFormulas = true

    if (wasCut) truncated.push({ sheet: name, total: lastRow, used: MAX_ROWS_PER_SHEET })

    sheets.push({
      sheetId: i,
      title: name,
      index: i,
      hidden,
      /* SheetJS does not expose frozen panes on read. Measured, not assumed:
         ws['!freeze'] is undefined on a round tripped workbook that had them.
         Sending 0 is honest; sending a guess would put a false header signal
         into detectHeaders, which is worse than sending none. */
      frozenRows: 0,
      frozenColumns: 0,
      /* SheetJS populates a tab colour but does not declare one on SheetProps,
         so it is read through a narrow cast rather than left out. */
      tabColor: tabColorOf(meta[i]),
      /* Rows in the SHEET, per the field's documented meaning, not rows sent.
         When these differ the engine can see the sheet was cut and refuse to
         report a total over it. Setting this to values.length, as it was, is
         what made a truncated sheet look complete. */
      rowCount: lastRow,
      columnCount: lastCol,
      values,
      numberFormats,
      formulas,
      mergedRanges: merges
    })

    const stats = columnStats(values, lastCol)
    summaries.push({
      title: name,
      rows: values.length - 1,
      columns: lastCol,
      included: true,
      headers: values[0].map(h => String(h ?? '')),
      sample: values.slice(1, 6),
      numericColumns: stats.numeric,
      dateColumns: stats.dates,
      truncated: wasCut
    })
  }

  const workbook: WorkbookPayload = {
    version: '2.0',
    spreadsheetId: 'upload:' + file.name,
    title: file.name.replace(/\.[^.]+$/, ''),
    sheets
  }

  return {
    workbook,
    truncated,
    summaries,
    hasNumbers: hasNumericData(sheets),
    fileName: file.name,
    /* Data rows actually sent. Not the same as the rows in the file when a
       tab was cut, and the screen should say so rather than quoting this as
       the size of the upload. */
    totalDataRows: sheets.reduce((a, s) => a + Math.max(0, s.values.length - 1), 0),
    signals: {
      numberFormats: sawFormats,
      mergedRanges: sawMerges,
      formulas: sawFormulas,
      frozenPanes: false
    }
  }
}

function tabColorOf(m: unknown): string | null {
  const rgb = (m as { TabColor?: { rgb?: string } } | undefined)?.TabColor?.rgb
  return rgb ? '#' + String(rgb).slice(-6) : null
}

function blankSummary(title: string, reason: string): SheetSummary {
  return { title, rows: 0, columns: 0, included: false, reason, headers: [], sample: [], numericColumns: 0, dateColumns: 0 }
}

/** Why the workbook cannot be analysed, in the customer's words, or null if
 * it can. Mirrors the two refusals the add-on makes before spending a
 * credit. */
export function blockingReason(r: ReadResult): string | null {
  if (!r.workbook.sheets.length)
    return 'No readable business data found in this file. Every tab is empty, or has a header row with nothing under it.'
  if (!r.hasNumbers)
    return 'Growth Terminal needs numbers to analyse. Every tab here is text only. Add at least one tab with a header row and numeric rows such as revenue, spend, orders or users.'
  return null
}

/** Things worth telling the customer before they spend a credit. Not
 * blocking, because none of them make the workbook unanalysable, but every
 * one of them changes what the analysis can honestly claim. A csv carries no
 * formats at all, which is the common case and is worth saying out loud
 * rather than leaving to be discovered in a weaker result. */
export function readingNotes(r: ReadResult): string[] {
  const notes: string[] = []
  for (const t of r.truncated) {
    notes.push(
      `${t.sheet} has ${t.total.toLocaleString()} rows and the first ${t.used.toLocaleString()} were read. ` +
      `Totals and trends for that tab describe the part that was read, not the whole tab.`
    )
  }
  if (!r.signals.numberFormats && r.workbook.sheets.length) {
    notes.push(
      'This file carries no cell formatting, which is normal for a csv. ' +
      'Without it a percentage stored as 0.12 and one stored as 12 look the same, and a date stored as a number cannot be told from a quantity. ' +
      'An xlsx export of the same data is read more accurately.'
    )
  }
  const hiddenTabs = r.workbook.sheets.filter(s => s.hidden).map(s => s.title)
  if (hiddenTabs.length) {
    notes.push(`Hidden ${hiddenTabs.length === 1 ? 'tab' : 'tabs'} included: ${hiddenTabs.join(', ')}.`)
  }
  return notes
}
