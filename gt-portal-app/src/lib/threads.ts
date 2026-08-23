/** THREADS CONNECTION.
 *
 *  Threads is not Facebook Login wearing a different hat. It has its own
 *  authorization server at threads.com, its own token endpoint at
 *  graph.threads.com, and its own scope list. None of the Instagram and
 *  Facebook connect code applies to it, which is why this file exists next to
 *  social.ts rather than inside it.
 *
 *  Same rule as social.ts, for the same reason: the portal never sees a
 *  token. The browser is sent to Threads, the customer comes back to the
 *  engine with a code, and the engine does the exchange, the upgrade to a
 *  sixty day token, and the storage. This bundle is static and public, so a
 *  token in it is a token in anyone's devtools, posting under the customer's
 *  own name.
 *
 *  WHAT THE AUTHORIZATION WINDOW WILL AND WILL NOT GRANT.
 *
 *  Five scopes can be granted by a person clicking Allow: basic, publishing,
 *  reading replies, managing replies, and insights. Keyword search is not one
 *  of them. It is not a permission a customer can hand over on a consent
 *  screen, so nothing here pretends to ask for it.
 */
import { THREADS_PATH } from '../config'
import { liveRoot } from './api'

export function threadsConfigured(): boolean {
  return THREADS_PATH.length > 0
}

/** What the engine redirects back with. Each is a different sentence to the
 *  customer, so they stay separate rather than collapsing into "error". */
export type ThreadsResult =
  /* The token was exchanged, upgraded and stored. */
  | 'connected'
  /* They pressed Cancel on Threads. Nothing was changed and nothing is wrong. */
  | 'denied'
  /* The state parameter did not match the one we issued. Either the link was
     stale or it did not originate here. Worth its own message: telling
     somebody "it failed" when we actually refused on purpose is a lie. */
  | 'bad_state'
  /* The exchange itself failed. Ours to fix, not theirs. */
  | 'failed'

const RESULTS: ThreadsResult[] = ['connected', 'denied', 'bad_state', 'failed']

/** Reads and clears the marker the engine appends on the way back. Returns
 *  null when there is nothing to report, which is the ordinary case. */
export function takeThreadsResult(): ThreadsResult | null {
  const raw = new URLSearchParams(window.location.search).get('threads')
  if (!raw) return null
  window.history.replaceState({}, '', window.location.pathname)
  return (RESULTS as string[]).includes(raw) ? (raw as ThreadsResult) : 'failed'
}

/** Plain language for each outcome. No apology where none is owed, no blame
 *  where it is ours. */
export function threadsResultText(r: ThreadsResult): string {
  switch (r) {
    case 'connected':
      return 'Threads connected. Growth Terminal can now post and reply as this account.'
    case 'denied':
      return 'You stopped before Threads finished. Nothing was changed.'
    case 'bad_state':
      return 'That link had expired, so we did not use it. Start the connection again.'
    case 'failed':
      return 'Threads could not complete that. Nothing was changed.'
  }
}

/** Asks the engine where to send the browser. The engine builds the URL
 *  because it owns the app id and the state it will later verify. */
export async function beginThreadsConnect(): Promise<string> {
  if (!threadsConfigured()) throw new Error('Threads connecting is not switched on yet.')
  const r = await liveRoot<{ url?: string }>(THREADS_PATH + '/begin', { method: 'POST' })
  if (!r || !r.url) throw new Error('The engine did not return a Threads authorization link.')
  return r.url
}
