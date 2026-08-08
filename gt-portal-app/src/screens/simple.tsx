import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { data, AnalysisRow } from '../lib/api'
import { toast, noCredits } from '../lib/bus'
import { OvBars, Spark } from '../components/charts'

export function Header({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="apphdr simple">
      <span className="ttl">{title}</span>
      <span className="sp" />
      {children}
    </div>
  )
}
const Canvas = ({ children }: { children: React.ReactNode }) => (
  <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
    <div className="wrap">{children}</div>
  </div>
)

export function Overview() {
  const nav = useNavigate()
  return (
    <div className="scr on">
      <Header title="Overview">
        <button className="btn p" onClick={noCredits}>New analysis</button>
      </Header>
      <Canvas>
        <div className="greet">
          <h1>Good evening, Kevin.</h1>
          <p>One analysis completed today. One workbook is waiting on credits.</p>
        </div>
        <div className="warnrow"><b>0 credits left.</b> New analyses will not run until you top up.
          <button className="btn p" onClick={() => toast('Opening billing.')}>Top up</button></div>
        <div className="tilegrid">
          <div className="tile"><span className="lbl">Analyses run</span><span className="fig">24</span><span className="cap">6 this month</span></div>
          <div className="tile"><span className="lbl">Businesses</span><span className="fig">9</span><span className="cap">4 active this month</span></div>
          <div className="tile"><span className="lbl">Forecasts logged</span><span className="fig">3</span><span className="cap">0 resolved yet</span></div>
          <div className="tile"><span className="lbl">Calibration</span><span className="fig">Drifting</span><span className="cap">Resolve forecasts to score it</span></div>
        </div>
        <div className="ovgrid">
          <div className="chartcard">
            <div className="ct">Analyses per month</div>
            <div className="cs">Runs across the workspace, all sources.</div>
            <OvBars />
          </div>
          <div className="card">
            <div style={{ padding: '14px 15px 4px' }}><span className="lbl">Recent analyses</span></div>
            <ul className="minirows">
              {data.AN.slice(0, 5).map((a, i) => (
                <li key={i} onClick={() => nav('/analyses')}>
                  <span className="b">{a.b}</span><span className="c">{a.st}</span><span className="d">{a.d}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Canvas>
    </div>
  )
}

const statCls = (st: string) => 'stat ' + (st === 'Complete' ? 'ok' : st === 'Running' ? 'run' : '')

export function Analyses() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [f, setF] = useState('all')
  const rows = useMemo(() => data.AN.filter(a =>
    (f === 'all' || a.st === f) &&
    (!q || (a.b + ' ' + a.c + ' ' + a.cat).toLowerCase().includes(q.toLowerCase()))
  ), [q, f])
  const openRow = (a: AnalysisRow) => {
    if (a.open) nav('/analyses/northlane')
    else if (a.st === 'Running') toast('Still running. Usually under five minutes.')
    else if (a.st === 'Queued') noCredits()
    else toast('Failed: no analyzable sheet. The workbook had no numeric columns.')
  }
  return (
    <div className="scr on">
      <Header title="Analyses">
        <button className="btn p" onClick={noCredits}>New analysis</button>
      </Header>
      <Canvas>
        <div className="toolrow">
          <div className="searchin">
            <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search businesses and constraints" autoComplete="off" />
          </div>
          {['all', 'Complete', 'Running', 'Failed'].map(k => (
            <button key={k} className={'fchip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>
              {k === 'all' ? 'All' : k}
            </button>
          ))}
        </div>
        <div className="tbl">
          <div className="trow h"><span>Business</span><span>Constraint</span><span className="hidem">Severity</span><span className="hidem">Source</span><span>Status</span><span className="hidem">Date</span></div>
          {rows.map((a, i) => (
            <div key={i} className="trow" onClick={() => openRow(a)}>
              <span className="b">{a.b}</span>
              <span className="mut">{a.c}</span>
              <span className="num hidem">{a.sev || '·'}</span>
              <span className="mut hidem">{a.src}</span>
              <span className={statCls(a.st)}><i />{a.st}</span>
              <span className="mut num hidem">{a.d}</span>
            </div>
          ))}
        </div>
      </Canvas>
    </div>
  )
}

function CardGrid({ items }: { items: typeof data.BIZ }) {
  const nav = useNavigate()
  return (
    <div className="cardgrid">
      {items.map(b => (
        <div key={b.n} className="bizcard" onClick={() => nav('/analyses')}>
          <div className="nm">{b.n}</div><div className="in">{b.i}</div>
          <div className="ft"><span className="stat ok"><i />{b.f}</span></div>
          <div className="ft" style={{ border: 0, marginTop: 6, paddingTop: 0, color: 'var(--faint)' }}>{b.d}</div>
        </div>
      ))}
    </div>
  )
}

export const Businesses = () => (
  <div className="scr on">
    <Header title="Businesses"><button className="btn g" onClick={() => toast('Businesses are created when their first analysis runs.')}>Add business</button></Header>
    <Canvas><CardGrid items={data.BIZ} /></Canvas>
  </div>
)
export const Clients = () => (
  <div className="scr on">
    <Header title="Clients"><button className="btn g" onClick={() => toast('Clients are available on GT Agency.')}>Add client</button></Header>
    <Canvas><CardGrid items={data.BIZ.slice(0, 4)} /></Canvas>
  </div>
)

export function ApiKeys() {
  return (
    <div className="scr on">
      <Header title="API Keys"><button className="btn p" onClick={() => toast('Key created. It is shown once, copy it now.')}>Create key</button></Header>
      <Canvas>
        <p style={{ margin: '16px 0 12px', color: 'var(--muted)', fontSize: 12.5, maxWidth: '70ch' }}>
          Keys connect the Google Sheets{'™'} add-on to this workspace. A key belongs to the person
          who created it and can be revoked at any time.</p>
        <div className="tbl">
          <div className="keyrowi"><span className="kv">gt_ws_live_2f8c {'····'} 9d14</span>
            <span className="mut hidem">Created 12 Jul</span><span className="mut hidem">Used 2 min ago</span>
            <span className="stat ok"><i />Active</span>
            <button className="btn g" onClick={() => toast('Key revoked. The add-on it was used in is signed out.')}>Revoke</button></div>
          <div className="keyrowi"><span className="kv">gt_ws_live_77aa {'····'} 03be</span>
            <span className="mut hidem">Created 2 Jun</span><span className="mut hidem">Used 30 Jul</span>
            <span className="stat"><i />Revoked</span><span /></div>
        </div>
      </Canvas>
    </div>
  )
}

export const Teams = () => (
  <div className="scr on">
    <Header title="Teams"><button className="btn p" onClick={() => toast('Invites are sent by email from Teams.')}>Invite</button></Header>
    <Canvas>
      <div className="tbl" style={{ marginTop: 16 }}>
        <div className="member"><span className="av">KG</span><span><span className="nm">Kevin Gonzalez</span><br />
          <span className="rl">hustleglobal95@gmail.com</span></span><span className="sp" /><span className="rl">Owner</span></div>
        <div className="member"><span className="av">MR</span><span><span className="nm">Markus Reid</span><br />
          <span className="rl">Content engine</span></span><span className="sp" /><span className="rl">Editor</span></div>
      </div>
    </Canvas>
  </div>
)

export function Stub() {
  const { id } = useParams()
  const st = data.STUBS['stub-' + (id || 'admin')] || data.STUBS['stub-admin']
  return (
    <div className="scr on">
      <Header title={st[0]} />
      <Canvas>
        <div className="tbl" style={{ marginTop: 16 }}>
          {st[1].map(([k, v]) => (
            <div key={k} className="keyrowi" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <span className="kv">{k}</span><span className="mut" style={{ textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </Canvas>
    </div>
  )
}
