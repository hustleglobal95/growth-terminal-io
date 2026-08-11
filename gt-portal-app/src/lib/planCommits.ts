/** Execution record for the 90 day plan.
 *
 *  The engine writes the plan once. What happens next is the part nobody
 *  usually captures: which weeks actually got done, when, and by whom. This
 *  module is that ledger. Every week of every phase can be committed, and the
 *  commit is stamped with a timestamp and the member who made it, so at the
 *  end of the horizon the whole run can be grabbed as one payload and scored.
 *
 *  Scoring is internal. Nothing here renders a grade to the customer: the
 *  portal captures the record, and `planRecord` hands it over on request.
 *
 *  Storage is localStorage per workspace, exactly like teamData, and the
 *  shapes mirror the future API one to one so wiring later is a swap of load
 *  and save, not a rebuild.
 */
import { getWorkspaceId } from './api'
import { ME } from './teamData'

/** One committed week. `week` is the week number inside the plan horizon,
 *  1 based, which is what makes the record scoreable against the calendar. */
export interface WeekCommit {
  week: number
  phaseIndex: number
  phaseTitle: string
  committedAt: number
  committedBy: string
  committedByName: string
  note: string
}

/** Everything known about one analysis's execution, ready to be scored. */
export interface PlanRecord {
  analysisId: string
  businessName: string
  /** When the analysis landed. Week 1 is the week that starts here. */
  startedAt: number
  horizonWeeks: number
  phaseCount: number
  weeks: WeekCommit[]
  updatedAt: number
}

type PlanStore = Record<string, PlanRecord>

const KEY = (ws: string) => 'gt_plan_' + ws

function load(): PlanStore {
  const ws = getWorkspaceId() || 'default'
  try {
    const raw = localStorage.getItem(KEY(ws))
    if (raw) return JSON.parse(raw) as PlanStore
  } catch { /* fall through to empty */ }
  return {}
}

function save(store: PlanStore) {
  const ws = getWorkspaceId() || 'default'
  try { localStorage.setItem(KEY(ws), JSON.stringify(store)) } catch { /* storage full */ }
}

/** The signed in member's display name, read from the team state so the
 *  ledger says "Marcus committed week 3", not "someone did". */
function myName(): string {
  try {
    const ws = getWorkspaceId() || 'default'
    const raw = localStorage.getItem('gt_team_' + ws)
    if (raw) {
      const st = JSON.parse(raw) as { members?: { id: string; name: string }[] }
      const own = (st.members || []).find(m => m.id === ME)
      if (own && own.name) return own.name
    }
  } catch { /* fall through */ }
  return 'Workspace owner'
}

/** Turn a phase's own week label into the week numbers it covers.
 *  The engine writes these as free text ("Week 1 to 2", "Weeks 3-4",
 *  "Week 5"), so this reads the numbers out and never guesses beyond them.
 *  An unreadable label returns an empty range and the caller falls back to
 *  the phase's position in the plan. */
export function weekRange(label: string): number[] {
  const nums = (label.match(/\d+/g) || []).map(Number).filter(n => n > 0 && n <= 104)
  if (nums.length === 0) return []
  const from = Math.min(...nums)
  const to = Math.max(...nums)
  if (to - from > 26) return [from]
  const out: number[] = []
  for (let w = from; w <= to; w++) out.push(w)
  return out
}

/** The weeks a phase owns: its own label when readable, otherwise the single
 *  week matching its place in the sequence, so every phase is committable. */
export function phaseWeeks(label: string, phaseIndex: number): number[] {
  const r = weekRange(label)
  return r.length > 0 ? r : [phaseIndex + 1]
}

export function getRecord(analysisId: string): PlanRecord | null {
  return load()[analysisId] || null
}

export function committedWeeks(analysisId: string): WeekCommit[] {
  const r = getRecord(analysisId)
  return r ? r.weeks.slice().sort((a, b) => a.week - b.week) : []
}

export function isCommitted(analysisId: string, week: number): WeekCommit | null {
  return committedWeeks(analysisId).find(w => w.week === week) || null
}

/** Facts about the plan itself, saved alongside the commits so the record
 *  can be scored later without needing the analysis fetched again. */
export interface PlanMeta {
  businessName: string
  startedAt: number
  horizonWeeks: number
  phaseCount: number
}

function ensure(store: PlanStore, analysisId: string, meta: PlanMeta): PlanRecord {
  const cur = store[analysisId]
  if (cur) {
    cur.businessName = meta.businessName || cur.businessName
    cur.startedAt = meta.startedAt || cur.startedAt
    cur.horizonWeeks = meta.horizonWeeks || cur.horizonWeeks
    cur.phaseCount = meta.phaseCount || cur.phaseCount
    return cur
  }
  const rec: PlanRecord = {
    analysisId, businessName: meta.businessName, startedAt: meta.startedAt,
    horizonWeeks: meta.horizonWeeks, phaseCount: meta.phaseCount,
    weeks: [], updatedAt: Date.now()
  }
  store[analysisId] = rec
  return rec
}

