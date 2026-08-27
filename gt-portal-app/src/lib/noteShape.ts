/** TURNING WHAT SOMEBODY SAID INTO SOMETHING THEY CAN USE.
 *
 *  Dictation gives you one long paragraph with no punctuation you can trust and
 *  no structure at all. This turns that into sections, and inside a section into
 *  the four kinds of line a working note actually contains: something to do, a
 *  question that is still open, a decision that was made, and a figure that was
 *  said out loud.
 *
 *  THIS INVENTS NOTHING. Every line of output is a span of the input, classified
 *  and grouped. It does not summarise, rewrite, expand or infer, and it never
 *  reaches a model. That matters for two reasons. A note is a record of what you
 *  said, so a tidier version of it that says something slightly different is
 *  worse than no version at all. And a rule you can read is a rule you can
 *  correct, which is not true of a paragraph a model rewrote.
 *
 *  The cost of that honesty is that it is only as good as its cues, so the cues
 *  are listed here in the open rather than buried.
 */

export type LineKind = 'action' | 'question' | 'decision' | 'figure' | 'note'

export interface ShapedLine { kind: LineKind; text: string }
export interface ShapedSection { heading: string; lines: ShapedLine[] }
export interface ShapedNote { title: string; sections: ShapedSection[] }

/* Spoken section breaks. People say these out loud when they change subject,
   and they are the only reliable structural signal dictation gives you. */
const BREAKS = [
  'new section', 'next section', 'new heading', 'heading',
  'moving on', 'next up', 'next thing', 'separately', 'switching to',
  'first thing', 'second thing', 'third thing', 'lastly', 'finally'
]

/* Something to do, in two lists because one list got it wrong.
   These carry an obligation wherever they appear in the sentence. */
const OBLIGATIONS = [
  'i need to', 'we need to', 'i have to', 'we have to', 'i should', 'we should',
  'make sure', 'remember to', 'do not forget', 'dont forget', 'follow up',
  'action item', 'to do', 'todo', 'next step', 'assign'
]
/* These are only a task when the sentence opens with them, because they are
   ordinary words in the middle of a sentence. "Call them on Friday" is a task.
   "The Northlane call notes" is not, and the first version of this list read it
   as one. */
const VERB_FIRST = ['send', 'email', 'call', 'book', 'schedule', 'ask', 'check', 'chase', 'draft', 'write']

/* A call that was made. Past tense and settled, which is what separates it from
   an action. */
const DECISIONS = [
  'we decided', 'i decided', 'decision is', 'the call is', 'going with',
  'we agreed', 'agreed to', 'we are going to', 'we will', 'settled on',
  'ruled out', 'not doing'
]

const QUESTION_STARTS = [
  'who ', 'what ', 'when ', 'where ', 'why ', 'how ', 'is ', 'are ', 'do ',
  'does ', 'did ', 'can ', 'could ', 'should ', 'would ', 'will '
]

/* A number said out loud, with something that makes it a measurement rather
   than a date fragment: a currency, a unit, a percent, or a plain figure of
   three digits or more. */
const FIGURE = /(\$\s?\d|\d+\s?(percent|%|k\b|m\b|dollars|pounds|euros|per cent))|(\b\d{3,}\b)/i

/** Sentences, from dictation that may have no punctuation at all.
 *
 *  Splitting on stops alone returns one enormous sentence for most dictation,
 *  so a spoken break counts as a boundary too. Anything still longer than a
 *  breath gets cut at a conjunction rather than left as a wall. */
export function sentences(raw: string): string[] {
  const cleaned = String(raw || '').replace(/\s+/g, ' ').trim()
  if (!cleaned) return []
  const bits = cleaned.split(/(?<=[.!?])\s+/)
  const out: string[] = []
  for (const bit of bits) {
    if (bit.length <= 190) { out.push(bit); continue }
    let rest = bit
    while (rest.length > 190) {
      const cut = rest.slice(0, 190).lastIndexOf(' and ')
      const at = cut > 60 ? cut : rest.slice(0, 190).lastIndexOf(' ')
      if (at <= 0) break
      out.push(rest.slice(0, at).trim())
      rest = rest.slice(at).trim()
    }
    if (rest) out.push(rest)
  }
  return out.filter(Boolean)
}

const starts = (s: string, list: string[]) => list.some(p => s.startsWith(p))
const holds = (s: string, list: string[]) => list.some(p => s.includes(p))

export function classify(sentence: string): LineKind {
  const s = sentence.toLowerCase().trim()
  if (s.endsWith('?') || starts(s, QUESTION_STARTS)) return 'question'
  if (holds(s, DECISIONS)) return 'decision'
  if (holds(s, OBLIGATIONS)) return 'action'
  if (VERB_FIRST.some(v => new RegExp('^' + v + '\\b').test(s))) return 'action'
  if (FIGURE.test(s)) return 'figure'
  return 'note'
}

/** True when a sentence is somebody announcing a new subject, and the heading
 *  they gave it if they gave one. */
function breakAt(sentence: string): string | null {
  const s = sentence.toLowerCase().trim()
  for (const b of BREAKS) {
    if (!s.startsWith(b)) continue
    const rest = sentence.slice(b.length).replace(/^[\s,.:;-]+/, '').trim()
    return rest ? rest.replace(/[.]+$/, '') : ''
  }
  return null
}

const cap = (s: string) => s ? s[0].toUpperCase() + s.slice(1) : s

export function shape(raw: string): ShapedNote {
  const all = sentences(raw)
  const sections: ShapedSection[] = []
  let current: ShapedSection | null = null

  for (const s of all) {
    const br = breakAt(s)
    if (br !== null) {
      current = { heading: cap(br) || 'Next', lines: [] }
      sections.push(current)
      continue
    }
    if (!current) { current = { heading: 'Notes', lines: [] }; sections.push(current) }
    current.lines.push({ kind: classify(s), text: s.trim() })
  }

  /* The title is the first thing said, with the noise people open their mouths
     with taken off the front, and cut to a length somebody can scan. */
  const first = all.find(s => breakAt(s) === null) || ''
  const trimmed = first
    .replace(/^((ok|okay|so|right|um|erm|alright|yeah|and)\b[\s,]*)+/i, '')
    .replace(/^(this is|these are)\s+/i, '')
    .replace(/[.]+$/, '')
    .trim()
  const lead = cap(trimmed || first)
  const title = lead.length > 68 ? lead.slice(0, 65).trim() + '...' : lead
  return { title: title || 'Untitled note', sections: sections.filter(x => x.lines.length) }
}

/** What the note contains, counted rather than described. Shown on the note so
 *  somebody can see at a glance whether the shaping found anything. */
export function tally(note: ShapedNote): Record<LineKind, number> {
  const out: Record<LineKind, number> = { action: 0, question: 0, decision: 0, figure: 0, note: 0 }
  for (const sec of note.sections) for (const l of sec.lines) out[l.kind]++
  return out
}
