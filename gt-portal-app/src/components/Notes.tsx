/** THE NOTEPAD, REACHABLE FROM EVERY SCREEN.
 *
 *  A note gets taken in the middle of doing something else, which is why this is
 *  a widget in the corner rather than a section you have to navigate to. It
 *  opens over whatever you were looking at and closes back onto it.
 *
 *  Three things it does and nothing else. It listens, using the browser's own
 *  recogniser so nothing is uploaded by this app and no credit is spent. It
 *  shapes what was said into sections and into the four kinds of line a working
 *  note contains, by rule rather than by model, so it can never put a word in
 *  your mouth. And it holds the files you drop on it, as files, without reading
 *  them.
 *
 *  What it deliberately does not do: summarise, rewrite, or send anything
 *  anywhere. See noteShape.ts for the rules and noteStore.ts for where this
 *  lives, which is this browser.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
/* workspaceOwner is the Clerk user the stored workspace was resolved for, which
   is exactly the pair a note should be filed under: a browser that has signed
   two people in must never show one of them the other's notes. */
import { getWorkspaceId, workspaceOwner } from '../lib/api'
import { dictate, dictationSupported } from '../lib/dictate'
import { shape, tally, type LineKind } from '../lib/noteShape'
import {
  deleteNote, dropFile, listNotes, newId, putFile, readFile, readableSize,
  saveNote, scopeOf, MAX_FILE, type Note, type NoteFile
} from '../lib/noteStore'

const KIND_LABEL: Record<LineKind, string> = {
  action: 'Do', question: 'Open', decision: 'Decided', figure: 'Figure', note: ''
}

const blank = (scope: string): Note => ({
  id: newId(), scope, title: '', raw: '', files: [],
  createdAt: Date.now(), updatedAt: Date.now()
})

