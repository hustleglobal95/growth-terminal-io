/** CONNECTIONS. Where a customer hands the engine permission to post.
 *
 *  Three things this screen does that most do not.
 *
 *  It states the prerequisite before they start. An Instagram account can
 *  only be posted to through the API when it is Business or Creator and has a
 *  Facebook Page attached. A personal account never can. The usual design
 *  discovers this at the moment the first post fails, days later, and the
 *  customer concludes the product is broken. This one says it on the way in.
 *
 *  It separates connected from working. An account can be connected and
 *  unpostable, and those look identical on every dashboard I have seen. Here
 *  a connected account with a problem is drawn as a problem, with the fix in
 *  the customer's own terms, because every one of these is fixed somewhere
 *  else: two in the Instagram app, one by reconnecting.
 *
 *  It admits when publishing is not live yet. Advanced access from Meta is a
 *  separate approval to having built the flow, and until it lands a customer
 *  can connect and nothing will ever post. Saying that up front costs one
 *  paragraph. Not saying it costs their trust the week they notice.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { Header } from './simple'
import { toast } from '../lib/bus'
import {
  ConnectedAccount, SocialState, beginConnect, disconnect,
  listSocial, problemText, socialConfigured
} from '../lib/social'
import {
  ThreadsAccount, ThreadsResult, beginThreadsConnect, listThreads,
  takeThreadsResult, threadsConfigured, threadsResultText
} from '../lib/threads'

export function Connections() {
  const [state, setState] = useState<SocialState | null>(null)
  const [busy, setBusy] = useState(false)
  /* Threads reports itself through the redirect marker. There is no read
     route on the engine yet, so this is the only thing the screen actually
     knows, and it says exactly that rather than drawing an account card out
     of nothing. */
  const [threads, setThreads] = useState<ThreadsResult | null>(null)
  const [thAccount, setThAccount] = useState<ThreadsAccount | null>(null)

  const load = useCallback(() => {
    if (!socialConfigured()) { setState({ accounts: [], publishingLive: false }); return }
    listSocial().then(setState).catch(() => setState({ accounts: [], publishingLive: false }))
  }, [])

  useEffect(load, [load])

  /* Facebook sends the browser back to the engine, which redirects here with
     a marker. Reading it here rather than on a route of its own keeps the
     customer on the screen they started from. */
  const loadThreads = useCallback(() => {
    if (!threadsConfigured()) return
    listThreads().then(setThThenClear).catch(() => setThAccount(null))
    function setThThenClear(a: ThreadsAccount | null) { setThAccount(a) }
  }, [])

  useEffect(loadThreads, [loadThreads])

  useEffect(() => {
    const t = takeThreadsResult()
    if (t) {
      setThreads(t)
      toast(threadsResultText(t))
      /* The engine has just written the connection, so ask it again rather
         than leaving the screen showing what was true a second ago. */
      if (t === 'connected') loadThreads()
    }
  }, [loadThreads])

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    /* The engine sends social=connected|cancelled|failed. The older
       connected=1|0 is still read because it costs two lines and a marker
       nobody handles is a customer staring at an unchanged screen. */
    const social = q.get('social')
    if (social === 'connected') {
      toast('Connected. Checking which accounts can publish.')
      window.history.replaceState({}, '', window.location.pathname)
      load()
    } else if (social === 'cancelled') {
      toast('You stopped before Facebook finished. Nothing was changed.')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (social === 'failed') {
      toast('Facebook could not complete that. Nothing was changed.')
      window.history.replaceState({}, '', window.location.pathname)
    } else if (q.get('connected') === '1') {
      toast('Connected. Checking which accounts can publish.')
      window.history.replaceState({}, '', window.location.pathname)
      load()
    } else if (q.get('connected') === '0') {
      toast('That did not finish. Nothing was changed.')
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [load])

  const connect = async () => {
    setBusy(true)
    try {
      const url = await beginConnect()
      /* Same tab on purpose. A popup gets blocked, and an OAuth flow that
         opens in a window the customer did not expect is the shape phishing
         takes, so it is worth not teaching them to accept it. */
      window.location.assign(url)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start the connection.')
      setBusy(false)
    }
  }

  const connectThreads = async () => {
    setBusy(true)
    try {
      window.location.assign(await beginThreadsConnect())
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not start the Threads connection.')
      setBusy(false)
    }
  }

  const drop = async (a: ConnectedAccount) => {
    setBusy(true)
    try {
      await disconnect(a.platform, a.id)
      toast('Disconnected. Nothing will publish there.')
      load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not disconnect.')
    } finally {
      setBusy(false)
    }
  }

  const accounts = (state && state.accounts) || []
  const healthy = accounts.filter(a => !a.problem)

  return (
    <div className="scr on">
      <Header title="Connections">
        {socialConfigured() && (
          <button className="btn p" disabled={busy} onClick={connect}>
            {accounts.length ? 'Connect another' : 'Connect Instagram and Facebook'}
          </button>
        )}
      </Header>

      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">

          <div className="greet">
            <h1>Where the engine is allowed to post.</h1>
            <p>You connect once through Facebook. Growth Terminal never sees your password,
              and you can revoke it from Facebook at any time without asking us.</p>
          </div>

          {!socialConfigured() && <NotSwitchedOn />}

          {socialConfigured() && state && !state.publishingLive && (
            <div className="emptypage wide">
              <span className="lbl">Publishing is not switched on</span>
              <h2>You can connect, but nothing will publish yet.</h2>
              <p>Posting on your behalf needs an approval from Meta that Growth Terminal is
                still waiting on. Connecting now is not wasted: the accounts stay connected and
                start publishing the day it lands. We would rather tell you than let you wonder
                why the queue never empties.</p>
            </div>
          )}

          {socialConfigured() && <Requirements />}

          {socialConfigured() && accounts.length > 0 && (
            <>
              <div className="shead" style={{ marginTop: 28 }}>
                <h2>Connected</h2>
                <span className="sp" />
                <span className="lbl">{healthy.length} of {accounts.length} can publish</span>
              </div>
              {accounts.map(a => (
                <AccountRow key={a.platform + a.id} a={a} busy={busy} onDrop={() => drop(a)} />
              ))}
            </>
          )}

          {socialConfigured() && state && accounts.length === 0 && (
            <div className="emptypage wide" style={{ marginTop: 22 }}>
              <span className="lbl">Nothing connected</span>
              <h2>No accounts yet.</h2>
              <p>Connect through Facebook and we will show you every Instagram account and Page
                you manage, and which of them can actually be posted to.</p>
              <div className="act">
                <button className="btn p" disabled={busy} onClick={connect}>
                  Connect Instagram and Facebook</button>
              </div>
            </div>
          )}

          <ThreadsCard
            configured={threadsConfigured()}
            account={thAccount}
            result={threads}
            busy={busy}
            onConnect={connectThreads}
          />

        </div>
      </div>
    </div>
  )
}

