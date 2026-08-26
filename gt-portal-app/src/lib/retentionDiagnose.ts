/**
 * The diagnostic payload.
 *
 * What the constraint engine receives when it asks whether retention is the
 * thing capping this business. It follows the same rules as the lifecycle
 * diagnosis it sits beside:
 *
 *   - Severity says what it was derived from. A score taken from an industry
 *     band is labelled a band, because the engine already learned the hard way
 *     what happens when a benchmark is presented at the same weight as a
 *     measurement.
 *   - Confidence is capped by how much data there is, not asserted.
 *   - Anything that could not be measured is named in the reader's language.
 */

import {
  RetentionMatrix, RollingPoint, SignalFinding, RetentionOptions, twoProportionTest,
} from './retention'

export type SeverityBasis = 'measured_decline' | 'level_against_band' | 'insufficient_data'
export type Confidence = 'high' | 'medium' | 'low'

export interface WatchCondition {
  id: string
  label: string
  metric: 'retention_rate' | 'cohort_size' | 'rolling_rate'
  period: number
  comparator: 'below' | 'above'
  threshold: number
  /** What the measurement says right now, or null if not yet observable. */
  observed: number | null
  status: 'holding' | 'breached' | 'not_evaluable'
}

export interface PlanPhase {
  phase: number
  weeks: string
  title: string
  intent: string
  doneWhen: string
}

export interface RetentionDiagnostic {
  module: 'retention'
  version: string
  grain: string
  period: string
  observationHorizon: string

  headline: {
    period: number
    rate: number | null
    retained: number
    denominator: number
    cohortsUsed: number
  }

  retention_severity: number
  severity_basis: SeverityBasis
  severity_reason: string

  confidence_level: Confidence
  confidence_reason: string

  /** The decline, when there is one that beats the ordinary spread. */
  trend: {
    earlyCohorts: string[]
    recentCohorts: string[]
    earlyRate: number | null
    recentRate: number | null
    /** The counts behind each rate, so the move can be audited and tested. */
    earlyCounts: { retained: number; denominator: number }
    recentCounts: { retained: number; denominator: number }
    changePoints: number | null
    seriesStdDev: number | null
    /** The drop clears the ordinary spread of the series. */
    exceedsNoise: boolean
    /** And it clears a two proportion test on the pooled counts. Both are
     *  required before the engine will call retention a constraint: a series
     *  of twelve noisy cohorts will cross one standard deviation on its own
     *  often enough to be useless as a trigger. */
    significant: boolean
    pValue: number | null
  } | null

  watch_conditions: WatchCondition[]
  action_plan_phases: PlanPhase[]

  /** Association only. The wording is part of the contract. */
  retention_signals: {
    tested: number
    strongest: SignalFinding | null
    caveat: string
    findings: SignalFinding[]
  }

  refusals: string[]
}

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN)

/** Day 30 account retention bands, stated as bands and never as a measurement.
 *  They exist so a business with one cohort still gets a shape; they never
 *  produce a figure in currency and they never outrank a measured decline. */
const BANDS: [number, number][] = [
  [0.20, 8], [0.30, 7], [0.40, 6], [0.55, 4], [0.70, 3], [1.01, 2],
]

