/** The founder view. Not in the navigation, not reachable by any control in
 *  the interface, and gated to a single signed in address. Everyone else who
 *  types the URL gets the same stub any unknown route gets.
 *
 *  This is where the question "does the engine actually work" gets answered.
 *  Every analysis writes a plan ledger: which weeks were committed, when, and
 *  whether the engine's own predictions held. This screen reads all of them
 *  and puts the two side by side, because the interesting failure is not
 *  "the plan did not work", it is telling apart a wrong call from a plan
 *  nobody executed.
 *
 *  Today the records live in this browser. Until the engine grows plan
 *  routes, this sees the analyses run on this machine and nothing from a
 *  customer workspace. The banner says so rather than implying coverage it
 *  does not have.
 */
import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '@clerk/clerk-react'
import { DEMO } from '../config'
import { toast } from '../lib/bus'
import { ScoredPlan, allScored } from '../lib/planCommits'
import { Header, Stub } from './simple'

/** Who sees this. One address, matched case insensitively, read from the
 *  Clerk session rather than from anything the page can be told.
 *
 *  This is a courtesy gate, not security: it runs in the browser, so it hides
 *  the screen rather than protecting the data. The data it shows is already
 *  in this browser's own storage. When the engine grows plan routes, the
 *  admin scope has to be enforced there, and this list becomes a convenience
 *  rather than the control. */
const FOUNDERS = ['hustleglobal95@gmail.com']

/** Demo builds carry no Clerk provider, so the gated screen is never mounted
 *  there and the Clerk hook is never called outside its provider. */
export function Internal() {
  if (DEMO) return <Stub />
  return <InternalLive />
}

const pct = (n: number) => n + '%'
const day = (ms: number) => ms
  ? new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  : ''

/** The closing line every checklist ends with. Tracked on its own because it
 *  is the only question the whole product exists to answer. */
const VERDICT_ID = 'verdict'

