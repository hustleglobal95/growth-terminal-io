/** THE FEED. What the customer puts in, and what comes out.
 *
 *  A suggestion is the unit. One thought: a line they want said, a list they
 *  want made, a link worth pointing at. The machine turns suggestions into
 *  posts; it does not invent the thoughts.
 *
 *  That is the difference between this and every tool that promises to write
 *  your content. Those start from nothing and produce plausible filler. This
 *  starts from something the owner actually wanted to say, and its job is to
 *  shape it, schedule it and learn from it. A customer who feeds it nothing
 *  gets very few posts, and that is the correct behaviour rather than a
 *  failure to fill a calendar.
 *
 *  WHY A SUGGESTION IS NOT A POST.
 *
 *  One suggestion can make several posts, in different shapes, at different
 *  times, and the ones that land can be made again. Keeping them separate is
 *  what lets the engine learn: the engagement attaches to both the layout and
 *  the suggestion behind it, so it can tell "this idea works" apart from
 *  "this shape works", which are different findings with different actions.
 */
import { FEED_PATH } from '../config'
import { liveRoot } from './api'

export function feedConfigured(): boolean {
  return FEED_PATH.length > 0
}

export type SuggestionState = 'new' | 'in_use' | 'retired'

export interface Suggestion {
  id: string
  businessSlug: string
  /** The thought, in the customer's words. This is the one required field:
   *  everything else is optional shaping. */
  line: string
  /** A phrase inside the line to mark in the accent colour. Optional, and an
   *  empty one is better than an arbitrary highlight. */
  emphasis: string
  /** Turns the suggestion into a list post when there are three or more. */
  items: string[]
  /** Somewhere this points, when it points anywhere. */
  link: string
  state: SuggestionState
  /** How many posts have been built from it, so a customer can see the ones
   *  the machine keeps reaching for. */
  usedCount: number
  createdAt: string
}

export interface QueuedPost {
  id: string
  suggestionId: string
  /** Which shape the composer chose. */
  layout: string
  /** The image the engine rendered, as a URL the portal can show. */
  preview: string
  /** When it is due to go out. */
  slot: string
  platform: string
  state: 'queued' | 'published' | 'held' | 'failed'
  /** Set when the composer refused to build it, in the customer's terms:
   *  a banned word, or a claim they have not confirmed. Shown rather than
   *  swallowed, because a silently dropped post is how a customer stops
   *  trusting a queue. */
  heldReason: string
}

export async function listSuggestions(businessSlug: string): Promise<Suggestion[]> {
  if (!feedConfigured()) return []
  const r = await liveRoot<Suggestion[]>(FEED_PATH + '?business=' + encodeURIComponent(businessSlug))
  return Array.isArray(r) ? r : []
}

export async function addSuggestion(s: {
  businessSlug: string; line: string; emphasis?: string; items?: string[]; link?: string
}): Promise<Suggestion> {
  if (!feedConfigured()) throw new Error('The feed is not switched on for this workspace yet.')
  return liveRoot<Suggestion>(FEED_PATH, { method: 'POST', body: JSON.stringify(s) })
}

export async function retireSuggestion(id: string): Promise<void> {
  if (!feedConfigured()) throw new Error('The feed is not switched on for this workspace yet.')
  await liveRoot<null>(FEED_PATH + '/' + encodeURIComponent(id), { method: 'DELETE' })
}

export async function listQueue(businessSlug: string): Promise<QueuedPost[]> {
  if (!feedConfigured()) return []
  const r = await liveRoot<QueuedPost[]>(
    FEED_PATH + '/queue?business=' + encodeURIComponent(businessSlug))
  return Array.isArray(r) ? r : []
}

/** What to tell a customer whose queue is thin.
 *
 *  Counted rather than guessed: the engine can only build as many posts as
 *  the suggestions and the brand record allow, so the honest message names
 *  the actual shortfall rather than nagging generically. */
export function feedAdvice(suggestions: Suggestion[], queued: number, perDay: number): string {
  const live = suggestions.filter(s => s.state !== 'retired').length
  if (live === 0) {
    return 'Nothing has been fed in yet. One line is enough to start: something you would say to a customer who asked what you do.'
  }
  const daysCovered = perDay > 0 ? Math.floor(queued / perDay) : 0
  if (daysCovered >= 7) return ''
  if (live < 5) {
    return 'Five or six suggestions is where the feed stops repeating itself. There are ' + live + ' now.'
  }
  return 'The queue covers about ' + daysCovered + (daysCovered === 1 ? ' day' : ' days') +
    '. Feeding a few more suggestions widens it without changing anything else.'
}
