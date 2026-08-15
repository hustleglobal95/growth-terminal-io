/** Where Stripe sends people back to.
 *
 *  The important decision in this file is that the success screen does not
 *  believe it is a success screen.
 *
 *  A success_url is a redirect and nothing more. Anyone can type it, a browser
 *  can restore it from history, and a link can be shared. Stripe's own docs are
 *  explicit that the redirect is not proof of payment: the webhook is. So this
 *  screen makes no claim of its own. It asks the engine what the balance is,
 *  compares it against what the balance was before checkout started, and
 *  reports what it actually finds.
 *
 *  That also handles the ordinary race. The browser usually gets back here
 *  before Stripe has finished calling the webhook, so the first read often
 *  shows the old number. Rather than either lying or showing a stale figure as
 *  though it were final, the screen polls for a short while and says which of
 *  the three things is true: the credits arrived, they have not arrived yet, or
 *  nothing about this session can be confirmed at all.
 */
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from './simple'
import { api } from '../lib/api'
import { useCredits } from '../lib/liveData'

/* The balance is stashed the moment checkout starts, so returning here can
   tell "42 credits, unchanged" apart from "42 credits, just arrived". Session
   storage, not local: it belongs to this tab and this purchase. */
const BEFORE_KEY = 'gt_credits_before_checkout'

export function rememberBalanceBeforeCheckout(balance: number | null) {
  try {
    if (typeof balance === 'number') sessionStorage.setItem(BEFORE_KEY, String(balance))
    else sessionStorage.removeItem(BEFORE_KEY)
  } catch { /* private browsing, and this is only ever an improvement */ }
}

function readBefore(): number | null {
  try {
    const v = sessionStorage.getItem(BEFORE_KEY)
    return v === null ? null : Number(v)
  } catch { return null }
}

function clearBefore() {
  try { sessionStorage.removeItem(BEFORE_KEY) } catch { /* nothing to do */ }
}

const ATTEMPTS = 10
const GAP_MS = 1500

type State =
  | { k: 'checking'; tries: number }
  | { k: 'arrived'; balance: number; gained: number | null }
  | { k: 'pending'; balance: number | null }
  | { k: 'unknown' }

export function CheckoutSuccess() {
  const nav = useNavigate()
  const [st, setSt] = useState<State>({ k: 'checking', tries: 0 })

  useEffect(() => {
    let alive = true
    const before = readBefore()

    const run = async () => {
      let last: number | null = null
      for (let i = 0; i < ATTEMPTS; i++) {
        if (!alive) return
        setSt({ k: 'checking', tries: i })
        try {
          const c = await api.credits()
          last = typeof c.balance === 'number' ? c.balance : null
          /* With a known starting point, "more than before" is the only
             honest evidence the portal can gather on its own. */
          if (before !== null && last !== null && last > before) {
            if (!alive) return
            clearBefore()
            void useCredits.refresh()
            setSt({ k: 'arrived', balance: last, gained: last - before })
            return
          }
          /* Without one, a positive balance is the most that can be said, and
             it is said as a balance rather than as a confirmation. */
          if (before === null && last !== null && last > 0) {
            if (!alive) return
            void useCredits.refresh()
            setSt({ k: 'arrived', balance: last, gained: null })
            return
          }
        } catch {
          /* A failed read is not a failed payment. Keep trying. */
        }
        await new Promise(r => setTimeout(r, GAP_MS))
      }
      if (!alive) return
      void useCredits.refresh()
      setSt(last === null ? { k: 'unknown' } : { k: 'pending', balance: last })
    }

    void run()
    return () => { alive = false }
  }, [])

  return (
    <div className="scr on">
      <Header title="Checkout" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          {st.k === 'checking' && (
            <div className="emptypage">
              <span className="lbl">Confirming</span>
              <h2>Checking your balance with the engine.</h2>
              <p>Stripe has sent you back here. The credits are added by the engine when
                it receives the payment notification, which usually lands a moment after
                you do, so this waits for the balance itself rather than assuming.</p>
              <div className="act"><span className="mut">Attempt {st.tries + 1} of {ATTEMPTS}.</span></div>
            </div>
          )}

          {st.k === 'arrived' && (
            <div className="emptypage">
              <span className="lbl">Confirmed</span>
              <h2>{st.gained !== null
                ? st.gained + (st.gained === 1 ? ' credit added.' : ' credits added.')
                : 'Your credits are in place.'}</h2>
              <p>The workspace now holds <b>{st.balance}</b>{' '}
                {st.balance === 1 ? 'credit' : 'credits'}. This is the balance the engine
                reports, not a message from the checkout page, so an analysis started now
                will run.</p>
              <div className="act">
                <button className="btn p" onClick={() => nav('/')}>Back to overview</button>
              </div>
            </div>
          )}

          {st.k === 'pending' && (
            <div className="emptypage">
              <span className="lbl">Not confirmed yet</span>
              <h2>Payment may have gone through, but the credits have not arrived.</h2>
              <p>The workspace still reports <b>{st.balance}</b>{' '}
                {st.balance === 1 ? 'credit' : 'credits'}. Notifications from the payment
                provider occasionally take longer than this, so give it a few minutes and
                reload. If the balance has not moved after that, nothing here has charged
                you twice: send us the receipt from your email and we will match it to the
                workspace.</p>
              <div className="act">
                <button className="btn p" onClick={() => window.location.reload()}>Check again</button>
                <button className="btn g" style={{ marginLeft: 8 }} onClick={() => nav('/')}>Back to overview</button>
              </div>
            </div>
          )}

          {st.k === 'unknown' && (
            <div className="emptypage">
              <span className="lbl">Could not check</span>
              <h2>We could not reach the engine to confirm your balance.</h2>
              <p>This says nothing about whether the payment succeeded, only that the
                portal could not ask. Reload in a moment, and check the sidebar: it shows
                the balance the engine reports.</p>
              <div className="act">
                <button className="btn p" onClick={() => window.location.reload()}>Try again</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function CheckoutCancel() {
  const nav = useNavigate()
  useEffect(() => { clearBefore() }, [])
  return (
    <div className="scr on">
      <Header title="Checkout" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          <div className="emptypage">
            <span className="lbl">Cancelled</span>
            <h2>Nothing was charged.</h2>
            <p>You left the checkout before it completed, so no payment was taken and your
              balance is unchanged. You can start again whenever you want to.</p>
            <div className="act">
              <button className="btn p" onClick={() => nav('/api-keys')}>Back to billing</button>
              <button className="btn g" style={{ marginLeft: 8 }} onClick={() => nav('/')}>Overview</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
