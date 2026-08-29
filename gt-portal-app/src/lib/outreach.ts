/** THE FIRST MESSAGE.
 *
 *  Turns a lead the finder produced and the sender's own brand record into a
 *  message they can paste into whatever they send mail with.
 *
 *  WHY THIS IS ASSEMBLED AND NOT WRITTEN BY A MODEL.
 *
 *  Every sentence here has to be traceable to a field. A model handed a
 *  company name and a category will produce a warm opening about a business it
 *  knows nothing about, and that sentence then gets sent to that business's
 *  owner. The brand module already holds this line: a field is drafted until a
 *  human confirms it, and an assistant may only be briefed on confirmed
 *  fields. A cold message to a stranger is the least forgiving place in the
 *  product to break that rule, so this module does not break it.
 *
 *  The consequence is a plainer message than a model would write. That is the
 *  right trade. A first touch that says one true, specific thing beats three
 *  paragraphs of invented rapport, and it is the version that does not
 *  embarrass the sender when the recipient replies.
 *
 *  WHAT IT IS ALLOWED TO SAY ABOUT THE RECIPIENT.
 *
 *  Only what the finder actually recorded: their name, the category the source
 *  filed them under, the area searched, their rating and review count, and
 *  whether they publish a website. It never claims to have read their blog,
 *  seen their post, or met them. If a fact is missing the line that needed it
 *  is dropped rather than filled with a placeholder.
 */

import type { Lead } from './leads'
import type { BrandRecord } from './brand'
import { isConfirmed } from './brand'

/** The reason the sender is writing. Each one leans on different fields and
 *  each one is refused when its fields are missing. */
export type Angle = 'introduction' | 'observation' | 'offer'

export const ANGLES: { key: Angle; label: string; needs: string; blurb: string }[] = [
  {
    key: 'introduction',
    label: 'Plain introduction',
    needs: 'Your business name and what you do',
    blurb: 'Who you are, who you help, one small ask. The safest first touch.',
  },
  {
    key: 'observation',
    label: 'Something about them',
    needs: 'The above, plus a rating or review count on the lead',
    blurb: 'Opens on a fact the search actually found about their business.',
  },
  {
    key: 'offer',
    label: 'Lead with the offer',
    needs: 'The above, plus what you sell and the promise you make',
    blurb: 'States the thing you sell and the outcome, early. Shorter, more direct.',
  },
]

/** What a draft can be pasted into. Length and shape change, the facts do not. */
export type Format = 'email' | 'short' | 'call'

export const FORMATS: { key: Format; label: string; blurb: string }[] = [
  { key: 'email', label: 'Email', blurb: 'Subject and body.' },
  { key: 'short', label: 'Short message', blurb: 'For a DM or an SMS. No subject, under 300 characters.' },
  { key: 'call', label: 'Call opener', blurb: 'The first twenty seconds, written to be said out loud.' },
]

export interface Draft {
  leadId: string
  company: string
  /** Best address to send to, when the crawl found one. */
  to: string | null
  subject: string | null
  body: string
  /** Facts about the recipient this draft actually used, so the screen can
   *  show what it leaned on rather than asking the sender to trust it. */
  used: string[]
  /** Why a line was left out. Shown, never hidden. */
  refusals: string[]
}

/** Sender details, pulled from confirmed brand fields only. A field that
 *  nobody has confirmed is treated as absent. */
export interface Sender {
  name: string
  oneLine: string
  what: string
  promise: string
  who: string
  /** Words the owner has said never to use. Checked against the output. */
  neverSay: string[]
  /** Which required pieces are missing, by label. */
  missing: string[]
}

function confirmedValue(f: { value: string; source: string } | undefined): string {
  if (!f) return ''
  return isConfirmed(f as never) ? f.value.trim() : ''
}

function confirmedList(f: { values: string[]; source: string } | undefined): string[] {
  if (!f) return []
  return isConfirmed(f as never) ? f.values : []
}

/** Read the sender out of a brand record. Everything unconfirmed is dropped
 *  on the floor, which is the whole point of the record having a source on
 *  every field. */
export function senderFrom(r: BrandRecord | null): Sender {
  const s: Sender = {
    name: confirmedValue(r?.identity.name),
    oneLine: confirmedValue(r?.identity.oneLine),
    what: confirmedValue(r?.offer.what),
    promise: confirmedValue(r?.offer.promise),
    who: confirmedValue(r?.audience.who),
    neverSay: confirmedList(r?.guardrails.neverSay),
    missing: [],
  }
  if (!s.name) s.missing.push('your business name')
  if (!s.oneLine) s.missing.push('what you do, for whom')
  return s
}

