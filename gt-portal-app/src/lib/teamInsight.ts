/** What the Teams screen needs to know, derived rather than fetched.
 *
 *  Everything here is a pure function of TeamData. No requests, no state, no
 *  clock reading except the now that gets passed in, so the views can be
 *  rendered in a test or a story without a workspace behind them.
 *
 *  Two fields are read defensively. dueAt and priority do not exist on the
 *  tickets table yet. Rather than block the screen on a migration, every
 *  reader below returns null when the field is absent and every view treats
 *  null as unscheduled rather than as a problem. The day the columns land,
 *  the same code starts answering.
 */
import { TeamData, TeamTicket, TeamApproval, Stage, STAGES, memberLabel, parseTs } from './teamLive'

/* ------------------------------------------------------- tolerant reads */

type Loose = Record<string, unknown>

/** Milliseconds, or null when the ticket has no due date or the column is
 *  not there yet. */
export function dueOf(t: TeamTicket): number | null {
  const raw = (t as unknown as Loose).dueAt ?? (t as unknown as Loose).due_at
  if (typeof raw !== 'string' || !raw) return null
  const ms = parseTs(raw)
  return ms > 0 ? ms : null
}

export type Priority = 'urgent' | 'high' | 'normal' | 'low'
const PRIORITIES: Priority[] = ['urgent', 'high', 'normal', 'low']
export const PRIORITY_ORDER: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 }

export function priorityOf(t: TeamTicket): Priority | null {
  const raw = (t as unknown as Loose).priority
  if (typeof raw !== 'string') return null
  const p = raw.toLowerCase() as Priority
  return PRIORITIES.indexOf(p) >= 0 ? p : null
}

/** True once any ticket anywhere carries scheduling data. Used to hide the
 *  due date and priority controls entirely until the engine supports them,
 *  so the screen never offers a field that will not save. */
export function schedulingAvailable(d: TeamData): boolean {
  return d.tickets.some(t => dueOf(t) !== null || priorityOf(t) !== null)
}

/* -------------------------------------------------------------- states */

export const DAY = 86400000
export const isOpen = (t: TeamTicket) => t.stage !== 'Closed'

export function isOverdue(t: TeamTicket, now: number): boolean {
  const d = dueOf(t)
  return isOpen(t) && d !== null && d < now
}

export function isDueSoon(t: TeamTicket, now: number, days = 3): boolean {
  const d = dueOf(t)
  return isOpen(t) && d !== null && d >= now && d <= now + days * DAY
}

/** Nothing has happened to it in a week and it is not closed. Staleness is
 *  the only signal available before due dates exist, and it is the one that
 *  actually catches a stalled project. */
export function isStale(t: TeamTicket, now: number, days = 7): boolean {
  return isOpen(t) && now - parseTs(t.updatedAt || t.createdAt) > days * DAY
}

export const isUnassigned = (t: TeamTicket) => isOpen(t) && !t.assignee.trim()

/** Sitting with the client longer than a working week. Client Review is the
 *  stage where work goes quiet, so it gets its own watch. */
export function isWaitingOnClient(t: TeamTicket, now: number, days = 5): boolean {
  return t.stage === 'Client Review' && now - parseTs(t.updatedAt || t.createdAt) > days * DAY
}

/** One label per ticket, most severe first. Null means nothing is wrong. */
export type Risk = 'overdue' | 'stale' | 'waiting' | 'unassigned' | null

export function riskOf(t: TeamTicket, now: number): Risk {
  if (isOverdue(t, now)) return 'overdue'
  if (isWaitingOnClient(t, now)) return 'waiting'
  if (isStale(t, now)) return 'stale'
  if (isUnassigned(t)) return 'unassigned'
  return null
}

export const RISK_LABEL: Record<Exclude<Risk, null>, string> = {
  overdue: 'Overdue',
  waiting: 'Waiting on client',
  stale: 'No movement',
  unassigned: 'Unassigned'
}

/* ------------------------------------------------------------- sorting */

/** Worst first. Overdue beats stale, then priority, then the oldest due
 *  date, then the oldest ticket, so the order is stable between renders. */
export function bySeverity(now: number) {
  const rank: Record<string, number> = { overdue: 0, waiting: 1, stale: 2, unassigned: 3 }
  return (a: TeamTicket, b: TeamTicket) => {
    const ra = riskOf(a, now), rb = riskOf(b, now)
    const na = ra ? rank[ra] : 9, nb = rb ? rank[rb] : 9
    if (na !== nb) return na - nb
    const pa = priorityOf(a), pb = priorityOf(b)
    const qa = pa ? PRIORITY_ORDER[pa] : 2, qb = pb ? PRIORITY_ORDER[pb] : 2
    if (qa !== qb) return qa - qb
    const da = dueOf(a), db = dueOf(b)
    if (da !== null && db !== null && da !== db) return da - db
    if (da !== null && db === null) return -1
    if (db !== null && da === null) return 1
    return parseTs(a.createdAt) - parseTs(b.createdAt)
  }
}