export function diagnose(
  matrix: RetentionMatrix,
  rolling: RollingPoint[],
  signals: SignalFinding[],
  opts: RetentionOptions & { headlinePeriod?: number } = { returnEvents: [] },
): RetentionDiagnostic {
  const refusals = [...matrix.unmeasured]
  const wanted = opts.headlinePeriod ?? (matrix.period === 'day' ? 30 : 3)
  const minSize = opts.minCohortSize ?? 20

  /* The headline is the first number anybody reads, so which checkpoint it
     comes from is not a detail.
     *
     * The requested checkpoint is often absent: a weekly matrix asked for
     * week 3 while the checkpoints are 1, 2, 4, 8, 12. Falling back to the
     * last checkpoint is the worst available choice, because the last
     * checkpoint is the most censored one. Only the oldest cohorts have been
     * watched that long, so the headline would rest on the smallest sample in
     * the matrix and, worse, on a sample selected for being old. If retention
     * has decayed for recent cohorts, the newest ones are precisely the rows
     * that cannot answer there, and the headline reports the healthy past as
     * though it were the present.
     *
     * So: take the requested checkpoint when it exists, otherwise the largest
     * one that at least two cohorts have actually been watched through. */
  /* The headline and the trend read the ROLLING measure, not the per cell one.
   *
   * A cell counts activity inside its own window, and with milestone
   * checkpoints those windows are not the same width: (14, 30] is sixteen days
   * and (30, 60] is thirty. Within one column that is fine, and it is how the
   * heatmap ramps and how cohorts are compared against each other. Across
   * columns it is not: a curve built from unequal buckets rises with age and
   * looks like retention improving when it is only the bucket getting wider.
   *
   * The tempting fix is to read the rolling measure instead, since it is
   * monotonic and every column means the same thing. That trades one bias for
   * a worse one. Rolling asks whether a member was active at this checkpoint
   * OR LATER, and how much later there is depends on how long the cohort has
   * been watched. A cohort three months old has almost no later, so its
   * rolling rate is structurally lower than an identical cohort a year old,
   * and comparing cohorts on it manufactures a decline out of nothing but age.
   * That was caught by a scenario built to be flat, which the rolling version
   * flagged as a significant slide.
   *
   * So the two measures are used where each is sound. Cohorts are compared to
   * each other down a single column, where every cohort gets the same window,
   * and that is the interval measure. Rolling stays available on the curve,
   * where one cohort is read across its own checkpoints. Nothing is compared
   * on a measure that is not comparable in that direction. */
  const answerable = matrix.overall.filter(o => o.cohorts >= 2 && o.denominator > 0)
  const head = matrix.overall.find(o => o.period === wanted)
    ?? answerable[answerable.length - 1]
    ?? matrix.overall[matrix.overall.length - 1]
    ?? { period: wanted, retained: 0, denominator: 0, rate: null, cohorts: 0 }
  const headlinePeriod = head.period
  if (head.period !== wanted && matrix.overall.length) {
    refusals.push(
      'The headline is read at ' + head.period + ' ' + matrix.period +
      (head.period === 1 ? '' : 's') + ' rather than ' + wanted +
      ', which is not one of this matrix\'s checkpoints or has not been watched by enough cohorts.'
    )
  }

  /* The series of per-cohort rates at the headline period, over the cohorts
     large enough and old enough to answer. */
  const series = matrix.cohorts
    .filter(r => r.size >= minSize)
    .map(r => ({ cohort: r.cohort, cell: r.cells.find(c => c.period === headlinePeriod) }))
    .filter(x => x.cell && x.cell.observable && x.cell.rate !== null)
    .map(x => ({ cohort: x.cohort, rate: x.cell!.rate as number, n: x.cell!.retained as number, d: x.cell!.denominator }))

  let trend: RetentionDiagnostic['trend'] = null
  if (series.length >= 6) {
    const third = Math.max(2, Math.floor(series.length / 3))
    const early = series.slice(0, third)
    const recent = series.slice(-third)
    const e = mean(early.map(x => x.rate))
    const r = mean(recent.map(x => x.rate))
    const mu = mean(series.map(x => x.rate))
    const sd = Math.sqrt(mean(series.map(x => (x.rate - mu) ** 2)))
    const en = early.reduce((s2, x) => s2 + x.n, 0)
    const ed = early.reduce((s2, x) => s2 + x.d, 0)
    const rn = recent.reduce((s2, x) => s2 + x.n, 0)
    const rd = recent.reduce((s2, x) => s2 + x.d, 0)
    const test = twoProportionTest(en, ed, rn, rd)
    trend = {
      earlyCohorts: early.map(x => x.cohort),
      recentCohorts: recent.map(x => x.cohort),
      earlyRate: e, recentRate: r,
      earlyCounts: { retained: en, denominator: ed },
      recentCounts: { retained: rn, denominator: rd },
      changePoints: r - e,
      seriesStdDev: sd,
      exceedsNoise: e - r > sd,
      significant: test.significant && r < e,
      pValue: test.pValue,
    }
  } else {
    refusals.push(`Only ${series.length} cohort${series.length === 1 ? '' : 's'} of adequate size have reached period ${headlinePeriod}, which is too few to say whether retention is moving. A level can be reported; a direction cannot.`)
  }

  /* Severity. A measured decline outranks a band, always. */
  let severity = 1
  let basis: SeverityBasis = 'insufficient_data'
  let reason = ''

  if (trend && trend.exceedsNoise && trend.significant && trend.changePoints !== null) {
    const drop = -trend.changePoints
    severity = Math.max(1, Math.min(10, Math.round(4 + drop * 20)))
    basis = 'measured_decline'
    reason = `Retention through ${matrix.period} ${headlinePeriod} fell from ${(trend.earlyRate! * 100).toFixed(1)}% across ${trend.earlyCohorts[0]} to ${trend.earlyCohorts[trend.earlyCohorts.length - 1]} to ${(trend.recentRate! * 100).toFixed(1)}% across ${trend.recentCohorts[0]} to ${trend.recentCohorts[trend.recentCohorts.length - 1]}, a fall of ${(drop * 100).toFixed(1)} points against ${(trend.seriesStdDev! * 100).toFixed(1)} points of ordinary spread. Pooled, that is ${trend.recentCounts.retained} of ${trend.recentCounts.denominator} against ${trend.earlyCounts.retained} of ${trend.earlyCounts.denominator}, p = ${trend.pValue}.`
  } else if (head.rate !== null && head.cohorts > 0) {
    if (trend && trend.changePoints !== null && trend.changePoints < 0 && !trend.significant) {
      refusals.push(`Retention through ${matrix.period} ${headlinePeriod} is ${(-trend.changePoints * 100).toFixed(1)} points lower in the recent cohorts than the early ones, but on these volumes that difference is within what chance produces (p = ${trend.pValue}). It is not being called a decline.`)
    }
    const band = BANDS.find(b => head.rate! < b[0])
    severity = band ? band[1] : 2
    basis = 'level_against_band'
    reason = `Retention through ${matrix.period} ${headlinePeriod} sits at ${(head.rate * 100).toFixed(1)}% (${head.retained} of ${head.denominator} across ${head.cohorts} cohorts). No decline could be measured, so this score comes from a published band rather than from this business's own history, and it should be read as a starting point rather than as a finding.`
  } else {
    severity = 1
    basis = 'insufficient_data'
    reason = `No cohort has been watched long enough to report period ${headlinePeriod}, so no severity can be derived.`
    refusals.push(reason)
  }

  /* Confidence is capped by what the data can carry. */
  const usable = matrix.cohorts.filter(r => r.size >= minSize && r.periodsObserved >= headlinePeriod)
  const smallest = usable.length ? Math.min(...usable.map(r => r.size)) : 0
  let confidence: Confidence
  let confidenceReason: string
  if (usable.length >= 6 && smallest >= 50 && basis === 'measured_decline') {
    confidence = 'high'
    confidenceReason = `${usable.length} cohorts of at least ${smallest} members have completed period ${headlinePeriod}, and the movement beats the spread of the series.`
  } else if (usable.length >= 3 && smallest >= minSize) {
    confidence = 'medium'
    confidenceReason = `${usable.length} cohorts have completed period ${headlinePeriod}, the smallest holding ${smallest} members. Enough for a level, not enough to be sure of a direction.`
  } else {
    confidence = 'low'
    confidenceReason = usable.length === 0
      ? `No cohort of at least ${minSize} members has completed period ${headlinePeriod}.`
      : `Only ${usable.length} cohort${usable.length === 1 ? '' : 's'} of adequate size has completed period ${headlinePeriod}.`
  }
  if (basis === 'level_against_band' && confidence === 'high') confidence = 'medium'

  /* Gates, with the current reading attached so a reader can see the distance. */
  const cellAt = (p: number) => matrix.overall.find(o => o.period === p) ?? null
  const gate = (
    id: string, label: string, period: number, threshold: number,
    metric: WatchCondition['metric'] = 'retention_rate',
  ): WatchCondition => {
    const src = metric === 'rolling_rate'
      ? rolling.find(x => x.period === period) ?? null
      : cellAt(period)
    const observed = src && src.rate !== null && src.cohorts > 0 ? src.rate : null
    return {
      id, label, metric, period, comparator: 'below', threshold, observed,
      status: observed === null ? 'not_evaluable' : observed < threshold ? 'breached' : 'holding',
    }
  }

  const watch: WatchCondition[] = [
    gate('d30-floor', `Period ${headlinePeriod} retention drops below 25%`, headlinePeriod, 0.25),
    gate('early-floor', `Period ${matrix.checkpoints[0]} retention drops below 60%`, matrix.checkpoints[0], 0.60),
    gate('rolling-floor', `Rolling retention at period ${headlinePeriod} drops below 30%`, headlinePeriod, 0.30, 'rolling_rate'),
  ]
  if (trend && trend.recentRate !== null) {
    watch.push({
      id: 'no-further-slide',
      label: `Period ${headlinePeriod} retention does not fall further than its current ${(trend.recentRate * 100).toFixed(1)}%`,
      metric: 'retention_rate', period: headlinePeriod, comparator: 'below',
      threshold: trend.recentRate, observed: trend.recentRate, status: 'holding',
    })
  }

  const strongest = signals
    .filter(s => s.significant && s.lift !== null && s.lift > 0)
    .sort((a, b) => (b.phi ?? 0) - (a.phi ?? 0))[0] ?? null

  const plan = buildPlan(headlinePeriod, strongest, matrix.checkpoints[0])

  for (const s of signals) if (s.withheld) refusals.push(`${s.eventName}: ${s.withheld}`)

  return {
    module: 'retention',
    version: '1.0',
    grain: matrix.grain,
    period: matrix.period,
    observationHorizon: matrix.observationHorizon,
    headline: {
      period: headlinePeriod, rate: head.rate, retained: head.retained,
      denominator: head.denominator, cohortsUsed: head.cohorts,
    },
    retention_severity: severity,
    severity_basis: basis,
    severity_reason: reason,
    confidence_level: confidence,
    confidence_reason: confidenceReason,
    trend,
    watch_conditions: watch,
    action_plan_phases: plan,
    retention_signals: {
      tested: signals.length,
      strongest,
      caveat: 'These are associations measured over the same members, not causes. An event that goes with coming back may be a symptom of an account that was always going to stay. Treat the strongest one as the first thing to test, not as the answer.',
      findings: signals,
    },
    refusals,
  }
}

