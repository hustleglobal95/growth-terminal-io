/** DATA SOURCES.
 *
 *  The engine has carried a complete integrations product for a long time and
 *  the portal has never had a door onto it: eight sync adapters, a scheduler,
 *  leases so two workers cannot double pull, a reaper for stuck runs, a
 *  failure classifier, encrypted tokens, and per-connection health. This file
 *  is the client for it. It adds nothing and invents nothing.
 *
 *    GET    /api/connections?accountId=<workspace>
 *    POST   /api/connections/{provider}/start      -> { ok, url }
 *    DELETE /api/connections/{id}
 *    POST   /api/connections/{id}/resync
 *    POST   /api/connections/stripe/connect | /disconnect
 *
 *  TWO THINGS THIS MODULE REFUSES TO DECIDE.
 *
 *  Which providers are available. The engine answers that itself, per
 *  provider, in the `providers` array, by checking at request time whether
 *  that provider's client id and secret are actually set. A portal that kept
 *  its own list would go stale the first time a credential was added, and
 *  would offer a Connect button that 503s. So the screen renders what the
 *  engine says and nothing else.
 *
 *  Whether a connection is healthy. `status` says whether the grant is good.
 *  `lastSyncStatus` says whether data is arriving. Those are different
 *  questions and a connection can be active and failing every pull, which is
 *  the state every dashboard collapses into a green tick.
 */

import { liveRoot, getWorkspaceId } from './api'

export type ProviderKey =
  | 'shopify' | 'ga4' | 'hubspot' | 'meta-ads'
  | 'google-ads' | 'quickbooks' | 'gohighlevel' | 'stripe'

export type ConnectionStatus = 'active' | 'needs_reconnect' | 'revoked'
export type SyncStatus = 'success' | 'failure' | null

/** What the engine's classifier decided about the last failure. Kept as its
 *  own type because the fix differs for each one and the screen says which. */
export type FailureClass = 'needs_reauth' | 'quota' | 'provider_5xx' | 'unknown' | null

export interface Connection {
  id: string
  provider: ProviderKey
  /** Shop domain, GA4 property, ad account id. The engine's own words. */
  accountRef: string
  accountLabel: string | null
  status: ConnectionStatus
  lastError: string | null
  scopes: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
  lastSyncStatus: SyncStatus
  consecutiveFailures: number
  lastFailureClass: FailureClass
  lastSuccessAt: string | null
  lastFailureAt: string | null
}

/** Whether the server holds the client credentials this provider needs. The
 *  engine computes it per request from the env var names in its registry. */
export interface ProviderState {
  key: ProviderKey
  configured: boolean
}

export interface IntegrationsState {
  business: { id: string; slug: string; name: string }
  connections: Connection[]
  providers: ProviderState[]
}

const LABELS: Record<ProviderKey, string> = {
  shopify: 'Shopify',
  ga4: 'Google Analytics',
  hubspot: 'HubSpot',
  'meta-ads': 'Meta Ads',
  'google-ads': 'Google Ads',
  quickbooks: 'QuickBooks',
  gohighlevel: 'GoHighLevel',
  stripe: 'Stripe',
}

/** What each source actually contributes to an analysis. Taken from the
 *  engine's own rollup specs, so this is what the number will be built from
 *  rather than a marketing sentence. */
const CONTRIBUTES: Record<ProviderKey, string> = {
  stripe: 'Revenue and average sale value',
  shopify: 'Revenue, average sale value, sessions and conversion rate',
  ga4: 'Sessions, conversion rate and lead volume',
  'meta-ads': 'Ad spend',
  'google-ads': 'Ad spend',
  hubspot: 'Contacts and deals',
  quickbooks: 'Accounting revenue',
  gohighlevel: 'Contacts, opportunities and calendar events',
}

export function providerLabel(k: ProviderKey): string {
  return LABELS[k] || k
}

export function providerContributes(k: ProviderKey): string {
  return CONTRIBUTES[k] || ''
}

/** Shopify is the one provider that needs a value from the customer before
 *  the OAuth round trip can even start. */
export function needsShop(k: ProviderKey): boolean {
  return k === 'shopify'
}

