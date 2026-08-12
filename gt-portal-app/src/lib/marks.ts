import { live } from './api'

/** Editorial marks: the reader's own layer over a finished analysis.
 *
 *  The rule this module exists to keep is that the analysis text never
 *  changes. Marks are stored beside an analysis, fetched separately, and
 *  painted onto the rendered DOM after the fact. Turn the layer off and the
 *  page is byte for byte what the engine wrote. That is why nothing here
 *  touches the render tree: no section component knows this file exists.
 */

export type MarkKind = 'highlight' | 'pin' | 'note'
export type MarkColor = 'yellow' | 'pink' | 'blue' | 'green'

/** How a highlight is drawn. This rides inside the anchor rather than in a
 *  column of its own: the engine stores the anchor as an opaque blob and
 *  hands it back untouched, so a new way of drawing a mark costs no schema
 *  change and no second trip through the backend. */
export type MarkStyle = 'highlight' | 'underline'

/** Three strings, not offsets. Offsets break the moment anything upstream of
 *  the selection changes by a character, and they fail silently in the worst
 *  way: the highlight lands on the wrong sentence. A quote plus its
 *  neighbours either matches or it does not, and a mark that cannot be placed
 *  is dropped rather than guessed at. */
export interface Anchor {
  quote: string
  prefix: string
  suffix: string
  style?: MarkStyle
}

export interface Mark {
  id: string
  kind: MarkKind
  sectionId: string
  anchor: Anchor | null
  color: MarkColor | null
  body: string | null
  createdAt: string
}

/** The closed set, matching the ids already on the panels in LiveDetail and
 *  the labels already in its jump list. Adding a section here without adding
 *  the id to the page is how you get a pin that points at nothing. */
export const SECTIONS: [string, string][] = [
  ['verdict', 'What the engine found'],
  ['narrative', 'The verdict, in full'],
  ['causes', 'Root causes'],
  ['evidence', 'What the data said'],
  ['plan', 'The 90 day plan'],
  ['gates', 'Decision gates'],
  ['indicators', 'Indicators'],
  ['limits', 'What would prove this wrong']
]

export const COLORS: [MarkColor, string][] = [
  ['yellow', 'Yellow'],
  ['pink', 'Pink'],
  ['blue', 'Blue'],
  ['green', 'Green']
]

export function sectionLabel(id: string): string {
  const hit = SECTIONS.find(s => s[0] === id)
  return hit ? hit[1] : id
}

const CONTEXT = 32

/* ------------------------------------------------------------------ */
/* Storage                                                             */
/* ------------------------------------------------------------------ */

function base(analysisId: string): string {
  return '/analyses/' + encodeURIComponent(analysisId) + '/marks'
}

/** The engine names this field section_id and rejects the camelCase spelling
 *  with a validation error. That mismatch is what produced "Invalid mark" on
 *  every attempt to save one. Requests go out snake_case; replies are read
 *  either way, because a field name is not worth a second outage. */
interface RawMark extends Omit<Mark, 'sectionId'> {
  sectionId?: string
  section_id?: string
}

function normalize(r: RawMark): Mark {
  return {
    id: r.id,
    kind: r.kind,
    sectionId: r.sectionId || r.section_id || '',
    anchor: r.anchor || null,
    color: r.color || null,
    body: r.body || null,
    createdAt: r.createdAt
  }
}

export async function listMarks(analysisId: string): Promise<Mark[]> {
  const rows = await live<RawMark[]>(base(analysisId))
  return Array.isArray(rows) ? rows.map(normalize) : []
}

export async function createMark(
  analysisId: string,
  m: { kind: MarkKind; sectionId: string; anchor?: Anchor; color?: MarkColor; body?: string }
): Promise<Mark> {
  const wire: Record<string, unknown> = { kind: m.kind, section_id: m.sectionId }
  if (m.anchor) wire.anchor = m.anchor
  if (m.color) wire.color = m.color
  if (m.body) wire.body = m.body
  const r = await live<RawMark>(base(analysisId), { method: 'POST', body: JSON.stringify(wire) })
  return normalize(r)
}

