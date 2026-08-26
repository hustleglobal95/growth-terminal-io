/**
 * Cohort retention.
 *
 * Pure functions. Rows in, matrix and diagnosis out, no I/O and no dependencies,
 * so the same code runs in a job, in a test and in the browser and gives the
 * same answer three times.
 *
 * The discipline is the one the lifecycle engine already holds the rest of the
 * product to:
 *
 *   - Every rate carries the numerator and the denominator it came from. A
 *     percentage with no counts underneath it is not a result.
 *   - A cell that has not been watched long enough to exist is null with a
 *     reason, never zero. This is the single most common way a retention report
 *     lies: a cohort that is nine days old reports 0% at day thirty and the
 *     chart shows a cliff that is really just the edge of the data.
 *   - Nothing is stated that the events cannot support, and everything declined
 *     is said out loud rather than left as an absence.
 */

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export type Grain = 'account' | 'user'
export type Period = 'day' | 'week' | 'month'

export interface Member {
  /** Account id, or user id when the grain is user. */
  id: string
  /** When this member's clock starts. */
  startedAt: string | Date
}

export interface EventRow {
  memberId: string
  eventName: string
  occurredAt: string | Date
}

export interface RetentionOptions {
  /** The unit the checkpoints are counted in. */
  period?: Period
  /** How cohorts are bucketed. Defaults to `period`. Measuring in days while
   *  cohorting by month is the common case and the two are separate choices:
   *  conflating them gives one member per cohort and a matrix of 100% and 0%. */
  cohortPeriod?: Period
  /** Event names that count as coming back. */
  returnEvents: string[]
  /** Periods to report, e.g. [1, 7, 14, 30, 60, 90] for days. */
  checkpoints?: number[]
  /** The last moment the data can speak for. Defaults to the latest event seen.
   *  Never now(): a file that stops on the 3rd does not know about the 4th. */
  observationHorizon?: string | Date
  /** A cohort smaller than this is reported but never used for a verdict. */
  minCohortSize?: number
  /** Candidate events tested for association with later retention. */
  signalEvents?: string[]
  /** Days from a member's start in which a signal event counts. */
  signalWindowDays?: number
  /** The checkpoint the correlation pass predicts. */
  signalOutcomePeriod?: number
}

const DAY = 86_400_000

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */

export interface Cell {
  period: number
  /** True when this cohort has been watched at least this long. */
  observable: boolean
  /** Active in exactly this period. Null when not observable. */
  retained: number | null
  /** Active in this period or any later one. Null when not observable. */
  rolling: number | null
  denominator: number
  /** retained / denominator. Null when not observable. */
  rate: number | null
  /** rolling / denominator. Null when not observable. */
  rollingRate: number | null
}

export interface CohortRow {
  /** Period start, ISO date. */
  cohort: string
  size: number
  /** Whole periods between this cohort's start and the horizon. */
  periodsObserved: number
  cells: Cell[]
}

export interface RetentionMatrix {
  grain: Grain
  period: Period
  cohortPeriod: Period
  checkpoints: number[]
  observationHorizon: string
  cohorts: CohortRow[]
  /** Weighted across every cohort mature enough to have the checkpoint. */
  overall: { period: number; retained: number; denominator: number; rate: number | null; cohorts: number }[]
  totals: { members: number; events: number; cohorts: number }
  unmeasured: string[]
}

export interface SignalFinding {
  eventName: string
  outcomePeriod: number
  withSignal: { retained: number; total: number; rate: number | null }
  withoutSignal: { retained: number; total: number; rate: number | null }
  /** Percentage points, with minus meaning the signal group did worse. */
  lift: number | null
  /** Chi-square with Yates' correction, one degree of freedom. */
  chiSquare: number | null
  pValue: number | null
  /** Phi coefficient, the effect size a chi-square on its own does not give. */
  phi: number | null
  significant: boolean
  /** Why this event could not be judged, when it could not. */
  withheld: string | null
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

const at = (d: string | Date): number => (d instanceof Date ? d.getTime() : Date.parse(d))

function floorPeriod(ms: number, period: Period): number {
  const d = new Date(ms)
  if (period === 'day') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  if (period === 'month') return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)
  const dow = (d.getUTCDay() + 6) % 7 // Monday start
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)
}

