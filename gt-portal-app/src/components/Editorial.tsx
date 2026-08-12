import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '../lib/bus'
import {
  Mark, MarkColor, Anchor, COLORS, SECTIONS, sectionLabel,
  listMarks, createMark, patchMark, removeMark,
  anchorFromSelection, repaint, unpaint
} from '../lib/marks'

/** The editorial layer. One component, mounted once, that reaches into the
 *  already rendered analysis by id. Nothing in LiveDetail knows how a
 *  highlight works, and turning the layer off restores the original DOM
 *  exactly, because that is the standing rule here: the layout can change,
 *  the output cannot.
 */

function localId(): string {
  /* Only used while storage is unavailable, so it never has to survive a
   * reload or collide with a server id. */
  return 'local-' + Math.random().toString(36).slice(2, 10)
}

function sectionEl(id: string): HTMLElement | null {
  const el = document.getElementById(id)
  return el instanceof HTMLElement ? el : null
}

/* ------------------------------------------------------------------ */

function Pen() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11.2 2.6l2.2 2.2-7.5 7.5-2.9.7.7-2.9z" />
      <path d="M2.5 14.2h11" />
    </svg>
  )
}

function PinIcon({ on }: { on: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill={on ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true">
      <path d="M6.2 2.2h3.6l-.5 3.4 2.3 2.1H4.4l2.3-2.1z" />
      <path d="M8 7.7v6.1" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */

/** The strip that appears at the top of every section while the layer is on:
 *  pin the section, and open a note on it. Portalled into the section itself
 *  so it moves with the content and disappears cleanly. */
function SectionTools({ id, pinned, note, onPin, onNote }: {
  id: string
  pinned: boolean
  note: Mark | null
  onPin: (id: string, on: boolean) => void
  onNote: (id: string, text: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(note ? note.body || '' : '')
  useEffect(() => { setText(note ? note.body || '' : '') }, [note])

  const dirty = text.trim() !== (note ? (note.body || '').trim() : '')

  return (
    <div className="edui edtools">
      <button className={'edchip' + (pinned ? ' on' : '')} aria-pressed={pinned}
        onClick={() => onPin(id, !pinned)}>
        <PinIcon on={pinned} />{pinned ? 'Pinned' : 'Pin'}
      </button>
      <button className={'edchip' + (open || note ? ' on' : '')} aria-expanded={open}
        onClick={() => setOpen(!open)}>
        <Pen />{note ? 'Note' : 'Add a note'}
      </button>
      {open && (
        <div className="ednote">
          <label className="lbl" htmlFor={'note-' + id}>Your note on {sectionLabel(id).toLowerCase()}</label>
          <textarea id={'note-' + id} rows={3} value={text} placeholder="What you want to remember about this section."
            onChange={e => setText(e.target.value)} />
          <div className="ednoterow">
            <button className="btn p" disabled={!dirty}
              onClick={() => { onNote(id, text.trim()); setOpen(false) }}>Save note</button>
            {note && <button className="btn g" onClick={() => { onNote(id, ''); setText(''); setOpen(false) }}>Delete</button>}
            <button className="ract" onClick={() => { setText(note ? note.body || '' : ''); setOpen(false) }}>Cancel</button>
          </div>
        </div>
      )}
      {note && !open && <p className="ednoteread">{note.body}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */

interface PopState { x: number; y: number; sectionId: string; anchor: Anchor }

export function Editorial({ analysisId, on }: { analysisId: string; on: boolean }) {
  const [marks, setMarks] = useState<Mark[]>([])
  const [stored, setStored] = useState(true)
  const [ready, setReady] = useState(false)
  const [pop, setPop] = useState<PopState | null>(null)
  const [lost, setLost] = useState(0)
  const [hosts, setHosts] = useState<string[]>([])
  const busy = useRef(false)

  /* Load once per analysis. A storage route that is not live yet is not an
   * error the reader caused, so the layer still works and says plainly that
   * nothing is being kept. */
  useEffect(() => {
    let alive = true
    setReady(false)
    listMarks(analysisId)
      .then(rows => { if (alive) { setMarks(rows); setStored(true); setReady(true) } })
      .catch(() => { if (alive) { setMarks([]); setStored(false); setReady(true) } })
    return () => { alive = false }
  }, [analysisId])

  /* Which sections actually rendered. Checked on every toggle because role
   * gating and the plan panel change what exists. */
  useEffect(() => {
    if (!on) { setHosts([]); return }
    setHosts(SECTIONS.map(s => s[0]).filter(id => !!sectionEl(id)))
  }, [on, ready, analysisId])

  /* Paint and unpaint. The dependency on marks is what makes the mark list
   * the single source of truth: change the list, the page follows. */
  useEffect(() => {
    if (!on) {
      SECTIONS.forEach(s => { const el = sectionEl(s[0]); if (el) unpaint(el) })
      setPop(null)
      return
    }
    let missing = 0
    for (const [id] of SECTIONS) {
      const el = sectionEl(id)
      if (!el) continue
      missing += repaint(el, marks.filter(m => m.sectionId === id)).length
    }
    setLost(missing)
  }, [on, marks, hosts])

  /* Clean up if the layer is still on when the screen goes away. */
  useEffect(() => () => {
    SECTIONS.forEach(s => { const el = sectionEl(s[0]); if (el) unpaint(el) })
  }, [])

  const save = useCallback(async (fn: () => Promise<Mark | null>, optimistic: Mark | null) => {
    if (!stored) {
      if (optimistic) setMarks(m => m.concat(optimistic))
      return
    }
    if (busy.current) return
    busy.current = true
    try {
      const row = await fn()
      if (row) setMarks(m => m.concat(row))
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save that mark.')
    } finally { busy.current = false }
  }, [stored])

  /* Selection inside a section opens the colour picker. Anything selected
   * outside one, or a selection that collapses, closes it. */
  useEffect(() => {
    if (!on) return
    const handler = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPop(null); return }
      const range = sel.getRangeAt(0)
      const host = SECTIONS.map(s => s[0]).map(sectionEl)
        .find(el => el && el.contains(range.commonAncestorContainer))
      if (!host) { setPop(null); return }
      const anchor = anchorFromSelection(host, range)
      if (!anchor) { setPop(null); return }
      const r = range.getBoundingClientRect()
      setPop({ x: r.left + r.width / 2, y: r.top, sectionId: host.id, anchor })
    }
    document.addEventListener('mouseup', handler)
    document.addEventListener('keyup', handler)
    return () => {
      document.removeEventListener('mouseup', handler)
      document.removeEventListener('keyup', handler)
    }
  }, [on])

  /* Clicking a painted mark removes it. One gesture, no menu: the colour
   * picker is for making marks, the mark itself is for unmaking. */
  useEffect(() => {
    if (!on) return
    const click = (e: MouseEvent) => {
      const t = e.target
      if (!(t instanceof HTMLElement)) return
      const el = t.closest('mark.edmk')
      if (!el) return
      const id = el.getAttribute('data-mark')
      if (!id) return
      e.preventDefault()
      void drop(id)
    }
    document.addEventListener('click', click)
    return () => document.removeEventListener('click', click)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, stored])

  const drop = async (markId: string) => {
    setMarks(m => m.filter(x => x.id !== markId))
    if (!stored || markId.indexOf('local-') === 0) return
    try { await removeMark(analysisId, markId) }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not remove that mark.') }
  }

  const highlight = async (color: MarkColor) => {
    if (!pop) return
    const { sectionId, anchor } = pop
    setPop(null)
    window.getSelection()?.removeAllRanges()
    const optimistic: Mark = {
      id: localId(), kind: 'highlight', sectionId, anchor, color, body: null,
      createdAt: new Date().toISOString()
    }
    await save(() => createMark(analysisId, { kind: 'highlight', sectionId, anchor, color }), optimistic)
  }

  const setPin = async (sectionId: string, want: boolean) => {
    const existing = marks.find(m => m.kind === 'pin' && m.sectionId === sectionId)
    if (!want) { if (existing) await drop(existing.id); return }
    if (existing) return
    const optimistic: Mark = {
      id: localId(), kind: 'pin', sectionId, anchor: null, color: null, body: null,
      createdAt: new Date().toISOString()
    }
    await save(() => createMark(analysisId, { kind: 'pin', sectionId }), optimistic)
  }

  const setNote = async (sectionId: string, text: string) => {
    const existing = marks.find(m => m.kind === 'note' && m.sectionId === sectionId)
    if (!text) { if (existing) await drop(existing.id); return }
    if (existing) {
      setMarks(m => m.map(x => x.id === existing.id ? { ...x, body: text } : x))
      if (!stored || existing.id.indexOf('local-') === 0) return
      try { await patchMark(analysisId, existing.id, { body: text }) }
      catch (e) { toast(e instanceof Error ? e.message : 'Could not save that note.') }
      return
    }
    const optimistic: Mark = {
      id: localId(), kind: 'note', sectionId, anchor: null, color: null, body: text,
      createdAt: new Date().toISOString()
    }
    await save(() => createMark(analysisId, { kind: 'note', sectionId, body: text }), optimistic)
  }

  if (!on) return null

  const pins = marks.filter(m => m.kind === 'pin')
  const notes = marks.filter(m => m.kind === 'note')
  const highlights = marks.filter(m => m.kind === 'highlight')

  return (
    <>
      {hosts.map(id => {
        const el = sectionEl(id)
        if (!el) return null
        return createPortal(
          <SectionTools key={id} id={id}
            pinned={pins.some(p => p.sectionId === id)}
            note={notes.find(n => n.sectionId === id) || null}
            onPin={(s, want) => void setPin(s, want)}
            onNote={(s, t) => void setNote(s, t)} />,
          el, 'edtools-' + id)
      })}

      {pop && (
        <div className="edui edpop" role="toolbar" aria-label="Highlight colour"
          style={{ left: pop.x, top: pop.y }}>
          {COLORS.map(([key, label]) => (
            <button key={key} className={'edswatch c' + key} title={label} aria-label={label}
              onMouseDown={e => e.preventDefault()}
              onClick={() => void highlight(key)} />
          ))}
        </div>
      )}

      <div className="edui edsum">
        <div className="shead">
          <h2>Marked</h2>
          <span className="hint">{highlights.length} highlighted, {pins.length} pinned, {notes.length} noted</span>
        </div>

        {!stored && (
          <p className="edwarn">Marks are not being saved. The storage route is not live yet, so
            anything you mark here lasts until you leave the page.</p>
        )}
        {lost > 0 && (
          <p className="edwarn">{lost === 1 ? 'One highlight could not be placed' : lost + ' highlights could not be placed'} and
            {lost === 1 ? ' it is' : ' they are'} not shown. The text they pointed at is no longer on this page.</p>
        )}

        {pins.length === 0 && notes.length === 0 && highlights.length === 0 && (
          <p className="edempty">Select any text to highlight it. Pin a section to collect it here.</p>
        )}

        {pins.length > 0 && (
          <div className="edgroup">
            <span className="lbl">Pinned sections</span>
            {pins.map(p => (
              <button key={p.id} className="edjump"
                onClick={() => sectionEl(p.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                {sectionLabel(p.sectionId)}
              </button>
            ))}
          </div>
        )}

        {notes.length > 0 && (
          <div className="edgroup">
            <span className="lbl">Your notes</span>
            {notes.map(n => (
              <div key={n.id} className="edsumnote">
                <button className="edjump"
                  onClick={() => sectionEl(n.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
                  {sectionLabel(n.sectionId)}
                </button>
                <p>{n.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