/** Which angles this sender can actually support right now. */
export function availableAngles(s: Sender, leads: Lead[]): Record<Angle, string | null> {
  const anyRated = leads.some(l => l.rating !== null || (l.reviews !== null && l.reviews > 0))
  return {
    introduction: s.missing.length ? 'Confirm ' + s.missing.join(' and ') + ' in your brand record first.' : null,
    observation: s.missing.length
      ? 'Confirm ' + s.missing.join(' and ') + ' in your brand record first.'
      : anyRated ? null : 'None of the selected companies came back with a rating or review count.',
    offer: s.missing.length
      ? 'Confirm ' + s.missing.join(' and ') + ' in your brand record first.'
      : s.what ? null : 'Confirm what you sell in your brand record first.',
  }
}

// ── Sentences ─────────────────────────────────────────────────

/** A brand field is free text a person wrote. It might be a noun phrase, it
 *  might be a full sentence with its own full stop. Anything that splices one
 *  into the middle of another sentence eventually produces "Acme Ltd we help
 *  dentists", so fields that could be either are only ever emitted whole. */
function sentence(v: string): string {
  const t = v.trim()
  if (!t) return ''
  const u = t.charAt(0).toUpperCase() + t.slice(1)
  return /[.!?]$/.test(u) ? u : u + '.'
}

/** A neutral way to name what they do, taken from the category the source
 *  filed them under. Falls back to nothing rather than guessing. */
function theirTrade(l: Lead): string {
  const c = (l.category || '').trim().toLowerCase()
  return c && c.length < 40 ? c : ''
}

/** The town off the listing address, so a first line can be about them rather
 *  than about the sender. Postal addresses put the locality in the
 *  second-to-last comma field in every format this product sees; anything that
 *  does not parse that way returns nothing rather than a guess. */
function town(l: Lead): string {
  const parts = (l.address || '').split(',').map(x => x.trim()).filter(Boolean)
  if (parts.length < 3) return ''
  const t = parts[parts.length - 2]
  return t && t.length < 32 && !/\d/.test(t) ? t : ''
}

function ratingLine(l: Lead): string | null {
  if (l.rating === null) return null
  const r = l.rating.toFixed(1)
  if (l.reviews !== null && l.reviews >= 10) {
    return l.company + ' is holding ' + r + ' across ' + l.reviews.toLocaleString() + ' reviews'
  }
  return l.company + ' is holding ' + r
}

function ask(format: Format): string {
  if (format === 'short') return 'Worth a short conversation?'
  if (format === 'call') return 'Is now a bad time?'
  return 'If it is worth ten minutes, reply and I will send a time. If not, no hard feelings and I will not chase you.'
}

// ── The builder ───────────────────────────────────────────────