/* ------------------------------------------------------------ workload */

export interface Load {
  name: string
  userId: string | null
  open: number
  inProgress: number
  overdue: number
  stale: number
  /** Open tickets, worst first, so a row can expand without another pass. */
  tickets: TeamTicket[]
}

export function workload(d: TeamData, now: number): Load[] {
  const rows = new Map<string, Load>()
  const add = (name: string, userId: string | null) => {
    if (!rows.has(name)) rows.set(name, { name, userId, open: 0, inProgress: 0, overdue: 0, stale: 0, tickets: [] })
    return rows.get(name)!
  }
  d.members.forEach(m => add(memberLabel(m), m.user_id))
  d.tickets.filter(isOpen).forEach(t => {
    const name = t.assignee.trim() || 'Unassigned'
    const r = add(name, null)
    r.open++
    if (t.stage === 'In Progress') r.inProgress++
    if (isOverdue(t, now)) r.overdue++
    if (isStale(t, now)) r.stale++
    r.tickets.push(t)
  })
  const sorter = bySeverity(now)
  rows.forEach(r => r.tickets.sort(sorter))
  return Array.from(rows.values()).sort((a, b) => {
    if (a.name === 'Unassigned') return 1
    if (b.name === 'Unassigned') return -1
    if (b.overdue !== a.overdue) return b.overdue - a.overdue
    return b.open - a.open
  })
}

/* -------------------------------------------------------- the Today cut */

export interface Today {
  /** Waiting on this person specifically, which is the only list that should
   *  make somebody feel personally on the hook. */
  yours: TeamTicket[]
  approvals: TeamApproval[]
  attention: TeamTicket[]
  unassigned: TeamTicket[]
  dueThisWeek: TeamTicket[]
  counts: { open: number; overdue: number; stale: number; closed7d: number }
}

export function todayCut(d: TeamData, now: number, myName: string): Today {
  const sorter = bySeverity(now)
  const open = d.tickets.filter(isOpen)
  const mine = myName.trim().toLowerCase()
  return {
    yours: open.filter(t => mine && t.assignee.trim().toLowerCase() === mine).sort(sorter),
    approvals: d.approvals.filter(a => a.status === 'pending'),
    attention: open.filter(t => {
      const r = riskOf(t, now)
      return r === 'overdue' || r === 'waiting' || r === 'stale'
    }).sort(sorter),
    unassigned: open.filter(isUnassigned).sort(sorter),
    dueThisWeek: open.filter(t => isDueSoon(t, now, 7)).sort(sorter),
    counts: {
      open: open.length,
      overdue: open.filter(t => isOverdue(t, now)).length,
      stale: open.filter(t => isStale(t, now)).length,
      closed7d: d.tickets.filter(t => t.stage === 'Closed' && now - parseTs(t.updatedAt) < 7 * DAY).length
    }
  }
}

/* --------------------------------------------------------------- board */

export interface Column { stage: Stage; tickets: TeamTicket[] }

export function board(d: TeamData, now: number, filter?: (t: TeamTicket) => boolean): Column[] {
  const sorter = bySeverity(now)
  return STAGES.map(stage => ({
    stage,
    tickets: d.tickets.filter(t => t.stage === stage).filter(filter || (() => true)).sort(sorter)
  }))
}

/** The stage a one-click advance should move a ticket to, or null at the end
 *  of the line. Keeping this in one place means the board and the drawer can
 *  never disagree about what forward means. */
export function nextStage(s: Stage): Stage | null {
  const i = STAGES.indexOf(s)
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null
}

/* -------------------------------------------------------------- labels */

export function dueLabel(t: TeamTicket, now: number): string {
  const d = dueOf(t)
  if (d === null) return ''
  const days = Math.round((d - now) / DAY)
  if (days < -1) return Math.abs(days) + ' days late'
  if (days === -1) return 'Yesterday'
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  if (days <= 7) return 'In ' + days + ' days'
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function agoLabel(iso: string, now: number): string {
  const ms = now - parseTs(iso)
  if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + 'm ago'
  if (ms < DAY) return Math.round(ms / 3600000) + 'h ago'
  const d = Math.round(ms / DAY)
  return d === 1 ? 'Yesterday' : d + ' days ago'
}
