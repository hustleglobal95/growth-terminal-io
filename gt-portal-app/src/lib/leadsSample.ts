/** SAMPLE ROWS FOR THE LEAD FINDER, AND THE ONE WAY TO SEE THEM.
 *
 *  This exists so the Leads screen can be looked at in the real product before
 *  the engine serves it. It is not a demo mode and it is not reachable by
 *  accident:
 *
 *    - It renders only when the URL carries `?sample=1`. No link in the
 *      product points there. Nothing in the nav reaches it.
 *    - The screen states, on screen and permanently, that the rows are made up.
 *    - The moment LEADS_PATH is set the real data wins and this is dead code.
 *
 *  Delete this file and the two `sample` branches in Leads.tsx on the day the
 *  engine answers. Nothing else depends on it.
 */
import { leadsLive } from './leads'
import type { Lead, LeadSearch, Quota } from './leads'
import type { Sender } from './outreach'

/** Which made-up situation to draw. `?sample=1` is the full result. */
export type SampleState = 'results' | 'running' | 'partial' | 'failed' | 'nothing' | 'none'

export function sampleState(search: string): SampleState | null {
  const q = new URLSearchParams(search)
  const on = q.get('sample')
  if (!on) return null
  const named = (q.get('state') || '').toLowerCase()
  const known: SampleState[] = ['results', 'running', 'partial', 'failed', 'nothing', 'none']
  const found = known.find(k => k === named)
  return found || 'results'
}

/** Whether to draw the sample, and which one.
 *
 *  Two ways in, and the difference matters. `?sample=1` is explicit and works
 *  for anybody. The second is the reason this function exists: while the
 *  engine serves no lead routes at all, an internal workspace draws the sample
 *  by default so the screens can be opened, looked at and worked on rather
 *  than showing a panel saying they are not switched on yet.
 *
 *  A customer never reaches that second branch. Invented dental practices in
 *  a paying workspace would be a lie the product told first and explained
 *  second, and the honest empty state is the right thing to show them. The
 *  moment LEADS_PATH is set both branches stop mattering and real rows win.
 */
export function demoState(search: string, internal: boolean): SampleState | null {
  const named = sampleState(search)
  if (named) return named
  return !leadsLive() && internal ? 'results' : null
}

const iso = (ms: number) => new Date(Date.now() + ms).toISOString()

const COMPANIES: [string, Partial<Lead>][] = [
  ['Cedar Park Family Dental', {}],
  ['Brushy Creek Dental Studio', { status: 'saved' }],
  ['Lakeline Smiles', {
    emails: ['front@lakelinesmiles.example', 'billing@lakelinesmiles.example'],
    rating: 4.9, reviews: 512,
  }],
  ['North Austin Orthodontics', {
    website: null, domain: null, emails: [], phone: '(512) 555-0140',
    rating: 4.2, reviews: 31,
  }],
  ['Anderson Mill Dental Care', {
    emails: [], phone: null, rating: null, reviews: null, address: null, category: null,
  }],
  ['Steiner Ranch Dentistry', { status: 'dismissed' }],
  /* Reachable, but only by phone, and the listing carries no rating and no
     category. The sparsest row anyone will actually try to write to. */
  ['Brushy Hollow Dental', {
    website: null, domain: null, emails: [], phone: '(512) 555-0155',
    rating: null, reviews: null, category: null,
  }],
]

function row(i: number, name: string, o: Partial<Lead>): Lead {
  const slug = 'practice' + (i + 1)
  return {
    id: 'sample-' + i,
    searchId: 'sample-search',
    company: name,
    category: o.category === undefined ? 'Dentist' : o.category,
    website: o.website === undefined ? 'https://' + slug + '.example' : o.website,
    domain: o.domain === undefined ? slug + '.example' : o.domain,
    address: o.address === undefined ? '1200 Whitestone Blvd, Cedar Park, TX 78613' : o.address,
    phone: o.phone === undefined ? '(512) 555-0' + (101 + i) : o.phone,
    emails: o.emails === undefined ? ['hello@' + slug + '.example'] : o.emails,
    socials: {},
    rating: o.rating === undefined ? 4.7 : o.rating,
    reviews: o.reviews === undefined ? 218 : o.reviews,
    status: o.status || 'new',
    foundAt: iso(0),
  }
}

