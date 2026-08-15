import { DEMO, API_BASE, PORTAL_API, CHECKOUT_CREDITS_PATH, CHECKOUT_PRODUCT_PATH, CHECKOUT_SUCCESS_PATH, CHECKOUT_CANCEL_PATH, AGENT_CREATE_PATH } from '../config'
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

/** The workspace this browser is scoped to, or nothing.
 *
 *  This used to fall back to a hardcoded id when storage was empty, which
 *  meant every signed in browser that had never stored one sent the same
 *  workspace: mine. A new account on a clean browser would either be refused
 *  everywhere or, worse, be handed somebody else's data. A workspace is
 *  something you belong to, not a constant, so it is discovered below rather
 *  than assumed here.
 *
 *  Removing the constant was only half the problem. What is stored here
 *  outlives the session that stored it: nothing cleared it on sign out, so a
 *  browser that had ever signed anybody in kept their workspace and handed it
 *  to whoever signed in next. Same leak, slower fuse. So the id is stored
 *  with the Clerk user it was resolved for, and is only honoured for that
 *  user. An id with no owner recorded predates this and is not trusted. */
export function getWorkspaceId(): string | null {
  return localStorage.getItem('gt_workspace')
}

/** The Clerk user this browser resolved its workspace for, if it recorded
 *  one. */
export function workspaceOwner(): string | null {
  return localStorage.getItem('gt_workspace_user')
}

export function clearWorkspace() {
  localStorage.removeItem('gt_workspace')
  localStorage.removeItem('gt_workspace_user')
}

/** True when the stored workspace was resolved for this exact user and can be
 *  used without asking again. Anything else, including a stored id with no
 *  owner, has to be re-resolved. */
export function workspaceBelongsTo(uid: string | null): boolean {
  if (!uid) return false
  const owner = workspaceOwner()
  return !!owner && owner === uid && !!getWorkspaceId()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A 401 normally means the session is gone, so the adapters below send the
 *  user to sign in. During bootstrap that is wrong and dangerous: Clerk
 *  registers its token getter in an effect, so the very first request can
 *  legitimately arrive without one, and redirecting on that answer produces a
 *  sign in loop for somebody who is already signed in. Inside this wrapper a
 *  401 is just an error to retry. */
let quiet = 0
async function withoutAuthRedirect<T>(fn: () => Promise<T>): Promise<T> {
  quiet++
  try { return await fn() } finally { quiet-- }
}

/** True when the last resolution attempt failed because there was no session,
 *  as opposed to no workspace. The caller needs to tell those apart: one is a
 *  trip to the sign in screen, the other is a message. */
let lastWasUnauthenticated = false
export function workspaceResolveWasUnauthenticated(): boolean { return lastWasUnauthenticated }

/** Ask the engine which workspace the signed in user belongs to, and remember
 *  it. Auth is checked before the workspace header on every route, so a signed
 *  in caller can ask this question without already knowing the answer.
 *
 *  Two sources, in order of directness, and neither is required to exist: if
 *  both come back empty the caller gets null and says so, because guessing is
 *  what caused the problem this function exists to fix. */
export async function resolveWorkspace(uid?: string | null): Promise<string | null> {
  if (workspaceBelongsTo(uid ?? null)) return getWorkspaceId()
  lastResolveTrace = []
  lastWasUnauthenticated = false

  /* Ask for a token first. Without one the engine answers 401 and we learn
     nothing except that we were early. */
  const token = await getClerkToken()
  if (!token) {
    lastWasUnauthenticated = true
    lastResolveTrace.push('no session token yet')
    return null
  }

  return withoutAuthRedirect(async () => {
  try {
    const me = await live<{ workspaceId?: string; workspace?: string }>('/me')
    const id = me.workspaceId || me.workspace || ''
    if (UUID.test(id)) { setWorkspaceId(id, uid); return id }
    lastResolveTrace.push('/me answered, but with no workspace id')
  } catch (e) {
    const m = e instanceof Error ? e.message : 'failed'
    if (m === 'Signed out.') lastWasUnauthenticated = true
    lastResolveTrace.push('/me: ' + m)
  }

  try {
    const r = await liveRoot<{ accounts?: { id: string }[] }>('/portal/accounts')
    const list = Array.isArray(r.accounts) ? r.accounts : []
    /* One workspace is the common case. More than one needs a picker, which
       is a bigger change than this fix; the first is a defensible default
       until somebody actually has two. */
    if (list.length > 0 && list[0].id) { setWorkspaceId(list[0].id, uid); return list[0].id }
    lastResolveTrace.push('accounts answered, but the list was empty')
  } catch (e) {
    const m = e instanceof Error ? e.message : 'failed'
    if (m === 'Signed out.') lastWasUnauthenticated = true
    lastResolveTrace.push('accounts: ' + m)
  }

  return null
  })
}

/** Why the last resolution came up empty. Kept so the screen that reports the
 *  failure can report the actual reason rather than a shrug: whoever hits this
 *  is the person who can tell us which of the two routes needs fixing. */
let lastResolveTrace: string[] = []
export function workspaceResolveTrace(): string[] { return lastResolveTrace.slice() }
export function setWorkspaceId(id: string, owner?: string | null) {
  localStorage.setItem('gt_workspace', id)
  /* Stamped with the user it was resolved for. A write with no owner, which
     is what the manual picker in config does, clears any stale stamp rather
     than leaving a wrong one behind. */
  if (owner) localStorage.setItem('gt_workspace_user', owner)
  else localStorage.removeItem('gt_workspace_user')
}

/** The live adapter, confirmed contract: Clerk __session cookie rides on
 *  credentials include, X-Workspace-Id scopes the request. 401 means the
 *  Clerk session is missing or expired, send the user to sign in.
 *
 *  Exported so features that own their own module, like editorial marks, can
 *  speak to the portal surface without every route in the product having to
 *  pile into the api object below. */
export async function live<T>(path: string, init?: RequestInit): Promise<T> {
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
  if (res.status === 401) {
    if (!quiet) window.location.assign('/login')
    throw new Error('Signed out.')
  }
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

/** The third API surface: /api/v1/workspace. Same Clerk session and same
 *  X-Workspace-Id header as the portal surface, different prefix. API keys live
 *  here and nowhere else, which is why they are not reachable under
 *  PORTAL_API. */
const WORKSPACE_API = '/api/v1/workspace'

async function liveWs<T>(path: string, init?: RequestInit): Promise<T> {
  const ws = getWorkspaceId()
  const token = await getClerkToken()
  const res = await fetch(API_BASE + WORKSPACE_API + path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(ws ? { 'X-Workspace-Id': ws } : {}),
      ...(init?.headers || {})
    }
  })
  if (res.status === 401) {
    if (!quiet) window.location.assign('/login')
    throw new Error('Signed out.')
  }
  if (!res.ok) {
    let msg = 'Request failed (' + res.status + ')'
    try {
      const eb = await res.json()
      const m = eb && eb.error && eb.error.message ? eb.error.message : eb && eb.message
      if (typeof m === 'string' && m) msg = m
    } catch { /* keep the status message */ }
    throw new Error(msg)
  }
  if (res.status === 204) return null as unknown as T
  const body = await res.json()
  const payload = body && typeof body === 'object' && 'data' in body ? body.data : body
  return stripDashes(payload) as T
}

