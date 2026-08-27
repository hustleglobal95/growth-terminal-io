/** CHECKING A GENERATED FORMULA BEFORE A CUSTOMER SEES IT.
 *
 *  This is the piece that makes generation safe to ship. A model can write a
 *  formula that points at a column the sheet does not have, or reaches past the
 *  last row, or uses a function the customer's Excel has never heard of, and
 *  every one of those looks exactly as convincing as a correct formula. The
 *  customer pastes it into their own instrument and finds out later.
 *
 *  So nothing goes on screen unchecked. Five checks, in the order that catches
 *  the worst failure soonest:
 *
 *    1. shape        brackets and quotes balance, and it starts with an equals
 *    2. references   every column exists, every row is inside the data
 *    3. dialect      no function the target app does not have
 *    4. dry run      execute it against the customer's own sample rows
 *    5. blanket      does it error on every single row
 *
 *  Four and five are the ones worth having. A formula can pass every static
 *  check and still return an error on every row of the customer's actual data,
 *  and only running it finds that.
 *
 *  A failed check is not a silent retry. It is reported, with the reason, so
 *  the assistant can say it could not write this rather than show something it
 *  does not stand behind.
 */
import type { ColumnFacts, SheetFacts } from './agentContext'
import { colLetter } from './agentContext'
import { evaluateFormula, isError, SUPPORTED, type Grid, type CellValue } from './sheetEval'

export type Dialect = 'sheets' | 'excel'

export type ProblemCode =
  | 'not-a-formula' | 'brackets' | 'quotes'
  | 'unknown-column' | 'row-out-of-range'
  | 'unknown-function' | 'wrong-dialect' | 'reaches-out'
  | 'errors-everywhere' | 'could-not-run'

export interface Problem { code: ProblemCode; says: string }

export interface CheckResult {
  ok: boolean
  problems: Problem[]
  /** What it returned on each sample row, when it ran. Shown to the customer as
   *  a preview, because a number they recognise is the fastest proof it is
   *  right and the fastest way to spot that it is not. */
  preview: { row: number; value: string }[]
  /** Notes that are not failures. A formula that is blank on some rows may be
   *  correct: the first row of a growth column has nothing to compare against. */
  notes: string[]
}

/* Functions that exist in one app and not the other, or not in every version.
   Only the ones a growth formula plausibly reaches for. Anything absent from
   both lists is judged by the evaluator instead. */
const SHEETS_ONLY = ['QUERY', 'ARRAYFORMULA', 'SPARKLINE', 'GOOGLEFINANCE', 'IMPORTRANGE', 'FLATTEN', 'SPLIT', 'JOIN', 'REGEXEXTRACT', 'REGEXMATCH', 'REGEXREPLACE']
const EXCEL_ONLY = ['XLOOKUP', 'LET', 'LAMBDA', 'TEXTJOIN', 'IFS', 'SWITCH', 'STDEV.S', 'STDEV.P', 'AGGREGATE']
/* Functions that can reach outside the workbook. A formula is data the
   customer pastes into their own sheet and runs with their own credentials, so
   one of these turns a generated string into a way to send their rows to
   somebody else's server, or to pull somebody else's content into their sheet.
   Nothing a growth measurement needs is on this list, so it is refused outright
   rather than weighed. The engine rejects these too. This is the second lock,
   here because a response can be rewritten between the engine and this screen
   and the customer would never see it happen. */
const REACHES_OUT = ['IMPORTRANGE', 'IMPORTDATA', 'IMPORTXML', 'IMPORTHTML', 'IMPORTFEED', 'IMAGE', 'HYPERLINK', 'WEBSERVICE', 'FILTERXML', 'ENCODEURL', 'GOOGLEFINANCE', 'GOOGLETRANSLATE', 'DETECTLANGUAGE', 'RTD']

const MODERN_EXCEL = ['SEQUENCE', 'FILTER', 'SORT', 'UNIQUE', 'RANDARRAY', 'TEXTSPLIT']

const fnNames = (f: string): string[] => {
  const out: string[] = []
  const re = /([A-Z][A-Z0-9._]*)\s*\(/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(f))) out.push(m[1].toUpperCase())
  return [...new Set(out)]
}

