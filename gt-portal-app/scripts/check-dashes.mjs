/** Build guard. Fails the build if em dashes or en dashes appear in portal
 *  source, or if the runtime sanitizer is removed or unwired.
 *
 *  This runs as the first step of `npm run build`, which is the command
 *  Cloudflare Pages runs on every deploy. A violation therefore blocks the
 *  deploy rather than surfacing later in the product. See RULES.md.
 *
 *  It also self tests the sanitizer's replacement rules, so the logic cannot
 *  silently rot. */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const EM = '—'
const EN = '–'
const BAD = new RegExp('[' + EN + EM + ']')
const EXT = /\.(ts|tsx|css|json|html|md)$/
const SKIP = new Set(['node_modules', 'dist', '.git'])

const failures = []

/* 1. No dashes anywhere in source we author. */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) { walk(p); continue }
    if (!EXT.test(p)) continue
    readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
      if (BAD.test(line)) failures.push(p + ':' + (i + 1) + '  ' + line.trim().slice(0, 90))
    })
  }
}
walk('src')
for (const f of ['index.html']) {
  if (!existsSync(f)) continue
  readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (BAD.test(line)) failures.push(f + ':' + (i + 1) + '  ' + line.trim().slice(0, 90))
  })
}

/* 2. The sanitizer must exist and must still be wired into the API boundary. */
if (!existsSync('src/lib/sanitize.ts')) {
  failures.push('src/lib/sanitize.ts is missing. The dash sanitizer was deleted.')
}
const api = existsSync('src/lib/api.ts') ? readFileSync('src/lib/api.ts', 'utf8') : ''
if (!/stripDashes\s*\(/.test(api)) {
  failures.push('src/lib/api.ts no longer calls stripDashes(). The API boundary guard was removed.')
}

/* 3. Self test of the replacement rules, mirrored from lib/sanitize.ts. */
const RANGE = new RegExp('(\\d)\\s*[' + EN + EM + ']\\s*(\\d)', 'g')
const DASH = new RegExp('\\s*[' + EN + EM + ']\\s*', 'g')
const clean = s => s
  .replace(RANGE, '$1-$2')
  .replace(DASH, ', ')
  .replace(/,\s*,+/g, ',')
  .replace(/\s+,/g, ',')
  .replace(/^,\s*/, '')
  .replace(/,\s*$/, '')

const cases = [
  ['High controllability ' + EM + ' business can act', 'High controllability, business can act'],
  ['weeks 3 ' + EN + ' 5', 'weeks 3-5'],
  ['weeks 3' + EN + '5', 'weeks 3-5'],
  ['word' + EM + 'word', 'word, word'],
  [EM + ' leading', 'leading'],
  ['trailing ' + EM, 'trailing'],
  ['one ' + EM + ' two ' + EM + ' three', 'one, two, three'],
  ['no dashes here', 'no dashes here']
]
for (const [input, want] of cases) {
  const got = clean(input)
  if (got !== want) failures.push('sanitizer self test failed: got "' + got + '" want "' + want + '"')
}

if (failures.length) {
  console.error('\nBUILD BLOCKED: dash guard failed (' + failures.length + ')')
  failures.forEach(f => console.error('  ' + f))
  console.error('\nEm dashes and en dashes are prohibited in this project. See RULES.md.\n')
  process.exit(1)
}
console.log('dash guard: clean (' + cases.length + ' sanitizer cases passed)')
