import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEMO } from '../config'
import { data, AnalysisRow } from '../lib/api'
import { useMe, useAnalyses, useOverview, useBusinesses, useAccounts, accountName, businessLabel, firstName } from '../lib/liveData'
import { toast, noCredits } from '../lib/bus'
import { NewAnalysis } from '../components/NewAnalysis'
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
const Canvas = ({ children, rail }: { children: React.ReactNode; rail?: React.ReactNode }) => (
  <div className="canvas" style={rail ? undefined : { gridTemplateColumns: 'minmax(0,1fr)' }}>
    <div className="wrap">{children}</div>
    {rail}
  </div>
)

/** Quick actions: the same shortcuts already reachable from the sidebar and
 *  each screen's own header, surfaced as a rail so they are one click away
 *  without opening the nav. Every entry calls the exact same handler the
 *  primary UI already uses; nothing here is new functionality. */
function QuickActions({ onNew, live }: { onNew: () => void; live?: { running: number; rows: AnalysisRow[] } }) {
  const nav = useNavigate()
  return (
    <aside className="rail">
      {live && (
        <div className="blk">
          <div className="rt">Running now</div>
          <div className="sevbig"><b>{live.running}</b><span>in the engine</span></div>
        </div>
      )}
      {live && live.rows.length > 0 && (
        <div className="blk">
          <div className="rt">Latest</div>
          <div className="railrecent">
            {live.rows.slice(0, 4).map((a, i) => (
              <div key={i} className="railrow">
                <span className="t">{a.c || a.b}</span>
                <span className={statCls(a.st)}><i />{a.st}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="blk">
        <div className="rt">Quick actions</div>
        <nav className="jump">
          <a href="#" onClick={e => { e.preventDefault(); onNew() }}><i />New analysis</a>
          <a href="#" onClick={e => { e.preventDefault(); nav('/businesses') }}><i />Businesses</a>
          <a href="#" onClick={e => { e.preventDefault(); nav('/teams') }}><i />Teams</a>
          <a href="#" onClick={e => { e.preventDefault(); nav('/api-keys') }}><i />API</a>
        </nav>
      </div>
    </aside>
  )
}

const daypart = () => {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

export function Overview() {
  const nav = useNavigate()
  const me = useMe()
  const an = useAnalyses()
  const ov = useOverview()
  const accs = useAccounts()
  const acct = accountName(accs)
  const [na, setNa] = useState(false)
  const recent = an.st === 'ready' ? an.rows.slice(0, 5) : []
  const fn = firstName(me)
  const s = ov ? ov.stats : null
  const subline = DEMO
    ? 'One analysis completed today. One workbook is waiting on credits.'
    : s
      ? s.totalAnalyses + ' analyses run in this workspace.' + (s.runningAnalyses > 0 ? ' ' + s.runningAnalyses + ' running now.' : '')
      : ''
  return (
    <div className="scr on">
      {na && <NewAnalysis close={() => setNa(false)} />}
      <Header title="Overview">
        <button className="btn p" onClick={() => setNa(true)}>New analysis</button>
      </Header>
      <Canvas rail={<QuickActions onNew={() => setNa(true)} live={{ running: s ? s.runningAnalyses : 0, rows: recent }} />}>
        <div className="greet">
          <h1>{'Good ' + daypart() + (fn ? ', ' + fn : '') + '.'}</h1>
          {subline && <p>{subline}</p>}
        </div>
        {DEMO && (
          <div className="warnrow"><b>0 credits left.</b> New analyses will not run until you top up.
            <button className="btn p" onClick={() => toast('Opening billing.')}>Top up</button></div>
        )}
        <div className="tilegrid">
          {DEMO ? (
            <>
              <div className="tile"><span className="lbl">Analyses run</span><span className="fig">24</span><span className="cap">6 this month</span></div>
              <div className="tile"><span className="lbl">Businesses</span><span className="fig">9</span><span className="cap">4 active this month</span></div>
              <div className="tile"><span className="lbl">Forecasts logged</span><span className="fig">3</span><span className="cap">0 resolved yet</span></div>
              <div className="tile"><span className="lbl">Calibration</span><span className="fig">Drifting</span><span className="cap">Resolve forecasts to score it</span></div>
            </>
          ) : (
            <>
              <div className="tile"><span className="lbl">Analyses run</span><span className="fig">{s ? s.totalAnalyses : '·'}</span><span className="cap">across this workspace</span></div>
              <div className="tile"><span className="lbl">Running now</span><span className="fig">{s ? s.runningAnalyses : '·'}</span><span className="cap">live in the engine</span></div>
              <div className="tile"><span className="lbl">Businesses</span><span className="fig">{s ? s.activeBusinesses : '·'}</span><span className="cap">active in this workspace</span></div>
              <div className="tile"><span className="lbl">Data snapshots</span><span className="fig">{s ? s.committedSnapshots : '·'}</span><span className="cap">committed and analyzable</span></div>
            </>
          )}
        </div>
        <div className="ovgrid">
          <div className="chartcard">
            {DEMO ? (
              <>
                <div className="ct">Analyses per month</div>
                <div className="cs">Runs across the workspace, all sources.</div>
                <OvBars />
              </>
            ) : (
              <>
                <div className="ct">Latest activity</div>
                <div className="cs">Analyses and data snapshots, newest first, straight from the workspace.</div>
                <ul className="actfeed">
                  {(ov ? ov.recentActivity.slice(0, 6) : []).map(a => (
                    <li key={a.id}>
                      <span className="pfchip">{a.type === 'snapshot' ? 'Snapshot' : 'Analysis'}</span>
                      <span className="actt">{a.type === 'snapshot' ? 'Workbook data received' : a.title}</span>
                      <span className={'stat' + ((a.status || '').toLowerCase() === 'complete' || (a.status || '').toLowerCase() === 'confirmed' ? ' ok' : '')}>
                        <i />{a.status}</span>
                    </li>
                  ))}
                  {!ov && <li><span className="skel" style={{ width: '60%' }} /></li>}
                </ul>
              </>
            )}
          </div>
          <div className="card">
            <div style={{ padding: '14px 15px 4px' }}><span className="lbl">Recent analyses</span></div>
            <ul className="minirows">
              {recent.map((a, i) => (
                <li key={i} tabIndex={0} onClick={() => nav('/analyses')}
                  onKeyDown={e => { if (e.key === 'Enter') nav('/analyses') }}>
                  <span className="b">{a.c || a.b || acct}</span><span className="c">{a.st}</span><span className="d">{a.d}</span>
                </li>
              ))}
              {an.st === 'loading' && [0, 1, 2, 3, 4].map(i => (
                <li key={'sk' + i} className="skelrow" aria-hidden="true">
                  <span className="skel" style={{ width: '42%' }} />
                  <span className="skel" style={{ width: '18%' }} />
                </li>
              ))}
              {an.st === 'error' && <li><span className="c">Could not load analyses. Reload to retry.</span></li>}
              {an.st === 'ready' && recent.length === 0 && (
                <li className="emptycell">
                  <b>No analyses yet.</b>
                  <span>Open the Google Sheets{'™'} add-on in a workbook with your numbers and press Analyze. The verdict lands here.</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      </Canvas>
    </div>
  )
}

const statCls = (st: string) => 'stat ' + (st === 'Complete' ? 'ok' : st === 'Running' ? 'run' : st === 'Failed' ? 'fail' : '')

export function Analyses() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [f, setF] = useState('all')
  const [na, setNa] = useState(false)
  const an = useAnalyses()
  const accs = useAccounts()
  const acct = accountName(accs)
  const all = an.st === 'ready' ? an.rows : []
  const rows = useMemo(() => all.filter(a =>
    (f === 'all' || a.st === f) &&
    (!q || (a.b + ' ' + a.c + ' ' + a.cat).toLowerCase().includes(q.toLowerCase()))
  ), [all, q, f])
  const openRow = (a: AnalysisRow) => {
    if (a.open) nav('/analyses/northlane')
    else if (a.id) nav('/analyses/' + a.id)
    else if (a.st === 'Running') toast('Still running. Usually under five minutes.')
    else if (a.st === 'Queued') noCredits()
    else toast('This sample row has no detail view.')
  }
  return (
    <div className="scr on">
      {na && <NewAnalysis close={() => setNa(false)} />}
      <Header title="Analyses">
        <button className="btn p" onClick={() => setNa(true)}>New analysis</button>
      </Header>
      <Canvas rail={<QuickActions onNew={() => setNa(true)} live={{ running: all.filter(a => a.st === 'Running').length, rows: rows.slice(0, 4) }} />}>
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
            <div key={i} className="trow" role="button" tabIndex={0}
              aria-label={'Open analysis: ' + (a.c || 'analysis')}
              onClick={() => openRow(a)}
              onKeyDown={e => { if (e.key === 'Enter') openRow(a) }}>
              <span className="b">{a.b || acct || 'This workspace'}</span>
              <span className="mut">{a.c}</span>
              <span className="num hidem">{a.sev || '·'}</span>
              <span className="mut hidem">{a.src}</span>
              <span className={statCls(a.st)}><i />{a.st}</span>
              <span className="mut num hidem rowend">
                <span className="dt">{a.d}</span>
                <span className="rowacts">
                  <button className="ract" onClick={e => { e.stopPropagation(); openRow(a) }}>Open</button>
                  <button className="ract" onClick={e => {
                    e.stopPropagation()
                    navigator.clipboard?.writeText(window.location.origin + '/analyses')
                      .then(() => toast('Link copied.'), () => toast('Could not copy.'))
                  }}>Copy link</button>
                </span>
              </span>
            </div>
          ))}
          {an.st === 'loading' && [0, 1, 2, 3, 4, 5].map(i => (
            <div key={'sk' + i} className="trow skeltrow" aria-hidden="true">
              <span className="skel" style={{ width: '70%' }} />
              <span className="skel" style={{ width: '85%' }} />
              <span className="skel hidem" style={{ width: '40%' }} />
              <span className="skel hidem" style={{ width: '60%' }} />
              <span className="skel" style={{ width: '55%' }} />
              <span className="skel hidem" style={{ width: '50%' }} />
            </div>
          ))}
          {an.st === 'error' && <div className="trow"><span className="mut">Could not load analyses. Reload to retry.</span></div>}
          {an.st === 'ready' && rows.length === 0 && all.length > 0 && (
            <div className="trow"><span className="mut">Nothing matches that search.</span></div>
          )}
          {an.st === 'ready' && all.length === 0 && (
            <div className="emptyblock">
              <b>No analyses in this workspace yet.</b>
              <span>Open the Google Sheets{'™'} add-on in a workbook with your business numbers and press Analyze Workbook. Results appear here within minutes.</span>
            </div>
          )}
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

/** Businesses, from the businesses table.
 *
 *  That table holds an id, a slug, a name and timestamps. It has no category
 *  and no metric, so none is shown. The only enrichment is the most recent
 *  analysis for each business, matched by the name the snapshot carried, which
 *  is real data the analyses endpoint already returns. Anything more numeric
 *  has to come from a join the API does not expose yet. */
export function Businesses() {
  const nav = useNavigate()
  const rows = useBusinesses()
  const an = useAnalyses()
  const accs = useAccounts()

  if (DEMO) return (
    <div className="scr on">
      <Header title="Businesses"><button className="btn g" onClick={() => toast('Businesses are created when their first analysis runs.')}>Add business</button></Header>
      <Canvas><CardGrid items={data.BIZ} /></Canvas>
    </div>
  )

  /* Analyses carry no business reference in this API, so a name match is the
     only join available and it fails whenever the business was auto-created.
     With a single business every analysis in the workspace is necessarily
     that one; with several there is no honest way to attribute them, so
     nothing is claimed. */
  const single = rows !== null && rows.length === 1
  const latest = (name: string): AnalysisRow | undefined => {
    if (an.st !== 'ready') return undefined
    if (single) return an.rows[0]
    return an.rows.find(r => r.b && r.b === name)
  }
  const day = (s: string | null) => {
    if (!s) return ''
    const d = new Date(s)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  }
  const synced = (s: string | null) => {
    if (!s) return false
    const d = new Date(s).getTime()
    return isFinite(d) && Date.now() - d < 14 * 24 * 60 * 60 * 1000
  }

  return (
    <div className="scr on">
      <Header title="Businesses">
        <button className="btn g" onClick={() => toast('Businesses are created when their first analysis runs.')}>Add business</button>
      </Header>
      <Canvas>
        {rows === null && (
          <div className="tbl">{[0, 1, 2].map(i => (
            <div key={i} className="bizrowi skelrow" aria-hidden="true">
              <span className="skel" style={{ width: '38%' }} />
              <span className="skel" style={{ width: '20%' }} />
              <span className="skel" style={{ width: '30%' }} />
              <span className="skel" style={{ width: '18%' }} />
            </div>
          ))}</div>
        )}
        {rows !== null && rows.length === 0 && (
          <div className="intempty" style={{ marginTop: 18 }}>
            <b>No businesses yet.</b>
            <span>A business is created the first time an analysis runs against it.
              Run one from the Google Sheets{'\u2122'} add-on and it appears here.</span>
          </div>
        )}
        {rows !== null && rows.length > 0 && (
          <div className="tbl">
            <div className="bizrowi h">
              <span>Business</span><span>Added</span><span>Latest analysis</span><span>Data</span>
            </div>
            {rows.map(b => {
              const a = latest(b.name)
              return (
                <div key={b.id} className="bizrowi" tabIndex={a && a.id ? 0 : -1}
                  onClick={() => { if (a && a.id) nav('/analyses/' + a.id) }}
                  onKeyDown={e => { if (e.key === 'Enter' && a && a.id) nav('/analyses/' + a.id) }}>
                  <span className="bizn">{businessLabel(b.name, accs)}</span>
                  <span className="mut">{day(b.createdAt)}</span>
                  <span className="mut">{a ? a.c : 'None yet'}</span>
                  <span className={'stat' + (synced(b.derivedInputsSyncedAt) ? ' ok' : '')}>
                    <i />{synced(b.derivedInputsSyncedAt) ? 'Syncing' : 'No recent data'}</span>
                </div>
              )
            })}
          </div>
        )}
      </Canvas>
    </div>
  )
}
export const Clients = () => (
  <div className="scr on">
    <Header title="Clients"><button className="btn g" onClick={() => toast('Clients are available on GT Agency.')}>Add client</button></Header>
    <Canvas><CardGrid items={data.BIZ.slice(0, 4)} /></Canvas>
  </div>
)

/** A key value, masked until asked for. The mask is the default state on
 *  every load, so a shared screen, a screen recording or a screenshot never
 *  carries the credential out of the room by accident. */
const MASK = '•'.repeat(22)
/** Locked and unlocked, drawn to the same 16 unit grid as the rest of the
 *  portal's icons: same stroke, same round joins, no fill. */
function Lock({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="7" width="10" height="7.2" rx="1.8" />
      {open
        ? <path d="M5.6 7V4.9a2.5 2.5 0 014.8-.9" />
        : <path d="M5.6 7V4.9a2.4 2.4 0 014.8 0V7" />}
    </svg>
  )
}
function KeyValue({ value }: { value: string }) {
  const [shown, setShown] = useState(false)
  const label = shown ? 'Hide this key' : 'Show this key'
  return (
    <span className="keyval">
      <span className={'kv' + (shown ? '' : ' hid')}>{shown ? value : MASK}</span>
      <button className={'keyeye' + (shown ? ' on' : '')} aria-pressed={shown}
        aria-label={label} title={label}
        onClick={() => setShown(!shown)}><Lock open={shown} /></button>
    </span>
  )
}

export function ApiKeys() {
  return (
    <div className="scr on">
      <Header title="API"><button className="btn p" onClick={() => toast('Key created. It is shown once, copy it now.')}>Create key</button></Header>
      <Canvas>
        <p style={{ margin: '16px 0 12px', color: 'var(--muted)', fontSize: 12.5, maxWidth: '70ch' }}>
          Keys connect the Google Sheets{'™'} add-on to this workspace. A key belongs to the person
          who created it and can be revoked at any time. Values stay hidden until you show them.</p>
        <div className="tbl">
          <div className="keyrowi"><KeyValue value={'gt_ws_live_2f8c ···· 9d14'} />
            <span className="mut hidem">Created 12 Jul</span><span className="mut hidem">Used 2 min ago</span>
            <span className="stat ok"><i />Active</span>
            <button className="btn g" onClick={() => toast('Key revoked. The add-on it was used in is signed out.')}>Revoke</button></div>
          <div className="keyrowi"><KeyValue value={'gt_ws_live_77aa ···· 03be'} />
            <span className="mut hidem">Created 2 Jun</span><span className="mut hidem">Used 30 Jul</span>
            <span className="stat"><i />Revoked</span><span /></div>
        </div>
      </Canvas>
    </div>
  )
}

export const Teams = () => {
  const me = useMe()
  const nm = me ? me.name : 'Workspace owner'
  const av = nm.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="scr on">
      <Header title="Teams"><button className="btn p" onClick={() => toast('Invites are sent by email from Teams.')}>Invite</button></Header>
      <Canvas>
        <div className="tbl" style={{ marginTop: 16 }}>
          <div className="member"><span className="av">{av}</span><span><span className="nm">{nm}</span><br />
            <span className="rl">hustleglobal95@gmail.com</span></span><span className="sp" /><span className="rl">Owner</span></div>
        </div>
      </Canvas>
    </div>
  )
}

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
