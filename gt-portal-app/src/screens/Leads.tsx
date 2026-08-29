/** FINDING COMPANIES.
 *
 *  Under Businesses, because this screen is about companies. Not mixed into
 *  the Businesses table, because a business in this product is a company that
 *  has already been analysed and a lead is one that has not. Two lists.
 *
 *  WHAT THIS SCREEN REFUSES TO DO.
 *
 *  It never reports a single total. Discovery finds places, some of those
 *  carry a website, some of those sites answer with a contact, and a screen
 *  that prints "96 leads" hides which of those three stages lost the other
 *  hundred. The funnel is on screen because the next decision a person makes
 *  is whether to widen the search or the area, and only the drop tells them
 *  which.
 *
 *  It never says a search is running when the engine has stopped. Polling ends
 *  on a terminal status, and a search that dies mid flight reports the
 *  engine's own sentence rather than a status code.
 *
 *  It never implies the crawl found something it did not. A row with no email
 *  and no phone says so in the row rather than being quietly filtered out,
 *  because a company worth calling that published no address is still a lead
 *  and hiding it would misrepresent the search.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from './simple'
import { Section } from '../components/Section'
import { toast } from '../lib/bus'
import {
  listSearches, getSearch, startSearch, setLeadStatus,
  running, stageLabel, headline, drop, contactable, toCsv, leadsLive,
} from '../lib/leads'
import type { Lead, LeadSearch, Quota, LeadStatus } from '../lib/leads'
import { sampleState, sample, SAMPLE_QUOTA, SAMPLE_STATES } from '../lib/leadsSample'
import type { SampleState } from '../lib/leadsSample'

const SIZES = [25, 50, 100, 200]
const POLL_MS = 4000

type Load = 'loading' | 'ready' | 'failed'

export function Leads() {
  const nav = useNavigate()

  /* Made-up rows, drawn only when the URL asks for them by name. Nothing in
     the product links here, so a customer cannot arrive at this by clicking.
     See lib/leadsSample.ts, which is deleted the day the engine answers. */
  const demo = sampleState(typeof window === 'undefined' ? '' : window.location.search)

  const [load, setLoad] = useState<Load>('loading')
  const [searches, setSearches] = useState<LeadSearch[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)

  const [openId, setOpenId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ search: LeadSearch; leads: Lead[] } | null>(null)

  const [industry, setIndustry] = useState('')
  const [location, setLocation] = useState('')
  const [limit, setLimit] = useState(50)
  const [enrich, setEnrich] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /* A poll that outlives the screen keeps a dead timer alive against an
     unmounted component, so the timer id is held and cleared. */
  const timer = useRef<number | null>(null)
  const stop = () => { if (timer.current) { window.clearTimeout(timer.current); timer.current = null } }

  const loadList = useCallback(async () => {
    try {
      const r = await listSearches()
      setSearches(r.searches)
      setQuota(r.quota)
      setLoad('ready')
      return r.searches
    } catch (e) {
      setLoad('failed')
      setErr(e instanceof Error ? e.message : 'Could not reach the engine.')
      return []
    }
  }, [])

  useEffect(() => {
    if (demo) {
      const s = sample(demo)
      setSearches(s.searches)
      setQuota(SAMPLE_QUOTA)
      setDetail(s.searches.length ? { search: s.searches[0], leads: s.leads[s.searches[0].id] || [] } : null)
      setOpenId(s.searches.length ? s.searches[0].id : null)
      setLoad('ready')
      return
    }
    if (!leadsLive()) { setLoad('ready'); return }
    let live = true
    loadList().then(list => {
      if (!live) return
      /* Land on the newest search rather than an empty right hand side, and
         on the running one if there is one, because that is the thing the
         person came back to look at. */
      const run = list.find(s => running(s.status))
      const first = run || list[0]
      if (first) setOpenId(first.id)
    })
    return () => { live = false; stop() }
  }, [loadList, demo])

  /* Detail load and poll. One effect: the poll is the same call as the load,
     so splitting them would mean two code paths that must agree. */
  useEffect(() => {
    if (demo) return
    if (!openId || !leadsLive()) { setDetail(null); return }
    let live = true
    stop()

    const tick = async () => {
      try {
        const d = await getSearch(openId)
        if (!live) return
        setDetail(d)
        if (running(d.search.status)) {
          timer.current = window.setTimeout(tick, POLL_MS)
        } else {
          /* The row in the list still says "finding". Refresh it once the
             job is actually over, then stop asking. */
          loadList()
        }
      } catch (e) {
        if (!live) return
        setErr(e instanceof Error ? e.message : 'Could not read that search.')
      }
    }
    tick()
    return () => { live = false; stop() }
  }, [openId, loadList, demo])

  const ready = industry.trim().length > 1 && location.trim().length > 1
  const spent = quota ? quota.used >= quota.limit : false

  const onFind = async () => {
    if (!ready || busy || spent) return
    setBusy(true)
    setErr(null)
    try {
      const s = await startSearch({
        industry: industry.trim(), location: location.trim(), limit, enrich,
      })
      setSearches(prev => [s, ...prev])
      setQuota(q => (q ? { ...q, used: q.used + 1 } : q))
      setOpenId(s.id)
      setIndustry('')
      setLocation('')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The search could not be started.')
    } finally {
      setBusy(false)
    }
  }

  const mark = async (lead: Lead, status: LeadStatus) => {
    /* Optimistic, and reverted on failure. A save that visibly does nothing
       for two seconds gets clicked again. */
    const before = lead.status
    setDetail(d => d && ({ ...d, leads: d.leads.map(l => l.id === lead.id ? { ...l, status } : l) }))
    if (demo) return
    try {
      await setLeadStatus(lead.id, status)
    } catch {
      setDetail(d => d && ({ ...d, leads: d.leads.map(l => l.id === lead.id ? { ...l, status: before } : l) }))
      toast('That did not save. The lead is unchanged.')
    }
  }

  const exportCsv = () => {
    if (!detail || detail.leads.length === 0) return
    const blob = new Blob([toCsv(detail.leads)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads-' + detail.search.industry.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="scr on">
      <Header title="Leads">
        <button className="btn g" onClick={() => nav('/businesses')}>Businesses</button>
      </Header>
      <Canvas>
        <p className="pgintro">Companies in an industry and an area, with whatever contact
          details their own websites publish. These are prospects, not businesses: a business
          appears in this workspace when it is analysed, and nothing here is analysed.</p>

        {demo && <SampleNotice state={demo} />}

        {/* The screen is finished and the engine routes are not. Saying so is
            the honest state; a form that posts into nothing is not. */}
        {!leadsLive() && !demo && (
          <div className="ldempty">
            <b>Not switched on yet</b>
            <span>The engine does not serve lead searches yet. This screen is built against
              the routes it will serve, and it starts working the day they answer. Nothing
              here is waiting on you.</span>
          </div>
        )}

        {(leadsLive() || demo) && <Find
          industry={industry} setIndustry={setIndustry}
          location={location} setLocation={setLocation}
          limit={limit} setLimit={setLimit}
          enrich={enrich} setEnrich={setEnrich}
          quota={quota} busy={busy} ready={ready} spent={spent}
          err={err} onFind={onFind}
        />}

        {leadsLive() && !demo && load === 'loading' && (
          <div className="tbl">{[0, 1, 2].map(i => (
            <div key={i} className="leadrow skelrow" aria-hidden="true">
              <span className="skel" style={{ width: '34%' }} />
              <span className="skel" style={{ width: '22%' }} />
              <span className="skel" style={{ width: '26%' }} />
              <span className="skel" style={{ width: '14%' }} />
            </div>
          ))}</div>
        )}

        {(leadsLive() || demo) && load === 'ready' && searches.length === 0 && (
          <div className="ldempty">
            <b>No searches yet</b>
            <span>Name an industry and an area above. The first pass finds companies and
              the second reads their websites for a way to reach them.</span>
          </div>
        )}

        {detail && <Result detail={detail} onMark={mark} onExport={exportCsv}
          onWrite={detail.leads.some(l => l.status !== 'dismissed' && contactable(l))
            ? () => nav('/businesses/leads/outreach' + (demo ? window.location.search : ''))
            : undefined} />}

        {searches.length > 1 && (
          <Section title="Earlier searches" flush>
            <div className="tbl">
              {searches.map(s => (
                <button key={s.id} type="button"
                  className={'srchrow' + (s.id === openId ? ' on' : '')}
                  onClick={() => {
                    setOpenId(s.id)
                    if (demo) setDetail({ search: s, leads: sample(demo).leads[s.id] || [] })
                  }}>
                  <span className="sq">{s.industry}</span>
                  <span className="mut">{s.location}</span>
                  <span className="mut">{stageLabel(s)}</span>
                  <span className="num">{headline(s) === null ? '' : headline(s)}</span>
                </button>
              ))}
            </div>
          </Section>
        )}
      </Canvas>
    </div>
  )
}

/** Says what this is, every time, in the one place nobody can scroll past.
 *  The switcher underneath changes which made-up situation is drawn. */
function SampleNotice({ state }: { state: SampleState }) {
  const go = (k: SampleState) => {
    const q = new URLSearchParams(window.location.search)
    q.set('sample', '1')
    q.set('state', k)
    window.location.search = q.toString()
  }
  return (
    <div className="ldsample">
      <p><b>These rows are made up.</b> The engine does not serve lead searches yet, so this
        is the screen drawn against invented companies. It appears only because the address
        bar says sample. Nothing links here, and no customer can reach it.</p>
      <div className="ldsamplesw">
        {SAMPLE_STATES.map(s => (
          <button key={s.key} type="button" className={s.key === state ? 'on' : ''}
            onClick={() => go(s.key)}>{s.label}</button>
        ))}
      </div>
    </div>
  )
}

const Canvas = ({ children }: { children: React.ReactNode }) => (
  <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
    <div className="wrap">{children}</div>
  </div>
)

// ── The form ────────────────────────────────────────────────────────────────

function Find(p: {
  industry: string; setIndustry: (v: string) => void
  location: string; setLocation: (v: string) => void
  limit: number; setLimit: (v: number) => void
  enrich: boolean; setEnrich: (v: boolean) => void
  quota: Quota | null; busy: boolean; ready: boolean; spent: boolean
  err: string | null; onFind: () => void
}) {
  return (
    <div className="ldfind">
      <div className="ldfields">
        <div className="ldf">
          <label className="lbl" htmlFor="ldind">Industry</label>
          <input id="ldind" className="tminput" value={p.industry} autoComplete="off"
            placeholder="dental practice" disabled={p.busy}
            onChange={e => p.setIndustry(e.target.value)} />
        </div>
        <div className="ldf">
          <label className="lbl" htmlFor="ldloc">Area</label>
          <input id="ldloc" className="tminput" value={p.location} autoComplete="off"
            placeholder="Austin, Texas" disabled={p.busy}
            onChange={e => p.setLocation(e.target.value)} />
        </div>
        <div className="ldf narrow">
          <label className="lbl" htmlFor="ldlim">How many</label>
          <select id="ldlim" className="tmsel" value={p.limit} disabled={p.busy}
            onChange={e => p.setLimit(Number(e.target.value))}>
            {SIZES.map(n => <option key={n} value={n}>{n} companies</option>)}
          </select>
        </div>
      </div>

      <label className="ldcheck">
        <input type="checkbox" checked={p.enrich} disabled={p.busy}
          onChange={e => p.setEnrich(e.target.checked)} />
        <span>Read each company's website for an email and a phone number</span>
      </label>

      <p className="sfine">It reads pages anyone can open. It does not sign in, it does not
        submit forms, and it collects what a business publishes about itself. Companies
        without a website are still returned, with whatever the listing carried.</p>

      {p.err && <p className="lderr">{p.err}</p>}

      <div className="ldact">
        <button className="btn p" disabled={!p.ready || p.busy || p.spent} onClick={p.onFind}>
          {p.busy ? 'Starting' : 'Find companies'}
        </button>
        {p.quota && (
          <span className={'ldquota' + (p.spent ? ' out' : '')}>
            {p.spent
              ? 'No searches left today. The allowance resets ' + resetsIn(p.quota.resets) + '.'
              : (p.quota.limit - p.quota.used) + ' of ' + p.quota.limit + ' searches left today'}
          </span>
        )}
      </div>
    </div>
  )
}

function resetsIn(iso: string): string {
  const t = new Date(iso).getTime()
  if (!isFinite(t)) return 'later today'
  const hrs = Math.max(0, Math.round((t - Date.now()) / 3600000))
  if (hrs === 0) return 'within the hour'
  return 'in ' + hrs + (hrs === 1 ? ' hour' : ' hours')
}

// ── One search and its rows ─────────────────────────────────────────────────

function Result({ detail, onMark, onExport, onWrite }: {
  detail: { search: LeadSearch; leads: Lead[] }
  onMark: (l: Lead, s: LeadStatus) => void
  onExport: () => void
  /** Present only when at least one row can actually be written to. */
  onWrite: (() => void) | undefined
}) {
  const { search: s, leads } = detail
  const live = running(s.status)
  const stages = drop(s.funnel, s.enrich)
  /* The last number carries the accent only once it is final. A count that is
     still climbing is not a number to act on. */
  const settled = s.status === 'complete'
  const shown = leads.filter(l => l.status !== 'dismissed')

  return (
    <Section
      title={s.industry + ' in ' + s.location}
      qualifier={stageLabel(s) + (s.limit ? ', asked for ' + s.limit : '')}
      verbs={leads.length > 0 ? [
        { label: 'Draft outreach', onClick: onWrite, disabled: !onWrite,
          title: onWrite ? undefined : 'No company here came back with an email or a phone number, so there is nothing to write to.' },
        { label: 'Export CSV', onClick: onExport },
      ] : undefined}
      flush
    >
      <div className={'ldfunnel' + (settled ? ' done' : '')}>
        {stages.map((st, i) => (
          <div key={st.label} className={'ldstage' + (i === stages.length - 1 ? ' last' : '')}>
            {st.count === null
              ? <b className="pending">Not yet</b>
              : <b>{st.count}</b>}
            <span>{st.label}</span>
          </div>
        ))}
      </div>

      {live && (
        <p className="ldrun"><i />{stageLabel(s)}. This keeps going if you leave the screen.</p>
      )}

      {s.status === 'failed' && (
        <p className="lderr big">{s.failure || 'The search stopped before it finished, and the engine did not say why.'}</p>
      )}

      {s.status === 'partial' && (
        <p className="ldwarn">The companies were found but their websites were not read, so these
          rows carry only what the listing published.</p>
      )}

      {s.refusals.length > 0 && (
        <ul className="ldrefuse">{s.refusals.map((r, i) => <li key={i}>{r}</li>)}</ul>
      )}

      {!live && leads.length === 0 && s.status !== 'failed' && (
        <div className="ldempty">
          <b>Nothing came back</b>
          <span>No company in that area matched that industry. A broader term or a wider
            area is the next thing to try; nothing was spent that a narrower search saved.</span>
        </div>
      )}

      {shown.length > 0 && (
        <div className="tbl">
          <div className="leadrow h">
            <span>Company</span><span>Contact</span><span>Site</span><span>Rating</span><span />
          </div>
          {shown.map(l => <LeadRow key={l.id} lead={l} onMark={onMark} />)}
        </div>
      )}

      {leads.length > shown.length && (
        <p className="sfine ldhidden">{leads.length - shown.length} dismissed and hidden.</p>
      )}
    </Section>
  )
}

function LeadRow({ lead, onMark }: { lead: Lead; onMark: (l: Lead, s: LeadStatus) => void }) {
  const has = contactable(lead)
  return (
    <div className={'leadrow' + (lead.status === 'saved' ? ' saved' : '')}>
      <span className="ldco">
        <b>{lead.company}</b>
        {lead.category && <i className="ldcat">{lead.category}</i>}
        {lead.address && <i className="ldaddr">{lead.address}</i>}
      </span>

      <span className="ldcontact">
        {lead.emails.length > 0 && (
          <a href={'mailto:' + lead.emails[0]}>{lead.emails[0]}</a>
        )}
        {lead.emails.length > 1 && <i className="ldmore">and {lead.emails.length - 1} more</i>}
        {lead.phone && <i className="ldphone">{lead.phone}</i>}
        {!has && <i className="ldnone">Nothing published</i>}
      </span>

      <span className="ldsite">
        {lead.website
          ? <a href={lead.website} target="_blank" rel="noopener noreferrer">{lead.domain || 'Website'}</a>
          : <i className="ldnone">No website</i>}
      </span>

      <span className="ldrate">
        {lead.rating === null
          ? <i className="ldnone">Unrated</i>
          : <><b>{lead.rating.toFixed(1)}</b>
              {lead.reviews !== null && lead.reviews > 0 && <i className="ldrev">{lead.reviews}</i>}</>}
      </span>

      <span className="ldacts">
        {lead.status === 'saved'
          ? <button className="ldbtn on" type="button" onClick={() => onMark(lead, 'new')}>Saved</button>
          : <button className="ldbtn" type="button" onClick={() => onMark(lead, 'saved')}>Save</button>}
        <button className="ldbtn q" type="button" onClick={() => onMark(lead, 'dismissed')}>Dismiss</button>
      </span>
    </div>
  )
}
