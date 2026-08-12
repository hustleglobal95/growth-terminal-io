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

/** Three strings, not offsets. Offsets break the moment anything upstream of
 *  the selection changes by a character, and they fail silently in the worst
 *  way: the highlight lands on the wrong sentence. A quote plus its
 *  neighbours either matches or it does not, and a mark that cannot be placed
 *  is dropped rather than guessed at. */
export interface Anchor {
  quote: string
  prefix: string
  suffix: string
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

export async function listMarks(analysisId: string): Promise<Mark[]> {
  const rows = await live<Mark[]>(base(analysisId))
  return Array.isArray(rows) ? rows : []
}

export async function createMark(
  analysisId: string,
  body: { kind: MarkKind; sectionId: string; anchor?: Anchor; color?: MarkColor; body?: string }
): Promise<Mark> {
  return live<Mark>(base(analysisId), { method: 'POST', body: JSON.stringify(body) })
}

export async function patchMark(
  analysisId: string, markId: string, body: { color?: MarkColor; body?: string }
): Promise<Mark> {
  return live<Mark>(base(analysisId) + '/' + encodeURIComponent(markId),
    { method: 'PATCH', body: JSON.stringify(body) })
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
function paintRange(r: Range, id: string, color: MarkColor): number {
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
    el.className = 'edmk c' + color
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
    if (paintRange(r, m.id, m.color || 'yellow') === 0) lost.push(m.id)
  }
  return lost
}
