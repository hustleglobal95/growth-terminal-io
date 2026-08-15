import React, { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEMO } from '../config'
import { api, data, AnalysisRow, ApiKeyRow, ADDON_SCOPES, SCOPE_HELP, secretOf } from '../lib/api'
import { useMe, useAnalyses, useOverview, useBusinesses, useAccounts, useCredits, accountName, businessLabel, firstName } from '../lib/liveData'
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
 *  primary UI already uses; nothing here is new functionality.
 *
 *  This used to carry a "Latest" block too. It was removed because on both
 *  screens that mount this rail, that block listed the same records the main
 *  column was already showing: on Overview the workspace's six analyses were
 *  rendered fifteen times between the feed, the card beside it and this. A
 *  rail earns its width by holding what the page does not, so what is left is
 *  the one live number and the shortcuts. */
function QuickActions({ onNew, live }: { onNew: () => void; live?: { running: number } }) {
  const nav = useNavigate()
  return (
    <aside className="rail">
      {live && (
        <div className="blk">
          <div className="rt">Running now</div>
          <div className="sevbig"><b>{live.running}</b><span>in the engine</span></div>
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

/** A date for the activity feed. Anything unparseable prints nothing rather
 *  than "Invalid Date", which is the kind of string that makes a whole screen
 *  look untrustworthy. */
const when = (s: string | null | undefined) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function Overview() {
  const me = useMe()
  const an = useAnalyses()
  const ov = useOverview()
  const [na, setNa] = useState(false)
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
      <Canvas rail={<QuickActions onNew={() => setNa(true)} live={{ running: s ? s.runningAnalyses : 0 }} />}>
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
        {/* One list, full width.
            There were two here, side by side. The left one read the overview
            endpoint's activity feed and the right one read the analyses
            endpoint, and on a real workspace those are the same records: the
            feed is a superset, since it carries data snapshots as well. Two
            half-width columns of the same six rows is not twice the
            information, it is the same information at half the measure. */}
        <div className="ovgrid one">
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
                  {(ov ? ov.recentActivity.slice(0, 8) : []).map(a => (
                    <li key={a.id}>
                      <span className="pfchip">{a.type === 'snapshot' ? 'Snapshot' : 'Analysis'}</span>
                      <span className="actt">{a.type === 'snapshot' ? 'Workbook data received' : a.title}</span>
                      <span className="actd">{when(a.createdAt)}</span>
                      <span className={'stat' + ((a.status || '').toLowerCase() === 'complete' || (a.status || '').toLowerCase() === 'confirmed' ? ' ok' : '')}>
                        <i />{a.status}</span>
                    </li>
                  ))}
                  {!ov && [0, 1, 2, 3].map(i => (
                    <li key={'sk' + i} className="skelrow" aria-hidden="true">
                      <span className="skel" style={{ width: '14%' }} />
                      <span className="skel" style={{ width: '46%' }} />
                    </li>
                  ))}
                  {/* The empty state used to live in the card that has just
                      been removed, so it moves here rather than disappearing
                      with it. */}
                  {ov && ov.recentActivity.length === 0 && (
                    <li className="emptycell">
                      <b>Nothing has run yet.</b>
                      <span>Open the Google Sheets{'™'} add-on in a workbook with your numbers and press
                        Analyze. Runs and the data behind them land here.</span>
                    </li>
                  )}
                  {an.st === 'error' && ov && ov.recentActivity.length === 0 && (
                    <li><span className="c">Could not load analyses. Reload to retry.</span></li>
                  )}
                </ul>
              </>
            )}
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
      <Canvas rail={<QuickActions onNew={() => setNa(true)} live={{ running: all.filter(a => a.st === 'Running').length }} />}>
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

/** An empty screen that says something.
 *
 *  A screen with one row on it, or none, was rendering as a thin strip of card
 *  on top of a very large backdrop, and a backdrop is only a backdrop while
 *  something is standing on it. This gives the sparse states a top: a label, a
 *  sentence that says what fills the screen, and where that comes from.
 *
 *  Deliberately no illustration and no big centred icon. This is a working
 *  tool, and the thing a person needs on an empty screen is the instruction,
 *  not a drawing of an empty box. */
function Empty({ label, head, body, action }: {
  label: string; head: string; body: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <div className="emptypage">
      <span className="lbl">{label}</span>
      <h2>{head}</h2>
      <p>{body}</p>
      {action && <div className="act">{action}</div>}
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
        {/* The same one-line orientation the API screen already opens with, so
            a screen holding a single row still has a top to it. */}
        <p className="pgintro">Every business you have ever analysed, with the most recent verdict
          against each. Businesses are created by the engine on their first run, not added here.</p>
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
          <Empty label="No businesses yet"
            head="A business appears the first time you analyse one."
            body={<>You do not create businesses here. Open the Google Sheets{'\u2122'} add-on in a
              workbook with a company's numbers and press Analyze; the business is created from
              that run and everything after it is filed against the same record.</>} />
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

/** The same lock, sized for a row in the key table. What it hides is the
 *  prefix rather than the key itself, since the key is unrecoverable after
 *  the moment it was made. A prefix still identifies a credential, so it
 *  starts locked: nothing about a screen share or a recording should depend
 *  on remembering to look away. */
function KeyPrefix({ value }: { value: string }) {
  const [shown, setShown] = useState(false)
  const label = shown ? 'Hide this key' : 'Show this key'
  return (
    <span className="keyval keypref">
      <code className={'kv' + (shown ? '' : ' hid')}>{shown ? value : MASK}</code>
      <button className={'keyeye' + (shown ? ' on' : '')} aria-pressed={shown}
        aria-label={label} title={label}
        onClick={() => setShown(!shown)}><Lock open={shown} /></button>
    </span>
  )
}

/** API keys, from the workspace key store.
 *
 *  The keys live at /api/v1/workspace/api-keys, not under the portal prefix,
 *  which is why they were unreachable from this app until now.
 *
 *  The engine stores a hash and a prefix, never the key. So the full value
 *  exists for exactly one response, the one that creates it, and this screen is
 *  the only place it will ever be readable. Everything after that is the
 *  prefix. The interface says that plainly instead of implying a key can be
 *  recovered later.
 */
export function ApiKeys() {
  const [rows, setRows] = useState<ApiKeyRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('Sheets add-on')
  const [scopes, setScopes] = useState<string[]>(ADDON_SCOPES)
  const [fresh, setFresh] = useState<{ secret: string; name: string } | null>(null)
  const credits = useCredits()

  const load = React.useCallback(async () => {
    if (DEMO) { setRows([]); return }
    try { setRows(await api.listKeys()); setFailed(false) } catch { setFailed(true) }
  }, [])
  React.useEffect(() => { void load() }, [load])

  const toggle = (s: string) =>
    setScopes(scopes.indexOf(s) < 0 ? scopes.concat(s) : scopes.filter(x => x !== s))

  const create = async () => {
    if (busy || !name.trim() || !scopes.length) return
    setBusy(true)
    try {
      const k = await api.createKey(name.trim(), scopes)
      const secret = secretOf(k)
      if (secret) setFresh({ secret, name: name.trim() })
      else toast('Key created, but the engine did not return its value. Revoke it and try again.')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not create the key.')
    } finally { setBusy(false) }
  }

  const revoke = async (k: ApiKeyRow) => {
    if (busy) return
    setBusy(true)
    try { await api.revokeKey(k.id); await load(); toast('Key revoked.') }
    catch (e) { toast(e instanceof Error ? e.message : 'Could not revoke the key.') }
    finally { setBusy(false) }
  }

  const day = (s: string | null) => {
    if (!s) return ''
    const d = new Date(s)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
  }
  const live = rows ? rows.filter(k => !k.revokedAt) : []

  return (
    <div className="scr on">
      <Header title="API" />
      <Canvas>
        <p className="apilede">
          A key connects the Google Sheets{'\u2122'} add-on to this workspace. Paste it into the
          add-on once and it stays connected until you revoke it here.
        </p>

        {fresh && (
          <div className="card keynew">
            <span className="lbl">Your new key, {fresh.name}</span>
            <p className="keyonce">This is the only time it will be shown. The engine keeps a hash,
              not the key, so it cannot be recovered later. Copy it now.</p>
            <div className="keyshow">
              <KeyValue value={fresh.secret} />
              <button className="btn p" onClick={() => {
                navigator.clipboard.writeText(fresh.secret)
                  .then(() => toast('Key copied.'))
                  .catch(() => toast('Could not reach the clipboard. Select it and copy by hand.'))
              }}>Copy</button>
            </div>
            <button className="ract" onClick={() => setFresh(null)}>I have saved it</button>
          </div>
        )}

        <div className="card keymake">
          <span className="lbl">Create a key</span>
          <label className="keyfield">Name
            <input className="keyinput" value={name} onChange={e => setName(e.target.value)}
              placeholder="Sheets add-on" />
          </label>
          <span className="lbl" style={{ marginTop: 12 }}>What it can do</span>
          <div className="keyscopes">
            {ADDON_SCOPES.map(s => (
              <label key={s} className={'keyscope' + (scopes.indexOf(s) < 0 ? '' : ' on')}>
                <input type="checkbox" checked={scopes.indexOf(s) >= 0} onChange={() => toggle(s)} />
                <span><code>{s}</code><br /><span className="mut">{SCOPE_HELP[s]}</span></span>
              </label>
            ))}
          </div>
          <p className="keynote">The add-on needs all three. Untick one only if you are wiring
            something else against the API.</p>
          <button className="btn p" disabled={busy || !name.trim() || !scopes.length}
            onClick={() => void create()}>Create key</button>
        </div>

        <div className="shead" style={{ marginTop: 26 }}>
          <h2>Your keys</h2>
          {rows !== null && <span className="hint">{live.length} active</span>}
        </div>

        {failed && <div className="emptyblock"><b>Could not load your keys.</b>
          <span>The workspace answered but the key store did not.
            <button className="ract" style={{ marginLeft: 8 }} onClick={() => void load()}>Try again</button></span>
        </div>}

        {rows === null && !failed && (
          <div className="tbl">{[0, 1].map(i => (
            <div key={i} className="keyrowi skelrow" aria-hidden="true">
              <span className="skel" style={{ width: '40%' }} />
              <span className="skel" style={{ width: '60%' }} />
              <span className="skel" style={{ width: '50%' }} />
              <span className="skel" style={{ width: '40%' }} />
              <span />
            </div>
          ))}</div>
        )}

        {rows !== null && rows.length === 0 && !failed && (
          <div className="emptyblock">
            <b>No keys yet.</b>
            <span>Create one above, then paste it into the Sheets{'\u2122'} add-on to connect it
              to this workspace.</span>
          </div>
        )}

        {rows !== null && rows.length > 0 && (
          <div className="tbl">
            {rows.map(k => {
              const dead = !!k.revokedAt
              return (
                <div key={k.id} className={'keyrowi' + (dead ? ' off' : '')}>
                  <span className="keyname">{k.name || 'Unnamed key'}
                    <KeyPrefix value={k.keyPrefix} /></span>
                  <span className="mut hidem">{k.scopes && k.scopes.length === ADDON_SCOPES.length
                    ? 'Full add-on access' : (k.scopes || []).join(', ')}</span>
                  <span className="mut hidem">Created {day(k.createdAt)}</span>
                  <span className="mut">{k.lastUsedAt ? 'Used ' + day(k.lastUsedAt) : 'Never used'}</span>
                  {dead
                    ? <span className="stat"><i />Revoked</span>
                    : <button className="btn g" disabled={busy} onClick={() => void revoke(k)}>Revoke</button>}
                </div>
              )
            })}
          </div>
        )}

        {credits && credits.costs && Object.keys(credits.costs).length > 0 && (
          <>
            <div className="shead" style={{ marginTop: 26 }}>
              <h2>What each run costs</h2>
              <span className="hint">{credits.balance} credits left</span>
            </div>
            <div className="tbl">
              {Object.keys(credits.costs).map(k => (
                <div key={k} className="costrow">
                  <span>{k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase())}</span>
                  <span className="mut">{credits.costs[k]} {credits.costs[k] === 1 ? 'credit' : 'credits'}</span>
                </div>
              ))}
            </div>
          </>
        )}
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

/** Anything that is not a route.
 *
 *  This used to render a demo fixture: any unrecognised URL on the live app,
 *  including a typo, came back as a page titled "Admin" listing a workspace
 *  name, a domain, a retention period and a plan. None of those were read from
 *  the API. They were sample values from the bundled demo data, presented on
 *  the real product, under the signed in user's own sidebar, as if they were
 *  that account's settings.
 *
 *  A wrong address should say so. In demo mode the sample pages still resolve,
 *  because that is what they are for. */
export function Stub() {
  const { id } = useParams()
  const nav = useNavigate()
  const st = DEMO ? data.STUBS['stub-' + (id || 'admin')] : undefined

  if (st) return (
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

  return (
    <div className="scr on">
      <Header title="Not found" />
      <Canvas>
        <Empty label="404"
          head="There is no page at this address."
          body={<>The link may be out of date, or the address may have a typo in it. Nothing has
            been lost: everything in this workspace is reachable from the sidebar.</>}
          action={<button className="btn p" onClick={() => nav('/')}>Back to overview</button>} />
      </Canvas>
    </div>
  )
}
