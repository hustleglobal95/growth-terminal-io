/** A small spreadsheet evaluator.
 *
 *  This exists to run a formula the engine generated against the customer's own
 *  sample rows before it is shown to them. A formula that points at a real
 *  column, balances its brackets and still returns an error on every row is
 *  syntactically fine and useless, and syntax checking alone cannot tell the
 *  difference. Executing it can.
 *
 *  It covers the functions a growth formula actually uses and refuses anything
 *  else by name. Refusing is the point: an unknown function is reported as
 *  unknown rather than skipped, so the check never passes a formula it did not
 *  understand.
 *
 *  No dependencies, and nothing here touches the DOM or the network.
 */
export type CellValue = string | number | boolean
export type Grid = Record<string, CellValue[][]>

const ERR = Symbol('#ERROR')
const isErr = (v: unknown): boolean => v === ERR

const colIndex = (s: string): number => { let n = 0; for (const c of s) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1 }

type Ctx = { grid: Grid; defaultSheet: string; cell: (s: string, c: number, r: number) => any }
function makeCtx(grid: Grid, defaultSheet: string): Ctx {
  const cell = (sheet: string, col: number, row: number): any => {
    const g = grid[sheet]; if (!g) return ERR
    const r = g[row - 1]; if (!r) return ''
    const v = r[col]; return v === undefined || v === null ? '' : v
  }
  return { grid, defaultSheet, cell }
}

type Tok = { t: string; v?: any }
function lex(src: string): Tok[] {
  const out: Tok[] = []; let i = 0
  const s = src[0] === '=' ? src.slice(1) : src
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '"') { let j = i + 1, v = ''
      while (j < s.length) { if (s[j] === '"') { if (s[j + 1] === '"') { v += '"'; j += 2; continue } break } v += s[j++] }
      out.push({ t: 'str', v }); i = j + 1; continue }
    if (c === "'") { let j = i + 1, v = "'"
      while (j < s.length) { if (s[j] === "'") { if (s[j + 1] === "'") { v += "''"; j += 2; continue } v += "'"; j++; break } v += s[j++] }
      let k = j; while (k < s.length && /[!$A-Za-z0-9:.]/.test(s[k])) v += s[k++]
      out.push({ t: 'ref', v }); i = k; continue }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1]))) {
      let j = i; while (j < s.length && /[0-9.]/.test(s[j])) j++
      out.push({ t: 'num', v: parseFloat(s.slice(i, j)) }); i = j; continue }
    if (/[A-Za-z_]/.test(c)) {
      let j = i; while (j < s.length && /[A-Za-z0-9_.$!:]/.test(s[j])) j++
      const w = s.slice(i, j)
      if (s[j] === '(' && !/[$!:]/.test(w)) out.push({ t: 'fn', v: w.toUpperCase() })
      else out.push({ t: 'ref', v: w })
      i = j; continue }
    if (c === '<' && (s[i + 1] === '=' || s[i + 1] === '>')) { out.push({ t: 'op', v: c + s[i + 1] }); i += 2; continue }
    if (c === '>' && s[i + 1] === '=') { out.push({ t: 'op', v: '>=' }); i += 2; continue }
    if ('+-*/^=<>'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue }
    if ('(),'.includes(c)) { out.push({ t: c }); i++; continue }
    throw new Error('lex: unexpected ' + c + ' in ' + src)
  }
  return out
}

type Node = any
function parse(toks: Tok[]): Node {
  let p = 0
  const peek = () => toks[p]
  const eat = (t?: string): Tok => { if (!toks[p] || (t && toks[p].t !== t)) throw new Error('parse: expected ' + t); return toks[p++] }
  function primary(): Node {
    const t = peek()
    if (!t) throw new Error('parse: unexpected end')
    if (t.t === 'num' || t.t === 'str') { p++; return { k: t.t, v: t.v } }
    if (t.t === 'ref') { p++; return { k: 'ref', v: t.v } }
    if (t.t === 'fn') { p++; eat('('); const args = []
      if (peek() && peek().t !== ')') { args.push(expr()); while (peek() && peek().t === ',') { p++; args.push(expr()) } }
      eat(')'); return { k: 'fn', name: t.v, args } }
    if (t.t === '(') { p++; const e = expr(); eat(')'); return e }
    if (t.t === 'op' && t.v === '-') { p++; return { k: 'neg', a: primary() } }
    throw new Error('parse: unexpected ' + JSON.stringify(t))
  }
  const bin = (next: () => Node, ops: string[]) => (): Node => { let l = next()
    while (peek() && peek().t === 'op' && ops.includes(peek().v)) { const o = toks[p++].v; l = { k: 'bin', o, l, r: next() } }
    return l }
  const pow = bin(primary, ['^'])
  const mul = bin(pow, ['*', '/'])
  const add = bin(mul, ['+', '-'])
  const cmp = bin(add, ['=', '<>', '>', '<', '>=', '<='])
  function expr(): Node { return cmp() }
  const e = expr(); if (p !== toks.length) throw new Error('parse: trailing tokens')
  return e
}

