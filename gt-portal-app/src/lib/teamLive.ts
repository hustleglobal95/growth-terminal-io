/** The live Teams layer.
 *
 *  Everything the Teams screen shows now comes from the engine. The routes
 *  live under /api/portal/accounts/:accountId/team and were already complete
 *  before this screen was built; the screen was running on browser storage
 *  only because nobody had pointed it at them.
 *
 *  Two rules govern the mapping below.
 *
 *  The engine's vocabulary wins. Ticket stages are New, In Progress, Client
 *  Review and Closed because those are the four values the API validates
 *  against. Renaming them here would mean the board and the database disagree
 *  about the same ticket.
 *
 *  Nothing is invented. Where the screen used to show a field the tickets
 *  table has no column for, the field is gone rather than faked: priority,
 *  due date, tags, checklist, watchers, ticket code, and who closed it. They
 *  come back the day those columns exist.
 */
import { liveRoot } from './api'

/* ---------------------------------------------------------------- types */

/** The four stages the engine validates against. Anything else is rejected
 *  server side, so this list is the board. */
export type Stage = 'New' | 'In Progress' | 'Client Review' | 'Closed'
export const STAGES: Stage[] = ['New', 'In Progress', 'Client Review', 'Closed']

/** Approvals are their own table, which is why the board has no approval
 *  column: an approval is attached to a deliverable, not to a ticket. */
export type ItemType = 'report' | 'forecast' | 'decision_memo' | 'plan'
export type ApprovalStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected'
export const ITEM_TYPES: ItemType[] = ['report', 'forecast', 'decision_memo', 'plan']

/** The roles the engine will hand out on an invite link. The workspace owner
 *  is not in the list because ownership is not granted, it is held. */
export type InviteRole = 'admin' | 'member' | 'viewer'
export const INVITE_ROLES: InviteRole[] = ['admin', 'member', 'viewer']

/** The eight areas of the portal a member can be granted. These are real
 *  rows in member_section_grants, not a client side idea of permission. */
export const SECTIONS = [
  'overview', 'businesses', 'briefing', 'forecasts',
  'diagnostic', 'deliverables', 'plan', 'api-keys'
] as const
export type Section = typeof SECTIONS[number]

export interface TeamComment {
  id: string
  authorName: string
  authorUserId: string
  body: string
  visibility: string
  stageTransition: string | null
  createdAt: string
}

export interface TeamTicket {
  id: string
  projectSlug: string
  title: string
  description: string
  creatorName: string
  creatorUserId: string
  assignee: string
  stage: Stage
  createdAt: string
  updatedAt: string
  comments: TeamComment[]
}

/** A member as the accounts endpoint returns one. display_name and email are
 *  null whenever identity_status is "missing", which happens for a member who
 *  was added by id before ever signing in. The screen has to survive that. */
export interface TeamMember {
  id: string
  user_id: string
  role: string
  base_role: string
  created_at: string
  display_name: string | null
  email: string | null
  identity_status: string
}

export interface TeamPerf {
  userId: string
  displayName: string | null
  email: string | null
  role: string
  analysesCompleted30d: number
  businessCount: number
  lastActiveAt: string | null
}

export interface TeamStats {
  activeMembers: number
  businessesManaged: number
  analysesCompleted30d: number
  weeklyAnalyses: number[]
  seatLimit: number | null
  planName: string | null
}

export interface TeamAssignment {
  id: string
  businessSlug: string
  businessName: string | null
  userId: string | null
  assigneeName: string | null
  assigneeEmail: string | null
  assignedAt: string
}

export interface TeamApproval {
  id: string
  businessSlug: string
  businessName?: string | null
  itemType: ItemType
  itemId: string
  title: string
  status: ApprovalStatus
  requestedBy: string
  requesterName?: string | null
  reviewedBy?: string | null
  reviewerName?: string | null
  reviewNote?: string | null
  reviewedAt?: string | null
  createdAt: string
}

export interface TeamGrant { userId: string; section: string }

export interface NotifyPrefs {
  reportReady: boolean
  mentionReceived: boolean
  approvalRequested: boolean
  approvalCompleted: boolean
}

