/** THE BRAND KIT. The visual half of a customer's brand.
 *
 *  The brand record says what the business is. This says what it looks like,
 *  and every rendered post is drawn with it: one accent, an ink, a paper, a
 *  mark, a handle and a closing line.
 *
 *  It is a separate record rather than another group inside BrandRecord, and
 *  that is deliberate. The brand record shipped and the engine validates its
 *  shape; adding a group to it means a schema change on both sides for
 *  something that has a different lifecycle anyway. A business rewrites its
 *  positioning once a year and swaps its logo file whenever the designer
 *  sends a new one.
 *
 *  ONE ACCENT, NOT A PALETTE.
 *
 *  The GT engine renders well because it has exactly one accent colour and
 *  everything else is neutral. Handed five brand colours it would produce the
 *  same soup every template driven tool produces. So the kit takes one accent
 *  and derives the rest, and a customer with a six colour brand guide picks
 *  the one that matters. That constraint is the product, not a limitation to
 *  apologise for.
 */

/** Where a kit value came from, same idea as the brand record: a colour
 *  sampled off a stylesheet is a guess until someone looks at it. */
export type KitSource = 'extracted' | 'confirmed' | 'written'

export interface KitColour {
  /** Hex, always six digits with the leading hash. */
  hex: string
  source: KitSource
  /** Where it was sampled from, when it was extracted. */
  evidence?: string
}

export interface BrandKit {
  version: 1
  businessSlug: string

  /** The one colour that marks the thing that matters on a post. Everything
   *  else on the creative is neutral. */
  accent: KitColour
  /** The dark. Text on light surfaces, and the background of dark posts. */
  ink: KitColour
  /** The light. Background of light posts, and text on dark ones. */
  paper: KitColour

  /** The mark, stored as an uploaded file reference rather than inline, so a
   *  large PNG never rides inside a record that gets read on every render. */
  logo: {
    /** Path or key the engine can fetch. Empty means no logo yet, and the
     *  layouts that need one are skipped rather than rendered with a hole. */
    file: string
    /** A logo drawn for a light background does not work on a dark one. Both
     *  are optional and the renderer picks; with only one, the layouts that
     *  need the other are skipped. */
    fileOnDark: string
    source: KitSource
  }

  /** How the account signs its posts. */
  mark: {
    /** The name as it should appear on a creative. */
    name: string
    /** With the at sign. Used in the footer and in captions. */
    handle: string
    /** The closing line on every post, usually a domain. */
    cta: string
    source: KitSource
  }

  /** Typeface choice is deliberately not here. Every layout is set in one
   *  family and the customer does not pick it, because a brand font uploaded
   *  by a customer is a licensing question we are not equipped to answer and
   *  a rendering failure we cannot debug for them. */

  confirmedAt: string | null
}

export function emptyKit(businessSlug: string): BrandKit {
  const c = (hex: string): KitColour => ({ hex, source: 'extracted' })
  return {
    version: 1,
    businessSlug,
    /* The accent starts empty rather than at a neutral, because there is no
       honest default for it. Every other value here has one: black text on
       white paper is a real design. An accent equal to the ink is not an
       accent, it is the absence of one, and a kit that reported itself ready
       in that state would render posts with nothing marked on them. So the
       customer picks this or the kit is not ready, and the screen says so. */
    accent: { hex: '', source: 'extracted' },
    ink: c('#111111'),
    paper: c('#FFFFFF'),
    logo: { file: '', fileOnDark: '', source: 'extracted' },
    mark: { name: '', handle: '', cta: '', source: 'extracted' },
    confirmedAt: null
  }
}

/** Six digit hex, uppercase, or empty when the input is not a colour.
 *  Accepts the three digit shorthand because stylesheets are full of it. */
export function normaliseHex(raw: string): string {
  const s = String(raw || '').trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(s)) return '#' + s.split('').map(ch => ch + ch).join('').toUpperCase()
  if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s.toUpperCase()
  return ''
}

/** Relative luminance, used for the contrast check below. */
function luminance(hex: string): number {
  const h = normaliseHex(hex)
  if (!h) return 0
  const v = [1, 3, 5].map(i => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]
}

export function contrast(a: string, b: string): number {
  const la = luminance(a), lb = luminance(b)
  const hi = Math.max(la, lb), lo = Math.min(la, lb)
  return (hi + 0.05) / (lo + 0.05)
}

/** What is wrong with this kit, in the customer's terms.
 *
 *  These are not style opinions. Each one is a combination that renders a
 *  post nobody can read, and a post nobody can read is worse than no post,
 *  because it goes out under their name and stays there.
 */
export function kitProblems(k: BrandKit): string[] {
  const out: string[] = []
  const accent = normaliseHex(k.accent.hex)
  const ink = normaliseHex(k.ink.hex)
  const paper = normaliseHex(k.paper.hex)

  if (!k.accent.hex.trim()) out.push('No accent colour chosen yet. It is the one colour that marks what each post is about.')
  else if (!accent) out.push('The accent colour is not a colour this can read.')
  if (!ink) out.push('The dark colour is not a colour this can read.')
  if (!paper) out.push('The light colour is not a colour this can read.')

  if (ink && paper && contrast(ink, paper) < 7) {
    out.push('Your dark and light colours are too close together. Text set in one on the other would be hard to read.')
  }
  /* Against paper is the case that matters: the accent carries the one thing
     each post is about, and a pale accent on a pale background loses exactly
     the word the post exists for. */
  if (accent && paper && contrast(accent, paper) < 3) {
    out.push('The accent is too pale against your light colour to mark anything on a post.')
  }
  if (accent && ink && contrast(accent, ink) < 3) {
    out.push('The accent is too close to your dark colour to stand out on a dark post.')
  }
  if (!k.mark.handle.trim()) out.push('No handle yet, so posts cannot sign themselves.')
  if (!k.mark.cta.trim()) out.push('No closing line yet, so posts have nothing to point at.')

  return out
}

/** A kit can render posts once it has readable colours and something to sign
 *  with. The logo is not required: a post without a mark is a legitimate
 *  design, a post nobody can read is not. */
export function kitReady(k: BrandKit): boolean {
  return kitProblems(k).length === 0
}

/** Seed a kit from a confirmed brand record, so a customer who has done the
 *  brand agent does not retype their own name. Colours are not guessable from
 *  text and are left at the defaults for them to set. */
export function kitFromRecord(businessSlug: string, name: string, url: string): BrandKit {
  const k = emptyKit(businessSlug)
  const host = String(url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '')
  k.mark.name = name || ''
  k.mark.cta = host || ''
  k.mark.handle = host ? '@' + host.split('.')[0] : ''
  return k
}
