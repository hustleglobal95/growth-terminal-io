/** The what-changed-while-you-were-away panel.
 *
 *  It opens by itself once, on the first render after a workspace loads with
 *  unread activity, and then never again until something new actually
 *  happens. A panel that reopens on every navigation is a panel people close
 *  without reading.
 *
 *  Anything that lands while the tab is open arrives as a toast instead. A
 *  modal that appears under somebody's cursor mid-click is worse than the
 *  information is worth.
 */
import React, { useEffect, useRef, useState } from 'react'
import { Event } from '../lib/teamLive'
import { KIND_LABEL, summarise } from '../lib/teamSeen'
import { agoLabel } from '../lib/teamInsight'
import { toast } from '../lib/bus'

export function UpdatesPanel({ items, now, workspaceName, onDismiss, onOpenActivity }: {
  items: Event[]
  now: number
  workspaceName: string
  onDismiss: () => void
  onOpenActivity: () => void
}) {
  const [all, setAll] = useState(false)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  /* Escape closes it, and focus starts on the dismiss button so a keyboard
     user is not dropped into a list with no way out. */
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  if (items.length === 0) return null
  const shown = all ? items : items.slice(0, 8)
  const actors = Array.from(new Set(items.map(i => i.actor)))

  return (
    <div className="updwrap" role="dialog" aria-modal="false" aria-label="Changes since you were last here">
      <div className="updcard">
        <div className="updhead">
          <span className="lbl">While you were away</span>
          <span className="sp" />
          <button ref={closeRef} className="updx" onClick={onDismiss} aria-label="Dismiss">Dismiss</button>
        </div>

        <p className="updlede">
          <b>{items.length} change{items.length === 1 ? '' : 's'}</b> in {workspaceName} since you were last
          here, by {actors.length === 1 ? actors[0] : actors.length + ' people'}.
        </p>

        <div className="updlist">
          {shown.map(e => (
            <div key={e.id} className="updrow">
              <span className={'updkind k-' + e.kind}>{KIND_LABEL[e.kind] || 'Update'}</span>
              <span className="updtext"><b>{e.actor}</b> {e.text}</span>
              <span className="updago">{agoLabel(new Date(e.ts).toISOString(), now)}</span>
            </div>
          ))}
        </div>

        {items.length > 8 && (
          <button className="ract" onClick={() => setAll(!all)}>
            {all ? 'Show less' : 'Show all ' + items.length}
          </button>
        )}

        <div className="updfoot">
          <button className="ract" onClick={onOpenActivity}>Open Activity</button>
          <span className="sp" />
          <button className="btn p mini" onClick={onDismiss}>Mark all as read</button>
        </div>
      </div>
    </div>
  )
}

/** The pill that reopens the panel after it has been dismissed, and the live
 *  watcher that toasts anything arriving while the tab is open. */
export function useLiveUpdates(items: Event[], enabled: boolean) {
  const seen = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!enabled) return
    const ids = new Set(items.map(i => i.id))
    if (seen.current === null) { seen.current = ids; return }   // first pass is the baseline
    const fresh = items.filter(i => !seen.current!.has(i.id))
    seen.current = ids
    if (fresh.length > 0) toast(summarise(fresh))
  }, [items, enabled])
}

export function UpdatesPill({ count, onClick }: { count: number; onClick: () => void }) {
  if (count < 1) return null
  return (
    <button className="updpill" onClick={onClick}
      title={count + ' change' + (count === 1 ? '' : 's') + ' since you were last here'}>
      <i />{count} new
    </button>
  )
}
