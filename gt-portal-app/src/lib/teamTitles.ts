/** THE TITLE CATALOG, THE PERMISSION BUCKETS, AND THE SEAT MATH.
 *
 *  Transcribed from the implementation directive and nothing else. Every title
 *  below appears in the directive; nothing here was added, renamed, merged or
 *  inferred. If a title is missing from this file it is missing from the
 *  product, and the fix is to change the directive first.
 *
 *  WHY THIS IS ONE FILE AND WHY IT IS DATA.
 *
 *  The same catalog has to be true in two places: this portal, which draws the
 *  picker, and the engine, which is the only thing that can actually stop
 *  somebody doing something. Two hand-maintained copies drift, and the way you
 *  discover the drift is a Viewer completing a ticket. So this is written as
 *  flat data with no behaviour in it, ready to be the single source both sides
 *  read.
 *
 *  A WARNING THAT BELONGS AT THE TOP OF THIS FILE.
 *
 *  Nothing in here enforces anything. This bundle is downloaded by the browser
 *  and readable by anyone who opens devtools, so every check built on it is a
 *  courtesy to the honest and an inconvenience to nobody else. The directive's
 *  acceptance checks are all of the form "X cannot do Y", and that sentence is
 *  only true when the engine refuses the request. Until then this file draws
 *  the right screen and makes no promises about access.
 */

// ── Buckets ─────────────────────────────────────────────────────────────────

/** The nine buckets from the directive. No more in v1. */
export type Bucket =
  | 'org'
  | 'team_admin'
  | 'tickets_full'
  | 'tickets_complete'
  | 'tickets_comment'
  | 'intel_write'
  | 'intel_read'
  | 'assets_write'
  | 'view'

export const BUCKETS: { id: Bucket; means: string }[] = [
  { id: 'org', means: 'Edit the tree, invite, assign titles, seats, billing' },
  { id: 'team_admin', means: 'Assign tickets on this node and its children, mention by title, manage members on the node' },
  { id: 'tickets_full', means: 'Create, assign, claim, complete, comment' },
  { id: 'tickets_complete', means: 'Claim and complete what is assigned, and comment' },
  { id: 'tickets_comment', means: 'Comment only' },
  { id: 'intel_write', means: 'View and edit intelligence, strategy and forecast objects on the node' },
  { id: 'intel_read', means: 'View intelligence on the node' },
  { id: 'assets_write', means: 'Upload and edit assets on the node' },
  { id: 'view', means: 'See the node directory and the tickets allowed to them' },
]

// ── Titles ──────────────────────────────────────────────────────────────────

export type TitleId = string

export interface Title {
  id: TitleId
  name: string
  category: string
  buckets: Bucket[]
  /** Owner only. Held by the paying account, never offered in the picker. */
  system?: true
  /** Extra rights the directive names in prose rather than as a bucket. Kept
   *  as flags rather than invented buckets, because the directive says not to
   *  add buckets in v1. */
  canWatch?: true
  canApprove?: true
  /** Scope note the directive attaches to this title, shown in the picker so
   *  the person choosing knows what they are handing out. */
  scope?: string
}

/* The bucket sets, named once so a change lands on every title that shares it
   rather than on whichever ones somebody remembered. */
const LEAD: Bucket[] = ['team_admin', 'tickets_full', 'intel_write', 'assets_write', 'view']
const STRATEGY: Bucket[] = ['tickets_full', 'intel_write', 'assets_write', 'view']
const ANALYSIS: Bucket[] = ['tickets_complete', 'intel_write', 'assets_write', 'view']
const CRAFT_LEAD: Bucket[] = ['tickets_full', 'intel_read', 'assets_write', 'view']
const CRAFT: Bucket[] = ['tickets_complete', 'intel_read', 'assets_write', 'view']
const REVIEW: Bucket[] = ['tickets_comment', 'intel_read', 'view']
const WATCH: Bucket[] = ['view', 'tickets_comment']

