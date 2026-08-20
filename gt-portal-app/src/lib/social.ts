/** CONNECTED SOCIAL ACCOUNTS.
 *
 *  The portal never sees a token. Not the short lived one, not the long lived
 *  one, not the page tokens. The browser sends the customer to Facebook, the
 *  customer comes back to the engine with a code, and the engine does the
 *  exchange and the storage. What the portal reads is this: which accounts
 *  are connected, whether they still work, and what is wrong when they do
 *  not.
 *
 *  That split is not caution for its own sake. A page token in this bundle is
 *  a page token in anyone's devtools, and it posts to a customer's audience
 *  under their name.
 *
 *  THE PREREQUISITE NOBODY MENTIONS.
 *
 *  An Instagram account can only be posted to through the API when it is a
 *  Business or Creator account AND it is linked to a Facebook Page. A
 *  personal account cannot, at all, ever, no matter what is granted. Most
 *  people who try this discover it at the moment their first post fails. So
 *  the connect screen states it before they start, and after connecting we
 *  report which accounts qualified rather than pretending all of them did.
 */
import { SOCIAL_PATH } from '../config'
import { liveRoot } from './api'

export function socialConfigured(): boolean {
  return SOCIAL_PATH.length > 0
}

export type Platform = 'instagram' | 'facebook'

/** Why an account cannot be posted to. Each of these is a different
 *  conversation with the customer, so they are separate rather than one
 *  "broken" flag. */
export type AccountProblem =
  /* The Instagram account is personal, so the API will never accept a post
     for it. They fix this in the Instagram app, not here. */
  | 'not_business'
  /* Business account, but no Facebook Page attached. Same fix, different
     screen. */
  | 'no_page'
  /* We had permission and lost it: they revoked, or the password changed, or
     the token expired. Reconnecting fixes it. */
  | 'token_expired'
  /* The customer granted the connection but withheld one of the permissions
     on Facebook's own consent screen, which it lets them do. */
  | 'missing_permission'

export interface ConnectedAccount {
  platform: Platform
  /** The platform's own id for the account. Not a secret. */
  id: string
  /** As it should be shown: the handle for Instagram, the page name for
   *  Facebook. */
  name: string
  /** Profile image, when the platform gave us one. */
  avatar: string
  /** The Facebook Page this Instagram account is attached to, which is what
   *  makes posting possible at all. */
  pageName: string
  connectedAt: string
  /** Empty when the account is healthy. */
  problem: AccountProblem | null
}

export interface SocialState {
  accounts: ConnectedAccount[]
  /** False until Meta grants advanced access. Everything else on the screen
   *  works; publishing does not, and the screen says so rather than letting
   *  a customer connect and then silently never post. */
  publishingLive: boolean
}

export function problemText(p: AccountProblem): { title: string; what: string } {
  switch (p) {
    case 'not_business':
      return {
        title: 'This is a personal Instagram account.',
        what: 'Instagram only allows posting through its API to Business and Creator accounts. Switch it in the Instagram app under Settings, Account type and tools, then connect again.'
      }
    case 'no_page':
      return {
        title: 'No Facebook Page is attached.',
        what: 'Instagram requires a linked Facebook Page before anything can post to it. Link one in the Instagram app under Settings, Sharing and remixes, then connect again.'
      }
    case 'token_expired':
      return {
        title: 'The connection has lapsed.',
        what: 'This happens when the password changes, or access is revoked, or enough time passes. Nothing is wrong with the account. Connect again and it resumes.'
      }
    case 'missing_permission':
      return {
        title: 'One permission was not granted.',
        what: 'Facebook lets you untick individual permissions on the consent screen, and one that publishing needs was left off. Connect again and accept all of them.'
      }
  }
}

/** What is connected. */
export async function listSocial(): Promise<SocialState> {
  if (!socialConfigured()) return { accounts: [], publishingLive: false }
  const r = await liveRoot<SocialState>(SOCIAL_PATH)
  return {
    accounts: Array.isArray(r && r.accounts) ? r.accounts : [],
    publishingLive: Boolean(r && r.publishingLive)
  }
}

/** Where to send the browser to begin. The engine builds the Facebook URL,
 *  because it holds the app id and the state secret, and it returns it rather
 *  than redirecting so the portal can open it deliberately. */
export async function beginConnect(): Promise<string> {
  if (!socialConfigured()) throw new Error('Connecting is not switched on for this workspace yet.')
  const r = await liveRoot<{ url?: string }>(SOCIAL_PATH + '/begin', { method: 'POST' })
  const url = String((r && r.url) || '')
  /* A 200 is not a URL. Refuse anything that is not Facebook's own consent
     host, so a misconfigured engine cannot send a customer somewhere else to
     type their password. */
  if (!/^https:\/\/(www\.)?facebook\.com\//.test(url)) {
    throw new Error('The engine did not return a Facebook address.')
  }
  return url
}

export async function disconnect(platform: Platform, id: string): Promise<void> {
  if (!socialConfigured()) throw new Error('Connecting is not switched on for this workspace yet.')
  await liveRoot<null>(
    SOCIAL_PATH + '?platform=' + encodeURIComponent(platform) + '&id=' + encodeURIComponent(id),
    { method: 'DELETE' }
  )
}
