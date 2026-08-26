/**
 * Retention definitions.
 *
 * A cohort matrix is undefined until somebody says what starts the clock and
 * what counts as coming back. Two people can point the same importer at the
 * same file, choose differently here, and get opposite answers. So this module
 * does two things and nothing else: it turns a definition plus a pile of
 * imported events into the inputs `computeRetention` wants, and it refuses the
 * definitions that cannot produce an honest matrix.
 *
 * The refusals matter more than the happy path. Every one of them describes a
 * report that would render, look plausible, and be wrong:
 *
 *   - The start event is also a return event, so every member comes back in
 *     period zero by construction and the first column reads 100%.
 *   - The grain is the person but most rows carry no person, so the matrix is
 *     built from a fraction of the file without saying so.
 *   - The start event fires for eleven accounts in a file of four hundred, so
 *     the cohorts are too small to mean anything and the chart still draws.
 *   - The checkpoint is further out than any cohort has been watched, so the
 *     column is empty and reads as collapse.
 *
 * Nothing here guesses on the customer's behalf. `suggestDefinition` proposes,
 * and the caller is expected to show the proposal as a proposal.
 */

import { floorPeriod } from './retention'
import type { Grain, Period, Member, EventRow } from './retention'
import type { ImportedEvent } from './retentionImport'
import { MIN_ACCOUNTS } from './retentionImport'

/* ------------------------------------------------------------------ */
/* The record                                                          */
/* ------------------------------------------------------------------ */

export interface Definition {
  /** What the customer calls this. Free text, theirs. */
  name: string
  grain: Grain
  /** The event that starts a member's clock. Exactly one. */
  startEvent: string
  /** Any of these counts as coming back. */
  returnEvents: string[]
  /** The unit the checkpoints are counted in. */
  period: Period
  /** How cohorts are bucketed. Separate from `period` on purpose. */
  cohortPeriod: Period
  checkpoints: number[]
  /** Candidate events tested for association with later retention. */
  signalEvents: string[]
}

export const DEFAULT_CHECKPOINTS: Record<Period, number[]> = {
  day: [1, 7, 14, 30, 60, 90],
  week: [1, 2, 4, 8, 12, 26],
  month: [1, 2, 3, 6, 9, 12]
}

const DAY = 86400000

const PERIOD_DAYS: Record<Period, number> = { day: 1, week: 7, month: 30 }

const plural = (n: number, one: string, many: string): string =>
  n === 1 ? one : many

/* ------------------------------------------------------------------ */
/* What is in the file                                                 */
/* ------------------------------------------------------------------ */

export interface EventFact {
  name: string
  /** Times this event fired. */
  count: number
  /** Distinct members that ever fired it, at the given grain. */
  members: number
  /** Members whose very first event of any kind is this one. */
  firstFor: number
  firstAt: string | null
  lastAt: string | null
}

const memberIdOf = (e: ImportedEvent, grain: Grain): string | null =>
  grain === 'account' ? (e.accountId || null) : (e.userId || null)

/**
 * One row per event name, with the numbers a person needs to choose between
 * them. `members` is the one that matters: an event can fire ten thousand
 * times and still only touch nine accounts.
 */
export function eventCatalog(events: ImportedEvent[], grain: Grain): EventFact[] {
  const acc = new Map<string, { count: number; members: Set<string>; first: number; last: number }>()
  const firstEventOf = new Map<string, { name: string; at: number }>()

  for (const e of events) {
    const t = Date.parse(e.occurredAt)
    if (!Number.isFinite(t)) continue
    let row = acc.get(e.eventName)
    if (!row) { row = { count: 0, members: new Set(), first: t, last: t }; acc.set(e.eventName, row) }
    row.count += 1
    if (t < row.first) row.first = t
    if (t > row.last) row.last = t
    const mid = memberIdOf(e, grain)
    if (mid) {
      row.members.add(mid)
      const cur = firstEventOf.get(mid)
      if (!cur || t < cur.at) firstEventOf.set(mid, { name: e.eventName, at: t })
    }
  }

  const firstCounts = new Map<string, number>()
  for (const v of firstEventOf.values()) {
    firstCounts.set(v.name, (firstCounts.get(v.name) ?? 0) + 1)
  }

  return [...acc.entries()]
    .map(([name, r]) => ({
      name,
      count: r.count,
      members: r.members.size,
      firstFor: firstCounts.get(name) ?? 0,
      firstAt: new Date(r.first).toISOString(),
      lastAt: new Date(r.last).toISOString()
    }))
    .sort((a, b) => b.count - a.count)
}

