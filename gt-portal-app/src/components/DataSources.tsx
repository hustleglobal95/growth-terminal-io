/** WHERE YOUR NUMBERS COME FROM.
 *
 *  Every figure in this product currently arrives because a person remembered
 *  to upload a workbook. A connected source removes the remembering, which is
 *  the difference between a tool somebody visits and one that is simply true
 *  when they arrive.
 *
 *  THREE RULES THIS SECTION HOLDS.
 *
 *  The list of providers comes from the engine, never from here. The engine
 *  checks, per request, whether each provider's client credentials are
 *  actually set, and a provider without them is drawn as unavailable rather
 *  than given a Connect button that fails with a 503.
 *
 *  Connected and working are separate words. A grant can be perfectly valid
 *  while every pull against it fails, and the reverse. Both are shown, because
 *  a green tick over a source that stopped feeding a month ago is how a
 *  customer ends up trusting a stale number.
 *
 *  A failure says what to do. The engine already classifies why a pull failed,
 *  and each class has a different fix: reconnect, wait, or nothing at all.
 *  Printing "sync failed" throws that away and puts the customer on support.
 */
import React, { useCallback, useEffect, useState } from 'react'
import { toast } from '../lib/bus'
import {
  listIntegrations, startConnect, disconnect, resync,
  connectStripe, disconnectStripe,
  providerLabel, providerContributes, needsShop,
  health, failureText, since, justConnected,
} from '../lib/integrations'
import type { Connection, IntegrationsState, ProviderKey, Health } from '../lib/integrations'

type Load = 'loading' | 'ready' | 'failed'

const HEALTH_WORD: Record<Health, string> = {
  working: 'Feeding',
  failing: 'Not feeding',
  reconnect: 'Needs reconnecting',
  waiting: 'Connected, nothing pulled yet',
  off: 'Disconnected',
}

export function DataSources() {
  const [load, setLoad] = useState<Load>('loading')
  const [state, setState] = useState<IntegrationsState | null>(null)
  const [why, setWhy] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [shop, setShop] = useState('')
  const [asking, setAsking] = useState<ProviderKey | null>(null)

  const read = useCallback(async () => {
    try {
      setState(await listIntegrations())
      setLoad('ready')
    } catch (e) {
      setWhy(e instanceof Error ? e.message : 'Could not reach the engine.')
      setLoad('failed')
    }
  }, [])

  useEffect(() => { read() }, [read])

  /* The engine appends ?connected= when it sends somebody back from a
     provider. Say which one landed, then take the marker out of the URL so a
     refresh does not congratulate them twice. */
  useEffect(() => {
    const p = justConnected(window.location.search)
    if (!p) return
    toast(providerLabel(p) + ' is connected.')
    const url = new URL(window.location.href)
    url.searchParams.delete('connected')
    window.history.replaceState({}, '', url.toString())
  }, [])

  const connected = (k: ProviderKey): Connection | undefined =>
    state?.connections.find(c => c.provider === k && c.status !== 'revoked')

  const go = async (k: ProviderKey, shopSlug?: string) => {
    setBusy(k)
    try {
      if (k === 'stripe') {
        await connectStripe()
        toast('Stripe is connected.')
        await read()
        return
      }
      /* Leaving the app is the point: the permission screen belongs to the
         provider and must be seen on their domain, not in a frame here. */
      window.location.href = await startConnect(k, shopSlug)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That did not start.')
    } finally {
      setBusy(null)
      setAsking(null)
      setShop('')
    }
  }

  const drop = async (c: Connection) => {
    setBusy(c.id)
    try {
      if (c.provider === 'stripe') await disconnectStripe()
      else await disconnect(c.id)
      toast(providerLabel(c.provider) + ' is disconnected. Nothing already collected is deleted.')
      await read()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That did not disconnect.')
    } finally { setBusy(null) }
  }

  const pull = async (c: Connection) => {
    setBusy(c.id)
    try {
      await resync(c.id)
      toast('Asked for a fresh pull. It runs in the background.')
      await read()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That did not start a pull.')
    } finally { setBusy(null) }
  }

  return (
    <div className="setupcard dscard">
      <div className="shead">
        <h2>Where your numbers come from</h2>
      </div>

      <p className="ssub">Connect a source once and the engine pulls from it on a schedule,
        so an analysis reads what is true today rather than whatever was last uploaded. A
        spreadsheet still works and stays the fallback: a connected source only wins for the
        figures it actually carries.</p>

      {load === 'loading' && (
        <div className="dsgrid">{[0, 1, 2, 3].map(i => (
          <div key={i} className="dstile skel" aria-hidden="true" />
        ))}</div>
      )}

      {load === 'failed' && (
        <p className="dsfail">{why} Nothing is disconnected by this; the screen simply
          cannot read the list right now.</p>
      )}

      {load === 'ready' && state && (
        <>
          <div className="dsgrid">
            {state.providers.map(p => {
              const c = connected(p.key)
              return (
                <Tile
                  key={p.key}
                  provider={p.key}
                  configured={p.configured}
                  conn={c}
                  busy={busy === p.key || (c ? busy === c.id : false)}
                  asking={asking === p.key}
                  shop={shop}
                  setShop={setShop}
                  onAsk={() => setAsking(p.key)}
                  onCancel={() => { setAsking(null); setShop('') }}
                  onConnect={s => go(p.key, s)}
                  onDrop={() => c && drop(c)}
                  onPull={() => c && pull(c)}
                />
              )
            })}
          </div>

          <p className="sfine dsnote">Growth Terminal never sees a password. Each connection is
            a permission you grant at the provider and can withdraw there at any time. Tokens
            are encrypted before they are stored.</p>
        </>
      )}
    </div>
  )
}