function ws(): string {
  const id = getWorkspaceId()
  if (!id) throw new Error('This browser has not resolved a workspace yet.')
  return id
}

function q(path: string): string {
  return path + (path.includes('?') ? '&' : '?') + 'accountId=' + encodeURIComponent(ws())
}

export function listIntegrations(): Promise<IntegrationsState> {
  return liveRoot<IntegrationsState>(q('/connections'))
}

/** Returns the provider's authorize URL. The caller sends the browser there;
 *  nothing is connected until the provider redirects back. */
export async function startConnect(provider: ProviderKey, shop?: string): Promise<string> {
  const body: Record<string, string> = { accountId: ws() }
  if (shop) body.shop = shop
  const r = await liveRoot<{ ok: boolean; url: string }>(
    '/connections/' + encodeURIComponent(provider) + '/start',
    { method: 'POST', body: JSON.stringify(body) },
  )
  if (!r || !r.url) throw new Error('The provider did not return a sign in link.')
  return r.url
}

export function disconnect(id: string): Promise<unknown> {
  return liveRoot(q('/connections/' + encodeURIComponent(id)), { method: 'DELETE' })
}

export function resync(id: string): Promise<unknown> {
  return liveRoot(q('/connections/' + encodeURIComponent(id) + '/resync'), { method: 'POST' })
}

export function connectStripe(): Promise<unknown> {
  return liveRoot('/connections/stripe/connect', {
    method: 'POST', body: JSON.stringify({ accountId: ws() }),
  })
}

export function disconnectStripe(): Promise<unknown> {
  return liveRoot('/connections/stripe/disconnect', {
    method: 'POST', body: JSON.stringify({ accountId: ws() }),
  })
}

// ── Reading a connection honestly ───────────────────────────────────────────

export type Health = 'working' | 'failing' | 'reconnect' | 'waiting' | 'off'

/** The grant and the data are two separate questions, and this is the only
 *  function that is allowed to combine them.
 *
 *  `working`   the grant is good and the last pull succeeded
 *  `failing`   the grant is good and the last pull did not
 *  `reconnect` the provider has withdrawn or expired the grant
 *  `waiting`   connected, nothing has been pulled yet
 *  `off`       disconnected
 */
export function health(c: Connection): Health {
  if (c.status === 'revoked') return 'off'
  if (c.status === 'needs_reconnect' || c.lastFailureClass === 'needs_reauth') return 'reconnect'
  if (c.lastSyncStatus === 'failure') return 'failing'
  if (c.lastSyncStatus === 'success') return 'working'
  return 'waiting'
}

/** What went wrong and what the customer can do about it, in their terms.
 *  Every branch names a different fix, which is the only reason the engine
 *  classifies failures at all. */
export function failureText(c: Connection): string | null {
  if (c.lastFailureClass === 'needs_reauth') {
    return 'The permission has lapsed. Reconnecting is the fix, and it takes a moment.'
  }
  if (c.lastFailureClass === 'quota') {
    return 'The provider is rate limiting us. Nothing is broken and it will catch up on its own.'
  }
  if (c.lastFailureClass === 'provider_5xx') {
    return 'The provider is returning errors. This is on their side and it retries by itself.'
  }
  if (c.lastFailureClass === 'unknown' && c.lastError) return c.lastError
  return c.lastError
}

/** Plain English for a timestamp, or null when there is not one. Kept here so
 *  a screen never has to decide what to print for "never". */
export function since(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!isFinite(t)) return null
  const mins = Math.round((Date.now() - t) / 60000)
  if (mins < 2) return 'just now'
  if (mins < 60) return mins + ' minutes ago'
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return hrs === 1 ? 'an hour ago' : hrs + ' hours ago'
  const days = Math.round(hrs / 24)
  return days === 1 ? 'yesterday' : days + ' days ago'
}

/** Reads the `?connected=` the engine appends when it sends somebody back
 *  from a provider. Returns the provider key so the screen can say which one
 *  landed rather than a generic success. */
export function justConnected(search: string): ProviderKey | null {
  const v = new URLSearchParams(search).get('connected')
  if (!v) return null
  return (Object.keys(LABELS) as ProviderKey[]).find(k => k === v) || null
}
