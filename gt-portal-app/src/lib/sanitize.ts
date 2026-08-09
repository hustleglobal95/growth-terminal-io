/** Dash sanitizer. Product rule: em dashes (U+2014) and en dashes (U+2013)
 *  must never reach the customer, anywhere, ever.
 *
 *  Why this exists as code and not as a style note: the analysis engine
 *  emits dashes from two separate sources, model generated prose and
 *  hardcoded string literals in engine source. An instruction to the model
 *  cannot fix literals, and any instruction can be dropped by a future
 *  rewrite. This function is the portal side enforcement point. It runs on
 *  every payload returned by the API, so no screen can bypass it and no new
 *  field can be added that escapes it.
 *
 *  The characters are written as escape sequences on purpose, so that this
 *  file itself passes the source scan in scripts/check-dashes.mjs.
 *
 *  DO NOT REMOVE. The build fails if this file disappears or if the call
 *  site in lib/api.ts is deleted. See RULES.md at the repository root. */

const EM = '\u2014'
const EN = '\u2013'

/** Numeric ranges keep a hyphen: "3 - 5" reads correctly, "3, 5" does not. */
const RANGE = new RegExp('(\\d)\\s*[' + EN + EM + ']\\s*(\\d)', 'g')
/** Everything else becomes a comma, which is how the prose was meant to read. */
const DASH = new RegExp('\\s*[' + EN + EM + ']\\s*', 'g')
const ANY = new RegExp('[' + EN + EM + ']', 'g')

export function cleanText(s: string): string {
  if (s.indexOf(EM) === -1 && s.indexOf(EN) === -1) return s
  return s
    .replace(RANGE, '$1-$2')
    .replace(DASH, ', ')
    .replace(/,\s*,+/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/^,\s*/, '')
    .replace(/,\s*$/, '')
}

/** Deep walk. Handles strings, arrays, plain objects and anything nested,
 *  and returns every other type untouched. */
export function stripDashes<T>(value: T): T {
  if (typeof value === 'string') return cleanText(value) as unknown as T
  if (Array.isArray(value)) return value.map(v => stripDashes(v)) as unknown as T
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(src)) out[k] = stripDashes(src[k])
    return out as unknown as T
  }
  return value
}

/** Counts remaining dashes in any structure. Available from the browser
 *  console for spot verification against live data. */
export function countDashes(value: unknown): number {
  if (typeof value === 'string') return (value.match(ANY) || []).length
  if (Array.isArray(value)) return value.reduce((n: number, v) => n + countDashes(v), 0)
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .reduce((n, k) => n + countDashes((value as Record<string, unknown>)[k]), 0)
  }
  return 0
}