export async function patchMark(
  analysisId: string, markId: string, patch: { color?: MarkColor; body?: string }
): Promise<Mark> {
  const r = await live<RawMark>(base(analysisId) + '/' + encodeURIComponent(markId),
    { method: 'PATCH', body: JSON.stringify(patch) })
  return normalize(r)
}

export async function removeMark(analysisId: string, markId: string): Promise<void> {
  await live<unknown>(base(analysisId) + '/' + encodeURIComponent(markId), { method: 'DELETE' })
}

/* ------------------------------------------------------------------ */
/* Text addressing                                                     */
/* ------------------------------------------------------------------ */

interface Flat {
  text: string
  nodes: Text[]
  starts: number[]
}

/** The section's visible text as one string, plus the map back to the text
 *  nodes it came from. Anything already painted is walked through rather than
 *  around, so a highlight can sit inside or across an earlier one. */
function flatten(root: Element): Flat {
  const nodes: Text[] = []
  const starts: number[] = []
  let text = ''
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n = walk.nextNode()
  while (n) {
    const t = n as Text
    const parent = t.parentElement
    /* Skip the layer's own furniture so a note you typed cannot become the
     * thing a later highlight anchors to. */
    if (!parent || !parent.closest('.edui')) {
      nodes.push(t)
      starts.push(text.length)
      text += t.data
    }
    n = walk.nextNode()
  }
  return { text, nodes, starts }
}

function pointAt(f: Flat, index: number): { node: Text; offset: number } | null {
  for (let i = f.nodes.length - 1; i >= 0; i--) {
    if (f.starts[i] <= index) {
      const off = index - f.starts[i]
      if (off <= f.nodes[i].data.length) return { node: f.nodes[i], offset: off }
    }
  }
  return null
}

function indexOfPoint(f: Flat, node: Node, offset: number): number {
  const at = f.nodes.indexOf(node as Text)
  if (at < 0) return -1
  return f.starts[at] + offset
}

/** Build an anchor from whatever the reader just selected. Returns null for a
 *  selection that is empty, whitespace only, or reaches outside the section,
 *  because none of those can be re-found later. */
export function anchorFromSelection(root: Element, range: Range): Anchor | null {
  const f = flatten(root)
  const start = indexOfPoint(f, range.startContainer, range.startOffset)
  const end = indexOfPoint(f, range.endContainer, range.endOffset)
  if (start < 0 || end < 0 || end <= start) return null
  const quote = f.text.slice(start, end)
  if (!quote.trim()) return null
  return {
    quote,
    prefix: f.text.slice(Math.max(0, start - CONTEXT), start),
    suffix: f.text.slice(end, Math.min(f.text.length, end + CONTEXT))
  }
}

/** Re-find an anchor. Every occurrence of the quote is scored on how much of
 *  its neighbouring text still matches, and the best is taken. A quote that
 *  appears once wins outright; a quote that appears five times is settled by
 *  context. If the quote is gone entirely the caller gets null and the mark
 *  is dropped. */
export function findAnchor(root: Element, a: Anchor): Range | null {
  const f = flatten(root)
  if (!a || !a.quote) return null
  const hits: number[] = []
  let at = f.text.indexOf(a.quote)
  while (at >= 0 && hits.length < 200) {
    hits.push(at)
    at = f.text.indexOf(a.quote, at + 1)
  }
  if (hits.length === 0) return null

  let best = hits[0]
  let bestScore = -1
  for (const h of hits) {
    const before = f.text.slice(Math.max(0, h - CONTEXT), h)
    const after = f.text.slice(h + a.quote.length, h + a.quote.length + CONTEXT)
    const score = tailMatch(before, a.prefix) + headMatch(after, a.suffix)
    if (score > bestScore) { bestScore = score; best = h }
  }

  const s = pointAt(f, best)
  const e = pointAt(f, best + a.quote.length)
  if (!s || !e) return null
  const r = document.createRange()
  try {
    r.setStart(s.node, s.offset)
    r.setEnd(e.node, e.offset)
  } catch { return null }
  return r
}