function periodsBetween(a: number, b: number, period: Period): number {
  if (period === 'day') return Math.floor((floorPeriod(b, 'day') - floorPeriod(a, 'day')) / DAY)
  if (period === 'week') return Math.floor((floorPeriod(b, 'week') - floorPeriod(a, 'week')) / (7 * DAY))
  const x = new Date(floorPeriod(a, 'month'))
  const y = new Date(floorPeriod(b, 'month'))
  return (y.getUTCFullYear() - x.getUTCFullYear()) * 12 + (y.getUTCMonth() - x.getUTCMonth())
}

const iso = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

/** Abramowitz and Stegun 7.1.26. */
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1
  const a = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * a)
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t
  return sign * (1 - poly * Math.exp(-a * a))
}

/** Two-sided p-value for a difference between two independent proportions.
 *  Shared with the verification module's test so a decline is judged the same
 *  way wherever the product judges one. */
export function twoProportionTest(
  n1: number, d1: number, n2: number, d2: number,
): { z: number | null; pValue: number | null; significant: boolean } {
  if (d1 < 1 || d2 < 1) return { z: null, pValue: null, significant: false }
  const p1 = n1 / d1
  const p2 = n2 / d2
  const pooled = (n1 + n2) / (d1 + d2)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / d1 + 1 / d2))
  if (!Number.isFinite(se) || se === 0) return { z: null, pValue: null, significant: false }
  const z = (p2 - p1) / se
  const p = 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2)))
  return { z: Math.round(z * 1000) / 1000, pValue: Math.round(p * 10000) / 10000, significant: p < 0.05 }
}

/** Upper tail of a chi-square with one degree of freedom. */
function chiSquareP(chi: number): number {
  if (!Number.isFinite(chi) || chi <= 0) return 1
  return 1 - erf(Math.sqrt(chi / 2))
}

