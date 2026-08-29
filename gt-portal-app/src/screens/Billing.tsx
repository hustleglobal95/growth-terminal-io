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

/* What was bought, stashed the moment checkout starts.
   It used to be only the balance, which quietly assumed every purchase grants
   credits. The workbook does not. A workbook buyer would pay successfully and
   then be told the credits had not arrived, which is alarming and false. So
   what is remembered is the purchase, not just the number.

   Session storage, not local: it belongs to this tab and this purchase. */
const KEY = 'gt_checkout_pending'

export type CheckoutKind = 'credits' | 'product'

export interface PendingCheckout {
  kind: CheckoutKind
  label: string
  balance: number | null
}

export function rememberCheckout(p: PendingCheckout | null) {
  try {
    if (p) sessionStorage.setItem(KEY, JSON.stringify(p))
    else sessionStorage.removeItem(KEY)
  } catch { /* private browsing, and this is only ever an improvement */ }
}

function readPending(): PendingCheckout | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw)
    return p && (p.kind === 'credits' || p.kind === 'product') ? p as PendingCheckout : null
  } catch { return null }
}

function clearPending() {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to do */ }
}

const ATTEMPTS = 10
const GAP_MS = 1500

type State =
  | { k: 'checking'; tries: number }
  | { k: 'arrived'; balance: number; gained: number | null }
  | { k: 'pending'; balance: number | null }
  | { k: 'unknown' }
  /* A purchase the portal has no way to verify. The workbook grants no
     credits, so there is no number here that can move, and polling one would
     only produce a false alarm. */
  | { k: 'unverifiable'; label: string }

export function CheckoutSuccess() {
  const nav = useNavigate()
  const [st, setSt] = useState<State>({ k: 'checking', tries: 0 })

  useEffect(() => {
    let alive = true
    const pending = readPending()

    /* Nothing in this workspace changes when a workbook is bought, so there is
       nothing to wait for and nothing to claim. Say what is true and point at
       the thing that actually is the confirmation. */
    if (pending && pending.kind === 'product') {
      clearPending()
      setSt({ k: 'unverifiable', label: pending.label })
      return
    }

    const before = pending ? pending.balance : null

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
            clearPending()
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

          {st.k === 'unverifiable' && (
            <div className="emptypage">
              <span className="lbl">Payment sent</span>
              <h2>Check your email for the receipt.</h2>
              <p>Stripe takes the payment and sends the receipt, and that email is the
                confirmation, not this page: this is only the address Stripe returns you to,
                and it can be opened by anyone. Nothing in the workspace changes when you buy
                {' '}{st.label}, so there is no balance here for us to point at.</p>
              <p>If the receipt has not arrived in a few minutes, send it to us when it does
                and we will match the payment to this workspace.</p>
              <div className="act">
                <button className="btn p" onClick={() => nav('/')}>Back to overview</button>
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
  useEffect(() => { clearPending() }, [])
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

/** The addresses the engine actually sends people to.
 *
 *  The server builds its success and cancel URLs itself, from PUBLIC_BASE_URL
 *  plus a hardcoded path: /checkout for a subscription, /settings/credits for
 *  a credit bundle. Neither existed in this app, so with PUBLIC_BASE_URL
 *  pointed here a buyer paid and landed on the 404 page. These two components
 *  are those addresses.
 *
 *  They are kept alongside /billing/success rather than replacing it. If the
 *  engine is later changed to honour the successUrl the portal already sends,
 *  that path is ready; until then, these are where people actually arrive.
 *  Two doors into the same room is cheap. A locked door is not.
 */

/* How the engine marks a cancelled return, per checkout type. */
const wasCancelled = (search: string) => {
  const q = new URLSearchParams(search)
  return q.get('canceled') === '1' || q.get('canceled') === 'true' ||
    q.get('purchase') === 'canceled' || q.get('cancelled') === '1'
}

type SubState =
  | { k: 'checking'; tries: number }
  | { k: 'active'; plan: string | null; trialEndsAt: string | null }
  | { k: 'pending' }
  | { k: 'unknown' }

/* Which states the engine reports for a subscription that entitles somebody
   to use the product. Anything else is not treated as a failure, only as not
   yet confirmed, because guessing wrong in the confident direction is how a
   product tells someone they are paid up when they are not. */
const LIVE_STATES = ['active', 'trialing', 'trial', 'past_due']

/** Where a subscription purchase lands: /checkout */
export function SubscriptionReturn() {
  const nav = useNavigate()
  const [st, setSt] = useState<SubState>({ k: 'checking', tries: 0 })
  const cancelled = wasCancelled(window.location.search)

  useEffect(() => {
    if (cancelled) return
    let alive = true
    const run = async () => {
      for (let i = 0; i < ATTEMPTS; i++) {
        if (!alive) return
        setSt({ k: 'checking', tries: i })
        try {
          const b = await api.billing()
          const live = b && (LIVE_STATES.includes(String(b.state || '').toLowerCase()) || !!b.planName)
          if (live) {
            if (!alive) return
            clearPending()
            setSt({ k: 'active', plan: b.planName || null, trialEndsAt: b.trialEndsAt || null })
            return
          }
        } catch {
          /* A failed read is not a failed payment. Keep asking. */
        }
        await new Promise(r => setTimeout(r, GAP_MS))
      }
      if (alive) setSt({ k: 'pending' })
    }
    void run()
    return () => { alive = false }
  }, [cancelled])

  if (cancelled) return <CheckoutCancel />

  return (
    <div className="scr on">
      <Header title="Checkout" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          {st.k === 'checking' && (
            <div className="emptypage">
              <span className="lbl">Confirming</span>
              <h2>Checking your subscription with the engine.</h2>
              <p>Stripe has sent you back. Your plan is activated by the engine when it
                receives the payment notification, which usually lands a moment after you do,
                so this waits for the subscription itself rather than assuming it.</p>
              <div className="act"><span className="mut">Attempt {st.tries + 1} of {ATTEMPTS}.</span></div>
            </div>
          )}

          {st.k === 'active' && (
            <div className="emptypage">
              <span className="lbl">Active</span>
              <h2>{st.plan ? st.plan + ' is active.' : 'Your subscription is active.'}</h2>
              <p>This is the subscription the engine reports against your workspace, not a
                message from the checkout page.{st.trialEndsAt ? ' Your trial runs until ' +
                  new Date(st.trialEndsAt).toLocaleDateString('en-GB',
                    { day: 'numeric', month: 'long', year: 'numeric' }) + '.' : ''}</p>
              <div className="act">
                <button className="btn p" onClick={() => nav('/')}>Open the workspace</button>
              </div>
            </div>
          )}

          {(st.k === 'pending' || st.k === 'unknown') && (
            <div className="emptypage">
              <span className="lbl">Not confirmed yet</span>
              <h2>Payment may have gone through, but the subscription is not showing yet.</h2>
              <p>Give it a few minutes and reload. Your receipt email is the record that the
                   payment happened; if the plan still has not appeared, send it to us and we
                   will attach it to this account.</p>
              <div className="act">
                <button className="btn p" onClick={() => window.location.reload()}>Check again</button>
                <button className="btn g" style={{ marginLeft: 8 }} onClick={() => nav('/')}>Overview</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Where a credit bundle lands: /settings/credits */
export function CreditsReturn() {
  if (wasCancelled(window.location.search)) return <CheckoutCancel />
  return <CheckoutSuccess />
}
