/** LIGHT OR DARK, AND NOTHING CLEVER.
 *
 *  The app opens light and stays light until somebody chooses otherwise. The
 *  system preference is deliberately not consulted, because a preference the
 *  application reads without being asked is a preference the person cannot
 *  reason about: they change something in their operating system months later
 *  and this looks broken. One control, one choice, remembered.
 *
 *  THE CHOICE IS WRITTEN BEFORE THE FIRST PAINT, not after it. A theme applied
 *  by React has already lost: the browser paints the light stylesheet, then the
 *  attribute lands and everything flips, and that white flash is worst exactly
 *  where it matters most, which is somebody opening a dark app at night. The
 *  companion to this file is four lines in index.html that run before the
 *  bundle and set the attribute off the same key.
 *
 *  Stored against the browser rather than the person, and that is the honest
 *  limit: it is a property of this screen in this browser, like a window size.
 *  Signing in somewhere else starts light again.
 */

export type Theme = 'light' | 'dark'

export const THEME_KEY = 'gt.theme'

export function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' }
  catch { return 'light' }
}

/** The attribute is the single source of truth for the stylesheet, and the
 *  event is how anything drawing its own colours finds out. Charts read the
 *  token block into real attributes at render time, because an exported SVG
 *  carries no stylesheet, so they cannot just be restyled by the cascade. */
export function applyTheme(t: Theme): void {
  try {
    const root = document.documentElement
    if (t === 'dark') root.setAttribute('data-theme', 'dark')
    else root.removeAttribute('data-theme')
    window.dispatchEvent(new CustomEvent('gt:theme', { detail: t }))
  } catch { /* no document */ }
}

export function setTheme(t: Theme): void {
  try { localStorage.setItem(THEME_KEY, t) } catch { /* private mode */ }
  applyTheme(t)
}

/** Subscribe to the choice. Returns the unsubscribe. Also listens for storage,
 *  so two tabs of the portal do not disagree about what theme this browser is
 *  in after somebody switches in one of them. */
export function onTheme(fn: (t: Theme) => void): () => void {
  const local = () => fn(readTheme())
  const storage = (e: StorageEvent) => { if (e.key === THEME_KEY) { applyTheme(readTheme()); fn(readTheme()) } }
  window.addEventListener('gt:theme', local)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener('gt:theme', local)
    window.removeEventListener('storage', storage)
  }
}
