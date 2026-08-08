import { DEMO, API_BASE, PORTAL_API, DEFAULT_WORKSPACE_ID } from '../config'
import { getClerkToken } from './clerkBridge'
import demo from '../data/demo.json'

export type Status = 'Complete' | 'Running' | 'Failed' | 'Queued'
export interface AnalysisRow { b: string; c: string; cat: string; sev: string; src: string; st: Status; d: string; open?: boolean }
export interface Business { n: string; i: string; f: string; d: string }
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
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T
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

export const api = {
  async listAnalyses(): Promise<AnalysisRow[]> {
    if (DEMO) return data.AN
    const rows = await live<RawAnalysisRow[]>('/analyses')
    return (Array.isArray(rows) ? rows : []).map(toRow)
  },
  async me(): Promise<{ name: string; workspace: string }> {
    if (DEMO) return { name: 'Kevin Gonzalez', workspace: 'Growth Terminal' }
    return live('/me')
  },
  /** Launch an analysis from the portal: business name plus raw CSV text.
   *  The server runs the same ingest, confirm and create pipeline the
   *  Sheets add-on uses, and answers 202 with the queued analysis id. */
  async runAnalysis(businessName: string, csv: string): Promise<{ id: string; status: string }> {
    if (DEMO) return { id: 'demo', status: 'queued' }
    return live('/analyses', {
      method: 'POST',
      body: JSON.stringify({ businessName, source: 'portal', data: { format: 'csv', csv } })
    })
  }
}
