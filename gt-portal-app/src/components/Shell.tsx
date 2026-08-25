import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Palette } from './Palette'
import { onToast } from '../lib/bus'
import { LegalFooter } from './LegalFooter'
import { useMe, useCalibration, useCredits, useBilling, calibrationLabel, creditsLabel, planLabel, trialDaysLeft, workspaceLabel, initials } from '../lib/liveData'
import { clearWorkspace } from '../lib/api'

const ICONS: Record<string, string> = {
  Overview: '<rect x="2" y="2" width="5.5" height="5.5" rx="1.2"/><rect x="10.5" y="2" width="5.5" height="5.5" rx="1.2"/><rect x="2" y="10.5" width="5.5" height="5.5" rx="1.2"/><rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.2"/>',
  Analyses: '<path d="M1.5 9.5h3l2-6 3 11 2.5-7h4"/>',
  Content: '<rect x="2" y="4.5" width="11" height="11" rx="1.6"/><path d="M5 2h11v11"/><path d="M2 12l3.4-3.4 2.6 2.6 2.4-2.4 2.6 2.7"/>',
  Businesses: '<path d="M2.5 15.5v-11l6-3v14"/><path d="M8.5 15.5v-8l6 2v6"/><path d="M1 15.5h16"/>',
  API: '<circle cx="5.5" cy="6.5" r="3.5"/><path d="M8 9l6.5 6.5"/><path d="M12 12.5l2 2"/>',
  /* A microphone, drawn to the same 18 unit grid as the rest: same stroke
     weight, round joins, no fill. */
  Agents: '<rect x="6.6" y="2" width="4.8" height="8.4" rx="2.4"/><path d="M3.8 8.6a5.2 5.2 0 0010.4 0"/><path d="M9 13.8V16"/>',
  /* Two links of a chain, same 18 unit grid and stroke weight as the rest.
     A plug or a lightning bolt would read as power rather than permission. */
  /* An arrow going into a tray: things go in here. */
  Feed: '<path d="M9 1.5v8.5"/><path d="M5.6 7.2L9 10.5l3.4-3.3"/><path d="M2 11.5v3a1.6 1.6 0 001.6 1.6h10.8A1.6 1.6 0 0016 14.5v-3"/>',
  Connections: '<path d="M7.4 10.6a3.2 3.2 0 010-4.5l2.6-2.6a3.2 3.2 0 014.5 4.5l-1.3 1.3"/><path d="M10.6 7.4a3.2 3.2 0 010 4.5l-2.6 2.6a3.2 3.2 0 01-4.5-4.5l1.3-1.3"/>',
  Teams: '<circle cx="6.5" cy="5.5" r="2.8"/><path d="M1.5 15.5c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M12 3.2a2.8 2.8 0 010 5.4"/><path d="M13.5 10.9c1.7.6 3 2.2 3 4.6"/>',
  Clients: '<circle cx="9" cy="5.5" r="3"/><path d="M3 15.5c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
  Editor: '<path d="M11.5 2.5l4 4L6 16H2v-4z"/><path d="M10 4l4 4"/>',
  Admin: '<path d="M9 1.5l6 2.5v5c0 4-2.6 6.4-6 7.5-3.4-1.1-6-3.5-6-7.5v-5z"/>',
  'Agent OS': '<rect x="4" y="4" width="10" height="10" rx="2.2"/><path d="M7 1.5v2.5M11 1.5v2.5M7 14v2.5M11 14v2.5M1.5 7H4M1.5 11H4M14 7h2.5M14 11h2.5"/>'
}
/* Customer navigation only. Clients, Editor and Agent OS were founder tooling
   living in the customer product; they belong to the back office at /portal and
   were removed from here rather than duplicated. */
/* Agents is always listed, whether or not one is configured yet.
   It was hidden until configured, on the reasoning that a nav item leading to
   "not switched on" is worse than no item. That was wrong for this feature:
   the screen is where you find out the agent exists and what it will answer,
   and hiding it means the only people who know it is coming are the ones who
   already knew. The screen states its own status honestly, which is the right
   place for that information. */
