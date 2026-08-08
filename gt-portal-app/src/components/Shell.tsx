import React, { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Palette } from './Palette'
import { onToast } from '../lib/bus'
import { useMe, initials } from '../lib/liveData'

const ICONS: Record<string, string> = {
  Overview: '<rect x="2" y="2" width="5.5" height="5.5" rx="1.2"/><rect x="10.5" y="2" width="5.5" height="5.5" rx="1.2"/><rect x="2" y="10.5" width="5.5" height="5.5" rx="1.2"/><rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.2"/>',
  Analyses: '<path d="M1.5 9.5h3l2-6 3 11 2.5-7h4"/>',
  Businesses: '<path d="M2.5 15.5v-11l6-3v14"/><path d="M8.5 15.5v-8l6 2v6"/><path d="M1 15.5h16"/>',
  'API Keys': '<circle cx="5.5" cy="6.5" r="3.5"/><path d="M8 9l6.5 6.5"/><path d="M12 12.5l2 2"/>',
  Teams: '<circle cx="6.5" cy="5.5" r="2.8"/><path d="M1.5 15.5c0-2.8 2.2-5 5-5s5 2.2 5 5"/><path d="M12 3.2a2.8 2.8 0 010 5.4"/><path d="M13.5 10.9c1.7.6 3 2.2 3 4.6"/>',
  Clients: '<circle cx="9" cy="5.5" r="3"/><path d="M3 15.5c0-3.3 2.7-6 6-6s6 2.7 6 6"/>',
  Editor: '<path d="M11.5 2.5l4 4L6 16H2v-4z"/><path d="M10 4l4 4"/>',
  Admin: '<path d="M9 1.5l6 2.5v5c0 4-2.6 6.4-6 7.5-3.4-1.1-6-3.5-6-7.5v-5z"/>',
  'Agent OS': '<rect x="4" y="4" width="10" height="10" rx="2.2"/><path d="M7 1.5v2.5M11 1.5v2.5M7 14v2.5M11 14v2.5M1.5 7H4M1.5 11H4M14 7h2.5M14 11h2.5"/>'
}
const NAV: [string, string][] = [
  ['Overview', '/'], ['Analyses', '/analyses'], ['Businesses', '/businesses'],
  ['API Keys', '/api-keys'], ['Teams', '/teams'], ['Clients', '/clients'],
  ['Editor', '/editor'], ['Admin', '/admin'], ['Agent OS', '/agent-os']
]
const TABS: [string, string][] = [
  ['Overview', '/'], ['Analyses', '/analyses'], ['Businesses', '/businesses'], ['Clients', '/clients']
]

function Icon({ name }: { name: string }) {
  return <svg viewBox="0 0 18 18" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />
}

function UserCard() {
  const me = useMe()
  const signOut = () => {
    const clerk = (window as unknown as { Clerk?: { signOut?: (o?: object) => Promise<void> } }).Clerk
    if (clerk && clerk.signOut) clerk.signOut({ redirectUrl: '/login' })
    else window.location.assign('/login')
  }
  return (
    <div className="usercard">
      <span className="av">{initials(me)}</span>
      <span className="ucmeta">
        <span className="nm">{me ? me.name : 'Signing in'}</span><br />
        <span className="ws">{me && me.workspace ? me.workspace : 'Growth Terminal'}</span>
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
  const [drawer, setDrawer] = useState(false)
  const [pal, setPal] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const loc = useLocation()
  const nav = useNavigate()

  useEffect(() => onToast(m => {
    setMsg(m)
    const h = setTimeout(() => setMsg(null), 2600)
    return () => clearTimeout(h)
  }), [])

  useEffect(() => { setDrawer(false); window.scrollTo(0, 0) }, [loc.pathname])

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
        <button className="mbtn" aria-label="Open menu" onClick={() => setDrawer(true)}>
          <span /><span /><span />
        </button>
        <img className="logo" src="/logo.svg" alt="" aria-hidden="true" />
        <button className="mbtn r" aria-label="Share">
          <svg viewBox="0 0 20 20"><path d="M10 13V3M10 3L6.5 6.5M10 3l3.5 3.5" /><path d="M4 12v3.5A1.5 1.5 0 005.5 17h9a1.5 1.5 0 001.5-1.5V12" /></svg>
        </button>
      </header>
      <div className={'scrim' + (drawer ? ' on' : '')} onClick={() => setDrawer(false)} />

      <nav className="tabbar">
        {TABS.map(([label, to]) => (
          <NavLink key={label} to={to} className={({ isActive }) =>
            (label === 'Analyses' ? analysesActive : isActive) ? 'on' : ''} end={to === '/'}>
            <Icon name={label} />{label}
          </NavLink>
        ))}
        <a href="#" onClick={e => { e.preventDefault(); setDrawer(true) }}>
          <svg viewBox="0 0 18 18"><circle cx="3" cy="9" r="1.4" /><circle cx="9" cy="9" r="1.4" /><circle cx="15" cy="9" r="1.4" /></svg>More
        </a>
      </nav>

      <div className="shell">
        <aside className={'side' + (drawer ? ' on' : '')}>
          <img className="logo" src="/logo.svg" alt="Growth Terminal" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div className="chip"><i />Calibration: drifting (0%)</div>
            <div className="chip"><i />Credits: 0 left</div>
          </div>
          <div className="searchpill" onClick={() => setPal(true)}>
            <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
            Search<span className="k">Ctrl K</span>
          </div>
          <nav className="nav">
            {NAV.map(([label, to]) => (
              <NavLink key={label} to={to} end={to === '/'}
                className={({ isActive }) => (label === 'Analyses' ? analysesActive : isActive) ? 'on' : ''}>
                <Icon name={label} />{label}
              </NavLink>
            ))}
          </nav>
          <div className="sp" />
          <UserCard />
        </aside>

        <main><Outlet /></main>
      </div>

      {pal && <Palette close={() => setPal(false)} go={p => { setPal(false); nav(p) }} />}
      <div className={'toast' + (msg ? ' on' : '')}>{msg}</div>
    </>
  )
}
