/** READING A SPREADSHEET IN THE BROWSER.
 *
 *  This is a deliberate port of serializeSheets() from the Sheets add-on, and
 *  it is a port rather than a fresh implementation for one reason: the engine
 *  must not be able to tell the difference between a workbook that arrived
 *  through the add-on and one that was dragged onto this screen.
 *
 *  The last time an upload path existed it fed the engine anything it was
 *  given, and the analyses came back wrong for a while. The failure was never
 *  in the engine. It was that the add-on's safety lives in five checks that
 *  run before anything is sent, and the upload path did not have them. All
 *  five are below, with the same constants the add-on uses.
 *
 *  If you change a limit here, change it in Code.gs too, or the two intakes
 *  start disagreeing about what a workbook is.
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
 *  because an unexpected key is the cheapest way to fail a schema. */
export type SheetPayload = {
  sheetId: number
  title: string
  index: number
  hidden: boolean
  frozenRows: number
  frozenColumns: number
  tabColor: string | null
  rowCount: number      // includes the header row
  columnCount: number
  values: (string | number | boolean)[][]   // values[0] is the header
}

export type WorkbookPayload = {
  version: '2.0'
  spreadsheetId: string
  title: string
  sheets: SheetPayload[]
}

export type Truncation = { sheet: string; total: number; used: number }

/** A tab that was read, and one that was not, with the reason. Skipped tabs
 *  are reported rather than dropped silently: a customer who uploads a
 *  workbook with a tab missing from the analysis should be told which and
 *  why, not left to notice on their own. */
export type SheetSummary = {
  title: string
  rows: number          // data rows, header excluded
  columns: number
  included: boolean
  reason?: string
  headers: string[]
  sample: (string | number | boolean)[][]   // up to 5 data rows, for preview
  numericColumns: number
  dateColumns: number
}

export type ReadResult = {
  workbook: WorkbookPayload
  truncated: Truncation[]
  summaries: SheetSummary[]
  hasNumbers: boolean
  fileName: string
  totalDataRows: number
}

const isPlanSheet = (n: string) => String(n || '').indexOf(PLAN_SHEET_BASE) === 0

/** Dates to ISO, blanks to empty string. The add-on does the same, and the
 *  normaliser downstream expects it. */
function normalizeValues(rows: unknown[][]): (string | number | boolean)[][] {
  return rows.map(row => row.map(cell => {
    if (cell instanceof Date) return cell.toISOString()
    if (cell === null || cell === undefined) return ''
    if (typeof cell === 'number' || typeof cell === 'boolean') return cell
    return String(cell)
  }))
}

/** At least one numeric cell below a header row, anywhere. The add-on refuses
 *  before spending a credit rather than failing after, and so does this. */
export function hasNumericData(sheets: SheetPayload[]): boolean {
  for (const s of sheets)
    for (let r = 1; r < s.values.length; r++)
      for (const c of s.values[r])
        if (typeof c === 'number' && isFinite(c)) return true
  return false
}

/** Looks like a date, for the readiness panel only. Never used to decide what
 *  is sent: the server does its own typing, and a second opinion here would
 *  be a second source of truth. */
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
 *  produces. Throws only on a file the parser cannot open at all; everything
 *  else is reported in the result so the screen can explain it. */
export async function readWorkbook(file: File): Promise<ReadResult> {
  const XLSX = await loadXLSX()
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array', cellDates: true })

  const sheets: SheetPayload[] = []
  const truncated: Truncation[] = []
  const summaries: SheetSummary[] = []

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

    const range = XLSX.utils.decode_range(ws['!ref'])
    const lastRow = range.e.r + 1
    const lastCol = Math.min(range.e.c + 1, MAX_COLS_PER_SHEET)
    if (lastRow < 2 || lastCol < 1) {
      summaries.push(blankSummary(name, lastRow < 2 ? 'Header row only, no data under it.' : 'No columns.'))
      continue
    }

    const readRows = Math.min(lastRow, MAX_ROWS_PER_SHEET)
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1, raw: true, defval: '', blankrows: true,
      range: { s: { r: 0, c: 0 }, e: { r: readRows - 1, c: lastCol - 1 } }
    })
    /* sheet_to_json returns ragged rows. The payload must be rectangular or
       the header and the data stop lining up on the server. */
    for (const row of grid) while (row.length < lastCol) row.push('')

    const values = normalizeValues(grid)
    if (lastRow > MAX_ROWS_PER_SHEET) truncated.push({ sheet: name, total: lastRow, used: MAX_ROWS_PER_SHEET })

    sheets.push({
      sheetId: i, title: name, index: i, hidden: false,
      frozenRows: 0, frozenColumns: 0, tabColor: null,
      rowCount: values.length, columnCount: lastCol, values
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
      dateColumns: stats.dates
    })
  }

  const workbook: WorkbookPayload = {
    version: '2.0',
    spreadsheetId: 'upload:' + file.name,
    title: file.name.replace(/\.[^.]+$/, ''),
    sheets
  }

  return {
    workbook, truncated, summaries,
    hasNumbers: hasNumericData(sheets),
    fileName: file.name,
    totalDataRows: sheets.reduce((a, s) => a + (s.rowCount - 1), 0)
  }
}

function blankSummary(title: string, reason: string): SheetSummary {
  return { title, rows: 0, columns: 0, included: false, reason, headers: [], sample: [], numericColumns: 0, dateColumns: 0 }
}

/** Why the workbook cannot be analysed, in the customer's words, or null if
 *  it can. Mirrors the two refusals the add-on makes before spending a
 *  credit. */
export function blockingReason(r: ReadResult): string | null {
  if (!r.workbook.sheets.length)
    return 'No readable business data found in this file. Every tab is empty, or has a header row with nothing under it.'
  if (!r.hasNumbers)
    return 'Growth Terminal needs numbers to analyse. Every tab here is text only. Add at least one tab with a header row and numeric rows such as revenue, spend, orders or users.'
  return null
}