export const NAV: [string, string][] = [
  ['Overview', '/'], ['Analyses', '/analyses'], ['Content', '/content'], ['Feed', '/feed'],
  ['Businesses', '/businesses'], ['Agents', '/agents'], ['Connections', '/connections'],
  ['API', '/api-keys'], ['Teams', '/teams']
]
/* The same nine destinations as NAV, in the same order, wearing labels.
   This is presentation only: no route changes, nothing is added, nothing is
   removed. Nine flat items gave a new person no way to tell that Analyses and
   Content are the work and API and Teams are the plumbing.

   Derived from NAV rather than written out again, so a tab added to NAV
   cannot silently fail to appear here. */
const GROUPING: [string, string[]][] = [
  ['Workspace', ['Overview', 'Analyses', 'Businesses']],
  ['Content engine', ['Content', 'Feed', 'Connections']],
  ['Setup', ['Agents', 'API', 'Teams']]
]
export const NAV_GROUPS: [string, [string, string][]][] = GROUPING.map(
  ([g, names]) => [g, names.map(n => NAV.find(([l]) => l === n)).filter(Boolean) as [string, string][]]
)

export const TABS: [string, string][] = [
  ['Overview', '/'], ['Analyses', '/analyses'], ['Content', '/content'], ['Businesses', '/businesses']
]

export function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 18 18" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
}

export function UserCard() {
  const me = useMe()
  const signOut = () => {
    /* The workspace goes with the session. Leaving it behind is how the next
       person to sign in on this browser inherits this one. */
    clearWorkspace()
    const clerk = (window as unknown as { Clerk?: { signOut?: (o?: object) => Promise<void> } }).Clerk
    if (clerk && clerk.signOut) clerk.signOut({ redirectUrl: '/login' })
    else window.location.assign('/login')
  }
  return (
    <div className="usercard">
      <span className="av">{initials(me)}</span>
      <span className="ucmeta">
        <span className="nm">{me ? me.name : 'Signing in'}</span><br />
        <span className="ws">{workspaceLabel(me)}</span>
      </span>
      <button className="signout" title="Sign out" aria-label="Sign out" onClick={signOut}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M6 2H3.5A1.5 1.5 0 0 0 2 3.5v9A1.5 1.5 0 0 0 3.5 14H6" />
          <path d="M10 5l3 3-3 3M13 8H6" />
        </svg>
      </button>
    </div>
  )
}

