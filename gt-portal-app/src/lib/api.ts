import { DEMO, API_BASE, PORTAL_API, DEFAULT_WORKSPACE_ID } from '../config'
import { getClerkToken } from './clerkBridge'
import { stripDashes } from './sanitize'
import demo from '../data/demo.json'

export type Status = 'Complete' | 'Running' | 'Failed' | 'Queued'
export interface AnalysisRow { id?: string; b: string; c: string; cat: string; sev: string; src: string; st: Status; d: string; open?: boolean }

/** Live analysis detail, normalized loosely: the raw row rides along so the
 *  detail screen can adaptively pick whatever fields the engine provided. */
export interface AnalysisDetail {
  id: string
  businessName: string
  status: string
  constraint: Record<string, unknown> | null
  createdAt: string | null
  completedAt: string | null
  executionPlan: unknown
  raw: Record<string, unknown>
}
export interface Business { n: string; i: string; f: string; d: string }

/** Workspace overview: live stats and the activity feed, as the API
 *  returns them. Nothing here is synthesized client side. */
export interface OverviewData {
  stats: { totalAnalyses: number; runningAnalyses: number; committedSnapshots: number; activeBusinesses: number }
  recentActivity: { type: string; id: string; title: string; subtitle: string; status: string; createdAt: string }[]
}
export interface Phase { n: number; wk: string; eff: string; t: string; dw: string; hyp: string; obj: string; why: string; steps: string[]; del: string; own: string; li: string; watch: string }
export interface Step { t: string; d: number; own: string; how: string[]; need: string; done: string; out: string; care: string }
export interface Gate { t: string; q: string; pass: string; miss: string }

export const data = demo as unknown as {
  D: { months: string[]; produced: number[]; required: number[]; gap: number[]; cac: number[]; cpql: number[] }
  RANK: [string, number, boolean][]
  EV: [string, string, string, string, string, number[]][]
  PHASES: Phase[]
  GATES: Record<string, Gate>
  STEPS: Record<string, Step[]>
  TWELVE: [string, number][]
  AN: AnalysisRow[]
  BIZ: Business[]
  IND: [string, string, string, string][]
  STUBS: Record<string, [string, [string, string][]]>
}

/** Workspace scoping. The API requires X-Workspace-Id on every portal
 *  request; 400 missing_workspace_id means this was not set. */
export function getWorkspaceId(): string | null {
  return localStorage.getItem('gt_workspace') || DEFAULT_WORKSPACE_ID || null
}
export function setWorkspaceId(id: string) {
  localStorage.setItem('gt_workspace', id)
}

/** The live adapter, confirmed contract: Clerk __session cookie rides on
 *  credentials include, X-Workspace-Id scopes the request. 401 means the
 *  Clerk session is missing or expired, send the user to sign in. */
async function live<T>(path: string, init?: RequestInit): Promise<T> {
  const ws = getWorkspaceId()
  const token = await getClerkToken()
  const res = await fetch(API_BASE + PORTAL_API + path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(ws ? { 'X-Workspace-Id': ws } : {}),
      ...(init?.headers || {})
    }
  })
  if (res.status === 401) { window.location.assign('/login'); throw new Error('Signed out.') }
  if (!res.ok) {
    let msg = 'Request failed (' + res.status + ')'
    try {
      const eb = await res.json()
      const m = eb && eb.error && eb.error.message ? eb.error.message : eb && eb.message
      if (typeof m === 'string' && m) msg = m
    } catch { /* keep the status message */ }
    throw new Error(msg)
  }
  const body = await res.json()
  const payload = body && typeof body === 'object' && 'data' in body ? body.data : body
  /* Single enforcement point: every engine string the portal renders passes
     through here. No screen can bypass it. See lib/sanitize.ts and RULES.md. */
  return stripDashes(payload) as T
}

/** The same adapter for routes that hang off /api directly rather than off
 *  /api/v1/portal. The engine has two API surfaces: the thin portal one this
 *  app was built against, and the older, much larger one at /api. Calibration
 *  and billing live on the second. Same origin, same Clerk session, same
 *  workspace header, different prefix. */
async function liveRoot<T>(path: string): Promise<T> {
  const ws = getWorkspaceId()
  const token = await getClerkToken()
  const res = await fetch(API_BASE + '/api' + path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(ws ? { 'X-Workspace-Id': ws } : {})
    }
  })
  if (res.status === 401) { window.location.assign('/login'); throw new Error('Signed out.') }
  if (!res.ok) throw new Error('Request failed (' + res.status + ')')
  return stripDashes(await res.json()) as T
}

/** Live auth is Clerk's, not ours: there is no login route on the API.
 *  The demo login resolves immediately; the live path never calls this,
 *  because the Login screen mounts Clerk's own sign in component. */