function shape(f: string, problems: Problem[]): boolean {
  if (typeof f !== 'string' || !f.trim()) { problems.push({ code: 'not-a-formula', says: 'The engine sent an empty formula.' }); return false }
  if (f[0] !== '=') { problems.push({ code: 'not-a-formula', says: 'A formula has to start with an equals sign. This one starts with ' + JSON.stringify(f.slice(0, 8)) + '.' }); return false }
  /* Quotes before brackets, and the order is the whole point of splitting the
     scan in two. An unterminated quote swallows the rest of the formula, so the
     brackets after it are never counted and it reports as an unclosed bracket.
     That sends somebody looking in the wrong place. The quote is the cause. */
  let inStr = false
  for (let i = 0; i < f.length; i++) {
    if (f[i] !== '"') continue
    if (inStr && f[i + 1] === '"') { i++; continue }
    inStr = !inStr
  }
  if (inStr) { problems.push({ code: 'quotes', says: 'It opens a piece of text with a quote mark and never closes it.' }); return false }

  let depth = 0
  inStr = false
  for (let i = 0; i < f.length; i++) {
    const c = f[i]
    if (c === '"') { if (inStr && f[i + 1] === '"') { i++; continue } inStr = !inStr; continue }
    if (inStr) continue
    if (c === '(') depth++
    else if (c === ')') { depth--; if (depth < 0) { problems.push({ code: 'brackets', says: 'It closes a bracket it never opened.' }); return false } }
  }
  if (depth !== 0) { problems.push({ code: 'brackets', says: `It leaves ${depth} bracket${depth === 1 ? '' : 's'} open.` }); return false }
  return true
}

/** Every A1 reference outside a string. Sheet qualified or not. */
function references(f: string): { col: string; row: number }[] {
  const out: { col: string; row: number }[] = []
  let inStr = false, buf = ''
  const flush = () => {
    const re = /(?:^|[^A-Z0-9_.!])\$?([A-Z]{1,3})\$?([0-9]{1,7})(?![A-Z0-9_(])/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(buf))) out.push({ col: m[1].toUpperCase(), row: parseInt(m[2], 10) })
    buf = ''
  }
  for (let i = 0; i < f.length; i++) {
    const c = f[i]
    if (c === '"') { if (inStr && f[i + 1] === '"') { i++; continue } if (!inStr) flush(); inStr = !inStr; continue }
    if (!inStr) buf += c
  }
  flush()
  return out
}

export interface CheckInput {
  formula: string
  dialect: Dialect
  sheet: SheetFacts
  columns: ColumnFacts[]
  /** Excel before 2021 has no dynamic arrays. Only asked about for Excel. */
  modernExcel?: boolean
}