/* ------------------------------------------------------------------ */
/* Turning a definition into inputs                                    */
/* ------------------------------------------------------------------ */

export interface BuiltInputs {
  members: Member[]
  rows: EventRow[]
  /** Last moment anything in the file happened. Passed to computeRetention so
   *  the horizon is the edge of the data rather than the last return event. */
  horizon: string | null
  /** Rows that could not be attributed to a member at this grain. */
  unattributed: number
  /** Members that fired a return event but never the start event, so they are
   *  in the file and outside every cohort. */
  neverStarted: number
}

/**
 * A member enters a cohort at the first time it fired the start event. Later
 * repeats of the start event do not restart the clock: a customer who signs
 * up twice is one member with one beginning, and treating the second as a new
 * cohort is how a churned account is counted as a new one.
 */
export function buildInputs(events: ImportedEvent[], def: Definition): BuiltInputs {
  const startAt = new Map<string, number>()
  const seen = new Set<string>()
  const rows: EventRow[] = []
  let unattributed = 0
  let horizon = 0

  for (const e of events) {
    const t = Date.parse(e.occurredAt)
    if (!Number.isFinite(t)) continue
    if (t > horizon) horizon = t
    const mid = memberIdOf(e, def.grain)
    if (!mid) { unattributed += 1; continue }
    seen.add(mid)
    rows.push({ memberId: mid, eventName: e.eventName, occurredAt: e.occurredAt })
    if (e.eventName === def.startEvent) {
      const cur = startAt.get(mid)
      if (cur === undefined || t < cur) startAt.set(mid, t)
    }
  }

  const members: Member[] = [...startAt.entries()]
    .map(([id, t]) => ({ id, startedAt: new Date(t).toISOString() }))
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)))

  return {
    members,
    rows,
    horizon: horizon ? new Date(horizon).toISOString() : null,
    unattributed,
    neverStarted: seen.size - startAt.size
  }
}

/* ------------------------------------------------------------------ */
/* Refusals                                                            */
/* ------------------------------------------------------------------ */

export interface DefinitionCheck {
  /** False when at least one refusal fired. */
  ok: boolean
  /** Blocking. Each names the measurement that produced it. */
  refusals: string[]
  /** Proceed, but the report has to carry these. */
  cautions: string[]
  /** Checkpoints no cohort has been watched long enough to reach. Dropping
   *  these is the difference between an empty column and a cliff. */
  unreachableCheckpoints: number[]
  facts: {
    cohortMembers: number
    startFires: number
    returnFires: number
    attributableRows: number
    unattributedRows: number
    maxObservablePeriods: number
    startBeforeReturnShare: number | null
    /** Middle cohort size at the chosen grouping. The mean hides the problem:
     *  one large launch cohort drags it above the floor while every other week
     *  sits under it. */
    medianCohortSize: number
    cohortCount: number
    cohortsAboveFloor: number
  }
}

/**
 * Judges a definition against the events it will actually run on. Everything
 * returned is measured from those events; nothing is a rule of thumb applied
 * without looking.
 */
