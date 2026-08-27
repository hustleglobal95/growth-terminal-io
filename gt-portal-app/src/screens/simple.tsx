import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEMO, CREDIT_BUNDLES, SHEET_PRODUCTS } from '../config'
import { api, data, AnalysisRow, ApiKeyRow, ADDON_SCOPES, SCOPE_HELP, secretOf, startCheckout, checkoutConfigured, Purchase } from '../lib/api'
import { rememberCheckout } from './Billing'
import { useMe, useAnalyses, useOverview, useBusinesses, useAccounts, useCredits, accountName, businessLabel, firstName } from '../lib/liveData'
import { findDue, MAX_CHECKED, NOTHING_DUE, type DueSummary } from '../lib/dueNow'
import { monthName } from '../lib/verified'
import { toast, noCredits } from '../lib/bus'
import { recents, lastSeen, stampSeen, ago, RecentItem } from '../lib/memory'
import { BLOG_POSTS, BLOG_URL } from '../lib/blogPosts'
import { NewAnalysis } from '../components/NewAnalysis'
import { OvBars, Spark } from '../components/charts'
import { Section, Row, Empty as SecEmpty, Fig, Status } from '../components/Section'
import { Execution } from '../components/Execution'
import { FilterBar, FilterGroup, FilterState, groupFrom, matches, loadFilters, saveFilters, activeCount } from '../components/Filters'

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

/** The newest field notes, in the slot the rail's "Latest" block used to
 *  occupy.
 *
 *  That block used to list this workspace's own analyses, which is what the
 *  screen underneath it was already showing: on Overview the same six records
 *  were rendered fifteen times between the feed, the card beside it and the
 *  rail. A rail earns its width by holding what the page does not, and the
 *  blog is the one thing in the product that is genuinely new every day and
 *  reachable from nowhere else in the portal.
 *
 *  These open in a new tab on purpose. Somebody reading an analysis has work
 *  in progress on the screen behind them, and a link that navigates away from
 *  it is a link nobody clicks twice. */
function LatestNotes() {
  if (!BLOG_POSTS.length) return null
  return (
    <div className="blk">
      <div className="rt">Latest from the blog</div>
      <div className="railrecent">
        {BLOG_POSTS.map(p => (
          <a key={p.url} className="railnote" href={p.url} target="_blank" rel="noopener noreferrer">
            <span className="t">{p.title}</span>
            <span className="m">
              {p.category && <span className="cat">{p.category}</span>}
              <span className="d">{when(p.date)}</span>
            </span>
          </a>
        ))}
      </div>
      <a className="railmore" href={BLOG_URL} target="_blank" rel="noopener noreferrer">
        All field notes
      </a>
    </div>
  )
}

/** The rail: what is running right now, and what has been published since the
 *  last visit. Both are things the screen beside it does not say, which is the
 *  only reason a second column is worth its width.
 *
 *  It kept its name from when it also carried a shortcut list. That list was
 *  four entries, all of them already on screen, and it is gone.
 *
 *  Exported because Agents and Teams mount it too. The live block is optional
 *  and only passed by a screen that has nothing else saying the same number. */
export function QuickActions({ live }: { live?: { running: number } }) {
  return (
    <aside className="rail">
      {live && (
        <div className="blk">
          <div className="rt">Running now</div>
          <div className="sevbig"><b>{live.running}</b><span>in the engine</span></div>
        </div>
      )}
      <LatestNotes />
      {/* Quick actions used to sit here: New analysis, Businesses, Teams, API.
          Every one of them was already on screen. Businesses, Teams and API are
          in the sidebar four hundred pixels to the left, visible at the same
          moment, and New analysis is the primary button in the header. So the
          rail was showing a person four things they could see, twice, and it
          was doing it on every screen that mounts a rail, which meant the rail
          never changed and stopped being read.

          A rail earns its column by carrying what the screen it is standing
          next to cannot: what is running right now, and what has been written
          since the last visit. That is what is left. */}
    </aside>
  )
}

const daypart = () => {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
}