/** The same adapter for routes that hang off /api directly rather than off
 *  /api/v1/portal. The engine has two API surfaces: the thin portal one this
 *  app was built against, and the older, much larger one at /api. Calibration
 *  and billing live on the second. Same origin, same Clerk session, same
 *  workspace header, different prefix. */
export async function liveRoot<T>(path: string, init?: RequestInit): Promise<T> {
  const ws = getWorkspaceId()
  const token = await getClerkToken()
  const res = await fetch(API_BASE + '/api' + path, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(ws ? { 'X-Workspace-Id': ws } : {})
    }
  })
  if (res.status === 401) {
    if (!quiet) window.location.assign('/login')
    throw new Error('Signed out.')
  }
  if (!res.ok) throw new Error('Request failed (' + res.status + ')')
  if (res.status === 204) return null as unknown as T
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
  snapshotBusinessName?: string | null
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
    /* Every analysis in the live workspace comes back with no business name:
       businessName is absent and snapshotBusinessName is null. Rather than
       stamping "Untitled business" onto every row, this is left empty and the
       screens fall back to the account name, which is real. */
    b: r.businessName || r.snapshotBusinessName || '',
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
/** An account as /api/portal/accounts returns it. This is where the only
 *  human readable name for a workspace lives: the businesses table stores
 *  auto-created businesses under the account identifier, not a chosen name. */
export interface AccountRow {
  id: string
  name: string
  role: string
  member_count: number
  seat_used: number | null
  seat_limit: number | null
}

export interface BillingStatus {
  state: string
  bypassed: boolean
  planName: string | null
  cadence: string | null
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
}

/** A key as the workspace endpoint returns one. The secret itself is never in
 *  here: only `keyPrefix` survives storage, because the engine keeps a hash.
 *  The full value exists for exactly one response, the one that creates it. */
export interface ApiKeyRow {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  mode: string
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
  createdByUserId: string
}

/** The create response. The engine returns the key once, on this response
 *  only, under `keySecret`. That was confirmed against the live route rather
 *  than guessed: a key created while this read the wrong field is a key nobody
 *  can ever use, so the other names stay as fallbacks and cost nothing. */
export interface NewApiKey extends ApiKeyRow {
  keySecret?: string
  key?: string
  apiKey?: string
  plaintext?: string
  secret?: string
}

export function secretOf(k: NewApiKey): string {
  return k.keySecret || k.key || k.apiKey || k.plaintext || k.secret || ''
}

/** What the add-on needs. All three, which is why the create form ticks them
 *  by default rather than making someone guess. */
export const ADDON_SCOPES = ['data:ingest', 'analyses:write', 'analyses:read']

export const SCOPE_HELP: Record<string, string> = {
  'data:ingest': 'Upload sheet data to the engine',
  'analyses:write': 'Start an analysis',
  'analyses:read': 'Read results and status'
}

