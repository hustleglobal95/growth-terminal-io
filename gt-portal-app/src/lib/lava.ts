/** The lava.
 *
 *  A single warm mass that follows the pointer at a distance. It is background,
 *  not decoration on top of the work: every card in the portal is opaque, so
 *  the only places it is ever visible are the gutters and the margins. Move the
 *  mouse across a dense screen and almost nothing happens; move it across an
 *  empty one and the page warms where you are looking.
 *
 *  Three decisions worth recording.
 *
 *  The lag is the whole effect. Following exactly reads as a cursor accessory.
 *  Easing toward the pointer at a low factor per frame gives it mass, which is
 *  the difference between a light and a thing.
 *
 *  No blur filter. A large filter:blur on a moving element repaints a huge area
 *  every frame and is the usual reason effects like this cost 30fps. A radial
 *  gradient is soft to begin with and composites on the GPU for free.
 *
 *  It stops when nothing is happening. The loop parks itself once the mass has
 *  arrived and restarts on the next movement, so an idle tab is not burning a
 *  frame budget on a stationary circle.
 */

const SIZE = 900          // px across, deliberately much larger than a cursor
const EASE = 0.045        // fraction of the remaining distance per frame
const REST = 0.4          // px, close enough to stop

export function initLava(): () => void {
  /* Somebody who has asked for less motion has asked for exactly this to not
     happen, and a touch device has no pointer to follow. */
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
  const fine = matchMedia('(pointer: fine)').matches
  if (reduced || !fine) return () => {}

  const el = document.createElement('div')
  el.className = 'lava'
  el.setAttribute('aria-hidden', 'true')
  document.body.appendChild(el)

  /* Start in the middle so the first movement is a drift rather than a jump in
     from a corner. */
  let tx = innerWidth / 2, ty = innerHeight * 0.4
  let x = tx, y = ty
  let raf = 0, running = false

  const draw = () => {
    x += (tx - x) * EASE
    y += (ty - y) * EASE
    el.style.transform = `translate3d(${Math.round(x - SIZE / 2)}px,${Math.round(y - SIZE / 2)}px,0)`
    if (Math.abs(tx - x) < REST && Math.abs(ty - y) < REST) { running = false; return }
    raf = requestAnimationFrame(draw)
  }

  const start = () => { if (!running) { running = true; raf = requestAnimationFrame(draw) } }

  const onMove = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY; start() }
  /* Leaving the window parks the mass at the last known point rather than
     snapping it anywhere, so coming back does not produce a jump. */
  const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); running = false } }

  el.style.transform = `translate3d(${Math.round(x - SIZE / 2)}px,${Math.round(y - SIZE / 2)}px,0)`
  window.addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('visibilitychange', onVis)

  return () => {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onMove)
    document.removeEventListener('visibilitychange', onVis)
    el.remove()
  }
}
