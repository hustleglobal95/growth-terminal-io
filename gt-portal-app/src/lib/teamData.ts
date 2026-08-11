/** Roles and what they can reach.
 *
 *  This file used to hold the whole Teams feature in browser storage. It no
 *  longer does: members, tickets, comments, assignments and approvals are all
 *  live now and live in teamLive.ts. What is left here is the one part of
 *  Teams the engine cannot answer yet.
 *
 *  The engine knows two roles on a member row, owner and member, and will
 *  hand out three on an invite link, admin, member and viewer. This product
 *  has five, and the extra two, Analyst and Editor, control which parts of an
 *  analysis a teammate can open. There is no column for that, so the role a
 *  person has been given is remembered in this browser, per workspace, and
 *  the analysis pages read it from here.
 *
 *  That is a real limit and the screen says so out loud rather than implying
 *  the choice is shared with the team. Once the members table carries a
 *  portal role, this file collapses into a lookup against it and nothing
 *  above it has to change.
 */
import { getWorkspaceId } from './api'

export type Role = 'Owner' | 'Admin' | 'Analyst' | 'Editor' | 'Viewer'
export const ROLES: Role[] = ['Owner', 'Admin', 'Analyst', 'Editor', 'Viewer']

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

/** The signed in user, kept under this name because the plan ledger records
 *  commits against it. */
export const ME = 'me'

export const uid = () => Math.random().toString(36).slice(2, 10)

/** Everything this file still stores: which portal role each member has been
 *  given, and whether the owner is previewing the portal as someone else. */
interface RoleStore { roles: Record<string, Role>; viewAs: Role | null }

const KEY = (ws: string) => 'gt_roles_' + ws

function read(): RoleStore {
  const ws = getWorkspaceId() || 'default'
  try {
    const raw = localStorage.getItem(KEY(ws))
    if (raw) {
      const v = JSON.parse(raw) as RoleStore
      return { roles: v.roles || {}, viewAs: v.viewAs || null }
    }
  } catch { /* fall through */ }
  return { roles: {}, viewAs: null }
}

function write(v: RoleStore) {
  const ws = getWorkspaceId() || 'default'
  try { localStorage.setItem(KEY(ws), JSON.stringify(v)) } catch { /* storage full */ }
}

/** The role a member has, defaulting from what the engine does know. An
 *  account owner is the Owner. Everyone else starts as a Viewer, the role
 *  that can see least, because guessing generously would hand out access
 *  nobody asked for. */
export function roleOf(userId: string, engineRole: string): Role {
  if ((engineRole || '').toLowerCase() === 'owner') return 'Owner'
  const stored = read().roles[userId]
  return stored || 'Viewer'
}

export function setRoleOf(userId: string, role: Role) {
  const v = read()
  v.roles[userId] = role
  write(v)
}

export function viewAs(): Role | null { return read().viewAs }
export function setViewAs(r: Role | null) {
  const v = read()
  v.viewAs = r
  write(v)
}

/** The role whose permissions currently apply: the preview role when the
 *  owner is checking what a teammate would see, otherwise Owner, since the
 *  only person who can reach this portal today is the account owner. */
export function effectiveRole(): Role {
  return read().viewAs || 'Owner'
}

/** Analysis access for the current effective role, readable without React.
 *  The analysis detail page calls this to gate its sections. */
export function analysisAccess(): Perms['analysis'] & { role: Role; previewing: boolean } {
  const role = effectiveRole()
  const previewing = read().viewAs !== null
  return { ...PERMS[role].analysis, role, previewing }
}
