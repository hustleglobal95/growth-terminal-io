/** THE LEAD FINDER.
 *
 *  This file is the contract. The screen is built against these shapes first
 *  and the engine is written to match, so the wiring is exact rather than
 *  discovered halfway through.
 *
 *    POST  /v1/leads/searches         start a search
 *    GET   /v1/leads/searches         this workspace's searches, newest first
 *    GET   /v1/leads/searches/{id}    one search and its leads
 *    PATCH /v1/leads/{id}             save or dismiss a lead
 *
 *  WHY THE SHAPES LOOK LIKE THIS.
 *
 *  A search is a job, not a request. Discovery and the site crawl are two
 *  Apify actor runs chained, and either can take minutes, so the start call
 *  answers with a record in `queued` and the screen polls. Nothing about this
 *  screen may block on a run finishing.
 *
 *  The counts are a funnel, not a total. A search that reports "96 leads"
 *  hides the three places where rows fall out: places found, places with a
 *  website, sites that answered with a contact. A person deciding whether to
 *  run another search needs to see which stage lost them, so every stage is
 *  carried separately and the screen shows the drop.
 *
 *  `refusals` is a list of plain sentences from the engine about what it could
 *  not do. It is not an error list. A search can be complete and still have
 *  refused something, and saying so is the difference between a result and a
 *  claim.
 */

import { LEADS_PATH } from '../config'
import { liveRoot } from './api'

/** Whether the engine serves this yet. The screen is complete and the routes
 *  are not, so the product hides the feature rather than offering a control
 *  that cannot work. */
export function leadsLive(): boolean {
  return LEADS_PATH.length > 0
}

/** Where a search is. `partial` means discovery worked and enrichment did not,
 *  which is a real outcome with usable rows in it, not a failure. */
export type SearchStatus =
  | 'queued'
  | 'finding'
  | 'enriching'
  | 'complete'
  | 'partial'
  | 'failed'

export type LeadStatus = 'new' | 'saved' | 'dismissed'

/** The stage counts. Each is null until that stage has run, so the screen can
 *  tell "none survived this stage" apart from "this stage has not happened". */
export interface Funnel {
  /** Places returned by discovery. */
  found: number | null
  /** Of those, how many carried a website. */
  withSite: number | null
  /** Of those, how many sites were crawled. */
  crawled: number | null
  /** Of those, how many yielded an email or a phone number. */
  contactable: number | null
}

export interface LeadSearch {
  id: string
  /** What was typed. Echoed back so a row is readable without the form. */
  industry: string
  location: string
  limit: number
  /** Whether the site crawl was asked for. */
  enrich: boolean
  status: SearchStatus
  funnel: Funnel
  startedAt: string
  finishedAt: string | null
  /** One sentence, the engine's own words, when status is failed. */
  failure: string | null
  /** What the engine could not do, said plainly. Never an error dump. */
  refusals: string[]
}

export interface Lead {
  id: string
  searchId: string
  company: string
  /** The category discovery filed it under. This is the industry as the source
   *  saw it, which is not always the industry that was searched for. */
  category: string | null
  website: string | null
  domain: string | null
  address: string | null
  phone: string | null
  /** Every address the crawl found on the site. Often empty. */
  emails: string[]
  /** Public profile URLs by network, only the ones that were found. */
  socials: Record<string, string>
  rating: number | null
  reviews: number | null
  status: LeadStatus
  foundAt: string
}

/** What is left of today's allowance. The searches cost money to run and are
 *  free to the customer for now, so the ceiling is real and is shown rather
 *  than discovered by hitting it. */
export interface Quota {
  used: number
  limit: number
  /** ISO instant the allowance resets. */
  resets: string
}

export interface SearchList {
  searches: LeadSearch[]
  quota: Quota
}

export interface SearchDetail {
  search: LeadSearch
  leads: Lead[]
}

export interface StartSearch {
  industry: string
  location: string
  limit: number
  enrich: boolean
}

async function root<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await liveRoot<unknown>(path, init)
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: T }).data
  }
  return body as T
}

export function listSearches(): Promise<SearchList> {
  return root<SearchList>(LEADS_PATH + '/searches')
}

export function getSearch(id: string): Promise<SearchDetail> {
  return root<SearchDetail>(LEADS_PATH + '/searches/' + encodeURIComponent(id))
}

export function startSearch(body: StartSearch): Promise<LeadSearch> {
  return root<LeadSearch>(LEADS_PATH + '/searches', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function setLeadStatus(id: string, status: LeadStatus): Promise<Lead> {
  return root<Lead>(LEADS_PATH + '/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  })
}

// ── Reading the record, without adding to it ────────────────────────────────

/** True while the engine still has work to do, which is the only condition
 *  under which this screen should poll. */
export function running(s: SearchSt): boolean {
  return s === 'queued' || s === 'finding' || s === 'enriching'
}
type SearchSt = SearchStatus

/** What the search is doing right now, in words rather than a status token. */
export function stageLabel(s: LeadSearch): string {
  if (s.status === 'queued') return 'Waiting to start'
  if (s.status === 'finding') return 'Finding companies'
  if (s.status === 'enriching') return 'Reading their sites'
  if (s.status === 'failed') return 'Failed'
  if (s.status === 'partial') return 'Found, not read'
  return 'Done'
}

/** The one number a row is worth summarising by, and null when no stage that
 *  could produce it has finished. Contactable when the crawl ran, companies
 *  found when it did not. */
export function headline(s: LeadSearch): number | null {
  if (s.enrich && s.funnel.contactable !== null) return s.funnel.contactable
  return s.funnel.found
}

/** Where the rows went. The whole pipeline is returned, including the stages
 *  that have not run yet, so a search in flight shows the shape it is going to
 *  fill rather than growing a cell at a time. A null count means that stage
 *  has not happened, which is a different fact from a count of zero and the
 *  screen must not collapse the two. */
export function drop(f: Funnel, enrich: boolean): { label: string; count: number | null }[] {
  const out: { label: string; count: number | null }[] = [
    { label: 'Companies found', count: f.found },
    { label: 'With a website', count: f.withSite },
  ]
  if (enrich) {
    out.push({ label: 'Sites read', count: f.crawled })
    out.push({ label: 'Gave a contact', count: f.contactable })
  }
  return out
}

/** A lead is worth contacting when there is a way to contact it. */
export function contactable(l: Lead): boolean {
  return l.emails.length > 0 || Boolean(l.phone)
}

/** The export. Built in the browser from rows already on screen, so it holds
 *  exactly what was shown and needs no second endpoint. */
export function toCsv(leads: Lead[]): string {
  const head = [
    'Company', 'Category', 'Website', 'Phone', 'Emails',
    'Address', 'Rating', 'Reviews', 'Status',
  ]
  const cell = (v: string | number | null): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const lines = [head.join(',')]
  for (const l of leads) {
    lines.push([
      cell(l.company), cell(l.category), cell(l.website), cell(l.phone),
      cell(l.emails.join(' ')), cell(l.address), cell(l.rating),
      cell(l.reviews), cell(l.status),
    ].join(','))
  }
  return lines.join('\n')
}