const num = (v: any): any => { if (isErr(v)) return ERR; if (v === '' || v === null || v === undefined) return 0
  if (typeof v === 'boolean') return v ? 1 : 0
  const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : ERR }

function refValues(ctx: Ctx, ref: string): { scalar: boolean; cells: any[] } {
  let sheet = ctx.defaultSheet, body = ref
  const bang = ref.lastIndexOf('!')
  if (bang >= 0) { let s = ref.slice(0, bang); body = ref.slice(bang + 1)
    if (s[0] === "'") s = s.slice(1, -1).replace(/''/g, "'"); sheet = s }
  const parts = body.split(':')
  const one = (t: string) => { const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(t.toUpperCase()); if (!m) throw new Error('ref: ' + ref)
    return { c: colIndex(m[1]), r: parseInt(m[2], 10) } }
  if (parts.length === 1) { const a = one(parts[0]); return { scalar: true, cells: [ctx.cell(sheet, a.c, a.r)] } }
  const a = one(parts[0]), b = one(parts[1]); const cells = []
  for (let r = Math.min(a.r, b.r); r <= Math.max(a.r, b.r); r++)
    for (let c = Math.min(a.c, b.c); c <= Math.max(a.c, b.c); c++) cells.push(ctx.cell(sheet, c, r))
  return { scalar: false, cells }
}

const flat = (v: any): any[] => Array.isArray(v) ? v : [v]
const nums = (v: any): number[] => flat(v).filter((x: any) => typeof x === 'number')
const anyErr = (vs: any[]): boolean => vs.some((v: any) => flat(v).some(isErr))

