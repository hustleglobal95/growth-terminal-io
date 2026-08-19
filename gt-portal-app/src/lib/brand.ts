/** THE BRAND RECORD.
 *
 *  One record per business, and it is the thing every later assistant reads.
 *  A lead response assistant, a content engine, a client facing agent: none of
 *  them should ask the customer what their business does. They ask this.
 *
 *  Two decisions are load bearing.
 *
 *  First, every field carries where it came from. A model that read a website
 *  and a person who typed an answer are not the same kind of fact, and an
 *  assistant briefed on the first one will state a guess out loud with the
 *  same confidence as the second. So a field is drafted until a human has
 *  looked at it, and an assistant is only ever briefed on confirmed fields.
 *  This is the same rule the analysis side already runs on: the engine
 *  separates severity from confidence rather than blending them into one
 *  number that reads as certainty.
 *
 *  Second, empty is a legitimate value. A model asked to describe a brand
 *  from a thin page will produce beautiful sentences about a company that
 *  does not exist, and those sentences then get spoken to that company's
 *  actual customers. Every extracted field is allowed to come back empty with
 *  a reason, and the review step shows the empties rather than hiding them.
 */

/** Where a value came from. The assistant brief is built from confirmed
 *  fields only, so this is not decoration. */
export type FieldSource = 'drafted' | 'confirmed' | 'written'

/** One field of the record: the value, where it came from, and the piece of
 *  the site it was read out of when a model drafted it. Keeping the evidence
 *  on the field is what lets the review screen show the customer why the
 *  model said this, which is the difference between reviewing and rubber
 *  stamping. */
export interface BrandField {
  value: string
  source: FieldSource
  /** The sentence or passage on the page this was read from. Empty when a
   *  person wrote the value themselves. */
  evidence?: string
  /** The page it was read from. */
  sourceUrl?: string
  /** Set when the model could not find this and declined to guess. */
  notFound?: boolean
}

export interface BrandList {
  values: string[]
  source: FieldSource
  evidence?: string
  sourceUrl?: string
  notFound?: boolean
}

/** Brand record, version 1.
 *
 *  The shape is grouped the way a person thinks about their own business,
 *  not the way a prompt is assembled, because a person has to read this
 *  screen and recognise themselves in it. */
export interface BrandRecord {
  version: 1
  businessSlug: string

  /** Who they are. */
  identity: {
    name: BrandField
    /** What you do, for whom, in one line. */
    oneLine: BrandField
    category: BrandField
  }

  /** What is actually sold. An assistant that gets this wrong will answer a
   *  buying question with the wrong product. */
  offer: {
    what: BrandField
    /** How it is priced, in their own terms. Not a number unless the site
     *  states one. */
    pricing: BrandField
    /** The promise made to a buyer. */
    promise: BrandField
  }

  audience: {
    who: BrandField
    /** Who this is explicitly not for. Rare on a website and worth asking
     *  for, because it is what stops an assistant chasing a lead that will
     *  never close. */
    notFor: BrandField
    /** The problem the buyer arrives with, in the buyer's words. */
    problem: BrandField
  }

  /** How it sounds. Read by the content engine and by any assistant that
   *  writes on the customer's behalf. */
  voice: {
    /** Three or four adjectives that survive a stranger reading the site. */
    character: BrandList
    /** A sentence from their own material that sounds most like them. */
    exemplar: BrandField
  }

  lexicon: {
    /** Words and phrases they use for their own things. */
    uses: BrandList
    /** Words they avoid, and words that would be wrong in their category. */
    avoids: BrandList
  }

  /** Claims that can be stood behind. Everything here is quoted from their
   *  material, never summarised, because a summarised claim is a new claim. */
  proof: {
    claims: BrandList
    /** Named customers, awards or figures the site states. */
    evidence: BrandList
  }

  /** The line the owner draws before anyone else speaks for them. */
  guardrails: {
    neverSay: BrandList
    /** Subjects that must be handed to a person rather than answered. */
    handOff: BrandList
  }

  provenance: {
    /** Every page that was read. */
    sources: string[]
    ingestedAt: string | null
    /** Who confirmed the record, and when. Empty means nobody has yet, and
     *  no assistant may be built on it. */
    confirmedBy: string
    confirmedAt: string | null
  }
}

/** A field the customer has not yet looked at cannot brief an assistant.
 *  This is the single gate the rest of the product hangs off. */
export function isConfirmed(f: BrandField | BrandList): boolean {
  return f.source === 'confirmed' || f.source === 'written'
}

/** Every field in the record, flattened, so the review screen and the
 *  readiness check walk the same list and cannot drift apart. */