export const TITLES: Title[] = [
  // Leadership
  {
    id: 'owner', name: 'Owner', category: 'Leadership', system: true,
    buckets: ['org', 'team_admin', 'tickets_full', 'tickets_complete', 'tickets_comment',
      'intel_write', 'intel_read', 'assets_write', 'view'],
    canWatch: true, canApprove: true,
    scope: 'The paying account. Account wide, and not assignable.',
  },
  { id: 'team-lead', name: 'Team Lead', category: 'Leadership', buckets: LEAD, canApprove: true, scope: 'This node and its children.' },
  { id: 'operations-lead', name: 'Operations Lead', category: 'Leadership', buckets: LEAD, canApprove: true, scope: 'This node and its children.' },
  { id: 'account-lead', name: 'Account Lead', category: 'Leadership', buckets: LEAD, canApprove: true, scope: 'This node and its children.' },

  // Strategy
  { id: 'strategist', name: 'Strategist', category: 'Strategy', buckets: STRATEGY },
  { id: 'growth-strategist', name: 'Growth Strategist', category: 'Strategy', buckets: STRATEGY },
  { id: 'brand-strategist', name: 'Brand Strategist', category: 'Strategy', buckets: STRATEGY },
  { id: 'offer-strategist', name: 'Offer Strategist', category: 'Strategy', buckets: STRATEGY },

  // Intelligence and analysis
  { id: 'analyst', name: 'Analyst', category: 'Intelligence and analysis', buckets: ANALYSIS },
  { id: 'data-analyst', name: 'Data Analyst', category: 'Intelligence and analysis', buckets: ANALYSIS },
  { id: 'researcher', name: 'Researcher', category: 'Intelligence and analysis', buckets: ANALYSIS },
  /* Insights Lead sits in this category but the directive maps it with the
     Strategy titles, so it carries tickets_full rather than tickets_complete. */
  { id: 'insights-lead', name: 'Insights Lead', category: 'Intelligence and analysis', buckets: STRATEGY },

  // Content
  { id: 'content-lead', name: 'Content Lead', category: 'Content', buckets: CRAFT_LEAD },
  { id: 'writer', name: 'Writer', category: 'Content', buckets: CRAFT },
  { id: 'editor', name: 'Editor', category: 'Content', buckets: CRAFT },
  { id: 'ghostwriter', name: 'Ghostwriter', category: 'Content', buckets: CRAFT },
  { id: 'community-manager', name: 'Community Manager', category: 'Content', buckets: CRAFT },

  // Acquisition and outbound
  { id: 'growth-operator', name: 'Growth Operator', category: 'Acquisition and outbound', buckets: CRAFT_LEAD },
  { id: 'outbound-lead', name: 'Outbound Lead', category: 'Acquisition and outbound', buckets: CRAFT_LEAD },
  { id: 'outreach-specialist', name: 'Outreach Specialist', category: 'Acquisition and outbound', buckets: CRAFT },
  { id: 'partnerships', name: 'Partnerships', category: 'Acquisition and outbound', buckets: CRAFT },

  // Creative
  { id: 'designer', name: 'Designer', category: 'Creative', buckets: CRAFT },
  { id: 'creative-lead', name: 'Creative Lead', category: 'Creative', buckets: CRAFT_LEAD },
  { id: 'video-editor', name: 'Video Editor', category: 'Creative', buckets: CRAFT },

  // Client and review
  { id: 'client-partner', name: 'Client Partner', category: 'Client and review', buckets: REVIEW, canWatch: true, scope: 'Can be added as a watcher.' },
  { id: 'reviewer', name: 'Reviewer', category: 'Client and review', buckets: REVIEW, canApprove: true, scope: 'Can approve where a ticket has an approve step.' },
  { id: 'approver', name: 'Approver', category: 'Client and review', buckets: REVIEW, canApprove: true, scope: 'Can approve where a ticket has an approve step.' },
  { id: 'stakeholder', name: 'Stakeholder', category: 'Client and review', buckets: WATCH, scope: 'Comments only on tickets shared with them.' },

  // Execution and support
  { id: 'operator', name: 'Operator', category: 'Execution and support', buckets: CRAFT },
  { id: 'coordinator', name: 'Coordinator', category: 'Execution and support', buckets: CRAFT },
  { id: 'specialist', name: 'Specialist', category: 'Execution and support', buckets: CRAFT },
  { id: 'contractor', name: 'Contractor', category: 'Execution and support', buckets: CRAFT },

  // Access only
  { id: 'viewer', name: 'Viewer', category: 'Access only', buckets: WATCH, scope: 'Comments only on tickets shared with them.' },
  { id: 'guest', name: 'Guest', category: 'Access only', buckets: WATCH, scope: 'The single node or ticket they were added to, and nothing else.' },
]

