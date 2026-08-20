/** THE FEED. Where the customer puts things in, and sees what comes out.
 *
 *  One screen with two halves, on purpose. Every tool in this category
 *  separates "create" from "schedule" and the customer never sees the
 *  relationship between what they put in and what went out. Here the
 *  suggestions are on the left of the queue they produced, so the loop is
 *  visible: this thought became those three posts, and that one has never
 *  been used.
 *
 *  The held posts are shown, not hidden. When the composer refuses to build
 *  something because it would have said a banned word, or made a claim the
 *  customer never confirmed, that refusal appears in the queue with its
 *  reason. A machine that silently drops work is a machine nobody trusts, and
 *  the refusals are the most convincing thing this product does.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from './simple'
import { toast } from '../lib/bus'
import { businessLabel, useAccounts, useBusinesses } from '../lib/liveData'
import { WORKSPACE_SLUG } from './Brand'
import {
  QueuedPost, Suggestion, addSuggestion, feedAdvice, feedConfigured,
  listQueue, listSuggestions, retireSuggestion
} from '../lib/feed'

export function Feed() {
  const accs = useAccounts()
  const businesses = useBusinesses()
  const rows = useMemo(() => (businesses || []).filter(b => b && b.slug), [businesses])
  const slug = rows.length ? rows[0].slug : WORKSPACE_SLUG
  const label = rows.length ? businessLabel(rows[0].name, accs) : 'this workspace'

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [queue, setQueue] = useState<QueuedPost[]>([])
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    if (!feedConfigured()) return
    listSuggestions(slug).then(setSuggestions).catch(() => setSuggestions([]))
    listQueue(slug).then(setQueue).catch(() => setQueue([]))
  }, [slug])

  useEffect(load, [load])

  const advice = feedAdvice(suggestions, queue.filter(q => q.state === 'queued').length, 1)
  const held = queue.filter(q => q.state === 'held')

  return (
    <div className="scr on">
      <Header title="Feed">
        {feedConfigured() && (
          <button className="btn p" onClick={() => setOpen(true)}>Feed it something</button>
        )}
      </Header>

      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">

          <div className="greet">
            <h1>You feed it thoughts. It makes the posts.</h1>
            <p>One line is a suggestion. The engine shapes it against your brand record, renders
              it in your colours, and puts it in the queue. It does not invent things to say
              for {label}.</p>
          </div>

          {!feedConfigured() && (
            <div className="emptypage wide">
              <span className="lbl">Not switched on yet</span>
              <h2>The feed is not available on this workspace yet.</h2>
              <p>Suggestions and the queue live on the engine, and it does not have those routes
                yet. Nothing is wrong with your account.</p>
            </div>
          )}

          {feedConfigured() && advice && (
            <div className="setupcard" style={{ marginTop: 20 }}>
              <h2>{suggestions.length === 0 ? 'Start it off.' : 'It could use more.'}</h2>
              <p className="ssub">{advice}</p>
              <div className="act">
                <button className="btn p" onClick={() => setOpen(true)}>Feed it something</button>
              </div>
            </div>
          )}

          {feedConfigured() && held.length > 0 && (
            <>
              <div className="shead" style={{ marginTop: 28 }}>
                <h2>Held back</h2>
                <span className="sp" />
                <span className="lbl">{held.length} not sent</span>
              </div>
              {held.map(h => (
                <div key={h.id} className="brrow">
                  <div className="brhead">
                    <span className="lbl">{h.layout}</span>
                    <span className="sp" />
                    <span className="brtag"><i />Held</span>
                  </div>
                  <p className="brev">{h.heldReason}</p>
                </div>
              ))}
              <p className="sfine" style={{ marginTop: 10 }}>These were built and then refused,
                against the lines you drew in your brand record. Change the record and the next
                one is allowed.</p>
            </>
          )}

          {feedConfigured() && suggestions.length > 0 && (
            <>
              <div className="shead" style={{ marginTop: 28 }}>
                <h2>What you have fed it</h2>
                <span className="sp" />
                <span className="lbl">{suggestions.filter(s => s.state !== 'retired').length} live</span>
              </div>
              {suggestions.filter(s => s.state !== 'retired').map(s => (
                <div key={s.id} className="brrow done">
                  <div className="brhead">
                    <span className="lbl">
                      {s.usedCount === 0
                        ? 'Not used yet'
                        : s.usedCount + (s.usedCount === 1 ? ' post' : ' posts')}
                    </span>
                    <span className="sp" />
                    <button className="ract" disabled={busy} onClick={async () => {
                      setBusy(true)
                      try { await retireSuggestion(s.id); toast('Retired. It will not be used again.'); load() }
                      catch (e) { toast(e instanceof Error ? e.message : 'Could not retire that.') }
                      finally { setBusy(false) }
                    }}>Retire</button>
                  </div>
                  <p className="fline">{s.line}</p>
                  {s.items.length > 0 && (
                    <p className="brev">{s.items.length} items, so it can also be made as a list</p>
                  )}
                </div>
              ))}
            </>
          )}

        </div>
      </div>

      {open && (
        <FeedModal
          busy={busy}
          onClose={() => setOpen(false)}
          onSubmit={async v => {
            setBusy(true)
            try {
              await addSuggestion({ businessSlug: slug, ...v })
              toast('Fed. It will appear in the queue as it gets built.')
              setOpen(false)
              load()
            } catch (e) {
              toast(e instanceof Error ? e.message : 'That did not go in.')
            } finally { setBusy(false) }
          }}
        />
      )}
    </div>
  )
}

/** The intake.
 *
 *  One required field and three optional ones. The optional ones are shaping,
 *  not questions: a customer who fills only the line gets posts, and a
 *  customer who fills the items gets a list as well. Asking for more up front
 *  is how an intake box goes unused. */