/** Threads, which is a different provider with a different consent screen and
 *  a different set of things it will let a person grant. Kept visually
 *  separate from the Instagram and Facebook block so nobody assumes
 *  connecting one connected the other. */
function ThreadsCard({ configured, account, result, busy, onConnect }: {
  configured: boolean
  account: ThreadsAccount | null
  result: ThreadsResult | null
  busy: boolean
  onConnect: () => void
}) {
  if (!configured) return null

  /* The engine's answer outranks the redirect marker. The marker says what
     happened a moment ago; the account says what is true now. */
  const live = !!account && !account.problem

  return (
    <div className="setupcard" style={{ marginTop: 28 }}>
      <div className="shead">
        <h2>Threads</h2>
        <span className="sp" />
        {live
          ? <span className="brtag on"><i />Connected</span>
          : <span className="brtag"><i />{account ? 'Cannot publish' : 'Not connected'}</span>}
      </div>

      <p className="ssub">A separate connection with its own permission screen. Connecting
        Instagram does not connect Threads, and revoking one leaves the other alone.</p>

      <div className="bgrows">
        <div className="bgrow">
          <span className="lbl">What you are granting</span>
          <b>Reading your own posts, publishing on your behalf, reading the replies you
            receive, replying to them, and reading your own insights.</b>
        </div>
        <div className="bgrow">
          <span className="lbl">What stays with you</span>
          <b>Your password, which we never see, and the connection itself, which you can
            revoke from Threads at any time without telling us.</b>
        </div>
      </div>

      {account && (
        <div className="cnrow" style={{ marginTop: 18 }}>
          {account.avatar
            ? <img className="cnav" src={account.avatar} alt="" />
            : <span className="cnav cnavblank" aria-hidden="true" />}
          <span className="cnmeta">
            <b>{account.username ? '@' + account.username : account.threadsUserId}</b>
            <span>{account.name || 'Threads account'}{expiryNote(account.expiresAt)}</span>
          </span>
        </div>
      )}

      {account && account.problem === 'token_expired' && (
        <p className="brev">
          <span className="lbl">Reconnect needed</span>
          Threads refused the stored permission. That happens when it is revoked from the
          Threads app, or when sixty days pass without a refresh. Connecting again fixes it.
        </p>
      )}

      {!account && result && result !== 'connected' && (
        <p className="brev">
          <span className="lbl">Not connected</span>
          {threadsResultText(result)}
        </p>
      )}

      <div className="act" style={{ marginTop: 16 }}>
        <button className="btn p" disabled={busy} onClick={onConnect}>
          {account ? 'Reconnect Threads' : 'Connect Threads'}
        </button>
      </div>

      <p className="sfine">Keyword search is deliberately not in that list. Threads does not
        offer it on the consent screen, so no amount of clicking Allow grants it.</p>
    </div>
  )
}