/** Credits, and what each action costs. Both come from the engine; the costs
 *  are the reason the balance is worth showing at all, since a number with no
 *  price list tells nobody whether it is enough. */
export interface Credits {
  balance: number
  costs: Record<string, number>
}

/** Whether the portal has a confirmed way to start a purchase. */
export function checkoutConfigured(): boolean {
  return !DEMO && CHECKOUT_CREDITS_PATH.length > 0
}

/** What the portal knows how to buy. Each one is a different route on the
 *  engine with a different body, which is why this is a union and not a
 *  string: there is no single "sku" field shared between them. */
export type Purchase =
  | { kind: 'credits'; bundle: number }
  | { kind: 'product'; productId: string }

/** Ask the engine for a checkout session and hand back the URL to send the
 *  browser to.
 *
 *  Everything here is deliberately suspicious of a 200. The host that serves
 *  this app answers every unknown path with the app shell at status 200, so
 *  "the request succeeded" proves nothing on its own; only a JSON body
 *  carrying a URL on Stripe's own domain does. Getting that wrong would give
 *  us a button that appears to work, navigates nowhere useful and takes no
 *  money, which is worse than one that plainly refuses.
 *
 *  The return URLs are sent on every request. The engine hardcodes its own
 *  today and may ignore these; sending them costs nothing and means the day it
 *  starts honouring them, this side is already correct. */
export async function startCheckout(p: Purchase): Promise<string> {
  if (!checkoutConfigured()) throw new Error('Checkout is not configured yet.')

  const origin = window.location.origin
  const returns = {
    successUrl: origin + CHECKOUT_SUCCESS_PATH,
    cancelUrl: origin + CHECKOUT_CANCEL_PATH
  }
  const [path, payload] = p.kind === 'credits'
    ? [CHECKOUT_CREDITS_PATH, { bundle: p.bundle, ...returns }]
    : [CHECKOUT_PRODUCT_PATH, { productId: p.productId, ...returns }]

  const body = await liveRoot<{ url?: string }>(path as string, {
    method: 'POST',
    body: JSON.stringify(payload)
  })
  const url = body && typeof body.url === 'string' ? body.url : ''
  if (!/^https:\/\/(checkout\.stripe\.com|billing\.stripe\.com)\//.test(url)) {
    throw new Error('The server did not return a Stripe checkout URL.')
  }
  return url
}

export const api = {
  async listKeys(): Promise<ApiKeyRow[]> {
    if (DEMO) return []
    const rows = await liveWs<ApiKeyRow[]>('/api-keys')
    return Array.isArray(rows) ? rows : []
  },
  async createKey(name: string, scopes: string[]): Promise<NewApiKey> {
    return liveWs<NewApiKey>('/api-keys', { method: 'POST', body: JSON.stringify({ name, scopes }) })
  },
  async revokeKey(id: string): Promise<void> {
    await liveWs<unknown>('/api-keys/' + encodeURIComponent(id), { method: 'DELETE' })
  },
  async credits(): Promise<Credits> {
    const ws = getWorkspaceId()
    return liveRoot<Credits>('/credits/balance?accountId=' + encodeURIComponent(ws || ''))
  },
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
  async accounts(): Promise<AccountRow[]> {
    const r = await liveRoot<{ accounts?: AccountRow[] }>('/portal/accounts')
    return Array.isArray(r.accounts) ? r.accounts : []
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

/* ------------------------------------------------------- customer agents */

/** What a customer says they want their agent to do.
 *
 *  Two of these four fields exist because of what the agent would be able to
 *  reach. An agent briefed on a workspace's analyses can speak a severity
 *  score, a revenue impact and a ninety day plan out loud, so it matters
 *  which business it is allowed to speak for and whether the listener is the
 *  team or the client. The third field, mustNotSay, is not decoration: it is
 *  the line the person commissioning the agent gets to draw before anyone
 *  else hears it.
 */
export interface AgentSpec {
  businessSlug: string
  businessName: string
  audience: 'team' | 'client'
  purpose: string
  mustNotSay: string
}

/** True once the engine can create an agent. False today, and the create
 *  flow raises a ticket instead of pretending. */
export function agentCreateConfigured(): boolean {
  return AGENT_CREATE_PATH.length > 0
}

/** Create the agent server side and hand back its public id.
 *
 *  The validation is deliberate and it is the same lesson three other things
 *  in this app learned the hard way: a 200 proves a response arrived, not
 *  that it is the response you asked for. An agent id has a shape. If what
 *  comes back is not that shape, this throws rather than storing a string
 *  that will render a dead widget later.
 */
export async function createAgent(spec: AgentSpec): Promise<string> {
  if (!agentCreateConfigured()) throw new Error('Agent creation is not switched on for this workspace.')
  const r = await liveRoot<{ agentId?: string; agent_id?: string }>(AGENT_CREATE_PATH, {
    method: 'POST',
    body: JSON.stringify(spec)
  })
  const id = String((r && (r.agentId || r.agent_id)) || '')
  if (!/^agent_[A-Za-z0-9]{8,}$/.test(id)) {
    throw new Error('The server did not return an agent id.')
  }
  return id
}
