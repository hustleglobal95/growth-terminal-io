/** The question mark that explains a box.
 *
 *  Sits in the top right corner of a panel and does nothing until it is asked.
 *  That was the point of choosing it over permanent subtitles: an analysis is a
 *  document somebody may be presenting to a client, and a report carrying a
 *  paragraph of tutorial under every heading reads like it is apologising for
 *  itself. Someone who already knows what a decision gate is never has to see
 *  the sentence explaining it.
 *
 *  Opening one closes any other, because two explanations open at once turns
 *  the report into a worksheet. There is no need for shared state to do it:
 *  each panel owns its own, and a single window event tells the rest to shut.
 */
import React, { useEffect, useState } from 'react'
import { EXPLAIN } from '../lib/explain'

const CLOSE_ALL = 'gt-why-close'

export function Why({ k }: { k: string }) {
  const e = EXPLAIN[k]
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    /* Close when another one opens, and on Escape, so a keyboard user is never
       left with a panel they cannot dismiss without the mouse. */
    const onOther = (ev: Event) => { if ((ev as CustomEvent).detail !== k) setOpen(false) }
    const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setOpen(false) }
    window.addEventListener(CLOSE_ALL, onOther as EventListener)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener(CLOSE_ALL, onOther as EventListener)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, k])

  /* An unknown key renders nothing rather than an empty bubble, so adding a
     panel before writing its copy degrades quietly. */
  if (!e) return null

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next) window.dispatchEvent(new CustomEvent(CLOSE_ALL, { detail: k }))
  }

  return (
    <>
      <button type="button" className={'why' + (open ? ' on' : '')}
        onClick={toggle} aria-expanded={open}
        aria-label={(open ? 'Hide explanation: ' : 'Explain: ') + e.t}>
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <p className="whybody" role="note">
          <b>{e.t}.</b> {e.b}
        </p>
      )}
    </>
  )
}
