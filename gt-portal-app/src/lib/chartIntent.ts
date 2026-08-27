/** TURNING A SENTENCE SOMEBODY SAID OUT LOUD INTO A CHART REQUEST.
 *
 *  "Revenue by month as a line." "Top ten customers by spend." "Show me
 *  orders against revenue." A person says one of those and means something
 *  precise, and the precision is carried by three or four words: a measure,
 *  a thing to break it down by, sometimes a chart type, sometimes an ordering.
 *
 *  THIS RESOLVES AGAINST THE CUSTOMER'S REAL HEADERS AND NOTHING ELSE. It
 *  never invents a column, never accepts a near miss quietly, and never picks
 *  between two equally good matches. A chart drawn from the wrong column looks
 *  exactly like a chart drawn from the right one, which is the whole reason
 *  this has to fail loudly rather than approximately.
 *
 *  WHERE IT STOPS. It understands the shapes people actually say. It does not
 *  understand everything, and when it cannot resolve a phrase it says which
 *  phrase and hands the sentence on rather than drawing its best guess. That
 *  handoff costs a credit, so it is offered and not taken automatically.
 *
 *  Dictation shapes the rules. There is no punctuation to lean on, numbers
 *  arrive as words, and filler at the front of a sentence is the norm rather
 *  than the exception. All three are handled here rather than pushed onto the
 *  person to speak more like a computer.
 */

export type ChartKind = 'line' | 'bar' | 'column' | 'area' | 'scatter'
export type Aggregate = 'sum' | 'average' | 'count' | 'none'
export type Order = 'value-desc' | 'value-asc' | 'label' | 'none'

export interface Field { header: string; kind: 'number' | 'date' | 'text' | 'empty' }

/** How a header got matched, kept so the screen can show its work. A person
 *  who sees "you heard spend and used Marketing Spend" can correct it in one
 *  glance; a person shown only the chart cannot. */
export interface Match {
  header: string
  heard: string
  how: 'exact' | 'words' | 'part' | 'synonym'
}

export interface Intent {
  /** Resolved numeric headers, in the order they were said. */
  measures: string[]
  /** What to break the measure down by. Null when the request is a plain
   *  series with no dimension, which is legal for a scatter. */
  dimension: string | null
  /** Set only when the person named one. Null means the data shape decides,
   *  which is the better answer more often than not. */
  kind: ChartKind | null
  aggregate: Aggregate
  order: Order
  limit: number | null
  heard: string
  matched: Match[]
  /** Content words that resolved to nothing. The reason a request gets handed
   *  to the engine, and the thing the screen quotes back. */
  unmatched: string[]
  /** Two or more headers matched one phrase equally well. Never resolved by
   *  picking one: the screen asks. */
  ambiguous: { heard: string; between: string[] }[]
  /** A chart type this understood and will not draw, with the reason. Told
   *  apart from a word it did not recognise, because "we do not draw those"
   *  and "we did not understand you" are different sentences and only one of
   *  them is the person's problem. */
  declined: { asked: string; because: string; instead: ChartKind } | null
}

/** Types people ask for by name that this does not draw, each with the reason
 *  and what it draws instead. Every one of these is a real judgement rather
 *  than a gap: a reader cannot compare angles, a second y axis lets any two
 *  lines be made to cross wherever you like, and a three dimensional bar hides
 *  the shorter bars behind the taller ones. */
const DECLINED: { re: RegExp; asked: string; because: string; instead: ChartKind }[] = [
  { re: /\b(pie|donut|doughnut)( chart)?\b/, asked: 'a pie chart',
    because: 'People read length well and angle badly, so a pie hides exactly the small differences a chart is usually being asked about.',
    instead: 'bar' },
  { re: /\b(dual|second|two) (y )?ax[ei]s\b/, asked: 'a second axis',
    because: 'Two scales on one chart can be set to make any two lines cross wherever you like, which makes the crossing meaningless.',
    instead: 'line' },
  { re: /\b3d\b|\bthree dimensional\b/, asked: 'a 3D chart',
    because: 'Depth puts the shorter bars behind the taller ones and adds no information.',
    instead: 'column' },
]

