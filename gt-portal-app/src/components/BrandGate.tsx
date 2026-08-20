/** THE BRAND GATE. Shown wherever something is about to write in the
 *  customer's voice.
 *
 *  The content engine does not have a voice of its own and should never
 *  invent one. It writes from the brand record: what the business does, who
 *  it is for, how it sounds, and above all what it is allowed to claim. So
 *  every screen that is about to generate something checks the record is
 *  there first, and says plainly what it is missing when it is not.
 *
 *  This replaces the four questions the content setup used to ask, which
 *  collected a brand name, a positioning line, three topics and a list of
 *  banned words, and then threw all four away when the customer pressed
 *  continue. Asking for the same information twice and storing it neither
 *  time is the worst of both.
 *
 *  The claims line is the one worth reading twice. Every tool in this
 *  category will happily write "trusted by thousands" for a business with
 *  four customers. This one cannot, because the sentence is not in the
 *  record, and the record only holds what the customer confirmed they could
 *  stand behind.
 */
import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BrandRecord, isConfirmed, readiness } from '../lib/brand'
import { brandConfigured, getBrand } from '../lib/brandApi'

type State = 'loading' | 'none' | 'started' | 'ready' | 'offline'

export function BrandGate({ businessSlug, onState }: {
  businessSlug: string
  /** Lets the host screen gate its own controls on the same answer, rather
   *  than deciding separately and drifting out of step with what is drawn. */
  onState?: (ready: boolean) => void
}) {
  const [state, setState] = useState<State>('loading')
  const [record, setRecord] = useState<BrandRecord | null>(null)

  useEffect(() => {
    let live = true
    if (!brandConfigured()) { setState('offline'); return }
    if (!businessSlug) return
    getBrand(businessSlug)
      .then(r => {
        if (!live) return
        setRecord(r)
        if (!r) setState('none')
        else if (!r.provenance.confirmedAt) setState('started')
        else setState('ready')
      })
      .catch(() => { if (live) setState('none') })
    return () => { live = false }
  }, [businessSlug])

  useEffect(() => { if (onState) onState(state === 'ready') }, [state, onState])

  if (state === 'loading') {
    return <div className="setupcard"><p className="ssub">Checking your brand record.</p></div>
  }

  if (state === 'offline') {
    return (
      <div className="setupcard">
        <h2>The brand record is not switched on yet.</h2>
        <p className="ssub">The engine writes from a record of your business rather than
          inventing a voice for you, and that record is not available on this workspace yet.</p>
      </div>
    )
  }

  if (state === 'none' || state === 'started') {
    const started = state === 'started'
    return (
      <div className="setupcard">
        <h2>{started ? 'Your brand record is not finished.' : 'The engine writes from your brand record.'}</h2>
        <p className="ssub">Before it posts anything in your name it needs to know what you do,
          who you are talking to, how you sound, and what you are allowed to claim. The brand
          agent reads your website and drafts all of it, and you correct it line by line.</p>
        <p className="ssub">{started
          ? 'You started one and have not confirmed it. Nothing is used until you do.'
          : 'It takes about ten minutes and you only do it once.'}</p>
        <div className="act">
          <Link className="btn p" to="/agents/brand">
            {started ? 'Finish the brand record' : 'Set up the brand record'}
          </Link>
        </div>
      </div>
    )
  }

  /* Ready. Show what the engine will actually be working from, because a
     green tick tells the customer nothing they can check. Claims especially:
     if the list is short, the posts will be modest, and that is the honest
     consequence of a website that does not claim much. */
  const r = record as BrandRecord
  const stat = readiness(r)
  const claims = isConfirmed(r.proof.claims) ? r.proof.claims.values : []
  const never = isConfirmed(r.guardrails.neverSay) ? r.guardrails.neverSay.values : []
  const voice = isConfirmed(r.voice.character) ? r.voice.character.values : []

  return (
    <div className="setupcard">
      <h2>It writes from your brand record.</h2>
      <p className="ssub">{stat.confirmed} of {stat.total} lines confirmed. Every post is built
        from those and from nothing else.</p>

      <div className="bgrows">
        <div className="bgrow">
          <span className="lbl">It is talking about</span>
          <b>{(isConfirmed(r.identity.oneLine) && r.identity.oneLine.value) || 'Not set'}</b>
        </div>
        <div className="bgrow">
          <span className="lbl">To</span>
          <b>{(isConfirmed(r.audience.who) && r.audience.who.value) || 'Not set'}</b>
        </div>
        <div className="bgrow">
          <span className="lbl">Sounding</span>
          <b>{voice.length ? voice.join(', ') : 'Not set'}</b>
        </div>
        <div className="bgrow">
          <span className="lbl">It may claim</span>
          <b>{claims.length
            ? claims.length + (claims.length === 1 ? ' thing you confirmed' : ' things you confirmed')
            : 'Nothing yet, so posts will not make claims'}</b>
        </div>
        <div className="bgrow">
          <span className="lbl">It must never say</span>
          <b>{never.length ? never.join(', ') : 'Nothing set'}</b>
        </div>
      </div>

      <p className="sfine">Change any of it and the next post picks it up. Posts already
        published are not rewritten.</p>
      <div className="act">
        <Link className="btn g" to="/agents/brand">Open the brand record</Link>
      </div>
    </div>
  )
}