/** Commit one week. Idempotent: committing an already committed week leaves
 *  the original stamp alone, because the first commit is the honest one. */
export function commitWeek(
  analysisId: string, meta: PlanMeta,
  week: number, phaseIndex: number, phaseTitle: string, note: string,
  byName?: string
): WeekCommit {
  const store = load()
  const rec = ensure(store, analysisId, meta)
  const existing = rec.weeks.find(w => w.week === week)
  if (existing) return existing
  const c: WeekCommit = {
    week, phaseIndex, phaseTitle,
    committedAt: Date.now(), committedBy: ME, committedByName: byName || myName(),
    note: note || ''
  }
  rec.weeks.push(c)
  rec.updatedAt = Date.now()
  save(store)
  return c
}

/** Undo a commit. Mistakes happen and a false record scores worse than none. */
export function uncommitWeek(analysisId: string, week: number) {
  const store = load()
  const rec = store[analysisId]
  if (!rec) return
  rec.weeks = rec.weeks.filter(w => w.week !== week)
  rec.updatedAt = Date.now()
  save(store)
}

/** Which week of the horizon the plan is in right now, 1 based. */
export function currentWeek(startedAt: number): number {
  if (!startedAt) return 0
  const ms = Date.now() - startedAt
  if (ms < 0) return 1
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1
}

/* ---------------------------------------------------------------------- */
/* The scoreable payload. Internal use: this is what gets grabbed at the    */
/* end of the horizon and scored. It is never rendered to the customer.     */
/* ---------------------------------------------------------------------- */

export interface ScoredWeek {
  week: number
  phaseIndex: number
  phaseTitle: string
  committed: boolean
  committedAt: number | null
  committedBy: string
  note: string
  /** Committed inside its own week, rather than backfilled weeks later. */
  onTime: boolean | null
  /** Whole weeks between when the week opened and when it was committed. */
  latencyWeeks: number | null
}

export interface ScoredPlan {
  analysisId: string
  businessName: string
  workspaceId: string
  startedAt: number
  horizonWeeks: number
  phaseCount: number
  weeksTotal: number
  weeksCommitted: number
  weeksOnTime: number
  completionRate: number
  onTimeRate: number
  elapsedWeeks: number
  weeks: ScoredWeek[]
  generatedAt: number
}

/** Build the full record for one analysis. `plan` is the week to phase map
 *  the page rendered, passed in so the payload covers every planned week,
 *  including the ones nobody committed. That absence is the signal. */
export function planRecord(
  analysisId: string,
  plan: { week: number; phaseIndex: number; phaseTitle: string }[]
): ScoredPlan | null {
  const rec = getRecord(analysisId)
  if (!rec && plan.length === 0) return null
  const startedAt = rec ? rec.startedAt : 0
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const weeks: ScoredWeek[] = plan.map(p => {
    const c = rec ? rec.weeks.find(w => w.week === p.week) : undefined
    let onTime: boolean | null = null
    let latencyWeeks: number | null = null
    if (c && startedAt) {
      const opens = startedAt + (p.week - 1) * weekMs
      onTime = c.committedAt <= opens + weekMs
      latencyWeeks = Math.max(0, Math.floor((c.committedAt - opens) / weekMs))
    }
    return {
      week: p.week, phaseIndex: p.phaseIndex, phaseTitle: p.phaseTitle,
      committed: !!c, committedAt: c ? c.committedAt : null,
      committedBy: c ? c.committedByName : '', note: c ? c.note : '',
      onTime, latencyWeeks
    }
  })
  const done = weeks.filter(w => w.committed).length
  const onTimeCount = weeks.filter(w => w.onTime).length
  return {
    analysisId,
    businessName: rec ? rec.businessName : '',
    workspaceId: getWorkspaceId() || 'default',
    startedAt,
    horizonWeeks: rec ? rec.horizonWeeks : 0,
    phaseCount: rec ? rec.phaseCount : 0,
    weeksTotal: weeks.length,
    weeksCommitted: done,
    weeksOnTime: onTimeCount,
    completionRate: weeks.length ? Math.round((done / weeks.length) * 100) : 0,
    onTimeRate: done ? Math.round((onTimeCount / done) * 100) : 0,
    elapsedWeeks: startedAt ? currentWeek(startedAt) : 0,
    weeks,
    generatedAt: Date.now()
  }
}

/** Every plan ledger this workspace holds, raw. The internal grab point
 *  until the backend grows plan routes; the shape is already the payload
 *  those routes will return. */
export function allRecords(): PlanRecord[] {
  const store = load()
  return Object.keys(store).map(k => store[k])
}

/* Internal access hook. Scoring happens on our side, not the customer's, so
 * there is no button for this anywhere in the interface: the ledger is read
 * from the console or, once the backend has plan routes, straight from the
 * API. */
declare global { interface Window { gtPlanRecords?: () => PlanRecord[] } }
if (typeof window !== 'undefined') window.gtPlanRecords = allRecords