function Tile(p: {
  provider: ProviderKey
  configured: boolean
  conn: Connection | undefined
  busy: boolean
  asking: boolean
  shop: string
  setShop: (v: string) => void
  onAsk: () => void
  onCancel: () => void
  onConnect: (shop?: string) => void
  onDrop: () => void
  onPull: () => void
}) {
  const { conn: c } = p
  const state: Health | null = c ? health(c) : null
  const problem = c ? failureText(c) : null
  const last = c ? since(c.lastSuccessAt) : null

  return (
    <div className={'dstile' + (state ? ' on' : '') + (state === 'failing' || state === 'reconnect' ? ' bad' : '')}>
      <div className="dsh">
        <b>{providerLabel(p.provider)}</b>
        {state && (
          <span className={'dschip ' + state}><i />{HEALTH_WORD[state]}</span>
        )}
      </div>

      <p className="dsc">{providerContributes(p.provider)}</p>

      {c && state === 'working' && last && (
        <p className="dsm">Last pulled {last}.</p>
      )}
      {c && state === 'waiting' && (
        <p className="dsm">The first pull runs on the next schedule.</p>
      )}
      {c && problem && <p className="dsm bad">{problem}</p>}
      {c && c.consecutiveFailures > 1 && (
        <p className="dsm">{c.consecutiveFailures} pulls in a row have failed.</p>
      )}

      {!p.configured && !c && (
        <p className="dsm off">Not available yet. This one needs its credentials set on the
          server before anybody can connect it.</p>
      )}

      {/* Shopify cannot start without knowing which store, so it asks first
          rather than sending somebody to a broken authorize URL. */}
      {p.asking && needsShop(p.provider) && (
        <div className="dsshop">
          <label className="lbl" htmlFor={'shop-' + p.provider}>Your store</label>
          <input id={'shop-' + p.provider} className="tminput" value={p.shop}
            placeholder="your-store" autoComplete="off"
            onChange={e => p.setShop(e.target.value.trim().toLowerCase())} />
          <p className="sfine">The part before .myshopify.com</p>
          <div className="dsacts">
            <button className="btn g" disabled={p.shop.length < 2 || p.busy}
              onClick={() => p.onConnect(p.shop)}>Continue</button>
            <button className="btn g" onClick={p.onCancel}>Cancel</button>
          </div>
        </div>
      )}

      {!p.asking && (
        <div className="dsacts">
          {/* Secondary on purpose. A source nobody has connected is an
              opportunity, not a problem, and the accent on this screen is
              reserved for the connection that has actually broken. */}
          {!c && p.configured && (
            <button className="btn g" disabled={p.busy}
              onClick={() => (needsShop(p.provider) ? p.onAsk() : p.onConnect())}>
              {p.busy ? 'Starting' : 'Connect'}
            </button>
          )}
          {c && state === 'reconnect' && (
            <button className="btn p" disabled={p.busy}
              onClick={() => (needsShop(p.provider) ? p.onAsk() : p.onConnect())}>Reconnect</button>
          )}
          {c && (
            <>
              <button className="dsbtn" disabled={p.busy} onClick={p.onPull}>Pull now</button>
              <button className="dsbtn q" disabled={p.busy} onClick={p.onDrop}>Disconnect</button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
