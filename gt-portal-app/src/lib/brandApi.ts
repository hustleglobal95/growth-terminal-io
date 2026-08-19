/** Brand record, client side.
 *
 *  Every call here goes through liveRoot, so it carries the Clerk session and
 *  the X-Workspace-Id header like everything else, and a signed out browser
 *  lands on the login screen rather than getting a confusing 401 in the
 *  console.
 *
 *  BRAND_PATH empty means the engine has no brand routes yet. The screen says
 *  so and offers the parts that work without one, rather than rendering a
 *  paste box that throws when it is used. This is the same pattern
 *  AGENT_CREATE_PATH set, and for the same reason: a control that looks live
 *  and does nothing is worse than an honest empty state.
 */
import { BRAND_PATH } from '../config'
import { liveRoot } from './api'
import { BrandRecord } from './brand'

export function brandConfigured(): boolean {
  return BRAND_PATH.length > 0
}

export interface IngestResult {
  record: BrandRecord
  pagesRead: string[]
  /** Field paths the engine dropped because the model's quote was not
   *  actually on the page. Named rather than counted, because a count is not
   *  something a customer can act on. */
  warnings: string[]
}

function notConfigured(): never {
  throw new Error('Brand ingest is not switched on for this workspace yet.')
}

/** Read a site and draft a record. Saves nothing. */
export async function ingestBrand(businessSlug: string, url: string): Promise<IngestResult> {
  if (!brandConfigured()) notConfigured()
  const r = await liveRoot<IngestResult>(BRAND_PATH + '/ingest', {
    method: 'POST',
    body: JSON.stringify({ businessSlug, url })
  })
  /* A 200 proves a response arrived, not that it is the response we asked
     for. The same lesson createAgent learned: validate the shape before
     handing it to a screen that will index into it. */
  if (!r || !r.record || r.record.version !== 1) {
    throw new Error('The engine returned something this portal does not understand.')
  }
  return { ...r, pagesRead: r.pagesRead || [], warnings: r.warnings || [] }
}

/** The saved record for a business, or null when there is not one yet. */
export async function getBrand(businessSlug: string): Promise<BrandRecord | null> {
  if (!brandConfigured()) return null
  const r = await liveRoot<BrandRecord | null>(
    BRAND_PATH + '?business=' + encodeURIComponent(businessSlug)
  )
  if (!r || (r as BrandRecord).version !== 1) return null
  return r as BrandRecord
}

/** Save the record. This is the confirm step and the only thing that writes. */
export async function saveBrand(record: BrandRecord): Promise<BrandRecord> {
  if (!brandConfigured()) notConfigured()
  return liveRoot<BrandRecord>(BRAND_PATH, {
    method: 'PUT',
    body: JSON.stringify({ record })
  })
}

export async function deleteBrand(businessSlug: string): Promise<void> {
  if (!brandConfigured()) notConfigured()
  await liveRoot<null>(BRAND_PATH + '?business=' + encodeURIComponent(businessSlug), { method: 'DELETE' })
}
