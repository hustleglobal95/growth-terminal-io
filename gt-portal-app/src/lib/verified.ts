/**
 * The verification surface.
 *
 * A claim is frozen when a plan is committed and never edited afterwards. Runs
 * accumulate against it. This module is the typed client for those records and
 * nothing more: it does no arithmetic, because every number here was computed
 * deterministically by the engine and arrives carrying the rows it came from.
 */

import { liveRoot } from './api'

export interface Window {
  periods: string[]
  numerator: number
  denominator: number
  rate: number | null
}

export interface ClaimTerms {
  volumePerPeriod: number | null
  gapRecovered: number | null
  downstreamRate: number | null
  valuePerCompletedRecord: number | null
}

export interface Gate {
  id: string
  label: string
  metric: 'rate' | 'latencyDays' | 'volume'
  test: string
  threshold: number
  duePeriods: number
}

export interface Claim {
  claimId: string
  measuredThrough: string | null
  from: string
  to: string
  baseline: Window
  atDiagnosis: Window
  gapPoints: number
  seriesStdDev: number
  recoveryTarget: number
  predictedImpactPerPeriod: number | null
  terms: ClaimTerms
  committedPeriod: string | null
  gates: Gate[]
  refusals: string[]
}

export type Verdict = 'improved' | 'no_detectable_change' | 'worsened' | 'not_yet_judgeable'
export type GateStatus = 'passed' | 'missed' | 'not_yet_due' | 'not_evaluable'

export interface GateResult {
  id: string
  label: string
  status: GateStatus
  observed: number | null
  threshold: number
  duePeriod: string | null
  reason: string
}

export interface SideEffect {
  from: string
  to: string
  before: Window
  after: Window
  changePoints: number
  significant: boolean
}

export interface CompositionCheck {
  column: string
  distance: number
  usualDrift: number | null
  threshold: number
  shifted: boolean
  topMoves: { value: string; before: number; after: number }[]
}

export interface VerificationResult {
  claimId: string
  verdict: Verdict
  evaluation: Window
  atDiagnosis: Window
  changePoints: number | null
  significance: { z: number | null; pValue: number | null; significant: boolean }
  minimumDetectableChange: number | null
  recoveryAchieved: number | null
  predictedImpactPerPeriod: number | null
  realizedImpactPerPeriod: number | null
  realizedTerms: ClaimTerms
  volume: { atDiagnosisPerPeriod: number | null; nowPerPeriod: number | null; changedMaterially: boolean }
  composition: CompositionCheck[]
  sideEffects: SideEffect[]
  gates: GateResult[]
  excludedForImmaturity: string[]
  notes: string[]
}

export interface CommitmentRow {
  id: string
  analysisId: string
  committedPeriod: string
  planVersion: number
  committedAt: string
}

export interface ClaimRow {
  id: string
  commitmentId: string
  claimKey: string
  claimJson: Claim
}

export interface RunRow {
  id: string
  commitmentId: string
  claimId: string
  snapshotId: string
  observedThrough: string | null
  createdAt: string
  resultJson: VerificationResult
}

/* The verification routes hang off /api/v1 directly, not off the portal
   prefix, which is why they go through liveRoot.
 *
 *  One difference matters. The portal adapter unwraps the { data, meta }
 *  envelope for you; liveRoot hands it back whole. Reading straight through it
 *  is how a committed plan renders as an uncommitted one: the array is there,
 *  one level down, and every length check quietly reads undefined. */
async function root<T>(path: string, init?: RequestInit): Promise<T> {
  const body = await liveRoot<unknown>(path, init)
  if (body && typeof body === 'object' && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: T }).data
  }
  return body as T
}

export function listCommitments(analysisId: string): Promise<CommitmentRow[]> {
  return root<CommitmentRow[]>('/v1/analyses/' + encodeURIComponent(analysisId) + '/commitments')
}

export function getCommitment(id: string): Promise<{ commitment: CommitmentRow; claims: ClaimRow[] }> {
  return root('/v1/commitments/' + encodeURIComponent(id))
}

export function listRuns(commitmentId: string): Promise<RunRow[]> {
  return root<RunRow[]>('/v1/commitments/' + encodeURIComponent(commitmentId) + '/runs')
}

export function commitPlan(
  analysisId: string, committedPeriod: string,
): Promise<{ commitment: CommitmentRow; claim: ClaimRow; existed: boolean }> {
  return root('/v1/analyses/' + encodeURIComponent(analysisId) + '/commitments', {
    method: 'POST',
    body: JSON.stringify({ committedPeriod }),
  })
}

/* ------------------------------------------------------------------ */
/* Language                                                            */
/* ------------------------------------------------------------------ */

export function thisPeriod(): string {
  const d = new Date()
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0')
}

export function monthName(period: string): string {
  const [y, m] = period.split('-').map(Number)
  if (!y || !m) return period
  const names = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December']
  return names[m - 1] + ' ' + y
}

/** Column names are the customer's own words. They read better unpunctuated. */
export function stepLabel(raw: string): string {
  const tail = raw.indexOf('.') >= 0 ? raw.slice(raw.indexOf('.') + 1) : raw
  return tail.replace(/[_-]+/g, ' ').trim()
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  improved: 'It worked',
  no_detectable_change: 'No change we can see',
  worsened: 'It got worse',
  not_yet_judgeable: 'Too early to say',
}

export const GATE_LABEL: Record<GateStatus, string> = {
  passed: 'Passed',
  missed: 'Missed',
  not_yet_due: 'Not due yet',
  not_evaluable: 'Cannot judge yet',
}

export function pct(x: number | null | undefined, places = 1): string {
  return x === null || x === undefined ? 'not measured' : (x * 100).toFixed(places) + '%'
}

export function points(x: number | null | undefined, places = 1): string {
  if (x === null || x === undefined) return 'not measured'
  const v = (x * 100).toFixed(places)
  return (x > 0 ? '+' : '') + v + (Math.abs(x * 100) === 1 ? ' point' : ' points')
}

export function money(x: number | null | undefined): string {
  return x === null || x === undefined
    ? 'withheld'
    : '$' + Math.round(x).toLocaleString('en-US')
}
