/** THE TEAM TREE, AND WHERE IT LIVES.
 *
 *  The structure half of the Teams directive: nodes, who sits on them, and
 *  what title they hold there. The catalog and the seat math are in
 *  teamTitles.ts; this file is storage and the operations on the shape.
 *
 *  WHERE IT IS KEPT, AND WHY THAT IS SAID OUT LOUD.
 *
 *  The engine has no route for any of this. It serves members, tickets,
 *  approvals, section grants and invite links, and there is no node table, no
 *  title assignment, and no team_node_id on a ticket. So until those exist the
 *  tree is held in the owner's browser.
 *
 *  That is a real limitation and not a detail: a structure whose whole purpose
 *  is that everybody can see who sits where does not work when only one
 *  machine can see it. The screen states this rather than implying the team
 *  can already read it. The day the routes land, `treeLive()` flips and the
 *  two functions at the bottom are the only ones that change.
 *
 *  AND WHAT THIS FILE DOES NOT DO.
 *
 *  It does not enforce. Buckets decide what a screen draws, never what a
 *  request is allowed to do, because this bundle is readable by anyone with
 *  devtools. Every "cannot" in the directive is the engine's to keep.
 */

import { TEAM_TREE_PATH } from '../config'
import type { TeamNode, TitleAssignment, TitleId } from './teamTitles'
import { withDescendants } from './teamTitles'

/** Whether the engine stores the tree yet. */
export function treeLive(): boolean {
  return TEAM_TREE_PATH.length > 0
}

export interface Tree {
  nodes: TeamNode[]
  titles: TitleAssignment[]
  /** Owner has turned on the five overflow seats. */
  overflow: boolean
}

export const EMPTY: Tree = { nodes: [], titles: [], overflow: false }

/** The default node the directive requires when no tree has been built: one
 *  root named after the account, so existing flat Teams and tickets keep
 *  working and every ticket has a node to belong to. */
export function withRoot(t: Tree, accountName: string): Tree {
  if (t.nodes.some(n => n.parentId === null && !n.archived)) return t
  return {
    ...t,
    nodes: [{ id: 'root', name: accountName || 'Workspace', parentId: null, archived: false }, ...t.nodes],
  }
}

export function rootOf(t: Tree): TeamNode | null {
  return t.nodes.find(n => n.parentId === null && !n.archived) || null
}

export function childrenOf(t: Tree, parentId: string | null): TeamNode[] {
  return t.nodes.filter(n => n.parentId === parentId && !n.archived)
}

/** Members sitting on a node, with the title they hold there. One title per
 *  member per node, which is what the directive specifies. */
export function seatedOn(t: Tree, nodeId: string): TitleAssignment[] {
  return t.titles.filter(a => a.teamNodeId === nodeId)
}

/** Every node a member sits on. A person on three nodes appears three times
 *  here and still counts as one seat, which is the point. */
export function nodesFor(t: Tree, memberId: string): TitleAssignment[] {
  return t.titles.filter(a => a.memberId === memberId)
}

/** Distinct people with a title anywhere. This is the seat count. */
export function seatedMembers(t: Tree): string[] {
  return Array.from(new Set(t.titles.map(a => a.memberId)))
}

// ── Operations ──────────────────────────────────────────────────────────────

let seq = 0
const newId = () => 'n' + Date.now().toString(36) + (seq++).toString(36)

export function addNode(t: Tree, name: string, parentId: string | null): Tree {
  return { ...t, nodes: [...t.nodes, { id: newId(), name, parentId, archived: false }] }
}

export function renameNode(t: Tree, id: string, name: string): Tree {
  return { ...t, nodes: t.nodes.map(n => (n.id === id ? { ...n, name } : n)) }
}

/** Archiving hides a node from the live tree. Tickets and history stay
 *  attached to it, so this never deletes and never reparents children: they
 *  go with it, which is what "archive the branch" means to a reader. */
export function archiveNode(t: Tree, id: string): Tree {
  const branch = withDescendants(id, t.nodes)
  return { ...t, nodes: t.nodes.map(n => (branch.includes(n.id) ? { ...n, archived: true } : n)) }
}

/** Moving a node under a new parent. Refuses to make a node its own ancestor,
 *  which is the one move that turns the tree into a ring and the render into
 *  an infinite loop. */
export function moveNode(t: Tree, id: string, parentId: string | null): Tree {
  if (id === parentId) return t
  if (parentId && withDescendants(id, t.nodes).includes(parentId)) return t
  return { ...t, nodes: t.nodes.map(n => (n.id === id ? { ...n, parentId } : n)) }
}

/** One title per member per node: assigning replaces rather than stacks. */
export function assignTitle(t: Tree, memberId: string, teamNodeId: string, titleId: TitleId): Tree {
  const rest = t.titles.filter(a => !(a.memberId === memberId && a.teamNodeId === teamNodeId))
  return { ...t, titles: [...rest, { memberId, teamNodeId, titleId }] }
}

/** Taking somebody off a node revokes that node's title immediately. The
 *  directive also reassigns their open tickets on that node, which is the
 *  engine's job because tickets do not carry a node yet. */
export function removeFromNode(t: Tree, memberId: string, teamNodeId: string): Tree {
  return { ...t, titles: t.titles.filter(a => !(a.memberId === memberId && a.teamNodeId === teamNodeId)) }
}

/** Removing a person from the account frees their seat and takes every title
 *  they held anywhere. */
export function removeMember(t: Tree, memberId: string): Tree {
  return { ...t, titles: t.titles.filter(a => a.memberId !== memberId) }
}

// ── Storage ─────────────────────────────────────────────────────────────────

/* Per account, so switching workspaces does not show the wrong tree. Both of
   these become engine calls the day the routes exist, and nothing above this
   line changes when they do. */
const key = (accountId: string) => 'gt.teamtree.' + accountId

export function readTree(accountId: string): Tree {
  try {
    const raw = window.localStorage.getItem(key(accountId))
    if (!raw) return EMPTY
    const p = JSON.parse(raw)
    return {
      nodes: Array.isArray(p.nodes) ? p.nodes : [],
      titles: Array.isArray(p.titles) ? p.titles : [],
      overflow: p.overflow === true,
    }
  } catch {
    return EMPTY
  }
}

export function writeTree(accountId: string, t: Tree): void {
  try {
    window.localStorage.setItem(key(accountId), JSON.stringify(t))
  } catch {
    /* Private browsing or full storage. The screen keeps working for this
       session and the shape is simply not remembered. */
  }
}
