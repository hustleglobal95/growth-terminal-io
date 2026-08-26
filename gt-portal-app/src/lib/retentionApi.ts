/**
 * The retention endpoints, typed.
 *
 * Two things about this file are load bearing and neither is obvious.
 *
 * The first is the envelope. The engine answers the version one routes with
 * { data, meta }, and `liveRoot` hands that back whole rather than unwrapping
 * it the way the portal adapter does. Reading straight through it is how a
 * committed plan once rendered as an uncommitted one, and the same mistake
 * here would show a stored definition as unstored. `root` below is the same
 * unwrap the verification client uses, for the same reason.
 *
 * The second is that the field names below are not guesses. Every one was read
 * off the engine's own route and service source, because the first draft of
 * this file invented plausible ones (`totalEvents`, `uniqueAccounts`,
 * `rejectionsOmitted`) and every single one was wrong. A mistyped field does
 * not throw. It reads undefined and renders as a blank or a zero, which is the
 * quietest possible way to be wrong.
 *
 * The third is that these routes may not exist yet. The portal ships ahead of
 * the engine, and a screen that treats "this build of the engine has no such
 * route" as "your data failed to save" is worse than one that says plainly
 * that storage is not available. `reachable` separates the two, so the import
 * screen can degrade honestly instead of showing a red error for a feature
 * that has simply not shipped.
 */

import { liveRoot } from './api'
import type { Grain, Period } from './retention'
import type { ImportedEvent } from './retentionImport'

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

async function root<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await liveRoot<unknown>(path, init)
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: T }).data
  }
  return body as T
}

/** A 404 from a build that predates these routes is not a failure to save.
 *  Anything else is. */
function isMissingRoute(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /\b404\b/.test(m) || /not found/i.test(m) || /cannot (get|post|patch)/i.test(m)
}

export type Availability = 'ready' | 'not_deployed' | 'unauthorized' | 'error'

export interface Reach {
  state: Availability
  detail: string
}

/** Asks the engine once whether it can store anything, and says which of the
 *  four answers it gave. Called before the screen offers to save, so the
 *  button is never offered against a route that is not there. */
export async function reachable(): Promise<Reach> {
  try {
    await root<RetentionSummary>('/v1/retention/summary')
    return { state: 'ready', detail: 'The engine is storing retention events for this workspace.' }
  } catch (e) {
    if (isMissingRoute(e)) {
      return {
        state: 'not_deployed',
        detail: 'This engine build has no retention storage yet, so a definition cannot be kept and events cannot be sent. Everything below still ran here in your browser and the numbers are real.'
      }
    }
    const m = e instanceof Error ? e.message : String(e)
    if (/signed out|401|403|scope/i.test(m)) {
      return { state: 'unauthorized', detail: 'This workspace is not allowed to read retention events. ' + m }
    }
    return { state: 'error', detail: m }
  }
}

/* ------------------------------------------------------------------ */
/* Events                                                             */
/* ------------------------------------------------------------------ */

export interface EventPayload {
  accountId: string
  userId: string | null
  eventName: string
  occurredAt: string
  sourceEventId?: string
}

export interface IngestRejection {
  index: number
  code: string
  message: string
  value: unknown
}

export interface IngestResponse {
  received: number
  inserted: number
  duplicates: number
  rejected: number
  rejections: IngestRejection[]
  /** How many rejections the engine left out of the list above. The engine
   *  caps the list at fifty, and a caller that cannot tell a complete list
   *  from a truncated one reads fifty problems and believes that is all of
   *  them. The engine spells this `rejectedOmitted`, not `rejectionsOmitted`.
   *  Verified against the route source, not assumed. */
  rejectedOmitted?: number
}

/** The engine takes at most this many events in one request and refuses the
 *  whole batch above it rather than truncating. Kept here so the portal
 *  chunks to the same number instead of discovering the limit by being
 *  refused. */
export const BATCH_MAX = 5000

const toPayload = (e: ImportedEvent): EventPayload => ({
  accountId: e.accountId,
  userId: e.userId,
  eventName: e.eventName,
  occurredAt: e.occurredAt
})

export function sendBatch(events: EventPayload[]): Promise<IngestResponse> {
  return root<IngestResponse>('/v1/retention/events', {
    method: 'POST',
    body: JSON.stringify({ events })
  })
}

export interface SendProgress {
  sent: number
  total: number
}