export function buildDraft(lead: Lead, s: Sender, angle: Angle, format: Format): Draft {
  const used: string[] = []
  const refusals: string[] = []
  const lines: string[] = []
  /* Only ever called at the point a fact reaches the page. A provenance line
     that lists what was available rather than what was used is worse than no
     provenance line, because it is read as a claim and it is wrong. */
  const from = (what: string) => { if (!used.includes(what)) used.push(what) }

  const trade = theirTrade(lead)
  const where = town(lead)
  const rated = ratingLine(lead)
  const brief = format === 'short' || format === 'call'

  if (angle === 'observation' && !rated) {
    refusals.push('No rating came back for this company, so this one opens on the plain introduction instead.')
  }

  // ── the opening, which is the only part that is about them
  if (angle === 'observation' && rated) {
    lines.push(rated + (trade && where ? ' as ' + article(trade) + ' ' + trade + ' in ' + where : '') + '.')
    from('their rating' + (lead.reviews ? ' and review count' : ''))
    if (trade) from('their category')
    if (where) from('their town')
    lines.push('That usually means the work is good and the problem is further up, in how many people ever find you.')
  } else {
    /* Naming how they were found is the one true specific thing this tool
       always has, and saying it plainly is better than pretending to a
       familiarity nobody has. */
    const how = trade && where ? ' while looking at ' + trade + 's around ' + where
      : trade ? ' while looking at ' + trade + 's'
        : where ? ' while looking around ' + where : ''
    /* On a call the opener has already said the company name out loud, and
       saying it twice in eight seconds is how a caller sounds like a script. */
    if (format === 'call') {
      lines.push('I found you' + how + '.')
    } else {
      lines.push('I came across ' + lead.company + how + '.')
      from('their name')
    }
    if (trade) from('their category')
    if (where) from('their town')
  }

  // ── who is writing. Every angle says this, because a message that never
  //    introduces its sender is not a first touch, it is spam.
  if (angle === 'offer' && s.what) {
    lines.push('I run ' + s.name + '. We sell ' + lowerFirst(s.what).replace(/\.$/, '') + '.')
    from('what you sell')
    if (s.promise && !brief) {
      lines.push(sentence(s.promise))
      from('your promise')
    }
  } else {
    /* One paragraph, not two. "I run Acme." on its own line followed by a
       second one-line paragraph reads like a form, which is the thing this
       whole module is trying not to be. */
    lines.push('I run ' + s.name + '. ' + sentence(s.oneLine))
  }

  // ── why them specifically
  if (angle !== 'offer' && s.who && !brief) {
    lines.push('We work with ' + lowerFirst(s.who).replace(/\.$/, '') + '.')
    from('who you work with')
  }

  // ── no website is a real observation and it is not an insult
  if (!lead.website && angle === 'observation' && !brief) {
    lines.push('I could not find a website for you, which is either deliberate or the thing costing you the most.')
    from('no website found')
  }

  lines.push(ask(format))

  let body = lines.join(format === 'email' ? '\n\n' : ' ')
  if (format === 'email') body = 'Hi,\n\n' + body + '\n\n' + s.name
  if (format === 'call') body = 'Hi, is that ' + lead.company + '? ' + body

  // ── the guardrail the owner set, enforced rather than trusted
  for (const word of s.neverSay) {
    const w = word.trim()
    if (!w) continue
    if (new RegExp('\\b' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(body)) {
      refusals.push('The word "' + w + '" is on your never-say list and appeared in this draft. Edit before sending.')
    }
  }

  /* An email needs somewhere to go. The row is in the picker because a phone
     number reaches them, which is a different message and a different day. */
  if (format === 'email' && !lead.emails.length) {
    refusals.push(lead.phone
      ? 'No email address came back for this company. ' + lead.phone + ' is the only way in, so the call opener is the format that fits.'
      : 'No email address came back for this company.')
  }

  /* Short messages are built short rather than cut short. If one still runs
     over, the sender is told the number instead of being handed a sentence
     that stops mid-word. */
  if (format === 'short' && body.length > 300) {
    refusals.push('This runs to ' + body.length + ' characters, over the 300 a single SMS carries. Cut a sentence before sending.')
  }

  return {
    leadId: lead.id,
    company: lead.company,
    to: lead.emails.length ? lead.emails[0] : null,
    subject: format === 'email' ? subjectFor(lead, s, angle) : null,
    body,
    used,
    refusals,
  }
}

function article(w: string): string {
  return /^[aeiou]/i.test(w) ? 'an' : 'a'
}

function subjectFor(lead: Lead, s: Sender, angle: Angle): string {
  const trade = theirTrade(lead)
  const where = town(lead)
  if (angle === 'observation' && lead.rating !== null) {
    return lead.company + ', and the gap above your reviews'
  }
  if (angle === 'offer' && s.what) return s.name + ' and ' + lead.company
  if (trade && where) return upperFirst(trade) + 's in ' + where
  return 'Quick one for ' + lead.company
}

function upperFirst(v: string): string {
  const t = v.trim()
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t
}

function lowerFirst(v: string): string {
  const t = v.trim()
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : t
}

// ── Getting it out of the app ───────────────────────────────────────────────

/** One draft as plain text, subject included, ready for a paste. */
export function asText(d: Draft): string {
  return d.subject ? 'Subject: ' + d.subject + '\n\n' + d.body : d.body
}

/** Every draft as a mail-merge sheet. This is the format that matters for
 *  volume: one row per company, with the fields a sending tool expects, so a
 *  hundred drafts leave the app in one file rather than a hundred pastes. */
export function asMergeCsv(drafts: Draft[]): string {
  const head = ['Company', 'Email', 'Subject', 'Body']
  const cell = (v: string | null): string => {
    const s = v === null ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const rows = drafts.map(d => [cell(d.company), cell(d.to), cell(d.subject), cell(d.body)].join(','))
  return [head.join(','), ...rows].join('\n')
}