/** Four phases. Measure, find the leak, act on the leak, prove it moved. The
 *  third phase is the only one that changes with the evidence, because acting
 *  before the leak is located is how a quarter gets spent on the wrong step. */
function buildPlan(headline: number, strongest: SignalFinding | null, firstCheck: number): PlanPhase[] {
  const act = strongest
    ? {
        title: `Drive ${strongest.eventName} inside the first week`,
        intent: `Members who did ${strongest.eventName} in their first week came back at period ${headline} ${((strongest.lift ?? 0) * 100).toFixed(1)} points more often than those who did not. That is the strongest association in the data, so it is the first thing worth trying to cause rather than merely observe.`,
        doneWhen: `The share of new members doing ${strongest.eventName} within seven days has risen by at least ten points against the pre-change baseline.`,
      }
    : {
        title: 'Instrument the first week before changing it',
        intent: 'No early action is measurably associated with coming back, which usually means the events that would show one are not being recorded rather than that none exists. Adding them is cheaper than guessing.',
        doneWhen: 'At least three candidate first-week events are recorded for every new member, and the next run can test them.',
      }

  return [
    {
      phase: 1, weeks: 'Week 1-2',
      title: 'Fix the clock before reading it',
      intent: `Confirm the start event and the return event mean what the business thinks. Retention that measures logins when the business runs on usage is a number that moves for the wrong reasons.`,
      doneWhen: `The start and return events are confirmed in writing, and every cohort in the last twelve periods has a size within ten percent of the count the business recognises.`,
    },
    {
      phase: 2, weeks: 'Week 3-5',
      title: 'Locate the drop, not the level',
      intent: `Find the period where members stop coming back. A curve that falls between period ${firstCheck} and period ${headline} is an onboarding problem; one that falls only later is a value problem, and they take opposite work.`,
      doneWhen: 'The steepest single transition in the curve is named, with its numerator and denominator, and agreed as the target.',
    },
    { phase: 3, weeks: 'Week 6-9', ...act },
    {
      phase: 4, weeks: 'Week 10-12',
      title: 'Prove it against a cohort that started after the change',
      intent: 'Only members who arrived after the work counts as evidence for it. Cohorts already in flight were partly formed under the old behaviour and will flatter or blunt the result.',
      doneWhen: `At least two cohorts formed after the change have reached period ${headline}, and their pooled rate is compared to the pre-change rate with both numerators and denominators shown.`,
    },
  ]
}