export function checkDefinition(events: ImportedEvent[], def: Definition): DefinitionCheck {
  const refusals: string[] = []
  const cautions: string[] = []

  if (!def.startEvent) refusals.push('No start event chosen. Retention is undefined until one event starts the clock.')
  if (!def.returnEvents.length) refusals.push('No return event chosen. Nothing in the file would count as coming back.')

  const returnSet = new Set(def.returnEvents)
  const overlap = def.returnEvents.filter(n => n === def.startEvent)
  if (overlap.length) {
    refusals.push(
      'The start event and a return event are both ' + def.startEvent +
      '. Every member would come back in period zero by construction, so the first column would read 100% whatever the data says.'
    )
  }

  const built = buildInputs(events, def)
  const cohortMembers = built.members.length

  let startFires = 0
  let returnFires = 0
  let horizon = 0
  const present = new Set<string>()
  for (const e of events) {
    const t = Date.parse(e.occurredAt)
    if (Number.isFinite(t) && t > horizon) horizon = t
    present.add(e.eventName)
    if (e.eventName === def.startEvent) startFires += 1
    if (returnSet.has(e.eventName)) returnFires += 1
  }

  if (def.startEvent && !present.has(def.startEvent)) {
    refusals.push('The file contains no event called ' + def.startEvent + '.')
  }
  const missingReturns = def.returnEvents.filter(n => !present.has(n))
  if (missingReturns.length) {
    refusals.push(
      'The file contains no event called ' + missingReturns.join(', ') + '.'
    )
  }

  /* The person column is empty on account level rows. Choosing the person as
     the grain then quietly discards them, and the matrix is built from a
     fraction of the file. */
  const totalRows = built.rows.length + built.unattributed
  if (def.grain === 'user' && totalRows > 0) {
    const share = built.unattributed / totalRows
    if (share >= 0.5) {
      refusals.push(
        Math.round(share * 100) + '% of rows carry no person, so measuring per person would build the matrix from under half the file. Measure per account, or export the person column.'
      )
    } else if (share >= 0.1) {
      cautions.push(
        Math.round(share * 100) + '% of rows carry no person and are left out of every cohort.'
      )
    }
  }

  if (cohortMembers > 0 && cohortMembers < MIN_ACCOUNTS) {
    refusals.push(
      'Only ' + cohortMembers + ' ' + plural(cohortMembers, 'member', 'members') +
      ' ever fired ' + def.startEvent + ', against a minimum of ' + MIN_ACCOUNTS +
      '. The file may be large, but the cohorts would not be.'
    )
  }
  if (cohortMembers === 0 && def.startEvent && present.has(def.startEvent)) {
    refusals.push('No member could be given a start time at this grain, so there are no cohorts to draw.')
  }

  /* How far out any cohort has been watched. A checkpoint past this is an
     empty column, and an empty column drawn next to full ones reads as a
     collapse rather than as the edge of the data. */
  let maxObservablePeriods = 0
  if (built.members.length && horizon) {
    const earliest = Date.parse(String(built.members[0].startedAt))
    if (Number.isFinite(earliest)) {
      maxObservablePeriods = Math.floor((horizon - earliest) / (PERIOD_DAYS[def.period] * DAY))
    }
  }
  const unreachableCheckpoints = def.checkpoints.filter(c => c > maxObservablePeriods)
  if (unreachableCheckpoints.length === def.checkpoints.length && def.checkpoints.length) {
    refusals.push(
      'No cohort has been watched as long as the earliest checkpoint. The file covers ' +
      maxObservablePeriods + ' ' + plural(maxObservablePeriods, def.period, def.period + 's') +
      ' at most.'
    )
  } else if (unreachableCheckpoints.length) {
    cautions.push(
      'Dropping ' + unreachableCheckpoints.join(', ') + ' from the checkpoints: no cohort has been watched that long yet.'
    )
  }

  if (built.neverStarted > 0) {
    cautions.push(
      built.neverStarted + ' ' + plural(built.neverStarted, 'member is', 'members are') +
      ' in the file but never fired ' + def.startEvent + ', so ' +
      plural(built.neverStarted, 'it sits', 'they sit') + ' outside every cohort.'
    )
  }

  /* If the start event usually happens last, the definition is inverted and
     retention will read near zero for a structural reason. */
  let startBeforeReturnShare: number | null = null
  if (cohortMembers > 0) {
    const startOf = new Map<string, number>()
    for (const m of built.members) startOf.set(m.id, Date.parse(String(m.startedAt)))
    const after = new Set<string>()
    for (const r of built.rows) {
      if (!returnSet.has(r.eventName)) continue
      const s = startOf.get(r.memberId)
      if (s === undefined) continue
      const t = Date.parse(String(r.occurredAt))
      if (Number.isFinite(t) && t > s) after.add(r.memberId)
    }
    startBeforeReturnShare = after.size / cohortMembers
    if (startBeforeReturnShare < 0.05) {
      refusals.push(
        'Almost no member fires a return event after ' + def.startEvent +
        '. This usually means the two are the wrong way round: the start event is something that happens at the end.'
      )
    } else if (startBeforeReturnShare < 0.25) {
      cautions.push(
        'Only ' + Math.round(startBeforeReturnShare * 100) + '% of members fire a return event after their start. Retention will read low, and that is what the file says rather than a fault in the chart.'
      )
    }
  }

  if (returnFires > 0 && cohortMembers > 0 && returnFires < cohortMembers) {
    cautions.push(
      'The return events fire ' + returnFires + ' times across ' + cohortMembers +
      ' members, so most members cannot have come back even once.'
    )
  }

  /* Cohort grouping is the quietest way to ruin a retention report. Grouping
     daily when a business signs one account a day gives cohorts of one and a
     matrix of 100% and 0%. Grouping weekly when it signs seven gives cohorts
     of seven, which draws a perfectly reasonable looking chart in which no
     cohort is ever large enough to carry a verdict, so the severity silently
     falls back to a band and the customer never learns why.
     Both are measured here, against the same bucketing the matrix will use. */
  const sizes: number[] = []
  if (built.members.length) {
    const buckets = new Map<number, number>()
    for (const m of built.members) {
      const t = Date.parse(String(m.startedAt))
      if (!Number.isFinite(t)) continue
      const c = floorPeriod(t, def.cohortPeriod)
      buckets.set(c, (buckets.get(c) ?? 0) + 1)
    }
    for (const v of buckets.values()) sizes.push(v)
    sizes.sort((a, b) => a - b)
  }
  const medianCohortSize = sizes.length
    ? (sizes.length % 2 ? sizes[(sizes.length - 1) / 2]
      : Math.round((sizes[sizes.length / 2 - 1] + sizes[sizes.length / 2]) / 2))
    : 0
  const cohortsAboveFloor = sizes.filter(v => v >= MIN_ACCOUNTS).length

  if (sizes.length) {
    const wider: Record<Period, Period | null> = { day: 'week', week: 'month', month: null }
    const next = wider[def.cohortPeriod]
    if (cohortsAboveFloor === 0) {
      cautions.push(
        'Grouped by ' + def.cohortPeriod + ', the typical cohort holds ' + medianCohortSize + ' ' +
        plural(medianCohortSize, 'member', 'members') + ' and not one of the ' + sizes.length +
        ' cohorts reaches ' + MIN_ACCOUNTS + '. The matrix is still true, but no single cohort can carry a verdict, so the severity will come from the overall level rather than from a measured decline' +
        (next ? '. Grouping by ' + next + ' would pool them.' : '.')
      )
    } else if (medianCohortSize < MIN_ACCOUNTS) {
      cautions.push(
        'Grouped by ' + def.cohortPeriod + ', the typical cohort holds ' + medianCohortSize + ' ' +
        plural(medianCohortSize, 'member', 'members') + ', under the ' + MIN_ACCOUNTS +
        ' a cohort needs before it counts toward a verdict. ' + cohortsAboveFloor + ' of ' +
        sizes.length + ' cohorts clear it' + (next ? ', and grouping by ' + next + ' would pool the rest.' : '.')
      )
    }
  }

  return {
    ok: refusals.length === 0,
    refusals,
    cautions,
    unreachableCheckpoints,
    facts: {
      cohortMembers,
      startFires,
      returnFires,
      attributableRows: built.rows.length,
      unattributedRows: built.unattributed,
      maxObservablePeriods,
      startBeforeReturnShare,
      medianCohortSize,
      cohortCount: sizes.length,
      cohortsAboveFloor
    }
  }
}

