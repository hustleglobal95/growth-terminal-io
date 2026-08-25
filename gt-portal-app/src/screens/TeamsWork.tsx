/** The Teams work surface.
 *
 *  This replaces nine tabs across the top of the page. Today, Board, Tickets,
 *  History and Activity were five destinations holding the same objects
 *  arranged five ways, which meant the page had no opinion about what a person
 *  should do when they arrived and handed that decision back to them on every
 *  visit. A team that opens a page every morning cannot pay that toll.
 *
 *  So there is one list now, and the switcher above it chooses a lens rather
 *  than a destination. Board stops being a tab and becomes a layout of the
 *  same set. History stops being a tab and becomes the Closed lens. What is
 *  left over, the configuration and the record, is demoted below a rule where
 *  work you touch monthly belongs.
 *
 *  Tickets did not get smaller in this. They became the substance of every
 *  lens instead of one tab among nine.
 */
import React from 'react'
import { TeamData, TeamTicket, TeamApproval, parseTs } from '../lib/teamLive'
import { TicketRow, BoardView, BoardHandlers } from './TeamsBoard'
import {
  todayCut, workload, bySeverity, isOpen, DAY, schedulingAvailable
} from '../lib/teamInsight'

export const WORK_VIEWS = ['Mine', 'Needs attention', 'Unowned', 'All open', 'Closed'] as const
export type WorkView = typeof WORK_VIEWS[number]

export const SETUP_VIEWS = ['Team', 'Business assignment', 'Activity', 'Collaboration'] as const
export type SetupView = typeof SETUP_VIEWS[number]

export type Layout = 'List' | 'Board'

interface Cut { items: TeamTicket[]; empty: string; hint: string }

/** Every lens is a filter over the same tickets, so a person learns one row
 *  once and it means the same thing everywhere. */
export function cutFor(view: WorkView, d: TeamData, now: number, myName: string): Cut {
  const t = todayCut(d, now, myName)
  const sorter = bySeverity(now)
  switch (view) {
    case 'Mine':
      return {
        items: t.yours,
        hint: 'Open work assigned to you, worst first',
        empty: myName
          ? 'Nothing is on you right now.'
          : 'Sign in to see what is assigned to you.'
      }
    case 'Needs attention':
      return {
        items: t.attention,
        hint: 'Stalled, overdue, or sitting with the client',
        empty: 'Nothing is late or stuck. This is the state you want.'
      }
    case 'Unowned':
      return {
        items: t.unassigned,
        hint: 'Open and nobody has picked it up',
        empty: 'Everything open has an owner.'
      }
    case 'Closed':
      return {
        items: d.tickets.filter(x => !isOpen(x))
          .sort((a, b) => parseTs(b.updatedAt) - parseTs(a.updatedAt)),
        hint: 'Most recently closed first',
        empty: 'Nothing has been closed yet.'
      }
    default:
      return {
        items: d.tickets.filter(isOpen).sort(sorter),
        hint: 'Everything open, worst first',
        empty: 'No open tickets. Nothing is waiting on anyone.'
      }
  }
}

/** The switcher. A lens is not a place, so these do not look like tabs and do
 *  not sit in a bar of nine. Setup and the record live under the rule, which
 *  is the whole point: they are not peers of the work. */
export function WorkSwitcher({ view, setView, layout, setLayout, setup, setSetup, counts }: {
  view: WorkView | null
  setView: (v: WorkView) => void
  layout: Layout
  setLayout: (l: Layout) => void
  setup: SetupView | null
  setSetup: (s: SetupView | null) => void
  counts: Record<WorkView, number>
}) {
  return (
    <div className="wsw">
      <div className="wswrow">
        <div className="wsviews" role="tablist" aria-label="Views">
          {WORK_VIEWS.map(v => (
            <button key={v} role="tab" aria-selected={view === v}
              className={'wsv' + (view === v ? ' on' : '')}
              onClick={() => { setSetup(null); setView(v) }}>
              {v}
              {counts[v] > 0 && <span className="wsn">{counts[v]}</span>}
            </button>
          ))}
        </div>
        <span className="sp" />
        {view && (
          <div className="wslay" role="group" aria-label="Layout">
            {(['List', 'Board'] as Layout[]).map(l => (
              <button key={l} className={'wsl' + (layout === l ? ' on' : '')}
                aria-pressed={layout === l} onClick={() => setLayout(l)}>{l}</button>
            ))}
          </div>
        )}
      </div>
      <div className="wssetup">
        {SETUP_VIEWS.map(s => (
          <button key={s} className={'wss' + (setup === s ? ' on' : '')}
            onClick={() => setSetup(setup === s ? null : s)}>{s}</button>
        ))}
      </div>
    </div>
  )
}

