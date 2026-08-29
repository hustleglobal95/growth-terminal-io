import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../lib/bus'
import { Header } from './simple'
import { BrandGate } from '../components/BrandGate'
import { WORKSPACE_SLUG } from './Brand'
import { businessLabel, useAccounts, useBusinesses } from '../lib/liveData'

/** Content machine setup. Five steps take any account from nothing to a
 *  running engine: connect the platforms, seed the creative bank, set the
 *  voice, pick the schedule, launch. Connections are simulated until the
 *  content API lands; every state change behaves exactly as the live flow
 *  will, so the backend swap changes no UX. */

interface Pf { n: string; ph: string; on: boolean; h: string; slot: string }

const START: Pf[] = [
  { n: 'Instagram', ph: '@yourbrand', on: false, h: '', slot: '18:00' },
  { n: 'Facebook', ph: 'Your page name', on: false, h: '', slot: '18:15' },
  { n: 'Threads', ph: '@yourbrand', on: false, h: '', slot: '19:00' },
  { n: 'TikTok', ph: '@yourbrand', on: false, h: '', slot: '20:30' }
]

/* Voice became Brand: the step used to ask four questions and throw the
   answers away. It now shows the brand record the engine actually writes
   from, and sends the customer to build one when there is not one. */
const STEPS = ['Platforms', 'Creative bank', 'Brand', 'Schedule', 'Launch']