const LEADS: Lead[] = COMPANIES.map(([name, o], i) => row(i, name, o))

const BASE: LeadSearch = {
  id: 'sample-search',
  industry: 'Dental practice',
  location: 'Austin, Texas',
  limit: 200,
  enrich: true,
  status: 'complete',
  funnel: { found: 200, withSite: 138, crawled: 138, contactable: 96 },
  startedAt: iso(-900e3),
  finishedAt: iso(-120e3),
  failure: null,
  refusals: ['Twelve sites blocked automated readers, so their listings carry no email.'],
}

const SECOND: LeadSearch = {
  ...BASE,
  id: 'sample-second',
  industry: 'Roofing contractor',
  location: 'Round Rock, Texas',
  status: 'partial',
  funnel: { found: 61, withSite: 40, crawled: null, contactable: null },
  refusals: [],
}

export const SAMPLE_QUOTA: Quota = { used: 2, limit: 5, resets: iso(6 * 3600e3) }

/** The searches and rows for one made-up situation. */
export function sample(state: SampleState): { searches: LeadSearch[]; leads: Record<string, Lead[]> } {
  if (state === 'none') return { searches: [], leads: {} }

  if (state === 'running') {
    return {
      searches: [{
        ...BASE, status: 'finding', finishedAt: null, refusals: [],
        funnel: { found: 74, withSite: null, crawled: null, contactable: null },
      }],
      leads: { 'sample-search': [] },
    }
  }

  if (state === 'partial') return { searches: [SECOND], leads: { 'sample-second': [] } }

  if (state === 'nothing') {
    return {
      searches: [{ ...BASE, funnel: { found: 0, withSite: 0, crawled: 0, contactable: 0 }, refusals: [] }],
      leads: { 'sample-search': [] },
    }
  }

  if (state === 'failed') {
    return {
      searches: [{
        ...BASE,
        status: 'failed',
        funnel: { found: 200, withSite: 138, crawled: null, contactable: null },
        failure: 'The site crawl stopped after 138 companies were found. The companies below are kept; their websites were not read.',
        refusals: [],
      }],
      leads: { 'sample-search': LEADS.slice(0, 2).map(l => ({ ...l, emails: [], phone: null })) },
    }
  }

  return { searches: [BASE, SECOND], leads: { 'sample-search': LEADS, 'sample-second': [] } }
}

/** The states worth flipping between, for the switcher this mode draws. */
export const SAMPLE_STATES: { key: SampleState; label: string }[] = [
  { key: 'results', label: 'Results' },
  { key: 'running', label: 'Running' },
  { key: 'partial', label: 'Found, not read' },
  { key: 'failed', label: 'Failed' },
  { key: 'nothing', label: 'Nothing found' },
  { key: 'none', label: 'No searches yet' },
]

/** A made-up brand record, already confirmed, so the outreach screen can be
 *  looked at behind `?sample=1` too. Without one, every angle is refused for
 *  the right reason and the screen shows nothing but the refusal. */
export const SAMPLE_SENDER: Sender = {
  name: 'Northgate Dental Marketing',
  oneLine: 'we fill dental chairs for practices that are good at dentistry and bad at getting found',
  what: 'a done-for-you patient acquisition system: local search, review capture and a booking follow-up sequence',
  promise: 'twenty new patient enquiries a month within ninety days, or we work the next month unpaid',
  who: 'independent dental practices with one to four chairs',
  neverSay: ['guaranteed', 'cheapest'],
  missing: [],
}