export interface InviteLink {
  id: string
  token: string
  role: string
  url: string
  expiresAt: string | null
  createdAt: string
}

/** Everything the screen renders, fetched together. Kept as one object so a
 *  mutation can refresh the whole picture in one pass and no tab can drift
 *  out of step with another. */
export interface TeamData {
  accountId: string
  accountName: string
  members: TeamMember[]
  tickets: TeamTicket[]
  assignments: TeamAssignment[]
  approvals: TeamApproval[]
  grants: TeamGrant[]
  perf: TeamPerf[]
  stats: TeamStats | null
  prefs: NotifyPrefs | null
  invites: InviteLink[]
}

/* ---------------------------------------------------------------- fetch */

const base = (accountId: string) => '/portal/accounts/' + encodeURIComponent(accountId) + '/team'

/** A read that is allowed to come back empty. Several of these routes are
 *  fine to be missing on an older deployment, and one 404 should not blank
 *  the whole screen, so a failed read degrades to a neutral value. */
async function soft<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p } catch { return fallback }
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])

export async function fetchTeam(accountId: string, accountName: string): Promise<TeamData> {
  const b = base(accountId)
  const [members, tickets, assignments, approvals, grants, perf, stats, prefs, invites] = await Promise.all([
    soft(liveRoot<{ members?: TeamMember[] }>('/portal/accounts/' + encodeURIComponent(accountId) + '/members'), {}),
    soft(liveRoot<unknown>(b + '/tickets'), []),
    soft(liveRoot<unknown>(b + '/business-assignments'), []),
    soft(liveRoot<unknown>(b + '/approvals'), []),
    soft(liveRoot<unknown>(b + '/section-grants'), []),
    soft(liveRoot<unknown>(b + '/performance'), []),
    soft(liveRoot<TeamStats | null>(b + '/stats'), null),
    soft(liveRoot<NotifyPrefs | null>(b + '/notification-prefs'), null),
    soft(liveRoot<unknown>(b + '/invite-links'), [])
  ])
  return {
    accountId,
    accountName,
    members: arr<TeamMember>((members as { members?: TeamMember[] }).members),
    tickets: arr<TeamTicket>(tickets),
    assignments: arr<TeamAssignment>(assignments),
    approvals: arr<TeamApproval>(approvals),
    grants: arr<TeamGrant>(grants),
    perf: arr<TeamPerf>(perf),
    stats,
    prefs,
    invites: arr<InviteLink>(invites)
  }
}

/* ------------------------------------------------------------ mutations */

const send = <T>(path: string, method: string, body?: unknown) =>
  liveRoot<T>(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })

export const teamApi = {
  createTicket(a: string, f: { projectSlug: string; title: string; description: string; assignee: string; creatorName: string }) {
    return send<TeamTicket>(base(a) + '/tickets', 'POST', f)
  },
  patchTicket(a: string, id: string, f: Partial<{ stage: Stage; assignee: string; title: string; description: string }>) {
    return send<TeamTicket>(base(a) + '/tickets/' + encodeURIComponent(id), 'PATCH', f)
  },
  deleteTicket(a: string, id: string) {
    return send<unknown>(base(a) + '/tickets/' + encodeURIComponent(id), 'DELETE')
  },
  /** A comment can carry the stage move that prompted it. Sending both in one
   *  request is what keeps the ticket history readable: the note and the move
   *  it explains land together instead of as two unrelated events. */
  addTicketComment(a: string, id: string, f: { body: string; authorName: string; visibility?: string; stageTransition?: Stage; newStage?: Stage }) {
    return send<TeamComment>(base(a) + '/tickets/' + encodeURIComponent(id) + '/comments', 'POST', f)
  },
  assignBusiness(a: string, businessSlug: string, userId: string | null) {
    return send<TeamAssignment>(base(a) + '/business-assignments', 'POST', { businessSlug, userId })
  },
  requestApproval(a: string, f: { businessSlug: string; itemType: ItemType; itemId: string; title: string }) {
    return send<TeamApproval>(base(a) + '/approvals', 'POST', f)
  },
  decideApproval(a: string, id: string, status: ApprovalStatus, reviewNote: string) {
    return send<TeamApproval>(base(a) + '/approvals/' + encodeURIComponent(id), 'PATCH', { status, reviewNote })
  },
  setGrant(a: string, userId: string, section: string, granted: boolean) {
    return send<unknown>(base(a) + '/section-grants', 'POST', { userId, section, granted })
  },
  createInvite(a: string, role: InviteRole) {
    return send<InviteLink>(base(a) + '/invite-links', 'POST', { role })
  },
  revokeInvite(a: string, id: string) {
    return send<unknown>(base(a) + '/invite-links/' + encodeURIComponent(id), 'DELETE')
  },
  setPrefs(a: string, prefs: Partial<NotifyPrefs>) {
    return send<NotifyPrefs>(base(a) + '/notification-prefs', 'PATCH', prefs)
  }
}