/**
 * Drops the checkpoints nothing can reach. Called after `checkDefinition` so
 * the report never carries a column no cohort could fill.
 */
export function prune(def: Definition, check: DefinitionCheck): Definition {
  if (!check.unreachableCheckpoints.length) return def
  const drop = new Set(check.unreachableCheckpoints)
  const kept = def.checkpoints.filter(c => !drop.has(c))
  return { ...def, checkpoints: kept }
}

/* ------------------------------------------------------------------ */
/* A proposal, offered as a proposal                                   */
/* ------------------------------------------------------------------ */

/**
 * The start event is the one that is most often a member's first event. That
 * is the same containment reasoning the lifecycle engine uses to find a
 * creation column, and it holds for the same reason: whatever begins a
 * relationship tends to come first in that relationship's own rows.
 *
 * The return events are every recurring event that is not the start, because
 * the alternative is to pick one and be quietly wrong about which activity
 * the customer considers alive.
 */
export function suggestDefinition(events: ImportedEvent[], grain: Grain = 'account'): Definition {
  const facts = eventCatalog(events, grain)
  const byFirst = facts.slice().sort((a, b) => b.firstFor - a.firstFor)
  const start = byFirst.length ? byFirst[0].name : ''
  const returns = facts
    .filter(f => f.name !== start && f.count > f.members)
    .map(f => f.name)
  /* If nothing recurs, fall back to everything other than the start rather
     than returning an empty set the caller has to special case. */
  const fallback = facts.filter(f => f.name !== start).map(f => f.name)
  const period: Period = 'day'
  return {
    name: 'Retention',
    grain,
    startEvent: start,
    returnEvents: returns.length ? returns : fallback,
    period,
    cohortPeriod: 'week',
    checkpoints: DEFAULT_CHECKPOINTS[period].slice(),
    signalEvents: facts.filter(f => f.name !== start).map(f => f.name).slice(0, 8)
  }
}