/** Categories in the directive's order. Derived rather than listed twice, so
 *  a title added to a new category cannot go missing from the picker. */
export function categories(): string[] {
  const seen: string[] = []
  for (const t of TITLES) if (!seen.includes(t.category)) seen.push(t.category)
  return seen
}

/** What the picker is allowed to offer. Owner is held by the paying account
 *  and is never on this list. */
export function assignable(): Title[] {
  return TITLES.filter(t => !t.system)
}

export function titleById(id: TitleId): Title | null {
  return TITLES.find(t => t.id === id) || null
}

export function hasBucket(id: TitleId, b: Bucket): boolean {
  const t = titleById(id)
  return t ? t.buckets.includes(b) : false
}

/** Whether a title may finish a ticket. Written as its own question because
 *  it is the one the directive's acceptance checks name, and because two
 *  different buckets grant it. */
export function canComplete(id: TitleId): boolean {
  return hasBucket(id, 'tickets_full') || hasBucket(id, 'tickets_complete')
}

// ── Seats ───────────────────────────────────────────────────────────────────

export const SEATS_INCLUDED = 10
export const SEATS_OVERFLOW = 5
export const SEATS_MAX = SEATS_INCLUDED + SEATS_OVERFLOW

/** A seat is a person, not a title and not a node. Somebody sitting on three
 *  nodes with three titles is one seat, which is why this counts distinct
 *  member ids and nothing else. */
export function seatsUsed(activeMemberIds: string[]): number {
  return new Set(activeMemberIds).size
}

export type InviteBlock = 'ok' | 'needs_overflow' | 'full'

/** Whether another person can be invited. Three answers, because "no" has two
 *  different meanings and only one of them has a button attached. */
export function inviteState(used: number, overflowEnabled: boolean): InviteBlock {
  if (used >= SEATS_MAX) return 'full'
  if (used >= SEATS_INCLUDED && !overflowEnabled) return 'needs_overflow'
  return 'ok'
}

export function seatCeiling(overflowEnabled: boolean): number {
  return overflowEnabled ? SEATS_MAX : SEATS_INCLUDED
}

/** Directive copy, verbatim. Kept here rather than in the screen so the two
 *  cannot drift and so a reviewer can check it against the document. */
export const COPY = {
  emptyTree: 'You’re the owner of this workspace. Build the team tree, then invite up to 10 people. Assign each person a title so everyone knows who can take which work.',
  atTen: 'All 10 seats are in use. Add 5 more seats or remove someone before you invite.',
  atFifteen: 'All 15 seats are in use. Remove someone before you invite.',
  picker: 'Choose a title from a category. Titles control who can see and complete work on this team.',
} as const

// ── The tree ────────────────────────────────────────────────────────────────

export interface TeamNode {
  id: string
  name: string
  /** Null for the root. The directive requires one root per account. */
  parentId: string | null
  archived: boolean
}

export interface TitleAssignment {
  memberId: string
  teamNodeId: string
  titleId: TitleId
}

/** Depth of a node, root being 1. The directive asks for at least three levels
 *  and does not require more than four, so this exists to be checked against
 *  rather than to be enforced silently. */
export const MAX_DEPTH = 4

export function depthOf(nodeId: string, nodes: TeamNode[]): number {
  let d = 1
  let cur = nodes.find(n => n.id === nodeId)
  const guard = new Set<string>()
  while (cur && cur.parentId) {
    if (guard.has(cur.id)) return d
    guard.add(cur.id)
    cur = nodes.find(n => n.id === cur!.parentId)
    d++
  }
  return d
}

/** Every descendant of a node, itself included. Parent leads see child work by
 *  default, and this is the set that means. */
export function withDescendants(nodeId: string, nodes: TeamNode[]): string[] {
  const out = [nodeId]
  for (let i = 0; i < out.length; i++) {
    for (const n of nodes) {
      if (n.parentId === out[i] && !out.includes(n.id)) out.push(n.id)
    }
  }
  return out
}