/** A date for the activity feed and the blog rows. Anything unparseable prints
 *  nothing rather than "Invalid Date", which is the kind of string that makes
 *  a whole screen look untrustworthy.
 *
 *  The two inputs are not the same kind of value. An activity record carries a
 *  full instant, and converting that to the reader's zone is correct. A blog
 *  post carries a bare calendar date, and Date reads a bare date as midnight
 *  UTC: render that anywhere behind UTC and it prints the day before, which is
 *  how a post published on the 14th came out as "13 Aug". So a bare date is
 *  built in local time, and only a real timestamp is converted. */
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const when = (s: string | null | undefined) => {
  if (!s) return ''
  const bare = BARE_DATE.exec(s)
  const d = bare ? new Date(+bare[1], +bare[2] - 1, +bare[3]) : new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function Overview() {
  const me = useMe()
  const an = useAnalyses()
  const ov = useOverview()
  const nav = useNavigate()
  const [na, setNa] = useState(false)
  const [busy, setBusy] = useState(false)
  const fn = firstName(me)
  const s = ov ? ov.stats : null
  const acts = ov ? ov.recentActivity : []
  /* What this browser remembers. The engine has no idea who looked at what or
     when, and it should not: this is a fact about one person at one machine.
     Read before the stamp is written, or the window is zero and the answer is
     permanently "nothing changed". */
  const since = useMemo(() => lastSeen(), [])
  const mine = useMemo(() => recents(), [ov])
  useEffect(() => { stampSeen() }, [])

  /* A committed plan nobody has measured is the loop left open, and the person
     who left it open is not going to find it by browsing. Asked for after the
     screen has painted, because this is a nudge and a nudge does not get to
     delay the page it sits on. */
  const [due, setDue] = useState<DueSummary>(NOTHING_DUE)
  useEffect(() => {
    let live = true
    const rows = an && an.st === 'ready' ? an.rows : []
    if (!rows.length) return
    void findDue(rows).then(d => { if (live) setDue(d) })
    return () => { live = false }
  }, [an])

  const moved = useMemo(() => {
    if (!ov || since == null) return null
    const fresh = acts.filter(a => {
      const t = a.createdAt ? new Date(a.createdAt).getTime() : 0
      return t > since
    })
    const done = fresh.filter(a => a.type === 'analysis' && (a.status || '').toLowerCase() === 'complete').length
    const failed = fresh.filter(a => a.type === 'analysis' && (a.status || '').toLowerCase() === 'failed').length
    const snaps = fresh.filter(a => a.type === 'snapshot').length
    return { done, failed, snaps, total: fresh.length }
  }, [ov, acts, since])

  const subline = DEMO
    ? 'One analysis completed today. One workbook is waiting on credits.'
    : s
      ? s.totalAnalyses + ' analyses run in this workspace.' + (s.runningAnalyses > 0 ? ' ' + s.runningAnalyses + ' running now.' : '')
      : ''

  /* Refresh drops both caches and refetches. It is wired to the real hooks
     rather than to a local re-render, because a control that repaints stale
     data while saying Refresh is worse than no control. */
  const refresh = async () => {
    if (busy) return
    setBusy(true)
    try {
      await Promise.all([useOverview.refresh(), useAnalyses.refresh()])
      toast('Workspace refreshed.')
    } finally {
      setBusy(false)
    }
  }

  const openActivity = (a: { id?: string; type?: string }) => {
    if (a.type === 'snapshot') { nav('/analyses'); return }
    if (a.id) nav('/analyses/' + a.id)
    else nav('/analyses')
  }

  return (
    <div className="scr on">
      {na && <NewAnalysis close={() => setNa(false)} />}
      <Header title="Overview">
        <button className="btn p" onClick={() => setNa(true)}>New analysis</button>
      </Header>
      {/* No live block in the rail here. The workspace strip six inches to the
          left of it already carries "Running now" and the same figure, so the
          rail was repeating the label and the number on the one screen where
          both were visible at once. It stays on Analyses, which has no strip. */}
      <Canvas rail={<QuickActions />}>
        <div className="gwrap">
          <div className="ghead">
            <h1>{'Good ' + daypart() + (fn ? ', ' + fn : '') + '.'}</h1>
            {subline && <p>{subline}</p>}
          </div>

          {/* Above the counters, because a total is the same number every
              morning and nobody makes a decision from one. What moved is the
              only thing on this screen that is different than yesterday. */}
          {due.unmeasured.length > 0 && (
            <Section
              title={due.unmeasured.length === 1 ? 'A committed plan has never been measured' : due.unmeasured.length + ' committed plans have never been measured'}
              qualifier="the loop is open"
              flush
            >
              <div className="gsb">
                <p className="sfine" style={{ margin: '0 0 10px' }}>
                  Committing froze what each plan promised. Until a current workbook is measured
                  against it, there is a promise on the record and no verdict. Measuring costs
                  nothing: it re-measures the same thing with the same engine and runs no analysis.
                </p>
                <ul className="glist2">
                  {due.unmeasured.map(d => (
                    <li key={d.analysisId}>
                      <a href={'#/analyses/' + d.analysisId} onClick={e => { e.preventDefault(); nav('/analyses/' + d.analysisId) }}>
                        {d.business}
                      </a>, committed {monthName(d.committedPeriod)}.
                    </li>
                  ))}
                </ul>
                {due.notChecked > 0 && (
                  <p className="sfine" style={{ margin: '8px 0 0' }}>
                    Only the {MAX_CHECKED} most recent analyses were checked, so {due.notChecked} older
                    {due.notChecked === 1 ? ' one is' : ' ones are'} not counted here.
                  </p>
                )}
              </div>
            </Section>
          )}

          <Section
            title="Since you last looked"
            qualifier={since == null ? 'first visit' : ago(since)}
            flush
          >
            <div className="gsb">
              {since == null && (
                <p className="sfine" style={{ margin: 0 }}>
                  This is the first visit recorded on this browser. From now on this
                  reports what moved between one visit and the next.
                </p>
              )}
              {since != null && moved && moved.total === 0 && (
                <p className="sfine" style={{ margin: 0 }}>
                  Nothing has moved since then. No analysis finished, none failed, and
                  no workbook arrived.
                </p>
              )}
              {since != null && moved && moved.total > 0 && (
                <div className="gstats">
                  {moved.done > 0 && (
                    <div className="gstat">
                      <span className="k">Finished</span>
                      <Fig value={moved.done} />
                      <span className="c">{moved.done === 1 ? 'analysis completed' : 'analyses completed'}</span>
                    </div>
                  )}
                  {moved.failed > 0 && (
                    <div className="gstat">
                      <span className="k">Failed</span>
                      <Fig value={moved.failed} accent />
                      <span className="c">{moved.failed === 1 ? 'run needs a look' : 'runs need a look'}</span>
                    </div>
                  )}
                  {moved.snaps > 0 && (
                    <div className="gstat">
                      <span className="k">Arrived</span>
                      <Fig value={moved.snaps} />
                      <span className="c">{moved.snaps === 1 ? 'workbook received' : 'workbooks received'}</span>
                    </div>
                  )}
                </div>
              )}
              {!ov && <p className="sfine" style={{ margin: 0 }}>Reading the workspace.</p>}
            </div>
          </Section>

          {/* The way back to a specific thing. Without it every return trip
              goes through the full list and a scan of rows that mostly read
              the same sentence with a different date on the end. */}
          {mine.length > 0 && (
            <Section
              title="Pick up where you left off"
              qualifier={mine.length + (mine.length === 1 ? ' analysis' : ' analyses')}
              flush
            >
              <div className="glist">
                {mine.map((r: RecentItem) => (
                  <Row key={r.id} cols="minmax(0,1fr) 130px" onClick={() => nav('/analyses/' + r.id)}>
                    <span className="n">{r.title}{r.qualifier && <span className="sub">{r.qualifier}</span>}</span>
                    <span className="f rowend"><span className="dt">{ago(r.seenAt)}</span></span>
                  </Row>
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Workspace"
            qualifier={ov ? 'live' : 'loading'}
            verbs={[
              { label: busy ? 'Refreshing' : 'Refresh', onClick: refresh, disabled: busy },
              { label: 'Open analyses', onClick: () => nav('/analyses') }
            ]}
            flush
          >
            <div className="gstats">
              <div className="gstat">
                <span className="k">Analyses run</span>
                <Fig value={s ? s.totalAnalyses : '\u00b7'} />
                <span className="c">across this workspace</span>
              </div>
              <div className="gstat">
                <span className="k">Running now</span>
                <Fig value={s ? s.runningAnalyses : '\u00b7'} accent={!!s && s.runningAnalyses > 0} />
                <span className="c">live in the engine</span>
              </div>
              <div className="gstat">
                <span className="k">Businesses</span>
                <Fig value={s ? s.activeBusinesses : '\u00b7'} />
                <span className="c">active in this workspace</span>
              </div>
              <div className="gstat">
                <span className="k">Data snapshots</span>
                <Fig value={s ? s.committedSnapshots : '\u00b7'} />
                <span className="c">committed and analyzable</span>
              </div>
            </div>
          </Section>

          {/* Above what happened, because what has not happened yet is the
              thing a person can still do something about. Renders nothing at
              all when no plan is running. */}
          <Execution />

          <Section
            title="Latest activity"
            qualifier={ov ? acts.length + (acts.length === 1 ? ' record' : ' records') : 'loading'}
            verbs={[{ label: 'All analyses', onClick: () => nav('/analyses') }]}
            flush
          >
            <div className="glist">
              {acts.slice(0, 8).map(a => (
                <Row key={a.id} cols="88px minmax(0,1fr) 74px 96px" onClick={() => openActivity(a)}>
                  <span className="m">{a.type === 'snapshot' ? 'Snapshot' : 'Analysis'}</span>
                  <span className="n">{a.type === 'snapshot' ? 'Workbook data received' : a.title}</span>
                  <span className="m">{when(a.createdAt)}</span>
                  <Status label={a.status}
                    tone={(a.status || '').toLowerCase() === 'complete' || (a.status || '').toLowerCase() === 'confirmed'
                      ? 'ok' : (a.status || '').toLowerCase() === 'running' ? 'run' : undefined} />
                </Row>
              ))}
              {!ov && [0, 1, 2, 3].map(i => (
                <div key={'sk' + i} className="grow skelrow" aria-hidden="true" style={{ gridTemplateColumns: '88px minmax(0,1fr)', padding: '9px 26px' }}>
                  <span className="skel" style={{ width: '70%' }} />
                  <span className="skel" style={{ width: '46%' }} />
                </div>
              ))}
              {ov && acts.length === 0 && (
                <SecEmpty
                  title="Nothing has run yet."
                  body={'Open the Google Sheets\u2122 add-on in a workbook with your numbers and press Analyze, or start one here from a file. Runs and the data behind them land in this section.'}
                  action={{ label: 'New analysis', onClick: () => setNa(true) }}
                />
              )}
              {an.st === 'error' && ov && acts.length === 0 && (
                <div className="gsb"><span className="m">Could not load analyses. Press Refresh to retry.</span></div>
              )}
            </div>
          </Section>
        </div>
      </Canvas>
    </div>
  )
}

const statCls = (st: string) => 'stat ' + (st === 'Complete' ? 'ok' : st === 'Running' ? 'run' : st === 'Failed' ? 'fail' : '')

/** Severity as language, not as a fraction.
 *
 *  The design system is explicit that readouts are sentences: "Severity 8 of
 *  10", never "8/10". The engine sends "7/10" and this column printed it
 *  verbatim, which is the one place in the product where a score is rendered
 *  as arithmetic. An empty cell stays a middle dot rather than a zero,
 *  because no severity and a severity of nothing are different facts. */
function severityCell(sev: string | undefined): string {
  const raw = (sev || '').trim()
  if (!raw) return '\u00b7'
  const m = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+)$/.exec(raw)
  return m ? m[1] + ' of ' + m[2] : raw
}

/** What to print in the constraint column.
 *
 *  A failed run has no constraint, but the engine leaves its placeholder text
 *  in the field, so the table was printing "Analysis in progress" on a row
 *  whose status said Failed. Two statements, side by side, contradicting each
 *  other. The row already says what happened; the constraint column should
 *  not argue with it. */
const PLACEHOLDER = /^(analysis in progress|in progress|pending|processing)$/i
function constraintCell(a: AnalysisRow): string {
  const c = (a.c || '').trim()
  if (a.st === 'Failed' && (!c || PLACEHOLDER.test(c))) return 'No constraint determined'
  return c || 'Untitled'
}

export function Analyses() {
  const nav = useNavigate()
  const [q, setQ] = useState('')
  /* The status pill is a filter like any other, and a filter that resets on
     every visit is one nobody uses twice. The group filters below already
     persisted; this one did not, so anyone working a single slice reselected
     it every morning. */
  const [f, setFState] = useState(() => {
    try { return localStorage.getItem('gt.filters.analyses.status') || 'all' } catch (e) { return 'all' }
  })
  const setF = (v: string) => {
    setFState(v)
    try { localStorage.setItem('gt.filters.analyses.status', v) } catch (e) { /* private mode */ }
  }
  const [na, setNa] = useState(false)
  const [busy, setBusy] = useState(false)
  const an = useAnalyses()
  const accs = useAccounts()
  const acct = accountName(accs)
  const all = an.st === 'ready' ? an.rows : []

  /* Category and business filters, built from the rows on screen rather than
     from a fixed list. A workspace with one business never sees a business
     filter; a workspace with nine does, without switching anything on. The
     selection is remembered, because a filter that resets on every visit is
     one nobody uses twice. */
  const [fx, setFx] = useState<FilterState>(() => loadFilters('analyses'))
  const setFilters = (next: FilterState) => { setFx(next); saveFilters('analyses', next) }
  const bizOf = (a: AnalysisRow) => a.b || acct || 'This workspace'
  const groups: FilterGroup[] = useMemo(() => [
    groupFrom('cat', all, (a: AnalysisRow) => a.cat, {
      label: 'Category',
      format: v => v.length > 2 && v === v.toUpperCase()
        ? v.toLowerCase().replace(/(^|[\s_])([a-z])/g, (_m, p1, p2) => (p1 === '_' ? ' ' : p1) + p2.toUpperCase())
        : v,
    }),
    groupFrom('biz', all, bizOf, { label: 'Business' }),
    groupFrom('src', all, (a: AnalysisRow) => a.src, { label: 'Source' }),
  ], [all, acct])

  const rows = useMemo(() => all.filter(a =>
    (f === 'all' || a.st === f) &&
    matches(fx, { cat: a.cat, biz: bizOf(a), src: a.src }) &&
    (!q || (a.b + ' ' + a.c + ' ' + a.cat).toLowerCase().includes(q.toLowerCase()))
  ), [all, q, f, fx, acct])
  const narrowed = activeCount(fx, groups)
  /* A column whose every cell says the same thing is not a column, it is a
     caption repeated once per row. On a single business console "Business"
     reads "This workspace" twenty times in the widest column of the table,
     and "Source" reads "API", while the constraint, which is the sentence
     somebody actually came to read, wraps inside a third of the width.
     This is measured rather than assumed, so a workspace that really does
     have two businesses or a second ingest route gets both columns back
     without anybody changing a setting. */
  const showBiz = useMemo(
    () => new Set(all.map(a => (a.b || acct || 'This workspace'))).size > 1, [all, acct])
  const showSrc = useMemo(
    () => new Set(all.map(a => a.src).filter(Boolean)).size > 1, [all])

  const openRow = (a: AnalysisRow) => {
    if (a.open) nav('/analyses/northlane')
    else if (a.id) nav('/analyses/' + a.id)
    else if (a.st === 'Running') toast('Still running. Usually under five minutes.')
    else if (a.st === 'Queued') noCredits()
    else toast('This sample row has no detail view.')
  }
  const copyLink = (a: AnalysisRow) => {
    navigator.clipboard?.writeText(
      window.location.origin + (a.open ? '/analyses/northlane' : a.id ? '/analyses/' + a.id : '/analyses'))
      .then(() => toast('Link copied.'), () => toast('Could not copy.'))
  }
  const refresh = async () => {
    if (busy) return
    setBusy(true)
    try { await useAnalyses.refresh(); toast('Analyses refreshed.') } finally { setBusy(false) }
  }
  /* Filtered against total, so the qualifier is a claim about what is on
     screen rather than a count of everything that exists. */
  const qual = an.st === 'loading' ? 'loading'
    : an.st === 'error' ? 'could not load'
      : rows.length === all.length ? all.length + (all.length === 1 ? ' analysis' : ' analyses')
        : rows.length + ' of ' + all.length + (narrowed > 0 ? ', ' + narrowed + (narrowed === 1 ? ' filter' : ' filters') : '')

  const cols = (showBiz ? '150px ' : '') + 'minmax(0,1fr) 78px ' + (showSrc ? '70px ' : '') + '96px 118px'

  return (
    <div className="scr on">
      {na && <NewAnalysis close={() => setNa(false)} />}
      <Header title="Analyses">
        <button className="btn p" onClick={() => setNa(true)}>New analysis</button>
      </Header>
      <Canvas rail={<QuickActions live={{ running: all.filter(a => a.st === 'Running').length }} />}>
        <div className="gwrap">
          <Section
            title="Analyses"
            qualifier={qual}
            verbs={[
              ...(q || f !== 'all' || narrowed > 0
                ? [{ label: 'Clear filters', onClick: () => { setQ(''); setF('all'); setFilters({}) } }]
                : []),
              /* "New analysis" was listed here too, sixty pixels below the
                 primary button in the header that does the same thing, and a
                 third time in the rail. One action, offered three times, reads
                 as an interface that is not sure which one is real. It stays
                 where it belongs, which is the header. */
              { label: busy ? 'Refreshing' : 'Refresh', onClick: refresh, disabled: busy }
            ]}
            flush
          >
            <div className="toolrow gtool">
              <div className="searchin">
                <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search businesses and constraints" autoComplete="off" />
              </div>
              <span className="gfgroup">
                {['all', 'Complete', 'Running', 'Failed'].map(k => (
                  <button key={k} className={'fchip' + (f === k ? ' on' : '')} onClick={() => setF(k)}>
                    {k === 'all' ? 'All' : k}
                  </button>
                ))}
              </span>
              <FilterBar groups={groups} state={fx} onChange={setFilters} />
            </div>

            <div className="glist">
              <div className="grow ghrow" style={{ gridTemplateColumns: cols }}>
                {showBiz && <span className="m">Business</span>}
                <span className="m">Constraint</span>
                {/* The header has to sit on the same edge as the figures under
                    it, or the column stops reading as a column. */}
                <span className="m num">Severity</span>
                {showSrc && <span className="m">Source</span>}
                <span className="m">Status</span>
                <span className="m" style={{ textAlign: 'right' }}>Date</span>
              </div>

              {an.st === 'ready' && rows.map((a, i) => (
                <Row key={i} cols={cols} onClick={() => openRow(a)}>
                  {showBiz && <span className="m">{a.b || acct || 'This workspace'}</span>}
                  <span className={a.st === 'Failed' ? 'n faintcell' : 'n'}>{constraintCell(a)}</span>
                  <span className="m num">{severityCell(a.sev)}</span>
                  {showSrc && <span className="m">{a.src}</span>}
                  <Status label={a.st}
                    tone={a.st === 'Complete' ? 'ok' : a.st === 'Running' ? 'run' : undefined} />
                  <span className="f rowend">
                    <span className="dt">{a.d}</span>
                    <span className="rowacts">
                      <button className="ract" onClick={e => { e.stopPropagation(); openRow(a) }}>Open</button>
                      <button className="ract" onClick={e => { e.stopPropagation(); copyLink(a) }}>Copy link</button>
                    </span>
                  </span>
                </Row>
              ))}

              {an.st === 'loading' && [0, 1, 2, 3, 4, 5].map(i => (
                <div key={'sk' + i} className="grow skelrow" aria-hidden="true" style={{ gridTemplateColumns: cols }}>
                  {showBiz && <span className="skel" style={{ width: '70%' }} />}
                  <span className="skel" style={{ width: '85%' }} />
                  <span className="skel" style={{ width: '40%' }} />
                  {showSrc && <span className="skel" style={{ width: '60%' }} />}
                  <span className="skel" style={{ width: '55%' }} />
                  <span className="skel" style={{ width: '50%' }} />
                </div>
              ))}
            </div>

            {an.st === 'error' && (
              <SecEmpty
                title="Could not load analyses."
                body="The engine did not answer. Nothing has been lost; the list is fetched fresh every time."
                action={{ label: 'Try again', onClick: refresh }}
              />
            )}
            {an.st === 'ready' && rows.length === 0 && all.length > 0 && (
              <SecEmpty
                title="Nothing matches that search."
                body={'No analysis in this workspace matches ' + (q ? '"' + q + '"' : 'that filter') + '.'}
                action={{ label: 'Clear filters', onClick: () => { setQ(''); setF('all'); setFilters({}) } }}
              />
            )}
            {an.st === 'ready' && all.length === 0 && (
              <SecEmpty
                title="No analyses in this workspace yet."
                body={'Open the Google Sheets\u2122 add-on in a workbook with your business numbers and press Analyze Workbook, or start one here from a file. Results appear in this section within minutes.'}
                action={{ label: 'New analysis', onClick: () => setNa(true) }}
              />
            )}
          </Section>
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
/** Buying, from inside the portal.
 *
 *  It lives under the balance and the per run costs because that is the only
 *  place in the product where somebody already has the two numbers in front of
 *  them that make the decision: what they hold, and what a run costs.
 *
 *  The bundles are shown with a per credit rate rather than only a total. A
 *  column of four prices asks the reader to do the division; showing it is the
 *  difference between a price list and a decision.
 *
 *  When no checkout route is configured none of this renders, rather than
 *  rendering and failing. A button that posts to a guessed path would get this
 *  app's own HTML shell back at status 200 and look like it had worked. */
function BuyPanel({ balance }: { balance: number | null }) {
  const [busy, setBusy] = useState<string | null>(null)
  if (!checkoutConfigured()) return null

  const go = async (id: string, p: Purchase, label: string) => {
    setBusy(id)
    /* Recorded before leaving, so the screen we come back to knows what it is
       looking at. A bundle can be confirmed by watching the balance rise; a
       workbook cannot be confirmed here at all, and the return screen has to
       know which of those it is rather than assuming the first. */
    rememberCheckout({ kind: p.kind, label, balance })
    try {
      window.location.assign(await startCheckout(p))
    } catch (e) {
      setBusy(null)
      toast(e instanceof Error ? e.message : 'Could not open checkout.')
    }
  }

  return (
    <>
      <div className="shead" style={{ marginTop: 26 }}>
        <h2>Add credits</h2>
      </div>
      <div className="buygrid">
        {CREDIT_BUNDLES.map(b => (
          <div key={b.bundle} className="buycard">
            <span className="lbl">{b.bundle} credits</span>
            <span className="fig">{b.price}</span>
            <span className="cap">{b.each}</span>
            <button className="btn p" disabled={busy !== null}
              onClick={() => void go('c' + b.bundle, { kind: 'credits', bundle: b.bundle },
                b.bundle + ' credits')}>
              {busy === 'c' + b.bundle ? 'Opening checkout' : 'Buy'}
            </button>
          </div>
        ))}
      </div>

      {SHEET_PRODUCTS.length > 0 && (
        <>
          <div className="shead" style={{ marginTop: 26 }}>
            <h2>Workbooks</h2>
            <span className="hint">One time purchase</span>
          </div>
          <div className="tbl">
            {SHEET_PRODUCTS.map(pr => (
              <div key={pr.productId} className="buyrow">
                <span className="nm">{pr.name}</span>
                <span className="mut">{pr.blurb}</span>
                <span className="pr">{pr.price}</span>
                <button className="btn g" disabled={busy !== null}
                  onClick={() => void go(pr.productId, { kind: 'product', productId: pr.productId },
                    pr.name)}>
                  {busy === pr.productId ? 'Opening checkout' : 'Buy'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}

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

        <BuyPanel balance={credits ? credits.balance : null} />
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