export function walk(r: BrandRecord): { path: string; label: string; group: string; f: BrandField | BrandList }[] {
  const out: { path: string; label: string; group: string; f: BrandField | BrandList }[] = []
  const push = (group: string, path: string, label: string, f: BrandField | BrandList) =>
    out.push({ path, label, group, f })

  push('Identity', 'identity.name', 'Business name', r.identity.name)
  push('Identity', 'identity.oneLine', 'What you do, for whom', r.identity.oneLine)
  push('Identity', 'identity.category', 'Category', r.identity.category)

  push('Offer', 'offer.what', 'What you sell', r.offer.what)
  push('Offer', 'offer.pricing', 'How it is priced', r.offer.pricing)
  push('Offer', 'offer.promise', 'The promise to a buyer', r.offer.promise)

  push('Audience', 'audience.who', 'Who it is for', r.audience.who)
  push('Audience', 'audience.notFor', 'Who it is not for', r.audience.notFor)
  push('Audience', 'audience.problem', 'The problem they arrive with', r.audience.problem)

  push('Voice', 'voice.character', 'How it sounds', r.voice.character)
  push('Voice', 'voice.exemplar', 'A sentence that sounds like you', r.voice.exemplar)

  push('Lexicon', 'lexicon.uses', 'Words you use', r.lexicon.uses)
  push('Lexicon', 'lexicon.avoids', 'Words you avoid', r.lexicon.avoids)

  push('Proof', 'proof.claims', 'Claims you stand behind', r.proof.claims)
  push('Proof', 'proof.evidence', 'Evidence for them', r.proof.evidence)

  push('Guardrails', 'guardrails.neverSay', 'What it must never say', r.guardrails.neverSay)
  push('Guardrails', 'guardrails.handOff', 'What it must hand to a person', r.guardrails.handOff)

  return out
}

/** How far through review the customer is, and whether the record can brief
 *  an assistant yet.
 *
 *  Ready is deliberately strict on a short list rather than lenient on a long
 *  one. An assistant can work without knowing the pricing. It cannot work
 *  without knowing what the business does, who it is for, and what it must
 *  never say, and those three are exactly where a wrong answer does damage. */
export const REQUIRED = ['identity.name', 'identity.oneLine', 'offer.what', 'audience.who', 'guardrails.neverSay']

export function readiness(r: BrandRecord): {
  total: number
  confirmed: number
  missing: string[]
  ready: boolean
} {
  const all = walk(r)
  const confirmed = all.filter(x => isConfirmed(x.f)).length
  const byPath = new Map(all.map(x => [x.path, x]))
  const missing = REQUIRED.filter(p => {
    const e = byPath.get(p)
    if (!e) return true
    if (!isConfirmed(e.f)) return true
    return 'values' in e.f ? e.f.values.length === 0 : e.f.value.trim().length === 0
  })
  return { total: all.length, confirmed, missing, ready: missing.length === 0 }
}

/** An empty record for a business that has not been ingested. Written out in
 *  full rather than generated, so a field added to the interface fails the
 *  build here instead of arriving as undefined on a customer's screen. */
export function emptyRecord(businessSlug: string): BrandRecord {
  const f = (): BrandField => ({ value: '', source: 'drafted', notFound: true })
  const l = (): BrandList => ({ values: [], source: 'drafted', notFound: true })
  return {
    version: 1,
    businessSlug,
    identity: { name: f(), oneLine: f(), category: f() },
    offer: { what: f(), pricing: f(), promise: f() },
    audience: { who: f(), notFor: f(), problem: f() },
    voice: { character: l(), exemplar: f() },
    lexicon: { uses: l(), avoids: l() },
    proof: { claims: l(), evidence: l() },
    guardrails: { neverSay: l(), handOff: l() },
    provenance: { sources: [], ingestedAt: null, confirmedBy: '', confirmedAt: null }
  }
}

/** The brief an assistant is built from.
 *
 *  Confirmed fields only. A drafted field is a model's opinion about a
 *  business it read for thirty seconds, and putting that in a system prompt
 *  is how an assistant ends up telling a customer's own client something the
 *  customer never said.
 */
export function briefFrom(r: BrandRecord): string {
  const lines: string[] = []
  const val = (f: BrandField) => (isConfirmed(f) && f.value.trim() ? f.value.trim() : '')
  const list = (f: BrandList) => (isConfirmed(f) ? f.values.filter(v => v.trim()) : [])

  const add = (label: string, v: string) => { if (v) lines.push(label + ': ' + v) }
  const addList = (label: string, v: string[]) => { if (v.length) lines.push(label + ': ' + v.join('; ')) }

  lines.push('THE BUSINESS YOU SPEAK FOR')
  add('Name', val(r.identity.name))
  add('What it does, for whom', val(r.identity.oneLine))
  add('Category', val(r.identity.category))
  add('What it sells', val(r.offer.what))
  add('How it is priced', val(r.offer.pricing))
  add('The promise', val(r.offer.promise))

  lines.push('')
  lines.push('WHO YOU ARE TALKING TO')
  add('Who it is for', val(r.audience.who))
  add('Who it is not for', val(r.audience.notFor))
  add('The problem they arrive with', val(r.audience.problem))

  lines.push('')
  lines.push('HOW YOU SOUND')
  addList('Character', list(r.voice.character))
  add('A sentence that sounds like them', val(r.voice.exemplar))
  addList('Words to use', list(r.lexicon.uses))
  addList('Words to avoid', list(r.lexicon.avoids))

  lines.push('')
  lines.push('WHAT YOU MAY CLAIM')
  addList('Claims that can be stood behind', list(r.proof.claims))
  addList('The evidence for them', list(r.proof.evidence))
  lines.push('Any claim not on that list may not be made, including a stronger version of one that is.')

  lines.push('')
  lines.push('HARD RULES')
  addList('Never say', list(r.guardrails.neverSay))
  addList('Hand these to a person rather than answering', list(r.guardrails.handOff))
  lines.push('Say plainly when you do not know, rather than guessing.')
  lines.push('Never state an accuracy percentage for the engine forecasts.')
  lines.push('Never give financial or investment advice.')

  return lines.join('\n')
}