function InternalLive() {
  const nav = useNavigate()
  const { isLoaded, user } = useUser()
  const [tick, setTick] = useState(0)
  const plans = useMemo(() => { void tick; return allScored() }, [tick])

  /* Nothing renders until Clerk has resolved, so the screen never flashes
     into view for someone who is not allowed to see it. */
  if (!isLoaded) return <div className="scr on" />
  const email = (user && user.primaryEmailAddress ? user.primaryEmailAddress.emailAddress : '') || ''
  if (FOUNDERS.indexOf(email.toLowerCase()) < 0) return <Stub />

  const checked = plans.filter(p => p.verification)
  const weeksPlanned = plans.reduce((n, p) => n + p.weeksTotal, 0)
  const weeksDone = plans.reduce((n, p) => n + p.weeksCommitted, 0)
  const confirmed = checked.reduce((n, p) => n + (p.verification ? p.verification.confirmed : 0), 0)
  const refuted = checked.reduce((n, p) => n + (p.verification ? p.verification.refuted : 0), 0)
  const unmeasured = checked.reduce((n, p) => n + (p.verification ? p.verification.unmeasured : 0), 0)
  const answered = confirmed + refuted
  const held = answered ? Math.round((confirmed / answered) * 100) : 0

  /* The call itself, separated from everything else. */
  const verdicts = checked.map(p => {
    const v = p.verification ? p.verification.items.find(i => i.id === VERDICT_ID) : undefined
    return v ? v.answer : null
  })
  const callYes = verdicts.filter(a => a === 'yes').length
  const callNo = verdicts.filter(a => a === 'no').length

  const payload = () => JSON.stringify({
    generatedAt: Date.now(),
    source: 'browser localStorage, pending engine plan routes',
    plans
  }, null, 2)

  const copy = () => {
    navigator.clipboard.writeText(payload())
      .then(() => toast('Records copied. ' + plans.length + ' plans.'))
      .catch(() => toast('Could not reach the clipboard. Use Download instead.'))
  }
  const download = () => {
    const b = new Blob([payload()], { type: 'application/json' })
    const u = URL.createObjectURL(b)
    const a = document.createElement('a')
    a.href = u
    a.download = 'gt-plan-records.json'
    a.click()
    URL.revokeObjectURL(u)
    toast('Downloaded ' + plans.length + ' plan records.')
  }

  return (
    <div className="scr on">
      <Header title="Internal">
        <button className="btn g" onClick={() => setTick(t => t + 1)}>Refresh</button>
        <button className="btn g" onClick={copy}>Copy JSON</button>
        <button className="btn p" onClick={download}>Download</button>
      </Header>
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">

          <div className="intbanner">
            <b>Browser storage, not the engine.</b>
            <span>These records are written to localStorage in whichever browser ran the plan.
              This screen therefore sees what happened on this machine and nothing from a
              customer workspace. Wiring the engine routes turns this into one fetch and
              changes nothing else on this page.</span>
          </div>

          <div className="tilegrid">
            <div className="tile"><span className="lbl">Plans tracked</span>
              <span className="fig">{plans.length}</span>
              <span className="cap">{checked.length} closed out with a check</span></div>
            <div className="tile"><span className="lbl">Weeks committed</span>
              <span className="fig">{weeksDone}</span>
              <span className="cap">of {weeksPlanned} planned</span></div>
            <div className="tile"><span className="lbl">Predictions held</span>
              <span className="fig">{answered ? pct(held) : '·'}</span>
              <span className="cap">{confirmed} of {answered} answerable claims</span></div>
            <div className="tile"><span className="lbl">The call held</span>
              <span className="fig">{callYes + callNo ? callYes + ' of ' + (callYes + callNo) : '·'}</span>
              <span className="cap">constraint actually relieved</span></div>
          </div>

          {checked.length > 0 && (
            <div className="card intcard">
              <div style={{ padding: '15px 16px 0' }}>
                <span className="lbl">Every answered claim</span>
                <p className="intsub">Unmeasured claims are held out of the rate rather than
                  counted against the engine. A claim nobody measured is not a claim that failed.</p>
              </div>
              <div className="intbars">
                <div className="intbar">
                  <span className="intbn">Held</span>
                  <span className="intbt"><i style={{ width: answered ? (confirmed / (confirmed + refuted + unmeasured)) * 100 + '%' : '0%' }} /></span>
                  <span className="intbv">{confirmed}</span>
                </div>
                <div className="intbar">
                  <span className="intbn">Did not hold</span>
                  <span className="intbt"><i className="o" style={{ width: answered ? (refuted / (confirmed + refuted + unmeasured)) * 100 + '%' : '0%' }} /></span>
                  <span className="intbv">{refuted}</span>
                </div>
                <div className="intbar">
                  <span className="intbn">Unmeasured</span>
                  <span className="intbt"><i className="f" style={{ width: confirmed + refuted + unmeasured ? (unmeasured / (confirmed + refuted + unmeasured)) * 100 + '%' : '0%' }} /></span>
                  <span className="intbv">{unmeasured}</span>
                </div>
              </div>
            </div>
          )}

          <div className="shead" style={{ marginTop: 26 }}>
            <h2>Execution against outcome</h2>
            <span className="hint">A plan that was never worked tells you nothing about the call.
              Read the two columns together.</span>
          </div>

          {plans.length === 0
            ? (
              <div className="intempty">
                <b>No plan records in this browser yet.</b>
                <span>A record appears the first time someone commits a week of a 90 day plan
                  on an analysis. Open a completed analysis, commit a week, and it lands here.</span>
              </div>
            )
            : (
              <div className="tbl inttbl">
                <div className="introw h">
                  <span>Business</span><span>Started</span><span>Weeks</span>
                  <span>On time</span><span>Check</span><span>Held</span><span>The call</span>
                </div>
                {plans.map(p => {
                  const v = p.verification
                  const call = v ? v.items.find(i => i.id === VERDICT_ID) : undefined
                  return (
                    <div key={p.analysisId} className="introw" tabIndex={0}
                      onClick={() => nav('/analyses/' + p.analysisId)}
                      onKeyDown={e => { if (e.key === 'Enter') nav('/analyses/' + p.analysisId) }}>
                      <span className="intb">{p.businessName || p.analysisId}</span>
                      <span className="mut">{day(p.startedAt)}</span>
                      <span className="mut">{p.weeksCommitted} of {p.weeksTotal}
                        <i className="intmini"><b style={{ width: pct(p.completionRate) }} /></i></span>
                      <span className="mut">{p.weeksCommitted ? pct(p.onTimeRate) : '·'}</span>
                      <span className={'stat' + (v ? ' ok' : '')}><i />
                        {v ? 'Committed' : p.elapsedWeeks > p.weeksTotal ? 'Overdue' : 'Open'}</span>
                      <span className="mut">{v && (v.confirmed + v.refuted) ? pct(v.heldRate) : '·'}</span>
                      <span className={'intcall ' + (call && call.answer ? call.answer : 'none')}>
                        {call && call.answer === 'yes' ? 'Relieved'
                          : call && call.answer === 'no' ? 'Still binding'
                          : call ? 'Cannot tell' : '·'}</span>
                    </div>
                  )
                })}
              </div>
            )}

          <div className="intnote">
            <span className="lbl">What is missing</span>
            <p>Three routes on the engine and this screen covers every workspace instead of one
              browser: write a plan record, read one back, and read all of them with an admin
              scope. The shapes this page already reads are the shapes those routes should
              return, so nothing above this line has to change.</p>
          </div>

        </div>
      </div>
    </div>
  )
}

export type { ScoredPlan }
