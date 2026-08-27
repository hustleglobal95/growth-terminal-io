/** WHERE THE NOTES LIVE.
 *
 *  In this browser, in IndexedDB, and nowhere else. That is a real limit and it
 *  is stated on the screen rather than left for somebody to discover when they
 *  open the portal on their phone and find an empty list. It is also the only
 *  honest option today: there is no notes route on the engine, and a note that
 *  claims to sync while sitting in one browser is worse than one that says
 *  plainly where it is.
 *
 *  Attachments are kept as blobs beside the note rather than as base64 inside
 *  it, so a dropped PDF costs its own size rather than a third more, and a
 *  large one does not take the note record down with it.
 *
 *  Everything is scoped to the person and the workspace it was written in. A
 *  browser that has signed two people in must not show one of them the other's
 *  notes, and a workspace switch is a different desk.
 */

const DB = 'gt-notes'
const VERSION = 1
const NOTES = 'notes'
const BLOBS = 'blobs'

export interface NoteFile {
  id: string
  name: string
  size: number
  type: string
  /** False when the file itself could not be kept, so the screen can say the
   *  note remembers the name and not the contents. */
  stored: boolean
}

export interface Note {
  id: string
  scope: string
  title: string
  /** What was said or typed, kept verbatim. The shaped view is derived from
   *  this every time rather than stored, so a change to the rules improves
   *  every old note instead of only new ones. */
  raw: string
  files: NoteFile[]
  createdAt: number
  updatedAt: number
}

/** Anything above this and the browser starts refusing writes on some devices,
 *  so it is refused here with a reason instead. */
export const MAX_FILE = 25 * 1024 * 1024

let open: Promise<IDBDatabase> | null = null

function db(): Promise<IDBDatabase> {
  if (open) return open
  open = new Promise((res, rej) => {
    const req = indexedDB.open(DB, VERSION)
    req.onupgradeneeded = () => {
      const d = req.result
      if (!d.objectStoreNames.contains(NOTES)) {
        const s = d.createObjectStore(NOTES, { keyPath: 'id' })
        s.createIndex('scope', 'scope')
      }
      if (!d.objectStoreNames.contains(BLOBS)) d.createObjectStore(BLOBS)
    }
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error || new Error('Notes storage is unavailable in this browser.'))
  })
  return open
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result)
    req.onerror = () => rej(req.error || new Error('Notes storage refused the write.'))
  })
}

export const scopeOf = (user: string | null, workspace: string | null) =>
  (user || 'anon') + ':' + (workspace || 'none')

export const newId = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8)

export async function listNotes(scope: string): Promise<Note[]> {
  const d = await db()
  const tx = d.transaction(NOTES, 'readonly')
  const rows = await done<Note[]>(tx.objectStore(NOTES).index('scope').getAll(scope) as IDBRequest<Note[]>)
  return rows.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function saveNote(note: Note): Promise<void> {
  const d = await db()
  const tx = d.transaction(NOTES, 'readwrite')
  await done(tx.objectStore(NOTES).put(note))
}

export async function deleteNote(note: Note): Promise<void> {
  const d = await db()
  const tx = d.transaction([NOTES, BLOBS], 'readwrite')
  const blobs = tx.objectStore(BLOBS)
  for (const f of note.files) blobs.delete(f.id)
  await done(tx.objectStore(NOTES).delete(note.id))
}

/** Puts a dropped file beside the note. Returns the record either way: a file
 *  too large to keep is still recorded by name, marked as not stored, so the
 *  note does not silently lose it. */
export async function putFile(file: File): Promise<NoteFile> {
  const rec: NoteFile = {
    id: newId(), name: file.name, size: file.size,
    type: file.type || 'application/octet-stream', stored: false
  }
  if (file.size > MAX_FILE) return rec
  try {
    const d = await db()
    const tx = d.transaction(BLOBS, 'readwrite')
    await done(tx.objectStore(BLOBS).put(file, rec.id))
    rec.stored = true
  } catch { /* quota, private mode: the name survives, the bytes do not */ }
  return rec
}

export async function readFile(id: string): Promise<Blob | null> {
  try {
    const d = await db()
    const tx = d.transaction(BLOBS, 'readonly')
    const b = await done<Blob | undefined>(tx.objectStore(BLOBS).get(id) as IDBRequest<Blob | undefined>)
    return b || null
  } catch { return null }
}

export async function dropFile(id: string): Promise<void> {
  try {
    const d = await db()
    const tx = d.transaction(BLOBS, 'readwrite')
    await done(tx.objectStore(BLOBS).delete(id))
  } catch { /* nothing to remove */ }
}

export function readableSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