export async function login(_email: string, _password: string): Promise<void> {
  if (DEMO) return
  throw new Error('Live sign in is handled by Clerk. Set CLERK_PUBLISHABLE_KEY in src/config.ts.')
}

/** The raw analysis row as the API returns it, confirmed against the
 *  backend: GET /api/v1/portal/analyses returns full database rows in a
 *  { data: [...], meta: {...} } envelope. We project them into the compact
 *  shape the screens render, client side, so the backend stays generic. */
interface RawAnalysisRow {
  id?: string | null
  businessName?: string | null
  primaryConstraintTitle?: string | null
  primaryConstraintCategory?: string | null
  severityScore?: number | null
  sourceType?: string | null
  sourceClient?: string | null
  status?: string | null
  createdAt?: string | null
}

const STATUS_LABEL: Record<string, Status> = {
  running: 'Running', complete: 'Complete', failed: 'Failed', queued: 'Queued'
}

const SOURCE_LABEL: Record<string, string> = {
  sheets: 'Sheets add-on', 'sheets-addon': 'Sheets add-on',
  api: 'API', upload: 'Upload', csv: 'Upload'
}

function toRow(r: RawAnalysisRow): AnalysisRow {
  const rawSrc = r.sourceClient || r.sourceType || ''
  const when = r.createdAt ? new Date(r.createdAt) : null
  return {
    id: r.id || undefined,
    b: r.businessName || 'Untitled business',
    c: r.primaryConstraintTitle || 'Analysis in progress',
    cat: r.primaryConstraintCategory || '',
    sev: r.severityScore != null ? r.severityScore + '/10' : '',
    src: SOURCE_LABEL[rawSrc.toLowerCase()] || rawSrc || 'API',
    st: STATUS_LABEL[(r.status || '').toLowerCase()] || 'Queued',
    d: when && !isNaN(when.getTime())
      ? when.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      : ''
  }
}

/** A business exactly as the businesses table holds it. There is no
 *  category and no metric on this row: anything numeric has to be joined
 *  from elsewhere, so the screen does not pretend otherwise. */
export interface BusinessRow {
  id: string
  slug: string
  name: string
  createdAt: string | null
  updatedAt: string | null
  derivedInputsSyncedAt: string | null
}

/** What the calibration engine actually reports. Only the fields the portal
 *  reads are typed; the response carries more (per type, per engine version). */
export interface CalibrationSummary {
  totals: { predictions: number; graded: number; coverage: number }
  intervalCalibration: { sampleSize: number; coverage: number; targetCoverage: number }
}

/** Billing state. Note there is no credit balance anywhere in this payload,
 *  which is why the sidebar reports the plan rather than a credit count. */
export interface BillingStatus {
  state: string
  bypassed: boolean
  planName: string | null
  cadence: string | null
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

export const api = {
  async listBusinesses(): Promise<BusinessRow[]> {
    if (DEMO) return []
    const rows = await live<BusinessRow[]>('/businesses')
    return Array.isArray(rows) ? rows : []
  },
  async calibration(): Promise<CalibrationSummary> {
    return liveRoot<CalibrationSummary>('/calibration/summary')
  },
  async billing(): Promise<BillingStatus> {
    return liveRoot<BillingStatus>('/portal/billing/status')
  },
  async listAnalyses(): Promise<AnalysisRow[]> {
    if (DEMO) return data.AN
    const rows = await live<RawAnalysisRow[]>('/analyses')
    return (Array.isArray(rows) ? rows : []).map(toRow)
  },
  async me(): Promise<{ name: string; workspace: string }> {
    if (DEMO) return { name: 'Kevin Gonzalez', workspace: 'Growth Terminal' }
    return live('/me')
  },
  async overview(): Promise<OverviewData> {
    if (DEMO) return {
      stats: { totalAnalyses: 24, runningAnalyses: 1, committedSnapshots: 9, activeBusinesses: 9 },
      recentActivity: []
    }
    return live<OverviewData>('/overview')
  },
  /** One analysis with its verdict and plan. The response shape flexes, so
   *  normalization keeps the raw object for adaptive field picking. */
  async getAnalysis(id: string): Promise<AnalysisDetail> {
    const r = await live<Record<string, unknown>>('/analyses/' + encodeURIComponent(id))
    const g = (k: string) => r[k]
    return {
      id: String(g('id') || id),
      businessName: String(g('businessName') || 'Untitled business'),
      status: String(g('status') || 'queued'),
      constraint: (g('constraint') as Record<string, unknown>) ||
        (g('constraintResult') as Record<string, unknown>) || null,
      createdAt: (g('createdAt') as string) || (g('startedAt') as string) || null,
      completedAt: (g('completedAt') as string) || (g('computedAt') as string) || (g('gradedAt') as string) || null,
      executionPlan: g('executionPlan') ?? g('execution_plan') ?? g('plan') ?? null,
      raw: r
    }
  }
}
