/** THE INTAKE. Upload, check what is going up, then analyse.
 *
 *  Three calls, and they are the same three the Sheets add-on makes:
 *
 *    POST /v1/data/ingest                   the workbook goes up as a snapshot
 *    PUT  /v1/data/snapshots/{id}/confirm   with corrections, or none
 *    POST /v1/analyses                      queued against the snapshot id
 *
 *  WHAT THE SERVER ACTUALLY RETURNS, AND WHY THIS SCREEN CHANGED SHAPE.
 *
 *  Code.gs says the portal has a review UI "where a person checks how the
 *  columns were read and can send back corrections". That describes an
 *  intention, not the endpoint. Ingest answers with three fields and none of
 *  them describe the workbook:
 *
 *    { data: { snapshotId, status, existed }, meta: { requestId } }
 *
 *  201 for a new snapshot, 200 when idempotency matched an existing one and
 *  existed comes back true. There is no column read-back to display, so this
 *  screen does not claim one. It shows what is being sent, which it knows for
 *  certain because it parsed the file itself, and it lets somebody take a tab
 *  out before it goes.
 *
 *  Corrections are not column mappings either. They address named fields with
 *  a replacement value and a confidence between 0 and 1:
 *
 *    { corrections: { "<field-name>": { value, confidence } } }
 *
 *  Nothing in the portal yet knows a field name the server would recognise,
 *  so nothing sends corrections. Guessing at keys would put a control on the
 *  screen that silently changes nothing, which is worse than no control.
 *  confirm sends {} until there is a read-back to correct against.
 */
import { INTAKE_PATH } from '../config'
import { liveRoot } from './api'
import type { WorkbookPayload } from './sheet'

export function intakeLive(): boolean {
  return INTAKE_PATH.length > 0
}

/** Everything ingest gives back. Optional beyond the id, because a missing
 *  key must degrade rather than throw on a screen somebody is halfway
 *  through. */
export type Snapshot = {
  snapshotId: string
  status?: string
  existed?: boolean
}

/** The confirm body, exactly as the endpoint accepts it. Keyed by field name.
 *  confidence is inclusive of 0 and 1. */
export type Corrections = Record<string, { value: string | number | null; confidence: number }>

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
  const d = (pick<Record<string, unknown>>(r, ['data']) || r) as Record<string, unknown>
  const id = pick<string>(d, ['snapshotId', 'snapshot_id', 'id'])
  if (!id) throw new Error('The file was uploaded but no snapshot reference came back.')
  return {
    snapshotId: String(id),
    status: pick<string>(d, ['status']),
    existed: pick<boolean>(d, ['existed'])
  }
}

/** Step two. An already confirmed snapshot is the state we wanted, so it is a
 *  success here. That is what makes a retry after a timeout safe. */
export async function confirm(snapshotId: string, corrections?: Corrections): Promise<void> {
  const body = corrections && Object.keys(corrections).length ? { corrections } : {}
  try {
    await liveRoot<unknown>(INTAKE_PATH + '/snapshots/' + encodeURIComponent(snapshotId) + '/confirm', {
      method: 'PUT',
      body: JSON.stringify(body)
    })
  } catch (e) {
    const m = String((e as Error).message || '').toLowerCase()
    if (m.includes('already') && m.includes('confirm')) return
    if (m.includes("in status 'confirmed'") || m.includes('in status "confirmed"')) return
    throw e
  }
}

/** Step three. Only snapshotId is accepted, so send only snapshotId. Code.gs
 *  is explicit that an extra field is a validation failure on a strict
 *  schema, and it has been talking to this endpoint longer than we have. */
export async function queueAnalysis(snapshotId: string): Promise<string> {
  const r = await liveRoot<Record<string, unknown>>('/v1/analyses', {
    method: 'POST', body: JSON.stringify({ snapshotId: String(snapshotId) })
  })
  const d = (pick<Record<string, unknown>>(r, ['data']) || r) as Record<string, unknown>
  const id = pick<string>(d, ['id', 'analysisId', 'analysis_id'])
  if (!id) throw new Error('The analysis was accepted but no reference came back. Check Analyses before retrying.')
  return String(id)
}

/** Keyed on the content itself, so uploading the same workbook twice reuses
 *  the stored snapshot rather than creating a duplicate and charging twice.
 *  When it matches, ingest answers 200 with existed true. */
function contentKey(w: WorkbookPayload): string {
  let h = 5381
  const s = JSON.stringify(w.sheets.map(x => [x.title, x.rowCount, x.columnCount, x.values[0]]))
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return 'upload-' + (h >>> 0).toString(36) + '-' + w.sheets.length
}
