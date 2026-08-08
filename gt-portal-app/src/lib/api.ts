import { DEMO, API_BASE } from '../config'
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

/** The live adapter. Each call maps to a confirmed route; auth is the one
 *  open question, so every request funnels through here. */
async function live<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers || {}) }
  })
  if (!res.ok) throw new Error('Request failed (' + res.status + ')')
  const body = await res.json()
  return (body && typeof body === 'object' && 'data' in body ? body.data : body) as T
}

/** Portal auth. AUTH_MODE in config picks the mechanism once the backend
 *  confirms it. Cookie mode relies on credentials: 'include' above; bearer
 *  mode stores the token and attaches it to every request. */
let bearer: string | null = localStorage.getItem('gt_token')

export function authHeaders(): Record<string, string> {
  return bearer ? { Authorization: 'Bearer ' + bearer } : {}
}

export async function login(email: string, password: string): Promise<void> {
  if (DEMO) return
  const out = await live<{ token?: string }>('/api/v1/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  })
  if (out && out.token) { bearer = out.token; localStorage.setItem('gt_token', out.token) }
}

export function signOut() { bearer = null; localStorage.removeItem('gt_token') }

export const api = {
  async listAnalyses(): Promise<AnalysisRow[]> {
    if (DEMO) return data.AN
    return live<AnalysisRow[]>('/api/v1/analyses')
  },
  async me(): Promise<{ name: string; workspace: string }> {
    if (DEMO) return { name: 'Kevin Gonzalez', workspace: 'Growth Terminal' }
    return live('/api/v1/me')
  }
}
