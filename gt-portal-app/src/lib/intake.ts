/** THE INTAKE. Upload, review what the engine read, then analyse.
 *
 *  Three calls, and they are the same three the Sheets add-on makes:
 *
 *    POST /v1/data/ingest                   the workbook goes up as a snapshot
 *    PUT  /v1/data/snapshots/{id}/confirm   with corrections, or none
 *    POST /v1/analyses                      queued against the snapshot id
 *
 *  The middle call is the one this screen exists for. Code.gs says it plainly:
 *  "A snapshot lands in awaiting_confirmation and cannot be analysed until it
 *  is confirmed. The portal has a review UI for this, where a person checks
 *  how the columns were read and can send back corrections. The add-on does
 *  not: it confirms with no corrections, so the analysis runs in one press."
 *
 *  So the review step is not something invented here. It is the half of the
 *  design the add-on skips, and building it is the difference between an
 *  intake that guesses and one that shows its work.
 *
 *  WHAT THIS REFUSES TO DO.
 *
 *  It does not read the columns itself. The server does that at ingest and
 *  returns what it found; this screen displays it and sends back corrections.
 *  A second opinion computed in the browser would be a second source of truth,
 *  and the moment the two disagreed the customer would be looking at a screen
 *  that did not describe the analysis they were about to get.
 */
import { INTAKE_PATH } from '../config'
import { liveRoot } from './api'
import type { WorkbookPayload } from './sheet'

export function intakeLive(): boolean {
  return INTAKE_PATH.length > 0
}

/** One column as the server read it. Every field is optional because the
 *  shape flexes and a missing key must degrade to "not sure" rather than
 *  throwing on a screen the customer is halfway through. */
export type ReadColumn = {
  sheet?: string
  header?: string
  index?: number
  /** What the engine thinks this is: revenue, leads, spend, date, and so on. */
  role?: string | null
  /** matched, suggested, unmapped, ignored. Anything else renders as unknown. */
  status?: string | null
  confidence?: number | null
  type?: string | null
  sample?: (string | number | boolean)[]
}

export type Snapshot = {
  snapshotId: string
  status?: string
  existed?: boolean
  columns?: ReadColumn[]
  /** Roles the engine wanted and did not find. */
  missing?: string[]
  /** Analyses this snapshot can support, if the server says. */
  supports?: string[]
  dateRange?: { start?: string; end?: string } | null
}

/** A correction the customer made on the review screen. Sent back on confirm.
 *  Keyed the same way the server addresses columns. */
export type Correction = { sheet?: string; index?: number; header?: string; role: string | null }

function pick<T>(o: Record<string, unknown>, keys: string[]): T | undefined {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k] as T
  return undefined
}

/** Step one. The workbook goes up. Nothing about the sheet travels in the
 *  analysis request afterwards, only the id that comes back. */
export async function ingest(workbook: WorkbookPayload, fileName: string): Promise<Snapshot> {
  const body = {
    raw: workbook,
    sourceType: 'upload',
    sourceRef: fileName,
    idempotencyKey: contentKey(workbook)
  }
  const r = await liveRoot<Record<string, unknown>>(INTAKE_PATH + '/ingest', {
    method: 'POST', body: JSON.stringify(body)
  })
  const d = (pick<Record<string, unknown>>(r, ['data', 'payload']) || r) as Record<string, unknown>
  const id = pick<string>(d, ['snapshotId', 'snapshot_id', 'id'])
  if (!id) throw new Error('The file was uploaded but no snapshot reference came back.')
  return {
    snapshotId: String(id),
    status: pick<string>(d, ['status']),
    existed: pick<boolean>(d, ['existed']),
    columns: pick<ReadColumn[]>(d, ['columns', 'readColumns', 'fields']) || [],
    missing: pick<string[]>(d, ['missing', 'missingFields', 'missingRoles']) || [],
    supports: pick<string[]>(d, ['supports', 'supportedAnalyses', 'available']) || [],
    dateRange: pick<{ start?: string; end?: string }>(d, ['dateRange', 'date_range']) || null
  }
}

