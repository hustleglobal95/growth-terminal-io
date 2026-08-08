import { DEMO, API_BASE, PORTAL_API } from '../config'
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
  return localStorage.getItem('gt_workspace')
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
  if (!res.ok) throw new Error('Request failed (' + res.status + ')')
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

export const api = {
  async listAnalyses(): Promise<AnalysisRow[]> {
    if (DEMO) return data.AN
    return live<AnalysisRow[]>('/analyses')
  },
  async me(): Promise<{ name: string; workspace: string }> {
    if (DEMO) return { name: 'Kevin Gonzalez', workspace: 'Growth Terminal' }
    return live('/me')
  }
}