/* ------------------------------------------------------------ vocabulary -- */

/* Every list below is open on the screen rather than buried, for the same
   reason the note sorter's cues are: a rule you can read is a rule you can
   correct. */

const KIND_WORDS: [RegExp, ChartKind][] = [
  [/\bscatter( ?plot)?\b/, 'scatter'],
  [/\bline( chart| graph)?\b/, 'line'],
  [/\bcolumn( chart)?\b/, 'column'],
  [/\bbar( chart| graph)?\b/, 'bar'],
  [/\barea( chart)?\b/, 'area'],
  [/\btrend(ing|line)?\b/, 'line'],
  [/\bover time\b/, 'line'],
]

/* Said out loud constantly, and each one is a real instruction. */
const AGG_WORDS: [RegExp, Aggregate][] = [
  [/\b(average|avg|mean)\b/, 'average'],
  [/\b(how many|number of|count( of)?)\b/, 'count'],
  [/\b(total|sum|sum of|added up)\b/, 'sum'],
]

const ORDER_WORDS: [RegExp, Order][] = [
  [/\b(top|biggest|largest|highest|best|most)\b/, 'value-desc'],
  [/\b(bottom|smallest|lowest|worst|least)\b/, 'value-asc'],
  [/\b(alphabetical(ly)?|by name|a to z)\b/, 'label'],
]

/* Dictation writes numbers as words about half the time, and "top ten" is one
   of the most common things anybody says to a chart. */
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, hundred: 100,
}

/** Synonyms are a last resort, never a first one, and they only fire when
 *  exactly one header answers to them. Two headers reachable by the same
 *  synonym is an ambiguity, and an ambiguity is a question rather than a coin
 *  toss: a workbook with both Sales and Revenue in it means two different
 *  things by them, and picking one silently is how a chart lies. */
const SYNONYMS: Record<string, string[]> = {
  revenue: ['sales', 'turnover', 'income', 'takings', 'gross'],
  sales: ['revenue', 'turnover'],
  cost: ['spend', 'costs', 'expense', 'expenses', 'outlay'],
  spend: ['cost', 'costs', 'budget'],
  profit: ['margin', 'net'],
  orders: ['purchases', 'transactions', 'sales count'],
  customers: ['clients', 'users', 'accounts', 'buyers'],
  month: ['months', 'monthly'],
  week: ['weeks', 'weekly'],
  day: ['days', 'daily', 'date'],
  date: ['day', 'time'],
  region: ['area', 'territory', 'market'],
  channel: ['source', 'medium'],
  product: ['sku', 'item', 'line'],
}

/* Stripped before anything is called unresolved. These are how people open a
   sentence, not things they are asking for. */
const FILLER = new Set([
  'show', 'me', 'a', 'an', 'the', 'give', 'make', 'build', 'draw', 'plot',
  'chart', 'graph', 'of', 'for', 'with', 'and', 'in', 'on', 'to', 'please',
  'can', 'you', 'i', 'want', 'need', 'like', 'see', 'look', 'at', 'lets',
  'let', 'us', 'okay', 'ok', 'so', 'just', 'my', 'our', 'this', 'that',
  'each', 'every', 'all', 'as', 'it', 'is', 'are', 'was', 'were', 'how',
  'what', 'which', 'per', 'by', 'against', 'versus', 'vs', 'over', 'across',
  'broken', 'down', 'split', 'grouped', 'sorted', 'ordered', 'compare',
  'comparing', 'comparison', 'between', 'from', 'up', 'out',
])

/* ------------------------------------------------------------ normalising -- */