export function Notes() {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [at, setAt] = useState<Note | null>(null)
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(false)
  const [err, setErr] = useState('')
  const [over, setOver] = useState(false)
  const [showShaped, setShowShaped] = useState(true)
  const stop = useRef<(() => void) | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const scope = useMemo(() => scopeOf(workspaceOwner(), getWorkspaceId()), [open])
  const canHear = useMemo(() => dictationSupported(), [])

  const refresh = useCallback(() => {
    listNotes(scope)
      .then(setNotes)
      .catch(() => { setNotes([]); setErr('This browser will not let the portal store notes.') })
  }, [scope])

  useEffect(() => { if (open) refresh() }, [open, refresh])

  /* Dictation holds the microphone, so it stops when the panel closes or the
     tab goes away rather than running on behind a closed drawer. */
  const halt = useCallback(() => {
    if (stop.current) { stop.current(); stop.current = null }
    setListening(false); setInterim('')
  }, [])
  useEffect(() => () => halt(), [halt])
  useEffect(() => { if (!open) halt() }, [open, halt])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) { setOpen(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const write = (patch: Partial<Note>) => {
    setAt(prev => {
      if (!prev) return prev
      const next = { ...prev, ...patch, updatedAt: Date.now() }
      saveNote(next).catch(() => setErr('The note could not be saved in this browser.'))
      return next
    })
  }

  const listen = () => {
    setErr('')
    if (listening) { halt(); return }
    const handle = dictate({
      onFinal: text => {
        setAt(prev => {
          if (!prev) return prev
          const joined = (prev.raw ? prev.raw.replace(/\s+$/, '') + ' ' : '') + text.trim()
          const next = { ...prev, raw: joined, updatedAt: Date.now() }
          saveNote(next).catch(() => { /* reported on the next write */ })
          return next
        })
        setInterim('')
      },
      onInterim: setInterim,
      onError: setErr,
      onStop: () => { setListening(false); setInterim('') }
    })
    if (!handle) { setErr('This browser has no speech recognition.'); return }
    stop.current = handle
    setListening(true)
  }

  const take = async (list: FileList | null) => {
    if (!list || !list.length || !at) return
    setErr('')
    const added: NoteFile[] = []
    for (const f of Array.from(list)) added.push(await putFile(f))
    const missed = added.filter(f => !f.stored)
    if (missed.length) setErr(missed.length + ' file' + (missed.length === 1 ? ' is' : 's are') +
      ' over ' + readableSize(MAX_FILE) + ', so the name is kept and the file is not.')
    write({ files: [...at.files, ...added] })
  }

  const opened = async (f: NoteFile) => {
    const blob = await readFile(f.id)
    if (!blob) { setErr('That file is not in this browser.'); return }
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank', 'noopener')
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  }

  const shaped = useMemo(() => at ? shape(at.raw) : null, [at])
  const counts = useMemo(() => shaped ? tally(shaped) : null, [shaped])

  return (
    <>
      <button className={'noteorb' + (open ? ' on' : '')} onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close notes' : 'Open notes'} title="Notes">
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 2.5h7l3.5 3.5v11.5H5z" />
          <path d="M12 2.5V6h3.5" />
          <path d="M7.5 10h5M7.5 13h3.5" />
        </svg>
      </button>

      {open && (
        <div className="notepanel" role="dialog" aria-label="Notes">
          <div className="notehead">
            <b>Notes</b>
            <span className="sp" />
            <button className="ract" onClick={() => { setAt(blank(scope)); setShowShaped(false) }}>New note</button>
            <button className="notex" onClick={() => setOpen(false)} aria-label="Close">
              <svg viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" /></svg>
            </button>
          </div>

          {!at && (
            <div className="notelist">
              {notes === null && <p className="notefine">Opening the notes in this browser.</p>}
              {notes && !notes.length && (
                <div className="noteempty">
                  <p>No notes in this browser yet.</p>
                  <p className="notefine">Start one, talk at it, and it sorts what you said into
                    sections, things to do, open questions, decisions and figures.</p>
                </div>
              )}
              {notes && notes.map(n => {
                const s = shape(n.raw)
                const t = tally(s)
                return (
                  <button key={n.id} className="noterow" onClick={() => { setAt(n); setShowShaped(true) }}>
                    <b>{n.title || s.title}</b>
                    <span className="notemeta">
                      {new Date(n.updatedAt).toLocaleDateString()}
                      {t.action ? ' · ' + t.action + ' to do' : ''}
                      {t.question ? ' · ' + t.question + ' open' : ''}
                      {n.files.length ? ' · ' + n.files.length + ' file' + (n.files.length === 1 ? '' : 's') : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {at && (
            <div className="noteedit"
              onDragOver={e => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); take(e.dataTransfer.files) }}>

              <button className="noteback" onClick={() => { halt(); setAt(null); refresh() }}>
                All notes
              </button>

              <input className="notetitle" value={at.title} placeholder={shaped ? shaped.title : 'Untitled note'}
                onChange={e => write({ title: e.target.value })} aria-label="Note title" />

              <div className="noteacts">
                <button className={'btn ' + (listening ? 'g' : 'p')} onClick={listen} disabled={!canHear}>
                  {listening ? 'Stop' : 'Talk to it'}
                </button>
                <button className="ract" onClick={() => setShowShaped(s => !s)}>
                  {showShaped ? 'See what I said' : 'See it sorted'}
                </button>
                <button className="ract" onClick={() => fileRef.current?.click()}>Attach</button>
                <input ref={fileRef} type="file" multiple className="vh"
                  onChange={e => { take(e.target.files); e.currentTarget.value = '' }} />
              </div>

              {!canHear && (
                <p className="notefine">This browser has no speech recognition, so the microphone is
                  off. Chrome and Edge have it. Typing works everywhere.</p>
              )}
              {canHear && (
                <p className="notefine">Recognition is the browser's own, so nothing here is uploaded
                  by Growth Terminal and no credit is spent. Chrome sends the audio to Google to
                  transcribe it, which is worth knowing before you dictate a number.</p>
              )}
              {err && <p className="brerr">{err}</p>}

              {listening && (
                <p className="noteheard"><i />{interim || 'Listening'}</p>
              )}

              {showShaped ? (
                <div className="noteshaped">
                  {shaped && shaped.sections.length === 0 && (
                    <p className="notefine">Nothing to sort yet. Talk at it or type below.</p>
                  )}
                  {shaped && shaped.sections.map((sec, i) => (
                    <div className="notesec" key={i}>
                      <h4>{sec.heading}</h4>
                      <ul>
                        {sec.lines.map((l, j) => (
                          <li key={j} className={'k-' + l.kind}>
                            {KIND_LABEL[l.kind] && <span className="notek">{KIND_LABEL[l.kind]}</span>}
                            {l.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {counts && (counts.action || counts.question) ? (
                    <p className="notefine">{counts.action} to do, {counts.question} still open,
                      {' '}{counts.decision} decided. Sorted by rule from what you said, and nothing
                      was added.</p>
                  ) : null}
                </div>
              ) : (
                <textarea className="noteraw" value={at.raw} placeholder="Say it or type it."
                  onChange={e => write({ raw: e.target.value })} aria-label="What was said" />
              )}

              <div className={'notefiles' + (over ? ' over' : '')}>
                {at.files.length === 0 && <p className="notefine">Drop files here. They ride along
                  with the note and are not read.</p>}
                {at.files.map(f => (
                  <div className="notefile" key={f.id}>
                    <button className="notefname" onClick={() => opened(f)} disabled={!f.stored}>
                      {f.name}
                    </button>
                    <span className="notemeta">{readableSize(f.size)}{f.stored ? '' : ', name only'}</span>
                    <button className="noteremove" aria-label={'Remove ' + f.name}
                      onClick={() => { dropFile(f.id); write({ files: at.files.filter(x => x.id !== f.id) }) }}>
                      <svg viewBox="0 0 14 14"><path d="M3 3l8 8M11 3l-8 8" /></svg>
                    </button>
                  </div>
                ))}
              </div>

              <div className="notefoot">
                <span className="notefine">Kept in this browser only.</span>
                <span className="sp" />
                <button className="ract" onClick={() => {
                  halt()
                  deleteNote(at).then(() => { setAt(null); refresh() })
                }}>Delete note</button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
