/** Teams data layer. Everything here is real, working state, persisted per
 *  workspace in the browser (localStorage) until the backend grows team
 *  routes. The shapes mirror the future API one to one so wiring later is a
 *  swap of load and save, not a rebuild. No fake teammates are seeded: the
 *  workspace starts with its real owner and one onboarding ticket. */
import { getWorkspaceId } from './api'

export type Role = 'Owner' | 'Admin' | 'Analyst' | 'Editor' | 'Viewer'
export type Stage = 'Backlog' | 'In progress' | 'Review' | 'Approval' | 'Done'
export type Priority = 'Low' | 'Medium' | 'High' | 'Urgent'

export const ROLES: Role[] = ['Owner', 'Admin', 'Analyst', 'Editor', 'Viewer']
export const STAGES: Stage[] = ['Backlog', 'In progress', 'Review', 'Approval', 'Done']
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High', 'Urgent']

/** What each role can do, and which parts of an analysis it can open.
 *  This matrix is the single source of truth: the Teams screen renders it
 *  and the analysis detail page enforces it. */
export interface Perms {
  manageTeam: boolean
  assign: boolean
  approve: boolean
  comment: boolean
  analysis: { diagnosis: boolean; evidence: boolean; financials: boolean; plan: boolean }
}
export const PERMS: Record<Role, Perms> = {
  Owner:   { manageTeam: true,  assign: true,  approve: true,  comment: true,
             analysis: { diagnosis: true, evidence: true, financials: true, plan: true } },
  Admin:   { manageTeam: true,  assign: true,  approve: true,  comment: true,
             analysis: { diagnosis: true, evidence: true, financials: true, plan: true } },
  Analyst: { manageTeam: false, assign: true,  approve: false, comment: true,
             analysis: { diagnosis: true, evidence: true, financials: false, plan: true } },
  Editor:  { manageTeam: false, assign: false, approve: false, comment: true,
             analysis: { diagnosis: true, evidence: false, financials: false, plan: true } },
  Viewer:  { manageTeam: false, assign: false, approve: false, comment: false,
             analysis: { diagnosis: true, evidence: false, financials: false, plan: false } }
}

export interface Member {
  id: string; name: string; email: string; role: Role; title: string
  status: 'Active' | 'Invited'; addedAt: number
}
export interface CheckItem { id: string; t: string; done: boolean }
export interface Comment { id: string; author: string; ts: number; text: string }
export interface Ticket {
  id: string; code: string; title: string; desc: string; business: string
  analysisId: string; assignee: string; reporter: string; priority: Priority
  stage: Stage; due: string; tags: string[]; checklist: CheckItem[]
  comments: Comment[]; watchers: string[]; createdAt: number; updatedAt: number
}
export interface Approval {
  id: string; subject: string; ticketId: string; requestedBy: string
  approver: string; status: 'Pending' | 'Approved' | 'Changes requested'
  note: string; ts: number; decidedAt: number | null
}
export interface Assignment {
  id: string; business: string; lead: string; memberIds: string[]
  status: 'Active' | 'Onboarding' | 'Paused'; notes: string; createdAt: number
}
export interface Thread {
  id: string; title: string; ticketId: string; createdBy: string
  createdAt: number; comments: Comment[]
}
export interface Activity { id: string; ts: number; actor: string; kind: string; text: string }

export interface TeamState {
  members: Member[]; tickets: Ticket[]; approvals: Approval[]
  assignments: Assignment[]; threads: Thread[]; activity: Activity[]
  viewAs: Role | null; nextCode: number
}

export const uid = () => Math.random().toString(36).slice(2, 10)
const KEY = (ws: string) => 'gt_team_' + ws

/** The signed in user is the seeded owner: member id 'me', everywhere. */
export const ME = 'me'