/* ------------------------------------------------------------------ */
/* The matrix                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_CHECKPOINTS: Record<Period, number[]> = {
  day: [1, 7, 14, 30, 60, 90],
  week: [1, 2, 4, 8, 12],
  month: [1, 2, 3, 6, 12],
}

export function computeRetention(
  members: Member[], events: EventRow[], opts: RetentionOptions,
): RetentionMatrix {
  const period = opts.period ?? 'day'
  const cohortPeriod = opts.cohortPeriod ?? period
  const checkpoints = (opts.checkpoints ?? DEFAULT_CHECKPOINTS[period]).slice().sort((a, b) => a - b)
  const minSize = opts.minCohortSize ?? 20
  const unmeasured: string[] = []

  const returnSet = new Set(opts.returnEvents)
  const relevant = events.filter(e => returnSet.has(e.eventName))
  if (!relevant.length) {
    unmeasured.push('No event in the file matches the configured return events, so no member can be counted as having come back.')
  }

  const startOf = new Map<string, number>()
  for (const m of members) {
    const t = at(m.startedAt)
    if (Number.isFinite(t)) startOf.set(m.id, t)
  }
  const undated = members.length - startOf.size
  if (undated > 0) {
    unmeasured.push(`${undated} member${undated === 1 ? '' : 's'} had no readable start time and ${undated === 1 ? 'was' : 'were'} left out of every cohort.`)
  }

  /* The horizon is the last moment the data can speak for. Taking now() here
     would silently add empty days to every cohort and drag the recent rows
     toward zero. */
  let horizon = opts.observationHorizon ? at(opts.observationHorizon) : 0
  if (!horizon) {
    for (const e of relevant) { const t = at(e.occurredAt); if (t > horizon) horizon = t }
    for (const t of startOf.values()) if (t > horizon) horizon = t
  }

  /* Per member, the set of periods in which it came back. */
  const hits = new Map<string, Set<number>>()
  let counted = 0
  for (const e of relevant) {
    const s = startOf.get(e.memberId)
    if (s === undefined) continue
    const t = at(e.occurredAt)
    if (!Number.isFinite(t) || t < s || t > horizon) continue
    const p = periodsBetween(s, t, period)
    if (p < 0) continue
    let set = hits.get(e.memberId)
    if (!set) { set = new Set(); hits.set(e.memberId, set) }
    set.add(p)
    counted += 1
  }

  const byCohort = new Map<number, string[]>()
  for (const [id, s] of startOf) {
    const c = floorPeriod(s, cohortPeriod)
    const list = byCohort.get(c)
    if (list) list.push(id); else byCohort.set(c, [id])
  }

  const cohorts: CohortRow[] = [...byCohort.keys()].sort((a, b) => a - b).map(c => {
    const ids = byCohort.get(c)!
    /* A cohort has only been watched as long as its youngest member. Measuring
       from the bucket's own start would let a member who joined on the 28th
       contribute a forced zero to the day 30 cell. */
    let youngest = c
    for (const id of ids) { const t = startOf.get(id)!; if (t > youngest) youngest = t }
    const observed = periodsBetween(youngest, horizon, period)
    const cells: Cell[] = checkpoints.map(p => {
      const observable = p <= observed
      if (!observable) {
        return { period: p, observable, retained: null, rolling: null, denominator: ids.length, rate: null, rollingRate: null }
      }
      let exact = 0
      let rolling = 0
      for (const id of ids) {
        const set = hits.get(id)
        if (!set) continue
        if (set.has(p)) exact += 1
        for (const q of set) if (q >= p) { rolling += 1; break }
      }
      return {
        period: p, observable, retained: exact, rolling, denominator: ids.length,
        rate: ids.length ? exact / ids.length : null,
        rollingRate: ids.length ? rolling / ids.length : null,
      }
    })
    return { cohort: iso(c), size: ids.length, periodsObserved: observed, cells }
  })

  /* The overall row pools only the cohorts old enough to have the checkpoint.
     Pooling an immature cohort in would import its missing tail as zero. */
  const overall = checkpoints.map(p => {
    let n = 0, d = 0, used = 0
    for (const row of cohorts) {
      const cell = row.cells.find(c => c.period === p)
      if (!cell || !cell.observable || cell.retained === null) continue
      n += cell.retained; d += cell.denominator; used += 1
    }
    return { period: p, retained: n, denominator: d, rate: d ? n / d : null, cohorts: used }
  })

  const immature = cohorts.filter(r => r.periodsObserved < checkpoints[checkpoints.length - 1])
  if (immature.length) {
    unmeasured.push(`${immature.length} cohort${immature.length === 1 ? '' : 's'} ${immature.length === 1 ? 'has' : 'have'} not been watched long enough for every checkpoint. Those cells are unobserved, not zero.`)
  }
  const small = cohorts.filter(r => r.size < minSize)
  if (small.length) {
    unmeasured.push(`${small.length} cohort${small.length === 1 ? '' : 's'} ${small.length === 1 ? 'is' : 'are'} smaller than ${minSize} members and ${small.length === 1 ? 'is' : 'are'} shown but not used for a verdict.`)
  }

  return {
    grain: 'account', period, cohortPeriod, checkpoints,
    observationHorizon: horizon ? new Date(horizon).toISOString() : '',
    cohorts, overall,
    totals: { members: startOf.size, events: counted, cohorts: cohorts.length },
    unmeasured,
  }
}

/* ------------------------------------------------------------------ */
/* Rolling retention                                                   */
/* ------------------------------------------------------------------ */

export interface RollingPoint {
  period: number
  retained: number
  denominator: number
  rate: number | null
  cohorts: number
}

/** Share of members that came back on or after period N, pooled over every
 *  cohort mature enough to answer for N. */
export function rollingRetention(m: RetentionMatrix): RollingPoint[] {
  return m.checkpoints.map(p => {
    let n = 0, d = 0, used = 0
    for (const row of m.cohorts) {
      const cell = row.cells.find(c => c.period === p)
      if (!cell || !cell.observable || cell.rolling === null) continue
      n += cell.rolling; d += cell.denominator; used += 1
    }
    return { period: p, retained: n, denominator: d, rate: d ? n / d : null, cohorts: used }
  })
}

/* ------------------------------------------------------------------ */
/* Correlation: which early action goes with coming back                */
/* ------------------------------------------------------------------ */