export function ContentSetup() {
  const nav = useNavigate()
  const [step, setStep] = useState(0)
  const [pfs, setPfs] = useState<Pf[]>(START)
  const [assets, setAssets] = useState(0)
  const [brandReady, setBrandReady] = useState(false)
  const accs = useAccounts()
  const businesses = useBusinesses()
  const rows = (businesses || []).filter(b => b && b.slug)
  const slug = rows.length ? rows[0].slug : WORKSPACE_SLUG
  const brand = rows.length ? businessLabel(rows[0].name, accs) : ''
  const [daily, setDaily] = useState(1)
  const [tz, setTz] = useState('America/New_York')

  const connected = useMemo(() => pfs.filter(p => p.on), [pfs])

  const connect = (i: number) => {
    setPfs(ps => ps.map((p, j) => j === i
      ? { ...p, on: !p.on, h: !p.on ? (p.n === 'Facebook' ? (brand || 'Your page') : '@' + (brand || 'yourbrand').toLowerCase().replace(/[^a-z0-9]/g, '')) : '' }
      : p))
    const p = pfs[i]
    toast(p.on ? p.n + ' disconnected.' : p.n + ' connected. The engine can post here now.')
  }

  const addAssets = (n: number, what: string) => {
    setAssets(a => a + n)
    toast(n + ' ' + what + ' added to the bank.')
  }

  const canNext =
    step === 0 ? connected.length > 0 :
    step === 1 ? assets >= 10 :
    step === 2 ? brandReady :
    true

  const nextHint =
    step === 0 ? 'Connect at least one platform to continue.' :
    step === 1 ? 'Seed at least 10 assets so the first week has range. ' + assets + ' of 10.' :
    step === 2 ? 'The engine needs a confirmed brand record before it can write anything.' : ''

  const launch = () => {
    toast('Engine is live. First post goes out at the next slot.')
    nav('/content')
  }

  return (
    <div className="scr on">
      <Header title="Content setup" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap setupwrap">

          <div className="setuprail" role="list" aria-label="Setup steps">
            {STEPS.map((s, i) => (
              <button key={s} role="listitem" className={'setupstep' + (i === step ? ' on' : '') + (i < step ? ' done' : '')}
                onClick={() => { if (i < step) setStep(i) }} disabled={i > step}>
                <span className="stepnum">{i < step ? '✓' : i + 1}</span>{s}
              </button>
            ))}
          </div>

          <div className="setupbody">

            {step === 0 && (
              <div className="setupcard">
                <h2>Connect the accounts this machine posts to.</h2>
                <p className="ssub">One machine runs one brand. Each platform gets its own daily slot, and you can add or remove platforms any time.</p>
                {pfs.map((p, i) => (
                  <div key={p.n} className="pfrow setupf">
                    <span className="pfchip">{p.n}</span>
                    <span className="pfmeta">
                      <b>{p.on ? p.h : 'Not connected'}</b>
                      <span>{p.on ? 'Ready to post' : p.ph}</span>
                    </span>
                    <button className={'btn ' + (p.on ? 'g' : 'p')} onClick={() => connect(i)}>
                      {p.on ? 'Disconnect' : 'Connect'}</button>
                  </div>
                ))}
                <p className="sfine">Connecting opens the platform's own sign in. Growth Terminal never sees the password, it holds a posting permission you can revoke from the platform at any time.</p>
              </div>
            )}

            {step === 1 && (
              <div className="setupcard">
                <h2>Seed the creative bank.</h2>
                <p className="ssub">The engine builds every post from what you put here: raw video, product shots, screenshots, testimonials, copy you like. More range in the bank means less repetition in the feed.</p>
                <div className="bankdrop" role="button" tabIndex={0}
                  onClick={() => addAssets(8, 'files')}
                  onKeyDown={e => { if (e.key === 'Enter') addAssets(8, 'files') }}>
                  <b>Drop files here</b>
                  <span>Video, images, audio and text. Or click to browse.</span>
                </div>
                <div className="bankrow">
                  <button className="btn g" onClick={() => addAssets(5, 'posts from your feed')}>Import your best posts</button>
                  <button className="btn g" onClick={() => addAssets(3, 'links')}>Paste links</button>
                  <span className="bankcount"><b>{assets}</b> assets in the bank</span>
                </div>
              </div>
            )}

            {step === 2 && (
              <BrandGate businessSlug={slug} onState={setBrandReady} />
            )}

            {step === 3 && (
              <div className="setupcard">
                <h2>Set the schedule.</h2>
                <p className="ssub">The engine posts at each platform's slot in your timezone,
                                      and moves slots on its own when the data says a better
                                      hour exists.</p>
                <div className="schedrow">
                  <span className="lbl">Posts per platform, per day</span>
                  <div className="segwrap">
                    {[1, 2, 3].map(n => (
                      <button key={n} className={'fchip' + (daily === n ? ' on' : '')} onClick={() => setDaily(n)}>{n}</button>
                    ))}
                  </div>
                </div>
                <div className="schedrow">
                  <span className="lbl">Timezone</span>
                  <select className="tzsel" value={tz} onChange={e => setTz(e.target.value)}>
                    <option value="America/New_York">Eastern, New York</option>
                    <option value="America/Chicago">Central, Chicago</option>
                    <option value="America/Denver">Mountain, Denver</option>
                    <option value="America/Los_Angeles">Pacific, Los Angeles</option>
                    <option value="Europe/London">London</option>
                    <option value="Europe/Madrid">Madrid</option>
                  </select>
                </div>
                {connected.map(p => (
                  <div key={p.n} className="pfrow setupf">
                    <span className="pfchip">{p.n}</span>
                    <span className="pfmeta"><b>{p.h}</b><span>Daily slot</span></span>
                    <input className="slotin" type="time" value={p.slot}
                      onChange={e => setPfs(ps => ps.map(q => q.n === p.n ? { ...q, slot: e.target.value } : q))} />
                  </div>
                ))}
              </div>
            )}

            {step === 4 && (
              <div className="setupcard">
                <h2>Ready to run.</h2>
                <p className="ssub">Read it once. If it looks like your brand, start the engine. Everything here stays editable after launch.</p>
                <div className="reviewgrid">
                  <div><span className="lbl">Platforms</span><b>{connected.map(p => p.n).join(', ') || 'None'}</b></div>
                  <div><span className="lbl">Creative bank</span><b>{assets} assets</b></div>
                  <div><span className="lbl">Brand</span><b>{brand || 'Not set'}</b></div>
                  <div><span className="lbl">Cadence</span><b>{daily} {daily === 1 ? 'post' : 'posts'} per platform, daily</b></div>
                  <div><span className="lbl">Voice</span><b>From your brand record</b></div>
                  <div><span className="lbl">Timezone</span><b>{tz.split('/')[1]?.replace('_', ' ')}</b></div>
                </div>
                <p className="sfine">The first post publishes at the next open slot. Week one leans on your seeded bank; from week two the performance data starts steering formats and captions.</p>
              </div>
            )}

            <div className="setupnav">
              {step > 0 && <button className="btn g" onClick={() => setStep(s => s - 1)}>Back</button>}
              <span className="sp" />
              {!canNext && <span className="stephint">{nextHint}</span>}
              {step < 4 && <button className="btn p" disabled={!canNext} onClick={() => canNext && setStep(s => s + 1)}>Continue</button>}
              {step === 4 && <button className="btn p" onClick={launch}>Start the engine</button>}
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