function seed(ownerName: string, ownerEmail: string): TeamState {
  const now = Date.now()
  const t: Ticket = {
    id: uid(), code: 'GT-101', title: 'Set up your team',
    desc: 'This ticket shows how work moves here. Advance it through the stages, tick the checklist, and leave a comment. Delete it when the team is rolling.',
    business: '', analysisId: '', assignee: ME, reporter: ME, priority: 'Medium',
    stage: 'Backlog', due: '', tags: ['onboarding'],
    checklist: [
      { id: uid(), t: 'Invite a teammate and pick their role', done: false },
      { id: uid(), t: 'Assign a business to someone', done: false },
      { id: uid(), t: 'Move this ticket through a stage', done: false }
    ],
    comments: [], watchers: [ME], createdAt: now, updatedAt: now
  }
  return {
    members: [{ id: ME, name: ownerName, email: ownerEmail, role: 'Owner', title: 'Founder', status: 'Active', addedAt: now }],
    tickets: [t], approvals: [], assignments: [], threads: [],
    activity: [{ id: uid(), ts: now, actor: ownerName, kind: 'team', text: 'created the workspace team' }],
    viewAs: null, nextCode: 102
  }
}

export function loadTeam(ownerName: string, ownerEmail: string): TeamState {
  const ws = getWorkspaceId() || 'default'
  try {
    const raw = localStorage.getItem(KEY(ws))
    if (raw) {
      const st = JSON.parse(raw) as TeamState
      // Owner identity follows the live session once it resolves.
      const own = st.members.find(m => m.id === ME)
      if (own && ownerName && own.name !== ownerName && ownerName !== 'Workspace owner') {
        own.name = ownerName; saveTeam(st)
      }
      return st
    }
  } catch { /* fall through to seed */ }
  const st = seed(ownerName || 'Workspace owner', ownerEmail)
  saveTeam(st)
  return st
}

export function saveTeam(st: TeamState) {
  const ws = getWorkspaceId() || 'default'
  try { localStorage.setItem(KEY(ws), JSON.stringify(st)) } catch { /* storage full */ }
}

/** Push an activity line. Call inside every mutation so anyone can pick up
 *  any project with full context from the Activity tab. */
export function act(st: TeamState, actorId: string, kind: string, text: string) {
  const actor = st.members.find(m => m.id === actorId)
  st.activity.unshift({ id: uid(), ts: Date.now(), actor: actor ? actor.name : 'Someone', kind, text })
  if (st.activity.length > 400) st.activity.length = 400
}

export function memberName(st: TeamState, id: string): string {
  const m = st.members.find(x => x.id === id)
  return m ? m.name : 'Unassigned'
}
export function initialsOf(name: string): string {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '·'
}

/** Ticket completion: checklist ratio when present, stage position otherwise. */
export function progressOf(t: Ticket): number {
  if (t.stage === 'Done') return 100
  if (t.checklist.length) {
    const done = t.checklist.filter(c => c.done).length
    return Math.round((done / t.checklist.length) * 90)
  }
  return [0, 35, 65, 85, 100][STAGES.indexOf(t.stage)] || 0
}

/** The role whose permissions currently apply: the preview role when the
 *  owner is checking what a teammate would see, otherwise the signed in
 *  member's real role. */
export function effectiveRole(st: TeamState): Role {
  if (st.viewAs) return st.viewAs
  const own = st.members.find(m => m.id === ME)
  return own ? own.role : 'Owner'
}

/** Analysis access for the current effective role, readable without React.
 *  The analysis detail page calls this to gate its sections. */
export function analysisAccess(): Perms['analysis'] & { role: Role; previewing: boolean } {
  try {
    const ws = getWorkspaceId() || 'default'
    const raw = localStorage.getItem(KEY(ws))
    if (raw) {
      const st = JSON.parse(raw) as TeamState
      const role = effectiveRole(st)
      return { ...PERMS[role].analysis, role, previewing: !!st.viewAs }
    }
  } catch { /* default open for the owner below */ }
  return { diagnosis: true, evidence: true, financials: true, plan: true, role: 'Owner', previewing: false }
}