function tailMatch(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

function headMatch(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}

/* ------------------------------------------------------------------ */
/* Painting                                                            */
/* ------------------------------------------------------------------ */

/** Wrap a range in one mark element per text node it covers. Splitting per
 *  node is what lets a highlight cross a bold word or a list item without
 *  reparenting anything, which would be a change to the analysis.
 *
 *  Every offset is read before a single mutation happens. A live Range moves
 *  its own boundaries when the DOM around it changes, so reading r.endOffset
 *  halfway through the loop reads a number that the loop itself has already
 *  invalidated. That bug only shows up on selections that span two or more
 *  nodes, which is most of the interesting ones. */
function paintRange(r: Range, id: string, color: MarkColor, style: MarkStyle): number {
  const nodes: Text[] = []
  const walk = document.createTreeWalker(r.commonAncestorContainer, NodeFilter.SHOW_TEXT)
  let n: Node | null = walk.nextNode()
  while (n) {
    if (r.intersectsNode(n)) nodes.push(n as Text)
    n = walk.nextNode()
  }
  if (nodes.length === 0 && r.startContainer.nodeType === 3) nodes.push(r.startContainer as Text)

  const plan: { node: Text; from: number; to: number }[] = []
  for (const t of nodes) {
    const from = t === r.startContainer ? r.startOffset : 0
    const to = t === r.endContainer ? r.endOffset : t.data.length
    if (to > from) plan.push({ node: t, from, to })
  }

  let painted = 0
  for (const { node, from, to } of plan) {
    const piece = from > 0 ? node.splitText(from) : node
    if (to - from < piece.data.length) piece.splitText(to - from)
    const el = document.createElement('mark')
    el.className = 'edmk c' + color + (style === 'underline' ? ' und' : '')
    el.setAttribute('data-mark', id)
    piece.parentNode?.insertBefore(el, piece)
    el.appendChild(piece)
    painted++
  }
  return painted
}

/** Take every mark element back out and glue the text nodes back together.
 *  After this the section is exactly the DOM the renderer produced, which is
 *  the whole promise of the layer. */
export function unpaint(root: Element) {
  const els = Array.from(root.querySelectorAll('mark.edmk'))
  for (const el of els) {
    const parent = el.parentNode
    if (!parent) continue
    while (el.firstChild) parent.insertBefore(el.firstChild, el)
    parent.removeChild(el)
  }
  root.normalize()
}

/** Repaint a section from scratch. Always a full clear and redraw rather than
 *  an incremental patch: the DOM is the derived thing here, the mark list is
 *  the truth, and rebuilding is the only version of this that cannot drift.
 *  Returns the ids that could not be placed so the caller can say so. */
export function repaint(root: Element, marks: Mark[]): string[] {
  unpaint(root)
  const lost: string[] = []
  const hl = marks.filter(m => m.kind === 'highlight' && m.anchor)
  for (const m of hl) {
    const r = findAnchor(root, m.anchor as Anchor)
    if (!r) { lost.push(m.id); continue }
    const style: MarkStyle = m.anchor && m.anchor.style === 'underline' ? 'underline' : 'highlight'
    if (paintRange(r, m.id, m.color || 'yellow', style) === 0) lost.push(m.id)
  }
  return lost
}

/* ------------------------------------------------------------------ */
/* Freehand selection                                                  */
/* ------------------------------------------------------------------ */

interface Caret { node: Node; offset: number }

/** The one browser API that turns a screen coordinate back into a position in
 *  text. Blink and WebKit ship the old spelling, Gecko the new one, and both
 *  are worth having because this is the whole mechanism the pen rides on. */
function caretAt(x: number, y: number): Caret | null {
  type Legacy = { caretRangeFromPoint?: (x: number, y: number) => Range | null }
  type Modern = { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null }
  const legacy = document as unknown as Legacy
  if (typeof legacy.caretRangeFromPoint === 'function') {
    const r = legacy.caretRangeFromPoint(x, y)
    return r ? { node: r.startContainer, offset: r.startOffset } : null
  }
  const modern = document as unknown as Modern
  if (typeof modern.caretPositionFromPoint === 'function') {
    const pos = modern.caretPositionFromPoint(x, y)
    return pos ? { node: pos.offsetNode, offset: pos.offset } : null
  }
  return null
}

/** How far off a glyph a stroke may sit and still count. Generous below the
 *  baseline, because underlining means drawing under the words, and tight to
 *  the sides, because a line down the margin is a line down the margin. */
const PAD_X = 2
const PAD_ABOVE = 6
const PAD_BELOW = 12

/** caretRangeFromPoint answers with the nearest caret rather than admitting a
 *  miss, so a stroke in the margin comes back holding the sentence next to
 *  it. This is the check that turns that into a miss: the point has to
 *  actually land on the character it was given. */
function onGlyph(node: Node, offset: number, x: number, y: number): boolean {
  if (node.nodeType !== 3) return false
  const t = node as Text
  const start = Math.max(0, Math.min(offset, t.data.length - 1))
  if (t.data.length === 0) return false
  const r = document.createRange()
  try {
    r.setStart(t, start)
    r.setEnd(t, Math.min(start + 1, t.data.length))
  } catch { return false }
  const rects = r.getClientRects()
  for (let i = 0; i < rects.length; i++) {
    const b = rects[i]
    if (b.width === 0 && b.height === 0) continue
    if (x >= b.left - PAD_X && x <= b.right + PAD_X &&
        y >= b.top - PAD_ABOVE && y <= b.bottom + PAD_BELOW) return true
  }
  return false
}

const WORD = /[\p{L}\p{N}'’-]/u

/** Grow a span out to whole words. A stroke drawn by hand starts and ends
 *  mid-letter every time, and a mark that begins at "onstraint" is a mark
 *  nobody meant to make. */
function snapToWords(text: string, start: number, end: number): [number, number] {
  let s = start
  let e = end
  while (s > 0 && WORD.test(text[s - 1])) s--
  while (e < text.length && WORD.test(text[e])) e++
  while (s < e && !text[s].trim()) s++
  while (e > s && !text[e - 1].trim()) e--
  return [s, e]
}

/** Turn a drawn stroke into the text it was drawn over.
 *
 *  Every sampled point on the path is resolved to a caret position, the ones
 *  that landed inside this section are kept, and the span from the earliest
 *  to the latest is taken and grown to whole words. That is deliberately
 *  forgiving: underlining a line, striking through it, circling it and
 *  scribbling over it all describe the same span, and a reader should not
 *  have to know which gesture the implementation preferred.
 *
 *  Returns null when the stroke never crossed any text, which is the honest
 *  answer to a line drawn in the margin. */
export function rangeFromStroke(root: Element, points: { x: number; y: number }[]): Range | null {
  if (!points || points.length === 0) return null
  const f = flatten(root)
  if (!f.text) return null

  const hits: number[] = []
  for (const pt of points) {
    const c = caretAt(pt.x, pt.y)
    if (!c) continue
    if (!root.contains(c.node)) continue
    if (!onGlyph(c.node, c.offset, pt.x, pt.y)) continue
    const i = indexOfPoint(f, c.node, c.offset)
    if (i >= 0) hits.push(i)
  }
  if (hits.length === 0) return null

  const [s, e] = snapToWords(f.text, Math.min(...hits), Math.max(...hits))
  if (e <= s) return null

  const a = pointAt(f, s)
  const b = pointAt(f, e)
  if (!a || !b) return null
  const r = document.createRange()
  try {
    r.setStart(a.node, a.offset)
    r.setEnd(b.node, b.offset)
  } catch { return null }
  return r
}

/** The anchor for a range that was drawn rather than selected. Same three
 *  strings as any other mark, so nothing downstream needs to know how it was
 *  made. */
export function anchorFromRange(root: Element, r: Range, style: MarkStyle): Anchor | null {
  const a = anchorFromSelection(root, r)
  if (!a) return null
  return style === 'underline' ? { ...a, style } : a
}