/* -------------------------------------------------------------- helpers */

/** What to call a member. A member who has never signed in has no name and
 *  no email on record, so the honest answer is to say so rather than print
 *  a user id at someone. */
export function memberLabel(m: { display_name?: string | null; email?: string | null; identity_status?: string }): string {
  if (m.display_name) return m.display_name
  if (m.email) return m.email
  return 'Invited member'
}

export function initialsOf(name: string): string {
  const parts = name.split(' ').filter(Boolean)
  if (!parts.length) return '?'
  return parts.map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

/** A ticket's position through the four stages, used for the progress bar.
 *  With no checklist column there is nothing finer to measure by, so this
 *  reports stage position and nothing more. */
export function stageProgress(s: Stage): number {
  const i = STAGES.indexOf(s)
  return i < 0 ? 0 : Math.round((i / (STAGES.length - 1)) * 100)
}

export const isClosed = (t: { stage: Stage }) => t.stage === 'Closed'

export function parseTs(s: string | null | undefined): number {
  if (!s) return 0
  const n = new Date(s).getTime()
  return isFinite(n) ? n : 0
}

/** One activity feed, assembled from the timestamps the engine already
 *  keeps. There is no activity table, so rather than leave the tab empty or
 *  invent a log, this reads the real events back out of the real rows. */
export interface Event { id: string; ts: number; actor: string; kind: string; text: string }

export function buildActivity(d: TeamData): Event[] {
  const out: Event[] = []
  const nameOf = (userId: string | null | undefined): string => {
    if (!userId) return 'Someone'
    const m = d.members.find(x => x.user_id === userId)
    return m ? memberLabel(m) : 'Someone'
  }

  d.tickets.forEach(t => {
    out.push({
      id: 'tc-' + t.id, ts: parseTs(t.createdAt),
      actor: t.creatorName || nameOf(t.creatorUserId), kind: 'ticket',
      text: 'opened "' + t.title + '"'
    })
    t.comments.forEach(c => {
      out.push({
        id: 'cm-' + c.id, ts: parseTs(c.createdAt),
        actor: c.authorName || nameOf(c.authorUserId),
        kind: c.stageTransition ? 'stage' : 'comment',
        text: c.stageTransition
          ? 'moved "' + t.title + '" to ' + c.stageTransition
          : 'commented on "' + t.title + '"'
      })
    })
  })

  d.assignments.forEach(a => out.push({
    id: 'as-' + a.id, ts: parseTs(a.assignedAt), actor: a.assigneeName || 'Someone',
    kind: 'assign', text: 'took on ' + (a.businessName || a.businessSlug)
  }))

  d.approvals.forEach(a => {
    out.push({
      id: 'ap-' + a.id, ts: parseTs(a.createdAt), actor: a.requesterName || nameOf(a.requestedBy),
      kind: 'approval', text: 'requested approval for "' + a.title + '"'
    })
    if (a.reviewedAt) out.push({
      id: 'ad-' + a.id, ts: parseTs(a.reviewedAt), actor: a.reviewerName || nameOf(a.reviewedBy),
      kind: 'approval', text: (a.status === 'approved' ? 'approved' : 'ruled on') + ' "' + a.title + '"'
    })
  })

  return out.filter(e => e.ts > 0).sort((a, b) => b.ts - a.ts)
}
