/** What changed while you were away.
 *
 *  The engine records every ticket, comment, stage move, assignment and
 *  approval with a timestamp, so "since you were last here" needs only one
 *  extra fact: when you were last here. That is a per browser, per person,
 *  per workspace mark, which is exactly the kind of thing that belongs in
 *  local storage and nowhere else. It is a reading position, not shared data.
 *
 *  Two rules keep the notice honest.
 *
 *  Your own actions never appear. Being told that you moved a ticket you just
 *  moved is noise, and noise is how people learn to dismiss a panel without
 *  reading it.
 *
 *  A first visit shows nothing. With no previous mark there is no such thing
 *  as an update, and opening a workspace to forty notices about work you
 *  already knew about would be worse than silence.
 */
import { Event } from './teamLive'

const KEY = 'gt_team_seen'

type Marks = Record<string, number>

function read(): Marks {
  try {
    const raw = localStorage.getItem(KEY)
    const v = raw ? JSON.parse(raw) : {}
    return v && typeof v === 'object' ? (v as Marks) : {}
  } catch { return {} }
}

function write(m: Marks) {
  try { localStorage.setItem(KEY, JSON.stringify(m)) } catch { /* storage full or blocked */ }
}

/** One mark per person per workspace, so signing in as somebody else on the
 *  same browser does not inherit their reading position. */
const markKey = (workspaceId: string, who: string) => workspaceId + '::' + (who || 'anon')

export function lastSeen(workspaceId: string, who: string): number | null {
  const v = read()[markKey(workspaceId, who)]
  return typeof v === 'number' && v > 0 ? v : null
}

export function markSeen(workspaceId: string, who: string, ts: number) {
  const m = read()
  const k = markKey(workspaceId, who)
  if (!(m[k] > ts)) { m[k] = ts; write(m) }
}

/** Everything that happened after the mark, newest first, minus your own
 *  doing. Comparison on the actor name is deliberately loose: the activity
 *  feed carries display names rather than ids, so a trimmed lowercase match
 *  is the honest best available and a near miss only means one extra line. */
export function unseen(events: Event[], since: number | null, myName: string): Event[] {
  if (since === null) return []
  const me = myName.trim().toLowerCase()
  return events
    .filter(e => e.ts > since)
    .filter(e => !me || e.actor.trim().toLowerCase() !== me)
    .sort((a, b) => b.ts - a.ts)
}

/** A single sentence for the toast, so the popover is not the only way to
 *  learn something happened. */
export function summarise(list: Event[]): string {
  if (list.length === 0) return ''
  const actors = Array.from(new Set(list.map(e => e.actor)))
  const who = actors.length === 1
    ? actors[0]
    : actors.length === 2
      ? actors[0] + ' and ' + actors[1]
      : actors[0] + ' and ' + (actors.length - 1) + ' others'
  return list.length === 1
    ? who + ' ' + list[0].text
    : who + ' made ' + list.length + ' changes while you were away.'
}

/** Kind to a plain label, used down the left of the panel so a long list can
 *  be skimmed by type rather than read line by line. */
export const KIND_LABEL: Record<string, string> = {
  ticket: 'New',
  stage: 'Moved',
  comment: 'Note',
  assign: 'Assigned',
  approval: 'Approval',
  member: 'Team'
}
