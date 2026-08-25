/**
 * What the portal remembers between visits.
 *
 * A tool somebody opens every morning has to know two things a tool somebody
 * opens once does not: which handful of objects that person keeps coming back
 * to, and what has moved since they last looked. Neither is in the engine,
 * because neither is a fact about the business. They are facts about one
 * person at one browser, so they live here.
 *
 * Everything is scoped to the workspace. Two workspaces open in two tabs must
 * not bleed their recents into each other, and a person who signs out and back
 * in as somebody else should not inherit a stranger's history.
 *
 * Every read and write is wrapped, because private mode throws on access
 * rather than returning null, and a lost recents list is never worth an error.
 */
import { getWorkspaceId } from './api'

export interface RecentItem {
  id: string
  title: string
  qualifier: string
  seenAt: number
}

const RECENT_LIMIT = 6

function key(kind: string): string {
  const ws = getWorkspaceId() || 'none'
  return 'gt.' + kind + '.' + ws
}

function read<T>(kind: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(kind))
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return parsed == null ? fallback : (parsed as T)
  } catch {
    return fallback
  }
}

function write(kind: string, value: unknown): void {
  try { localStorage.setItem(key(kind), JSON.stringify(value)) } catch { /* private mode */ }
}

/** The analyses this person actually opened, newest first, deduped by id.
 *  Recording happens on open rather than on hover or on render, because a
 *  thing you glanced past is not a thing you were working on. */
export function recordRecent(item: Omit<RecentItem, 'seenAt'>): void {
  if (!item.id) return
  const next = [{ ...item, seenAt: Date.now() }, ...recents().filter(r => r.id !== item.id)]
  write('recent', next.slice(0, RECENT_LIMIT))
}

export function recents(): RecentItem[] {
  const list = read<RecentItem[]>('recent', [])
  return Array.isArray(list) ? list.filter(r => r && r.id && r.title) : []
}

export function clearRecents(): void {
  write('recent', [])
}

/** When this person last opened the portal, as a timestamp, or null the first
 *  time. Null is a real answer and the interface says so rather than pretending
 *  that everything is new. */
export function lastSeen(): number | null {
  const v = read<number | null>('lastseen', null)
  return typeof v === 'number' && v > 0 ? v : null
}

/** Stamped once per session, after the overview has had a chance to report
 *  against the previous stamp. Stamping on every render would make the
 *  window zero and the answer permanently "nothing changed". */
let stamped = false
export function stampSeen(): void {
  if (stamped) return
  stamped = true
  write('lastseen', Date.now())
}

/** How long ago, in the shortest phrase that is still true. */
export function ago(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago')
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return hrs + (hrs === 1 ? ' hour ago' : ' hours ago')
  const days = Math.floor(hrs / 24)
  if (days < 7) return days + (days === 1 ? ' day ago' : ' days ago')
  const wks = Math.floor(days / 7)
  return wks + (wks === 1 ? ' week ago' : ' weeks ago')
}