/** Approvals are an inbox, not a tab. Something waiting on you belongs at the
 *  top of whatever you are looking at, with the decision attached. A tab you
 *  have to remember to open is a queue that grows in silence. */
export function ApprovalInbox({ items, h }: { items: TeamApproval[]; h: BoardHandlers }) {
  if (!items.length) return null
  return (
    <div className="card tmcardpad tmgroup wsinbox">
      <div className="tmhead">
        <span className="lbl">Waiting on your decision</span>
        <span className="tmnum">{items.length}</span>
        <span className="sp" />
      </div>
      {items.map(a => (
        <div key={a.id} className="tmline">
          <span className="tmlmain">
            <span className="tmltitle">{a.title}</span>
            <span className="tmlmeta">
              <span className="tmstage">{String(a.itemType).replace('_', ' ')}</span>
              {a.businessName && <span className="tmcount">{a.businessName}</span>}
              <span className="tmago">Asked by {a.requesterName || a.requestedBy}</span>
            </span>
          </span>
          <span className="tmlact">
            {h.canApprove ? (
              <>
                <button className="ract" disabled={h.busy}
                  onClick={() => h.decideApproval(a, false)}>Request changes</button>
                <button className="btn p mini" disabled={h.busy}
                  onClick={() => h.decideApproval(a, true)}>Approve</button>
              </>
            ) : <span className="rl">You cannot approve on this role.</span>}
          </span>
        </div>
      ))}
    </div>
  )
}

/** One list, one lens, one layout. */
export function WorkView({ view, layout, d, now, myName, h }: {
  view: WorkView; layout: Layout; d: TeamData; now: number
  myName: string; h: BoardHandlers
}) {
  const cut = cutFor(view, d, now, myName)
  const ids = new Set(cut.items.map(t => t.id))

  return (
    <>
      {layout === 'Board' ? (
        <BoardView d={d} now={now} h={{ ...h }} filter={(t: TeamTicket) => ids.has(t.id)} />
      ) : (
        <div className="card tmcardpad tmgroup">
          <div className="tmhead">
            <span className="lbl">{view}</span>
            {cut.items.length > 0 && <span className="tmnum">{cut.items.length}</span>}
            <span className="sp" />
            <span className="rl">{cut.hint}</span>
          </div>
          {cut.items.length === 0
            ? <div className="tmempty">{cut.empty}</div>
            : cut.items.map(t => (
              <TicketRow key={t.id} t={t} now={now} h={h} showStage />
            ))}
        </div>
      )}
    </>
  )
}

/** The rail carries the team. It used to carry four marketing posts, on the
 *  one screen in the product where people coordinate with each other. */
export function TeamRail({ d, now, myName }: { d: TeamData; now: number; myName: string }) {
  const t = todayCut(d, now, myName)
  const loads = workload(d, now).filter(l => l.open > 0)
  const closed = d.tickets.filter(x => !isOpen(x) && now - parseTs(x.updatedAt) < 7 * DAY).length
  const scheduled = schedulingAvailable(d)

  return (
    <aside className="rail">
      <div className="blk">
        <div className="rt">Open right now</div>
        <div className="sevbig"><b>{t.counts.open}</b><span>tickets not yet closed</span></div>
      </div>

      <div className="blk">
        <div className="rt">State of the board</div>
        <div className="wsmini">
          {scheduled && (
            <div className={'wsmr' + (t.counts.overdue ? ' bad' : '')}>
              <span>Overdue</span><b>{t.counts.overdue}</b></div>
          )}
          <div className={'wsmr' + (t.counts.stale ? ' warn' : '')}>
            <span>No movement</span><b>{t.counts.stale}</b></div>
          <div className="wsmr"><span>Unowned</span><b>{t.unassigned.length}</b></div>
          <div className="wsmr"><span>Awaiting approval</span><b>{t.approvals.length}</b></div>
          <div className="wsmr"><span>Closed this week</span><b>{closed}</b></div>
        </div>
        {!scheduled && (
          <p className="rl wsnote">Overdue is not counted because tickets carry no
            due date on this workspace. Ordering falls back to how long something
            has sat still.</p>
        )}
      </div>

      <div className="blk">
        <div className="rt">Who is carrying what</div>
        {loads.length === 0
          ? <p className="rl wsnote">No open work is assigned to anyone.</p>
          : (
            <div className="wsmini">
              {loads.map(l => (
                <div key={l.name} className="wsmr">
                  <span>{l.name}</span><b>{l.open}</b>
                </div>
              ))}
            </div>
          )}
      </div>
    </aside>
  )
}
