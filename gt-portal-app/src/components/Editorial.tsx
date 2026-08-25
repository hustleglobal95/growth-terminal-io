import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from '../lib/bus'
import {
  Mark, MarkColor, MarkStyle, Anchor, COLORS, SECTIONS, sectionLabel,
  VERDICTS, isVerdict, STYLE_LABEL,
  listMarks, createMark, patchMark, removeMark,
  anchorFromSelection, anchorFromRange, rangeFromStroke, repaint, unpaint
} from '../lib/marks'

/** The editorial layer. One component, mounted once, that reaches into the
 *  already rendered analysis by id. Nothing in LiveDetail knows how a
 *  highlight works, and turning the layer off restores the original DOM
 *  exactly, because that is the standing rule here: the layout can change,
 *  the output cannot.
 */

function localId(): string {
  return 'local-' + Math.random().toString(36).slice(2, 10)
}

function sectionEl(id: string): HTMLElement | null {
  const el = document.getElementById(id)
  return el instanceof HTMLElement ? el : null
}

function present(): string[] {
  return SECTIONS.map(s => s[0]).filter(id => !!sectionEl(id))
}

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */

const ico = {
  viewBox: '0 0 16 16', width: 13, height: 13, fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true
}

function Marker() {
  return <svg {...ico}><path d="M3.2 10.4l5.4-5.4 2.4 2.4-5.4 5.4H3.2z" /><path d="M2.4 14.2h11.2" /></svg>
}
function PenNib() {
  return <svg {...ico}><path d="M11.2 2.6l2.2 2.2-6.2 6.2-2.9.7.7-2.9z" /><path d="M2.4 14.2h11.2" /></svg>
}
function Scribble() {
  return <svg {...ico}><path d="M2.2 9.6c2-3.4 3.6-3.4 4.4-1.2.8 2.2 2 2.6 3-.2.7-2 2.2-2.2 4.2.4" /></svg>
}
function Strike() {
  return <svg {...ico}><path d="M2.6 8h10.8" /><path d="M11.4 4.6C10.6 3.4 9.4 3 8 3 6.2 3 5 3.9 5 5.2c0 1.2 1 1.9 3 2.4" /><path d="M4.9 11.2c.7 1.3 1.9 1.8 3.4 1.8 1.9 0 3.1-.9 3.1-2.2 0-.9-.5-1.5-1.6-2" /></svg>
}
function Tick() {
  return <svg {...ico}><path d="M3 8.4l3 3L13 4.6" /></svg>
}
function Query() {
  return <svg {...ico}><path d="M5.9 5.9a2.1 2.1 0 113.1 1.9c-.6.4-1 .8-1 1.6v.4" /><path d="M8 12.6h.01" /></svg>
}
function Bang() {
  return <svg {...ico}><path d="M8 3.4v5.4" /><path d="M8 12.4h.01" /></svg>
}
function Focus() {
  return <svg {...ico}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.6v1.8M8 12.6v1.8M1.6 8h1.8M12.6 8h1.8" /></svg>
}
function Copy() {
  return <svg {...ico}><rect x="5.4" y="5.4" width="8" height="8" rx="1.4" /><path d="M10.6 5.4V4a1.4 1.4 0 00-1.4-1.4H4A1.4 1.4 0 002.6 4v5.2A1.4 1.4 0 004 10.6h1.4" /></svg>
}
function Pad() {
  return <svg {...ico}><rect x="3" y="2.4" width="10" height="11.2" rx="1.6" /><path d="M5.6 5.8h4.8M5.6 8.4h4.8M5.6 11h2.8" /></svg>
}
function PinIcon({ on }: { on: boolean }) {
  return (
    <svg {...ico} fill={on ? 'currentColor' : 'none'}>
      <path d="M6.2 2.2h3.6l-.5 3.4 2.3 2.1H4.4l2.3-2.1z" /><path d="M8 7.7v6.1" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */

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
        <Pad />{note ? 'Note' : 'Add a note'}
      </button>
      {open && (
        <div className="ednote">
          <label className="lbl" htmlFor={'note-' + id}>Your note on {sectionLabel(id).toLowerCase()}</label>
          <textarea id={'note-' + id} rows={3} value={text}
            placeholder="What you want to remember about this section."
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
interface Stroke { pts: { x: number; y: number }[] }

export function Editorial({ analysisId, on }: { analysisId: string; on: boolean }) {
  const [marks, setMarks] = useState<Mark[]>([])
  const [stored, setStored] = useState(true)
  const [ready, setReady] = useState(false)
  const [pop, setPop] = useState<PopState | null>(null)
  const [lost, setLost] = useState(0)
  const [hosts, setHosts] = useState<string[]>([])

  /* The kit. Ink and nib are remembered between strokes, because nobody wants
     to pick yellow again for every sentence in a paragraph. */
  const [style, setStyle] = useState<MarkStyle>('highlight')
  const [color, setColor] = useState<MarkColor>('yellow')
  const [draw, setDraw] = useState(false)
  const [pad, setPad] = useState(false)
  /* Focus dims everything nobody marked. After a long read it is the fastest
     way back to the sentences you kept, and it is a reading mode rather than a
     mark, so it is not written anywhere. */
  const [focus, setFocus] = useState(false)
  const [stroke, setStroke] = useState<Stroke | null>(null)

  const busy = useRef(false)
  const svgRef = useRef<SVGSVGElement | null>(null)

  useEffect(() => {
    let alive = true
    setReady(false)
    listMarks(analysisId)
      .then(rows => { if (alive) { setMarks(rows); setStored(true); setReady(true) } })
      .catch(() => { if (alive) { setMarks([]); setStored(false); setReady(true) } })
    return () => { alive = false }
  }, [analysisId])

  useEffect(() => {
    if (!on) { setHosts([]); return }
    setHosts(present())
  }, [on, ready, analysisId])

  useEffect(() => {
    if (!on) {
      SECTIONS.forEach(s => { const el = sectionEl(s[0]); if (el) unpaint(el) })
      setPop(null); setStroke(null)
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

  useEffect(() => {
    const cls = 'edfocus'
    if (on && focus) document.body.classList.add(cls)
    else document.body.classList.remove(cls)
    return () => { document.body.classList.remove(cls) }
  }, [on, focus])

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
    } catch {
      /* The write failed. Keep the mark and say so, rather than throwing away
         work the reader just did because the engine is having a bad day. The
         layer keeps working for this session and the panel stops claiming
         anything is being kept, which is the honest pair of statements. */
      if (optimistic) setMarks(m => m.concat(optimistic))
      setStored(false)
      toast('Marks are not saving right now. Yours will last until you leave the page.')
    } finally { busy.current = false }
  }, [stored])

  const addMark = useCallback(async (sectionId: string, anchor: Anchor, ink: MarkColor) => {
    const optimistic: Mark = {
      id: localId(), kind: 'highlight', sectionId, anchor, color: ink, body: null,
      createdAt: new Date().toISOString()
    }
    await save(() => createMark(analysisId, { kind: 'highlight', sectionId, anchor, color: ink }), optimistic)
  }, [analysisId, save])

  /* Selection with a finger or a mouse: the popover offers the ink. */
  useEffect(() => {
    if (!on || draw) return
    const handler = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) { setPop(null); return }
      const range = sel.getRangeAt(0)
      const host = present().map(sectionEl)
        .find(el => el && el.contains(range.commonAncestorContainer))
      if (!host) { setPop(null); return }
      const anchor = anchorFromSelection(host, range)
      if (!anchor) { setPop(null); return }
      const r = range.getBoundingClientRect()
      setPop({ x: r.left + r.width / 2, y: r.top, sectionId: host.id, anchor: { ...anchor, ...(style === 'underline' ? { style } : {}) } })
    }
    document.addEventListener('mouseup', handler)
    document.addEventListener('keyup', handler)
    return () => {
      document.removeEventListener('mouseup', handler)
      document.removeEventListener('keyup', handler)
    }
  }, [on, draw, style])

  /* Clicking a painted mark removes it. */
  useEffect(() => {
    if (!on || draw) return
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
  }, [on, draw, stored])

  const drop = async (markId: string) => {
    setMarks(m => m.filter(x => x.id !== markId))
    if (!stored || markId.indexOf('local-') === 0) return
    try { await removeMark(analysisId, markId) }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not remove that mark.') }
  }

  const highlight = async (ink: MarkColor) => {
    if (!pop) return
    const { sectionId, anchor } = pop
    setPop(null)
    window.getSelection()?.removeAllRanges()
    await addMark(sectionId, anchor, ink)
  }

  /* ---------------- the pen ---------------- */

  const strokePoint = (e: React.PointerEvent) => ({ x: e.clientX, y: e.clientY })

  const penDown = (e: React.PointerEvent) => {
    if (!draw) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setStroke({ pts: [strokePoint(e)] })
  }

  const penMove = (e: React.PointerEvent) => {
    if (!draw || !stroke) return
    e.preventDefault()
    const pt = strokePoint(e)
    const last = stroke.pts[stroke.pts.length - 1]
    /* Sample rather than record everything: a dense path costs nothing to
       draw and a lot to hit test, and two pixels is finer than any hand. */
    if (last && Math.abs(pt.x - last.x) + Math.abs(pt.y - last.y) < 3) return
    setStroke({ pts: stroke.pts.concat(pt) })
  }

  const penUp = async () => {
    if (!draw || !stroke) return
    const pts = stroke.pts
    setStroke(null)
    if (pts.length < 2) return

    /* Step out of the way before hit testing. The overlay is the thing that
       caught the gesture, and it would also catch every caret lookup. */
    const svg = svgRef.current
    const prev = svg ? svg.style.pointerEvents : ''
    if (svg) svg.style.pointerEvents = 'none'

    let hit: { id: string; anchor: Anchor } | null = null
    for (const id of present()) {
      const el = sectionEl(id)
      if (!el) continue
      const r = rangeFromStroke(el, pts)
      if (!r) continue
      const a = anchorFromRange(el, r, style)
      if (a) { hit = { id, anchor: a }; break }
    }
    if (svg) svg.style.pointerEvents = prev

    if (!hit) { toast('That stroke did not cross any text.'); return }
    await addMark(hit.id, hit.anchor, color)
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

  /* Both of these sit above the early return below on purpose. A hook that
     runs only when the layer is open runs a different number of times than one
     that does not, and React counts hooks per render, so the page goes blank
     the moment somebody presses Mark up. This is the second time I made that
     mistake today, so it is written down here rather than remembered. */
  /* Marking is only half the job. Somebody vetting an analysis is usually on
     their way to writing to a client, a partner or their own team, and until
     now everything they kept lived on a page they would have to go back to and
     retype. This assembles what they marked, in the order the page presents
     it, grouped by section, with verdicts and notes attached, and puts it on
     the clipboard as plain text that pastes cleanly into an email.

     It is built from the marks themselves rather than from the DOM, so a
     passage that could not be repainted is simply absent rather than wrong. */
  const buildBrief = useCallback((): string => {
    const lines: string[] = []
    for (const [id, label] of SECTIONS) {
      const here = marks.filter(m => m.sectionId === id)
      const quotes = here.filter(m => m.kind === 'highlight' && m.anchor && m.anchor.quote)
      const sectionNotes = here.filter(m => m.kind !== 'highlight' && m.body)
      if (!quotes.length && !sectionNotes.length) continue

      lines.push(label)
      lines.push('-'.repeat(label.length))
      for (const q of quotes) {
        const a = q.anchor as Anchor
        const verdict = isVerdict(a.style) ? ' [' + STYLE_LABEL[a.style as MarkStyle] + ']' : ''
        lines.push('  "' + (a.quote || '').trim() + '"' + verdict)
        if (q.body) lines.push('    Note: ' + q.body.trim())
      }
      for (const n of sectionNotes) lines.push('  Note: ' + (n.body || '').trim())
      lines.push('')
    }
    if (!lines.length) return ''
    lines.unshift('')
    lines.unshift('Marked in Growth Terminal')
    return lines.join('\n').trimEnd() + '\n'
  }, [marks])

  const copyBrief = useCallback(() => {
    const text = buildBrief()
    if (!text) { toast('Nothing marked yet.'); return }
    const n = marks.filter(m => m.kind === 'highlight' && m.anchor).length
    navigator.clipboard?.writeText(text).then(
      () => toast(n === 1 ? 'One passage copied.' : n + ' passages copied.'),
      () => toast('Could not reach the clipboard.'))
  }, [buildBrief, marks])

  if (!on) return null

  const pins = marks.filter(m => m.kind === 'pin')
  const notes = marks.filter(m => m.kind === 'note')
  const inked = marks.filter(m => m.kind === 'highlight' && m.anchor)

  const path = stroke && stroke.pts.length > 1
    ? 'M' + stroke.pts.map(p => p.x.toFixed(1) + ' ' + p.y.toFixed(1)).join(' L')
    : ''


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

      {/* The drawing surface. Only in the way when the pen is out. */}
      <svg ref={svgRef} className={'edui edcanvas' + (draw ? ' on' : '')}
        onPointerDown={penDown} onPointerMove={penMove}
        onPointerUp={() => void penUp()} onPointerCancel={() => setStroke(null)}>
        {path && <path d={path} className={'edstroke c' + color + (style === 'underline' ? ' und' : '')} />}
      </svg>

      {/* The kit itself. */}
      <div className="edui edkit" role="toolbar" aria-label="Markup tools">
        <div className="edseg">
          <button className={'edtool' + (style === 'highlight' ? ' on' : '')} aria-pressed={style === 'highlight'}
            title="Marker" onClick={() => setStyle('highlight')}><Marker /></button>
          <button className={'edtool' + (style === 'underline' ? ' on' : '')} aria-pressed={style === 'underline'}
            title="Pen, underlines" onClick={() => setStyle('underline')}><PenNib /></button>
          <button className={'edtool' + (style === 'strike' ? ' on' : '')} aria-pressed={style === 'strike'}
            title="Strike out. This does not apply to us" onClick={() => setStyle('strike')}><Strike /></button>
        </div>

        {/* Verdicts. A colour says you looked at a sentence. A verdict says
            what you thought of it, which is the thing this product is for:
            the engine makes a claim in advance and somebody grades it. */}
        <div className="edseg edverd">
          <button className={'edtool vd agree' + (style === 'agree' ? ' on' : '')} aria-pressed={style === 'agree'}
            title="Agree with this" onClick={() => setStyle('agree')}><Tick /></button>
          <button className={'edtool vd doubt' + (style === 'doubt' ? ' on' : '')} aria-pressed={style === 'doubt'}
            title="Doubt this" onClick={() => setStyle('doubt')}><Bang /></button>
          <button className={'edtool vd ask' + (style === 'ask' ? ' on' : '')} aria-pressed={style === 'ask'}
            title="Ask about this" onClick={() => setStyle('ask')}><Query /></button>
        </div>
        <div className={'edinks' + (isVerdict(style) ? ' off' : '')}>
          {COLORS.map(([key, label]) => (
            <button key={key} className={'edswatch c' + key + (color === key ? ' on' : '')}
              title={label} aria-label={label} aria-pressed={color === key}
              onClick={() => setColor(key)} />
          ))}
        </div>
        <button className={'edtool' + (draw ? ' on' : '')} aria-pressed={draw}
          title={draw ? 'Drawing. Tap to go back to selecting' : 'Draw over the text instead of selecting it'}
          onClick={() => { setDraw(!draw); setPop(null) }}><Scribble /></button>
        <button className={'edtool' + (focus ? ' on' : '')} aria-pressed={focus}
          title={focus ? 'Showing only what you marked. Tap to show everything' : 'Dim everything you did not mark'}
          onClick={() => setFocus(!focus)}><Focus /></button>
        <button className={'edtool' + (pad ? ' on' : '')} aria-pressed={pad}
          title="Notepad" onClick={() => setPad(!pad)}><Pad /></button>
      </div>

      {pop && !draw && (
        <div className="edui edpop" role="toolbar" aria-label="Ink"
          style={{ left: pop.x, top: pop.y }}>
          {COLORS.map(([key, label]) => (
            <button key={key} className={'edswatch c' + key} title={label} aria-label={label}
              onMouseDown={e => e.preventDefault()}
              onClick={() => void highlight(key)} />
          ))}
        </div>
      )}

      {pad && (
        <div className="edui edpad">
          <div className="edpadhead">
            <b>Notepad</b>
            <span className="hint">{inked.length} marked, {notes.length} noted</span>
            <button className="ract edcopy" onClick={copyBrief}
              title="Copy everything you marked, as text you can paste into an email">
              <Copy />Copy as brief
            </button>
            <button className="ract" onClick={() => setPad(false)}>Close</button>
          </div>
          <div className="edpadbody">
            {inked.length === 0 && notes.length === 0 && (
              <p className="edempty">Anything you mark lands here, in the order you marked it.</p>
            )}
            {inked.map(m => (
              <div key={m.id} className={'edquote c' + (m.color || 'yellow')}>
                <button className="edqjump"
                  onClick={() => sectionEl(m.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  {sectionLabel(m.sectionId)}
                </button>
                <p>{m.anchor ? m.anchor.quote : ''}</p>
                <button className="edqx" aria-label="Remove this mark"
                  onClick={() => void drop(m.id)}>Remove</button>
              </div>
            ))}
            {notes.map(n => (
              <div key={n.id} className="edquote note">
                <button className="edqjump"
                  onClick={() => sectionEl(n.sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
                  {sectionLabel(n.sectionId)}
                </button>
                <p>{n.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="edui edsum">
        <div className="shead">
          <h2>Marked</h2>
          <span className="hint">{inked.length} marked, {pins.length} pinned, {notes.length} noted</span>
        </div>

        {!stored && (
          <p className="edwarn">Marks are not being saved. The storage route is not live yet, so
            anything you mark here lasts until you leave the page.</p>
        )}
        {lost > 0 && (
          <p className="edwarn">{lost === 1 ? 'One mark could not be placed' : lost + ' marks could not be placed'} and
            {lost === 1 ? ' it is' : ' they are'} not shown. The text they pointed at is no longer on this page.</p>
        )}

        {pins.length === 0 && notes.length === 0 && inked.length === 0 && (
          <p className="edempty">Select any text to mark it, or pick up the pen and draw over it.</p>
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