/**
 * For each candidate event, split the members who could have an outcome into
 * those who did it inside their own first window and those who did not, then
 * compare how many were still returning at the outcome period.
 *
 * This measures association. It does not measure cause, and the diagnosis says
 * so in words rather than leaving the reader to remember it.
 */
export function correlateSignals(
  members: Member[], events: EventRow[], opts: RetentionOptions,
): SignalFinding[] {
  const period = opts.period ?? 'day'
  const windowDays = opts.signalWindowDays ?? 7
  const outcome = opts.signalOutcomePeriod ?? (period === 'day' ? 30 : 1)
  const signals = opts.signalEvents ?? []
  if (!signals.length) return []

  let horizon = opts.observationHorizon ? at(opts.observationHorizon) : 0
  if (!horizon) for (const e of events) { const t = at(e.occurredAt); if (t > horizon) horizon = t }

  const startOf = new Map<string, number>()
  for (const m of members) {
    const t = at(m.startedAt)
    /* Only members that have had time to reach the outcome can be judged. */
    if (Number.isFinite(t) && periodsBetween(t, horizon, period) >= outcome) startOf.set(m.id, t)
  }

  const returnSet = new Set(opts.returnEvents)
  const retainedAt = new Set<string>()
  const didSignal = new Map<string, Set<string>>()
  for (const s of signals) didSignal.set(s, new Set())

  for (const e of events) {
    const s = startOf.get(e.memberId)
    if (s === undefined) continue
    const t = at(e.occurredAt)
    if (!Number.isFinite(t) || t < s || t > horizon) continue
    if (returnSet.has(e.eventName) && periodsBetween(s, t, period) >= outcome) retainedAt.add(e.memberId)
    const bucket = didSignal.get(e.eventName)
    if (bucket && t < s + windowDays * DAY) bucket.add(e.memberId)
  }

  const ids = [...startOf.keys()]
  return signals.map(name => {
    const group = didSignal.get(name)!
    let a = 0, b = 0, c = 0, d = 0   // a: signal+retained, b: signal+lost, c: none+retained, d: none+lost
    for (const id of ids) {
      const sig = group.has(id)
      const ret = retainedAt.has(id)
      if (sig && ret) a += 1
      else if (sig && !ret) b += 1
      else if (!sig && ret) c += 1
      else d += 1
    }
    const withSignal = { retained: a, total: a + b, rate: a + b ? a / (a + b) : null }
    const withoutSignal = { retained: c, total: c + d, rate: c + d ? c / (c + d) : null }
    const n = a + b + c + d

    const base: SignalFinding = {
      eventName: name, outcomePeriod: outcome, withSignal, withoutSignal,
      lift: null, chiSquare: null, pValue: null, phi: null, significant: false, withheld: null,
    }

    if (n < 60) return { ...base, withheld: `Only ${n} members are old enough to have a day ${outcome} outcome, which is too few to test.` }
    if (withSignal.total < 30 || withoutSignal.total < 30) {
      return { ...base, withheld: `One side of the split has fewer than 30 members (${withSignal.total} did it, ${withoutSignal.total} did not), so the comparison is not stable.` }
    }
    const expected = [
      ((a + b) * (a + c)) / n, ((a + b) * (b + d)) / n,
      ((c + d) * (a + c)) / n, ((c + d) * (b + d)) / n,
    ]
    if (expected.some(x => x < 5)) {
      return { ...base, withheld: 'An expected cell count falls below five, where a chi-square stops being trustworthy.' }
    }

    const chi = (n * Math.pow(Math.abs(a * d - b * c) - n / 2, 2)) /
      ((a + b) * (c + d) * (a + c) * (b + d))
    const p = chiSquareP(chi)
    const phi = (a * d - b * c) / Math.sqrt((a + b) * (c + d) * (a + c) * (b + d))

    return {
      ...base,
      lift: withSignal.rate !== null && withoutSignal.rate !== null ? withSignal.rate - withoutSignal.rate : null,
      chiSquare: Math.round(chi * 1000) / 1000,
      pValue: Math.round(p * 10000) / 10000,
      phi: Math.round(phi * 1000) / 1000,
      significant: p < 0.05,
    }
  })
}