function FeedModal({ busy, onClose, onSubmit }: {
  busy: boolean
  onClose: () => void
  onSubmit: (v: { line: string; emphasis: string; items: string[]; link: string }) => void
}) {
  const [line, setLine] = useState('')
  const [emphasis, setEmphasis] = useState('')
  const [items, setItems] = useState('')
  const [link, setLink] = useState('')

  /* Marking a phrase that is not in the line would render nothing, so it is
     caught here rather than producing a post with no accent on it. */
  const emphasisOk = !emphasis.trim() || line.toLowerCase().includes(emphasis.trim().toLowerCase())

  return (
    <div className="tmoverlay" onClick={busy ? undefined : onClose}>
      <div className="tmmodal" onClick={e => e.stopPropagation()}>
        <div className="tmhead">
          <span className="nm" style={{ fontSize: 15 }}>Feed it something</span>
          <span className="sp" />
          <button className="ract" onClick={onClose} disabled={busy}>Close</button>
        </div>

        <label className="rl">The thought, in your words
          <textarea className="tminput tmarea" value={line} disabled={busy}
            onChange={e => setLine(e.target.value)}
            placeholder="Something you would say to a customer who asked what you do" />
        </label>

        <label className="rl">A phrase to mark in your colour
          <input className="tminput" value={emphasis} disabled={busy}
            onChange={e => setEmphasis(e.target.value)}
            placeholder="Optional. Must be a phrase from the line above." />
        </label>
        {!emphasisOk && (
          <p className="tmnote">That phrase is not in the line, so nothing would be marked.
            It has to appear in the text above, word for word.</p>
        )}

        <label className="rl">Points to make, one per line
          <textarea className="tminput tmarea" value={items} disabled={busy}
            onChange={e => setItems(e.target.value)}
            placeholder="Optional. Three or more turns this into a list post as well." />
        </label>

        <label className="rl">A link
          <input className="tminput" value={link} disabled={busy}
            onChange={e => setLink(e.target.value)} placeholder="Optional" />
        </label>

        <p className="tmnote">It will be shaped against your brand record. Anything that would
          break a rule you set there gets held back and shown to you, rather than posted.</p>

        <button className="btn p" disabled={busy || line.trim().length < 8 || !emphasisOk}
          onClick={() => onSubmit({
            line: line.trim(),
            emphasis: emphasis.trim(),
            items: items.split('\n').map(s => s.trim()).filter(Boolean),
            link: link.trim()
          })}>
          {busy ? 'Feeding' : 'Feed it'}
        </button>
      </div>
    </div>
  )
}