/** How long the permission has left, in the terms a person thinks in. Silent
 *  when the engine did not give a date, rather than printing "Invalid Date". */
function expiryNote(iso: string): string {
  if (!iso) return ''
  const at = Date.parse(iso)
  if (!Number.isFinite(at)) return ''
  const days = Math.round((at - Date.now()) / 86400000)
  if (days < 0) return '. The permission has already lapsed'
  if (days === 0) return '. The permission lapses today'
  if (days === 1) return '. The permission lapses tomorrow'
  return '. The permission lasts another ' + days + ' days'
}

function NotSwitchedOn() {
  return (
    <div className="emptypage wide">
      <span className="lbl">Not switched on yet</span>
      <h2>Connecting is not available on this workspace yet.</h2>
      <p>The exchange that turns a Facebook login into permission to post happens on the
        engine, and the engine does not have that route yet. Nothing is wrong with your
        account.</p>
    </div>
  )
}

/** Said before they start, not after it fails. */
function Requirements() {
  return (
    <div className="setupcard" style={{ marginTop: 22 }}>
      <h2>What Instagram requires before any of this works.</h2>
      <p className="ssub">These are Instagram's rules, not ours, and there is no way around
        them. Both take a couple of minutes in the Instagram app.</p>
      <div className="bgrows">
        <div className="bgrow">
          <span className="lbl">Account type</span>
          <b>Business or Creator. A personal account cannot be posted to through the API at
            all, whatever permissions you grant.</b>
        </div>
        <div className="bgrow">
          <span className="lbl">Linked Page</span>
          <b>The Instagram account must be linked to a Facebook Page. That link is what makes
            posting possible.</b>
        </div>
      </div>
      <p className="sfine">If either is missing we will tell you which one after you connect,
        rather than letting you find out when a post fails.</p>
    </div>
  )
}

function AccountRow({ a, busy, onDrop }: {
  a: ConnectedAccount
  busy: boolean
  onDrop: () => void
}) {
  const p = a.problem ? problemText(a.problem) : null
  return (
    <div className={'brrow' + (p ? '' : ' done')}>
      <div className="brhead">
        <span className="lbl">{a.platform === 'instagram' ? 'Instagram' : 'Facebook Page'}</span>
        <span className="sp" />
        {p
          ? <span className="brtag"><i />Cannot publish</span>
          : <span className="brtag on"><i />Publishing</span>}
      </div>

      <div className="cnrow">
        {a.avatar
          ? <img className="cnav" src={a.avatar} alt="" />
          : <span className="cnav cnavblank" aria-hidden="true" />}
        <span className="cnmeta">
          <b>{a.name}</b>
          <span>{a.pageName
            ? 'Through the Page ' + a.pageName
            : 'No Page attached'}</span>
        </span>
        <button className="btn g" disabled={busy} onClick={onDrop}>Disconnect</button>
      </div>

      {p && (
        <p className="brev">
          <span className="lbl">{p.title}</span>
          {p.what}
        </p>
      )}
    </div>
  )
}