/**
 * Sends a whole import in batches and adds the results up.
 *
 * The totals are summed rather than taken from the last response, and a batch
 * that fails takes the whole send down rather than leaving the caller with a
 * partial count it has no way to interpret. Half an event stream in the
 * database, reported as a success, is the kind of thing that produces a
 * retention chart nobody can explain three weeks later.
 */
export async function sendAll(
  events: ImportedEvent[],
  onProgress?: (p: SendProgress) => void,
  /* Injectable so the batching and the index arithmetic can be tested without
     a server. The default is the real call; nothing in the app passes this. */
  send: (batch: EventPayload[]) => Promise<IngestResponse> = sendBatch
): Promise<IngestResponse> {
  const total: IngestResponse = {
    received: 0, inserted: 0, duplicates: 0, rejected: 0, rejections: [], rejectedOmitted: 0
  }
  for (let i = 0; i < events.length; i += BATCH_MAX) {
    const slice = events.slice(i, i + BATCH_MAX).map(toPayload)
    const r = await send(slice)
    total.received += r.received ?? slice.length
    total.inserted += r.inserted ?? 0
    total.duplicates += r.duplicates ?? 0
    total.rejected += r.rejected ?? 0
    /* Rejection indexes are per request. Shifted into whole file positions
       here, because "row 12" means nothing to somebody looking at a file
       where that was row 5012. */
    for (const rej of r.rejections ?? []) {
      if (total.rejections.length < 50) total.rejections.push({ ...rej, index: rej.index + i })
    }
    total.rejectedOmitted = (total.rejectedOmitted ?? 0) + (r.rejectedOmitted ?? 0)
    if (onProgress) onProgress({ sent: Math.min(i + BATCH_MAX, events.length), total: events.length })
  }
  const listed = total.rejections.length
  if (total.rejected > listed) {
    total.rejectedOmitted = total.rejected - listed
  }
  return total
}

/* ------------------------------------------------------------------ */
/* Summary                                                            */
/* ------------------------------------------------------------------ */

/** Field for field as the engine returns it. Do not rename these to read
 *  better; rename them at the point of use. */
export interface RetentionSummary {
  totalEventCount: number
  distinctAccounts: number
  distinctPersons: number
  eventCounts: { eventName: string; count: number }[]
  earliestEventAt: string | null
  latestEventAt: string | null
  spanDays: number | null
}

export function getSummary(start?: string, end?: string): Promise<RetentionSummary> {
  const q: string[] = []
  if (start) q.push('start=' + encodeURIComponent(start))
  if (end) q.push('end=' + encodeURIComponent(end))
  return root<RetentionSummary>('/v1/retention/summary' + (q.length ? '?' + q.join('&') : ''))
}

/* ------------------------------------------------------------------ */
/* Definitions                                                        */
/* ------------------------------------------------------------------ */

export interface StoredDefinition {
  id: string
  workspaceId?: string
  name: string
  grain: Grain
  startEvent: string
  returnEvents: string[]
  period: Period
  cohortPeriod: Period
  checkpoints: number[]
  signalEvents: string[]
  createdAt?: string
  updatedAt?: string
}

export type DefinitionInput = Omit<StoredDefinition, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>

export function listDefinitions(): Promise<StoredDefinition[]> {
  return root<StoredDefinition[]>('/v1/retention/definitions')
}

export function getDefinition(id: string): Promise<StoredDefinition> {
  return root<StoredDefinition>('/v1/retention/definitions/' + encodeURIComponent(id))
}

export function createDefinition(d: DefinitionInput): Promise<StoredDefinition> {
  return root<StoredDefinition>('/v1/retention/definitions', {
    method: 'POST',
    body: JSON.stringify(d)
  })
}

/** The engine validates a PATCH body against the same schema as a POST, so a
 *  partial update is rejected as an invalid body. Send the whole definition. */
export function updateDefinition(id: string, d: DefinitionInput): Promise<StoredDefinition> {
  return root<StoredDefinition>('/v1/retention/definitions/' + encodeURIComponent(id), {
    method: 'PATCH',
    body: JSON.stringify(d)
  })
}

/** The engine refuses this one by code rather than by prose, because it is the
 *  refusal a caller is most likely to hit and most likely to want to handle
 *  rather than display. */
export const START_IN_RETURNS = 'start_event_in_return_events'

export function isStartInReturns(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return m.indexOf(START_IN_RETURNS) >= 0 || /must not appear in returnEvents/i.test(m)
}