export function checkFormula(inp: CheckInput): CheckResult {
  const problems: Problem[] = []
  const notes: string[] = []
  const preview: { row: number; value: string }[] = []
  const f = inp.formula

  if (!shape(f, problems)) return { ok: false, problems, preview, notes }

  /* 2. references. The letters the sheet actually has, and the rows it has. */
  const lastCol = inp.sheet.headers.length - 1
  const known = new Set(inp.sheet.headers.map((_, i) => colLetter(i)))
  const lastRow = inp.sheet.rows + 1
  for (const r of references(f)) {
    if (!known.has(r.col)) {
      const label = lastCol >= 0 ? `${colLetter(0)} to ${colLetter(lastCol)}` : 'none'
      problems.push({ code: 'unknown-column', says: `It points at column ${r.col}, and ${inp.sheet.title} only has ${label}.` })
    } else if (r.row < 2 || r.row > lastRow) {
      problems.push({ code: 'row-out-of-range', says: `It points at row ${r.row}. The data runs from row 2 to row ${lastRow}, and row 1 is the header.` })
    }
  }

  /* 3. dialect. */
  const used = fnNames(f)
  for (const fn of used) {
    if (REACHES_OUT.includes(fn))
      problems.push({ code: 'reaches-out', says: `${fn} can send or fetch data outside your workbook, and no measurement needs that. The formula is refused rather than shown.` })
    if (inp.dialect === 'excel' && SHEETS_ONLY.includes(fn))
      problems.push({ code: 'wrong-dialect', says: `${fn} is a Google Sheets function and this was asked for as Excel.` })
    if (inp.dialect === 'sheets' && EXCEL_ONLY.includes(fn))
      problems.push({ code: 'wrong-dialect', says: `${fn} is an Excel function and this was asked for as Google Sheets.` })
    if (inp.dialect === 'excel' && inp.modernExcel === false && MODERN_EXCEL.includes(fn))
      problems.push({ code: 'wrong-dialect', says: `${fn} needs Excel 2021 or Microsoft 365, and this workspace is set to an older Excel.` })
    if (!SUPPORTED.includes(fn) && !SHEETS_ONLY.includes(fn) && !EXCEL_ONLY.includes(fn) && !MODERN_EXCEL.includes(fn))
      problems.push({ code: 'unknown-function', says: `${fn} is not a function this check knows how to verify, so the formula cannot be confirmed rather than being passed on trust.` })
  }

  if (problems.length) return { ok: false, problems, preview, notes }

  /* 4. dry run against the customer's own sample rows. Values only exist under
        a grant, so without one there is nothing to run and that is said plainly
        rather than reported as a pass. */
  const withValues = inp.columns.filter(c => c.values && c.values.length)
  if (!withValues.length) {
    notes.push('Checked for shape, columns, rows and functions. Not run against your data, because cell values were not shared, so a formula that errors on every row would not have been caught here.')
    return { ok: true, problems, preview, notes }
  }

  const depth = Math.max(...withValues.map(c => c.values!.length))
  const grid: Grid = { [inp.sheet.title]: [] }
  const rows: CellValue[][] = [inp.sheet.headers.slice()]
  for (let r = 0; r < depth; r++) {
    const row: CellValue[] = []
    for (const h of inp.sheet.headers) {
      const col = inp.columns.find(c => c.header === h)
      row.push(col && col.values ? (col.values[r] ?? '') : '')
    }
    rows.push(row)
  }
  grid[inp.sheet.title] = rows

  let errored = 0, ran = 0, stoppedShort = false
  for (let r = 2; r <= rows.length; r++) {
    /* Move the formula down a row the way filling down would, leaving anchored
       references alone. That is what makes this a check of the column rather
       than a check of one cell. */
    const shifted = shiftRows(f, r - 2)
    /* Stop before the formula reaches past the sample. A growth formula on row
       r reads row r + 1, so the last row of a five row sample would compare
       against a row that is not there and return a confident wrong number.
       Reporting minus one hundred percent on a customer's last row, because the
       harness ran out of sample, is worse than reporting nothing. */
    if (references(shifted).some(x => x.row > rows.length)) { stoppedShort = true; break }
    let v: unknown
    try { v = evaluateFormula(shifted, grid, inp.sheet.title) }
    catch { problems.push({ code: 'could-not-run', says: 'The formula could not be read well enough to test against your data.' }); return { ok: false, problems, preview, notes } }
    ran++
    if (isError(v)) { errored++; preview.push({ row: r, value: 'error' }) }
    else preview.push({ row: r, value: v === '' ? 'blank' : String(v) })
  }

  if (ran && errored === ran) {
    problems.push({ code: 'errors-everywhere', says: `It errors on all ${ran} of the rows checked, so it would fill the column with errors.` })
    return { ok: false, problems, preview, notes }
  }
  if (stoppedShort) notes.push(`Checked on ${ran} row${ran === 1 ? '' : 's'}. It reads ahead of itself, so the last rows of the sample have nothing to compare against and were left out rather than guessed at.`)
  const blanks = preview.filter(p => p.value === 'blank').length
  if (blanks) notes.push(`${blanks} of the ${ran} rows checked come back blank. That is often correct, a growth column has nothing to compare on its first row, but check it is the rows you expect.`)
  if (errored) notes.push(`${errored} of the ${ran} rows checked error. The formula still works elsewhere, so look at what those rows hold.`)
  return { ok: true, problems, preview, notes }
}

/** Shift unanchored row numbers down by n, the way filling down does. A row
 *  number written as $7 is anchored and does not move. */
export function shiftRows(f: string, n: number): string {
  if (!n) return f
  let out = '', inStr = false
  for (let i = 0; i < f.length; i++) {
    const c = f[i]
    if (c === '"') { if (inStr && f[i + 1] === '"') { out += '""'; i++; continue } inStr = !inStr; out += c; continue }
    if (inStr) { out += c; continue }
    const m = /^(\$?[A-Z]{1,3})(\$?)([0-9]{1,7})/i.exec(f.slice(i))
    if (m && !/[A-Z0-9_.]/i.test(f[i - 1] || '')) {
      out += m[1] + m[2] + (m[2] === '$' ? m[3] : String(parseInt(m[3], 10) + n))
      i += m[0].length - 1
      continue
    }
    out += c
  }
  return out
}