export function Shell() {
  const cal = useCalibration()
  const cred = useCredits()
  /* This hook existed and was consumed by nobody, so the engine tracked the
     subscription and the product never mentioned it. A person paying every
     month could not see what they were paying for. */
  const bill = useBilling()
  const [pal, setPal] = useState(false)
  /* Collapsed is a preference, so it outlives the tab. A failed read means
     private mode, which is not an error worth surfacing. */
  const [rail, setRail] = useState(() => { try { return localStorage.getItem('gt.rail') === '1' } catch (e) { return false } })
  /* Credits and calibration are diagnostics, not headlines. A standing "0 left"
     above every screen reads as a dead account to anyone who does not already
     know what it counts. They stay one click away, collapsed by default, and
     the choice outlives the tab the way the rail does. */
  const [meta, setMeta] = useState(() => { try { return localStorage.getItem('gt.meta') === '1' } catch (e) { return false } })
  const [msg, setMsg] = useState<string | null>(null)
  const loc = useLocation()
  const nav = useNavigate()

  useEffect(() => onToast(m => {
    setMsg(m)
    const h = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(h)
  }), [])

  useEffect(() => { window.scrollTo(0, 0) }, [loc.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setPal(p => !p) }
      else if (e.key === 'Escape') setPal(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const analysesActive = loc.pathname.startsWith('/analyses')

  return (
    <>
      <header className="mbar">
        <NavLink className="mbtn" to="/more" aria-label="More">
          <span /><span /><span />
        </NavLink>
        <span className="lockup" aria-hidden="true">
          {/* The phone mark is a 40px box, so the retina candidates are the 128
              and 192 assets. The 60 and 90 files are only enough for the 30px
              sidebar mark and would render soft here. */}
          <img className="marklogo" src="/logo-mark-90.png" srcSet="/logo-mark-128.png 2x, /logo-mark-192.png 3x" alt="" />Growth Terminal
        </span>
        <button className="mbtn r" aria-label="Share">
          <svg viewBox="0 0 20 20"><path d="M10 13V3M10 3L6.5 6.5M10 3l3.5 3.5" /><path d="M4 12v3.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V12" /></svg>
        </button>
      </header>

      <nav className="tabbar">
        {TABS.map(([label, to]) => (
          <NavLink key={label} to={to} className={({ isActive }) =>
            (label === 'Analyses' ? analysesActive : isActive) ? 'on' : ''} end={to === '/'}>
            <Icon name={label} />{label}
          </NavLink>
        ))}
        <NavLink to="/more" className={({ isActive }) => isActive ? 'on' : ''}>
          <svg viewBox="0 0 18 18"><circle cx="3" cy="9" r="1.4" /><circle cx="9" cy="9" r="1.4" /><circle cx="15" cy="9" r="1.4" /></svg>More
        </NavLink>
      </nav>

      {/* The address in the window toolbar tracks the route, the way a browser
          address bar does. It is written to a data attribute rather than
          rendered as text because the toolbar is drawn in CSS, and this keeps
          it one line here instead of a component that has to be positioned
          against a frame it does not own. */}
      <div className={'shell' + (rail ? ' railed' : '')}>
        <aside className="side">
          <button className="railtoggle" onClick={() => { setRail(r => { try { localStorage.setItem('gt.rail', r ? '0' : '1') } catch (e) { /* private mode */ } return !r }) }}
            aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} title={rail ? 'Expand sidebar' : 'Collapse sidebar'}>
            <svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="2"/><path d="M6 2.5v11"/></svg>
          </button>
          <span className="mark">
            <img className="marklogo" src="/logo-mark-60.png" srcSet="/logo-mark-60.png 2x, /logo-mark-90.png 3x" alt="" />Growth Terminal
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {/* A trial has a deadline attached, so it stays in the chrome where
                somebody on the last day of it will see it. "Plan: internal" is
                the billing-bypass state: no deadline, no balance, no action, and
                to anyone who does not run this account it reads as a staging
                build. It goes down with the other diagnostics. */}
            {bill && !bill.bypassed && (
              <div className={'chip' + (trialDaysLeft(bill) !== null ? ' warn' : '')}>
                <i />{planLabel(bill)}
              </div>
            )}
            {/* A chip renders when it has an answer. The plan chip has always
                worked this way; the other two printed "loading" and then, when
                the request failed, kept printing it. The hook caches nothing on
                failure and notifies nobody, so "Credits: loading" was permanent
                in the chrome of every screen in the product, on every visit.

                A readout that never resolves is worse than no readout: it is a
                standing claim that the application is still trying. */}
            {((bill && bill.bypassed) || (cal && cal.totals) || (cred && typeof cred.balance === 'number')) && (
              <button type="button" className={'metatoggle' + (meta ? ' open' : '')} aria-expanded={meta}
                onClick={() => setMeta(m => { try { localStorage.setItem('gt.meta', m ? '0' : '1') } catch (e) { /* private mode */ } return !m })}>
                <svg viewBox="0 0 10 10" width="9" height="9" aria-hidden="true"><path d="M3.5 2L6.5 5L3.5 8" /></svg>
                Account status
              </button>
            )}
            {meta && bill && bill.bypassed && <div className="chip"><i />{planLabel(bill)}</div>}
            {meta && cal && cal.totals && <div className="chip"><i />{calibrationLabel(cal)}</div>}
            {meta && cred && typeof cred.balance === 'number' && <div className="chip"><i />{creditsLabel(cred)}</div>}
          </div>
          <div className="searchpill" onClick={() => setPal(true)}>
            <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
            Search<span className="k">Ctrl K</span>
          </div>
          <nav className="nav" aria-label="Sections">
            {NAV_GROUPS.map(([group, items]) => (
              <div className="navgroup" key={group}>
                <span className="navlbl">{group}</span>
                {items.map(([label, to]) => (
                  <NavLink key={label} to={to} end={to === '/'} data-tip={label}
                    className={({ isActive }) => (label === 'Analyses' ? analysesActive : isActive) ? 'on' : ''}>
                    <Icon name={label} /><span className="navtxt">{label}</span>
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sp" />
          <UserCard />
        </aside>

        <main>
          <Outlet context={{ openPalette: () => setPal(true) }} />
          {/* Below the screen, not inside it, so every route carries the
              operating entity and the policies without any screen having to
              remember to. */}
          <LegalFooter />
        </main>
      </div>

      {pal && <Palette close={() => setPal(false)} go={p => { setPal(false); nav(p) }} />}
      <div className={'toast' + (msg ? ' on' : '')}>{msg}</div>
    </>
  )
}