export function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/[_\-/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const words = (s: string): string[] => norm(s).split(' ').filter(Boolean)

/** Crude but honest singularisation. Only ever used to compare two words, never
 *  to write one back out, so a wrong stem costs a missed match and never a
 *  mislabelled axis. */
function stem(w: string): string {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.length > 3 && w.endsWith('es') && !w.endsWith('ses')) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

const same = (a: string, b: string) => a === b || stem(a) === stem(b)

/* Header words too common to identify a column on their own. Half a workbook
   answers to Total or Name, so a single one of these never anchors a match. */
const GENERIC = new Set([
  'total', 'name', 'id', 'number', 'count', 'value', 'amount', 'type',
  'code', 'group', 'category', 'status', 'per', 'of', 'the', 'and',
])

/* -------------------------------------------------------------- matching -- */

/** `span` is the exact word positions this hit consumes. One spoken word can
 *  only ever belong to one column, so a hit whose words are already claimed by
 *  a stronger one is dropped rather than stacked on top of it. Without this,
 *  a workbook holding both Revenue and Revenue Per Customer answers the word
 *  "revenue" twice and draws two series where one was asked for. */
interface Hit { field: Field; how: Match['how']; heard: string; score: number; at: number; span: number[] }

const run = (start: number, len: number) => Array.from({ length: len }, (_, k) => start + k)

/** Every way this header could be recognised in the sentence, best first.
 *  Exact beats words beats synonym, and nothing else is tried. */
function hitsFor(field: Field, said: string[]): Hit[] {
  const head = words(field.header)
  if (!head.length) return []
  const out: Hit[] = []

  /* Exact: the whole header, in order, as a run of spoken words. */
  for (let i = 0; i + head.length <= said.length; i++) {
    let ok = true
    for (let j = 0; j < head.length; j++) if (!same(said[i + j], head[j])) { ok = false; break }
    if (ok) out.push({
      field, how: 'exact', heard: said.slice(i, i + head.length).join(' '),
      score: 100 + head.length, at: i, span: run(i, head.length),
    })
  }

  /* Words: every word of the header appears somewhere, in any order. A two
     word header found as two scattered words is a real match; a one word
     header found this way is the same thing as exact, so it is not doubled. */
  if (!out.length && head.length > 1) {
    const at = head.map(h => said.findIndex(s => same(s, h)))
    if (at.every(i => i >= 0)) out.push({
      field, how: 'words', heard: head.join(' '),
      score: 50 + head.length, at: Math.min(...at), span: at.slice(),
    })
  }

  /* Part: one distinctive word of a longer header, said on its own. Nobody
     says "marketing spend by month", they say "spend by month", and refusing
     that would be pedantry dressed as rigour. Generic header words are barred
     from anchoring a match by themselves, because Total, Name and Amount
     belong to half the columns in a workbook and would match all of them. Two
     headers reachable from the same word still land in the ambiguity list. */
  if (!out.length && head.length > 1) {
    for (const h of head) {
      if (GENERIC.has(stem(h))) continue
      const i = said.findIndex(s => same(s, h))
      if (i >= 0) { out.push({ field, how: 'part', heard: said[i], score: 35, at: i, span: [i] }); break }
    }
  }

  /* Synonym: a word somebody says for this column rather than its name. */
  if (!out.length) {
    for (const h of head) {
      const alts = SYNONYMS[stem(h)] || SYNONYMS[h] || []
      for (const alt of alts) {
        const aw = words(alt)
        for (let i = 0; i + aw.length <= said.length; i++) {
          let ok = true
          for (let j = 0; j < aw.length; j++) if (!same(said[i + j], aw[j])) { ok = false; break }
          if (ok) { out.push({ field, how: 'synonym', heard: alt, score: 20, at: i, span: run(i, aw.length) }); break }
        }
      }
    }
  }

  return out.sort((a, b) => b.score - a.score)
}

/* ------------------------------------------------------------- resolving -- */

export interface ReadOptions { fields: Field[] }

export function readAsk(heard: string, opts: ReadOptions): Intent {
  const raw = norm(heard)
  const said = raw.split(' ').filter(Boolean)

  const intent: Intent = {
    measures: [], dimension: null, kind: null, aggregate: 'none',
    order: 'none', limit: null, heard: String(heard || '').trim(),
    matched: [], unmatched: [], ambiguous: [], declined: null,
  }
  if (!said.length) return intent

  /* Instructions first, so their words are not later mistaken for columns. A
     workbook with a column called Total is exactly why this order matters, and
     it is also why an instruction word that matched a header is given back to
     the header below. */
  for (const d of DECLINED) if (d.re.test(raw)) {
    intent.declined = { asked: d.asked, because: d.because, instead: d.instead }
    intent.kind = d.instead
    break
  }
  if (!intent.kind) for (const [re, k] of KIND_WORDS) if (re.test(raw)) { intent.kind = k; break }
  for (const [re, a] of AGG_WORDS) if (re.test(raw)) { intent.aggregate = a; break }
  for (const [re, o] of ORDER_WORDS) if (re.test(raw)) { intent.order = o; break }

  const digits = raw.match(/\b(?:top|bottom|first|last)\s+(\d{1,3})\b/)
  if (digits) intent.limit = Number(digits[1])
  else {
    const spoken = raw.match(/\b(?:top|bottom|first|last)\s+([a-z]+)\b/)
    if (spoken && NUMBER_WORDS[spoken[1]] !== undefined) intent.limit = NUMBER_WORDS[spoken[1]]
  }
  if (intent.limit !== null && intent.order === 'none') intent.order = 'value-desc'

  /* Every header's best claim on the sentence, strongest first. One spoken
     word cannot serve two headers, so the strongest claim takes it. */
  const claims: Hit[] = []
  for (const f of opts.fields) { const h = hitsFor(f, said); if (h.length) claims.push(h[0]) }
  claims.sort((a, b) => b.score - a.score || a.at - b.at)

  /* Two headers with the same claim on the same words is a question, not a
     choice. Recorded and neither is used. */
  const taken = new Set<string>()
  const spent = new Set<number>()
  const used: Hit[] = []
  for (const c of claims) {
    const rivals = claims.filter(o => o !== c && o.score === c.score && o.heard === c.heard)
    if (rivals.length) {
      const between = [c.field.header, ...rivals.map(r => r.field.header)].sort()
      if (!intent.ambiguous.some(a => a.heard === c.heard))
        intent.ambiguous.push({ heard: c.heard, between })
      for (const w of c.span) spent.add(w)
      continue
    }
    if (taken.has(c.field.header)) continue
    /* Its words already belong to a stronger claim. "Revenue by region" in a
       workbook that also has Revenue Per Customer must not quietly become two
       series off one spoken word. */
    if (c.span.some(w => spent.has(w))) continue
    for (const w of c.span) spent.add(w)
    taken.add(c.field.header)
    used.push(c)
  }

  /* One word cannot be both the instruction and the column. A workbook with a
     column called Total makes "total revenue by region" genuinely double
     edged, and the tie breaks on whether anything else was named: with another
     measure in the sentence, "total" is the verb and Revenue is the subject;
     with nothing else, "total by region" can only mean the column. */
  const instructionWord = new Set<string>()
  for (const [re] of [...AGG_WORDS, ...ORDER_WORDS, ...KIND_WORDS]) {
    const m = raw.match(re)
    if (m) for (const w of words(m[0])) instructionWord.add(w)
  }
  const collided = used.filter(h => words(h.heard).every(w => instructionWord.has(w)))
  if (collided.length && used.some(h => !collided.includes(h) && h.field.kind === 'number')) {
    for (const c of collided) { const i = used.indexOf(c); if (i >= 0) used.splice(i, 1) }
  }

  /* Roles. The sentence usually says them: what comes after "by", "per",
     "across" or "over" is the thing to break down by, and that beats any
     guess from column type. */
  const splitAt = said.findIndex(w => w === 'by' || w === 'per' || w === 'across' || w === 'over')

  /* "By" points the other way inside a ranking. "Revenue by month" breaks
     revenue down by month, but "top ten customers by revenue" ranks customers
     using revenue, so the word after "by" is the measure and the thing being
     ranked sits in front of it. Same preposition, opposite roles, and reading
     it the first way turns every top ten anybody asks for into a chart of the
     wrong column. */
  const ranking = splitAt >= 0 && (intent.limit !== null || intent.order === 'value-desc' || intent.order === 'value-asc')
  const side = (h: Hit) => (ranking ? h.at < splitAt : h.at > splitAt)

  const byPosition = splitAt >= 0 ? used.filter(side) : []
  let dim: Hit | null = byPosition.find(h => h.field.kind !== 'number') || byPosition[0] || null

  /* No "by" in the sentence, so fall back to type. A date is a dimension
     before a text column is, because a date column in a request almost always
     means "over time". */
  if (!dim) {
    dim = used.find(h => h.field.kind === 'date')
      || used.find(h => h.field.kind === 'text')
      || null
  }

  const measures = used.filter(h => h !== dim && h.field.kind === 'number')

  /* Two measures and no dimension is somebody asking for one against the
     other, whether or not they said the word scatter. */
  if (!intent.kind && measures.length === 2 && !dim && /\b(against|versus|vs)\b/.test(raw)) {
    intent.kind = 'scatter'
  }

  intent.dimension = dim ? dim.field.header : null
  intent.measures = measures.sort((a, b) => a.at - b.at).map(h => h.field.header)
  intent.matched = [...(dim ? [dim] : []), ...measures]
    .map(h => ({ header: h.field.header, heard: h.heard, how: h.how }))

  /* What is left over. Instruction words, filler and anything already spoken
     for come out; a real word that survives all three is a word this could not
     resolve, and it is the honest reason to offer the engine. */
  const spokenFor = new Set<string>()
  for (const h of used) for (const w of words(h.heard)) spokenFor.add(w)
  for (const a of intent.ambiguous) for (const w of words(a.heard)) spokenFor.add(w)

  const instruction = new Set<string>()
  for (const [re] of [...KIND_WORDS, ...AGG_WORDS, ...ORDER_WORDS]) {
    const m = raw.match(re)
    if (m) for (const w of words(m[0])) instruction.add(w)
  }
  for (const d of DECLINED) {
    const m = raw.match(d.re)
    if (m) for (const w of words(m[0])) instruction.add(w)
  }
  if (intent.limit !== null) {
    instruction.add(String(intent.limit))
    for (const [w, n] of Object.entries(NUMBER_WORDS)) if (n === intent.limit) instruction.add(w)
  }

  const seen = new Set<string>()
  for (const w of said) {
    if (FILLER.has(w) || instruction.has(w) || spokenFor.has(w)) continue
    if (/^\d+$/.test(w)) continue
    if (w.length < 3) continue
    if (seen.has(stem(w))) continue
    seen.add(stem(w))
    intent.unmatched.push(w)
  }

  return intent
}

/** Can this be drawn here, without asking anybody for anything. Everything
 *  that is not a clean yes carries the sentence that says why, in the words
 *  the screen puts on the page. */
export function readiness(i: Intent): { ok: boolean; why: string } {
  if (!i.heard) return { ok: false, why: 'Nothing was said yet.' }
  if (i.ambiguous.length) {
    const a = i.ambiguous[0]
    return { ok: false, why: `"${a.heard}" could mean ${a.between.join(' or ')}, and picking one of them for you is how a chart ends up lying. Say which.` }
  }
  if (!i.measures.length) return {
    ok: false,
    why: i.unmatched.length
      ? `No numeric column here answers to ${i.unmatched.map(u => '"' + u + '"').join(' or ')}.`
      : 'Nothing in that named a number to plot.',
  }
  if (i.unmatched.length) return {
    ok: false,
    why: `${i.unmatched.map(u => '"' + u + '"').join(' and ')} matched no column on this tab.`,
  }
  return { ok: true, why: '' }
}