/** Step two. Confirm, with whatever the customer changed. An already
 *  confirmed snapshot is the state we wanted, so it is a success here. That
 *  is what makes a retry after a timeout safe. */
export async function confirm(snapshotId: string, corrections: Correction[]): Promise<void> {
  try {
    await liveRoot<unknown>(INTAKE_PATH + '/snapshots/' + encodeURIComponent(snapshotId) + '/confirm', {
      method: 'PUT',
      body: JSON.stringify(corrections.length ? { corrections } : {})
    })
  } catch (e) {
    const m = String((e as Error).message || '').toLowerCase()
    if (m.includes('already') && m.includes('confirm')) return
    throw e
  }
}

/** Step three. Only snapshotId is accepted, so send only snapshotId. An extra
 *  field is a validation failure on a strict schema. */
export async function queueAnalysis(snapshotId: string, businessId?: string): Promise<string> {
  const body: Record<string, string> = { snapshotId: String(snapshotId) }
  if (businessId) body.businessId = businessId
  const r = await liveRoot<Record<string, unknown>>('/v1/analyses', {
    method: 'POST', body: JSON.stringify(body)
  })
  const d = (pick<Record<string, unknown>>(r, ['data', 'payload']) || r) as Record<string, unknown>
  const id = pick<string>(d, ['id', 'analysisId', 'analysis_id'])
  if (!id) throw new Error('The analysis was accepted but no reference came back. Check Analyses before retrying.')
  return String(id)
}

/** Keyed on the content itself, so uploading the same workbook twice reuses
 *  the stored snapshot rather than creating a duplicate and charging twice. */
function contentKey(w: WorkbookPayload): string {
  let h = 5381
  const s = JSON.stringify(w.sheets.map(x => [x.title, x.rowCount, x.columnCount, x.values[0]]))
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return 'upload-' + (h >>> 0).toString(36) + '-' + w.sheets.length
}

/* ---------------------------------------------------------------- roles */

/** The roles the engine reasons about, in the order a person thinks about
 *  their business. Labels are the customer's words, not the field names. */
export const ROLES: { id: string; label: string; hint: string }[] = [
  { id: 'date',        label: 'Date',            hint: 'When it happened' },
  { id: 'revenue',     label: 'Revenue',         hint: 'Money in' },
  { id: 'expense',     label: 'Cost or spend',   hint: 'Money out, including ad spend' },
  { id: 'leads',       label: 'Leads',           hint: 'People who showed interest' },
  { id: 'customers',   label: 'Customers',       hint: 'People who bought' },
  { id: 'orders',      label: 'Orders',          hint: 'Transactions' },
  { id: 'campaign',    label: 'Campaign',        hint: 'Which channel or campaign' },
  { id: 'stage',       label: 'Conversion stage', hint: 'Where in the funnel' },
  { id: 'traffic',     label: 'Traffic',         hint: 'Sessions, visits or impressions' },
  { id: 'other',       label: 'Something else',  hint: 'Kept, but not used as a signal' }
]

export const roleLabel = (id?: string | null): string =>
  ROLES.find(r => r.id === id)?.label || (id ? String(id) : 'Not recognised')

/** Three states, and nothing falls through to a fourth silently. A column the
 *  engine is unsure about is never quietly treated as ignored: the customer
 *  is asked, because a dropped column on a messy sheet is exactly the thing
 *  nobody notices until the answer is wrong. */
export type ColumnState = 'recognised' | 'confirm' | 'unmapped'

export function columnState(c: ReadColumn): ColumnState {
  const s = String(c.status || '').toLowerCase()
  if (s === 'matched' || s === 'exact' || s === 'confirmed') return 'recognised'
  if (s === 'ignored' || s === 'unmapped' || s === 'none') return 'unmapped'
  if (c.role && (c.confidence ?? 1) >= 0.9) return 'recognised'
  if (c.role) return 'confirm'
  return 'unmapped'
}