const FN: Record<string, (...a: Array<() => any>) => any> = {
  IFERROR: (a, b) => (isErr(a()) ? b() : a()),
  IF: (c, a, b) => { const cv = c(); if (isErr(cv)) return ERR
    const t = Array.isArray(cv) ? cv[0] : cv; return (t === true || num(t) !== 0) ? a() : (b ? b() : false) },
  OR: (...as) => as.map(f => f()).some(v => v === true || (typeof v !== 'string' && num(v) !== 0)),
  ABS: a => { const v = num(a()); return isErr(v) ? ERR : Math.abs(v) },
  SUM: (...as) => { const vs = as.map(f => f()); if (anyErr(vs)) return ERR
    let s = 0; for (const v of vs) for (const x of nums(v)) s += x; return s },
  AVERAGE: (...as) => { const vs = as.map(f => f()); if (anyErr(vs)) return ERR
    const xs = vs.flatMap(nums); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : ERR },
  COUNT: (...as) => { const vs = as.map(f => f()); if (anyErr(vs)) return ERR; return vs.flatMap(nums).length },
  COUNTIF: (r, c) => { const crit = c(); const key = String(crit).toLowerCase()
    return flat(r()).filter(v => String(v).toLowerCase() === key).length },
  INDEX: (r, n) => { const arr = flat(r()); const i = num(n()); if (isErr(i) || i < 1 || i > arr.length) return ERR; return arr[i - 1] },
  LARGE: (r, k) => { const xs = nums(r()).sort((a, b) => b - a); const kk = k()
    const pick = (i: any): any => (i >= 1 && i <= xs.length) ? xs[i - 1] : ERR
    if (Array.isArray(kk)) return kk.map((i: any) => pick(num(i)))
    return pick(num(kk)) },
  SEQUENCE: n => { const k = num(n()); if (isErr(k)) return ERR; return Array.from({ length: k }, (_, i) => i + 1) },
  SUMPRODUCT: (...as) => { const vs = as.map(f => f()); if (anyErr(vs)) return ERR
    const arrs = vs.map(flat); const len = Math.max(...arrs.map(a => a.length))
    let s = 0
    for (let i = 0; i < len; i++) { let p = 1
      for (const a of arrs) { const v = a.length === 1 ? a[0] : a[i]; const n = typeof v === 'boolean' ? (v ? 1 : 0) : (typeof v === 'number' ? v : 0); p *= n }
      s += p }
    return s },
  STDEV: (...as) => { const vs = as.map(f => f()); if (anyErr(vs)) return ERR
    const xs = vs.flatMap(nums); if (xs.length < 2) return ERR
    const m = xs.reduce((a, b) => a + b, 0) / xs.length
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)) },
  /* Only the "1:N" form the catalogue emits. A real INDIRECT resolves any
     reference; this one carries the row span through to ROW and nothing else. */
  INDIRECT: a => { const v = String(a()); const m = /^(\d+):(\d+)$/.exec(v)
    if (!m) return ERR; return { rowSpan: [parseInt(m[1],10), parseInt(m[2],10)] } },
  ROW: (a: () => any) => { const v = a()
    if (v && v.rowSpan) { const [x,y] = v.rowSpan as [number,number]; return Array.from({length: y-x+1}, (_: unknown, i: number)=>x+i) }
    return ERR },
  NETWORKDAYS: (a, b) => { let s = num(a()), e = num(b()); if (isErr(s) || isErr(e)) return ERR
    let d = 0; for (let x = Math.min(s, e); x <= Math.max(s, e); x++) { const wd = (x + 5) % 7; if (wd !== 5 && wd !== 6) d++ }
    return d },
}

function ev(node: Node, ctx: Ctx): any {
  switch (node.k) {
    case 'num': case 'str': return node.v
    case 'neg': { const v = num(ev(node.a, ctx)); return isErr(v) ? ERR : -v }
    case 'ref': { const r = refValues(ctx, node.v); return r.scalar ? r.cells[0] : r.cells }
    case 'fn': { const f = FN[node.name]; if (!f) throw new Error('fn not supported: ' + node.name)
      return f(...node.args.map((a: Node) => () => ev(a, ctx))) }
    case 'bin': {
      const L = ev(node.l, ctx), R = ev(node.r, ctx)
      if (isErr(L) || isErr(R)) return ERR
      const cmpOps = ['=', '<>', '>', '<', '>=', '<=']
      const apply = (a: any, b: any): any => {
        if (cmpOps.includes(node.o)) {
          const bothNum = typeof a === 'number' && typeof b === 'number'
          const x = bothNum ? a : String(a).toLowerCase(), y = bothNum ? b : String(b).toLowerCase()
          switch (node.o) { case '=': return x === y; case '<>': return x !== y
            case '>': return x > y; case '<': return x < y; case '>=': return x >= y; case '<=': return x <= y }
        }
        const x = num(a), y = num(b); if (isErr(x) || isErr(y)) return ERR
        switch (node.o) { case '+': return x + y; case '-': return x - y; case '*': return x * y
          case '/': return y === 0 ? ERR : x / y; case '^': { const r = Math.pow(x, y); return Number.isFinite(r) ? r : ERR } }
      }
      if (Array.isArray(L) || Array.isArray(R)) {
        const la = flat(L), ra = flat(R), n = Math.max(la.length, ra.length)
        return Array.from({ length: n }, (_, i) => apply(la.length === 1 ? la[0] : la[i], ra.length === 1 ? ra[0] : ra[i]))
      }
      return apply(L, R)
    }
  }
  throw new Error('ev: ' + node.k)
}

function evaluate(formula: string, grid: Grid, sheet: string): any { return ev(parse(lex(formula)), makeCtx(grid, sheet)) }


export function evaluateFormula(formula: string, grid: Grid, sheet: string): unknown {
  return evaluate(formula, grid, sheet)
}
export function isError(v: unknown): boolean { return isErr(v) }
/** Every function this evaluator knows. Anything outside it is refused. */
export const SUPPORTED: string[] = Object.keys(FN)
