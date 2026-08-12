import React from 'react'
import { NavLink, useOutletContext } from 'react-router-dom'
import { Header } from './simple'
import { Icon, NAV, TABS, UserCard } from '../components/Shell'
import { useCalibration, useCredits, calibrationLabel, creditsLabel } from '../lib/liveData'

/** The More section. On a phone the bottom bar carries the four destinations
 *  people use hourly; everything else in the workspace lives here, as a real
 *  screen rather than a drawer sliding over the one you were reading.
 *
 *  The rows are derived from the same NAV list the desktop sidebar renders,
 *  so the names, icons and routes cannot drift apart from it. */
const inTabs = new Set(TABS.map(function (t) { return t[0] }))

export function More() {
  const cal = useCalibration()
  const cred = useCredits()
  const ctx = useOutletContext<{ openPalette: () => void } | null>()
  const rest = NAV.filter(function (n) { return !inTabs.has(n[0]) })
  return (
    <div className="scr on">
      <Header title="More" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          <div className="morewrap">

            <div className="chiprow">
              <div className="chip"><i />{calibrationLabel(cal)}</div>
              <div className="chip"><i />{creditsLabel(cred)}</div>
            </div>

            <div className="searchpill" onClick={() => ctx && ctx.openPalette()}>
              <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" /></svg>
              Search<span className="k">Ctrl K</span>
            </div>

            <div className="moresec">Workspace</div>
            <nav className="morelist">
              {rest.map(function (n) {
                return (
                  <NavLink key={n[0]} to={n[1]} className="morerow">
                    <Icon name={n[0]} />
                    <span className="t">{n[0]}</span>
                    <span className="chev" />
                  </NavLink>
                )
              })}
            </nav>

            <div className="moresec">Account</div>
            <UserCard />

          </div>
        </div>
      </div>
    </div>
  )
}
