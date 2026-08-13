/** Today and Board, the two views a manager actually works from.
 *
 *  Both are presentational. They take data and callbacks and hold no state
 *  beyond what is needed to draw themselves, so the mutation pattern in
 *  Teams.tsx stays the only place that talks to the engine: call, refetch,
 *  never optimistic.
 *
 *  The rule these two screens are built on: nothing here is a link to
 *  somewhere else. If a manager can see a problem on this screen, they can
 *  fix it on this screen. Opening a drawer to change an assignee is the thing
 *  that made the old tabs feel like a filing cabinet.
 */
import React, { useState } from 'react'
import { TeamTicket, TeamApproval, TeamData, Stage, STAGES, memberLabel, initialsOf } from '../lib/teamLive'
import {
  todayCut, board, workload, riskOf, RISK_LABEL, dueLabel, agoLabel,
  priorityOf, nextStage, isOpen, schedulingAvailable, Priority
} from '../lib/teamInsight'

export interface BoardHandlers {
  openTicket: (id: string) => void
  setStage: (t: TeamTicket, s: Stage) => void
  setAssignee: (t: TeamTicket, name: string) => void
  decideApproval: (a: TeamApproval, ok: boolean) => void
  newTicket: (stage?: Stage) => void
  canAssign: boolean
  canApprove: boolean
  members: string[]
  busy: boolean
}

/* ------------------------------------------------------------ fragments */

const Risk = ({ t, now }: { t: TeamTicket; now: number }) => {
  const r = riskOf(t, now)
  if (!r) return null
  return <span className={'tmrisk ' + r}>{RISK_LABEL[r]}</span>
}

const Pri = ({ p }: { p: Priority | null }) =>
  p && p !== 'normal' ? <span className={'tmpri ' + p}>{p}</span> : null

function Assignee({ t, h }: { t: TeamTicket; h: BoardHandlers }) {
  const name = t.assignee.trim()
  if (!h.canAssign) {
    return name
      ? <span className="tmwho"><span className="av tmav">{initialsOf(name)}</span>{name}</span>
      : <span className="tmwho none">Unassigned</span>
  }
  return (
    <select className="tmsel mini" value={name} disabled={h.busy}
      onClick={e => e.stopPropagation()}
      onChange={e => { e.stopPropagation(); h.setAssignee(t, e.target.value) }}>
      <option value="">Unassigned</option>
      {h.members.map(m => <option key={m} value={m}>{m}</option>)}
      {name && h.members.indexOf(name) < 0 && <option value={name}>{name}</option>}
    </select>
  )
}

/** One ticket, everywhere. The row is the unit of work on both screens so a
 *  manager learns it once. */
export function TicketRow({ t, now, h, showStage }: {
  t: TeamTicket; now: number; h: BoardHandlers; showStage?: boolean
}) {
  const next = nextStage(t.stage)
  return (
    <div className="tmline" role="button" tabIndex={0}
      onClick={() => h.openTicket(t.id)}
      onKeyDown={e => { if (e.key === 'Enter') h.openTicket(t.id) }}>
      <span className="tmlmain">
        <span className="tmltitle">{t.title || 'Untitled'}</span>
        <span className="tmlmeta">
          {showStage && <span className="tmstage">{t.stage}</span>}
          <Pri p={priorityOf(t)} />
          <Risk t={t} now={now} />
          {dueLabel(t, now) && <span className="tmdue">{dueLabel(t, now)}</span>}
          {t.comments.length > 0 && <span className="tmcount">{t.comments.length} note{t.comments.length === 1 ? '' : 's'}</span>}
          <span className="tmago">{agoLabel(t.updatedAt || t.createdAt, now)}</span>
        </span>
      </span>
      <span className="tmlact" onClick={e => e.stopPropagation()}>
        <Assignee t={t} h={h} />
        {next && isOpen(t) && (
          <button className="ract" disabled={h.busy} title={'Move to ' + next}
            onClick={() => h.setStage(t, next)}>{next === 'Closed' ? 'Close' : next}</button>
        )}
      </span>
    </div>
  )
}

function Group({ title, hint, items, now, h, showStage, empty }: {
  title: string; hint?: string; items: TeamTicket[]; now: number
  h: BoardHandlers; showStage?: boolean; empty: string
}) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 5)
  return (
    <div className="card tmcardpad tmgroup">
      <div className="tmhead">
        <span className="lbl">{title}</span>
        {items.length > 0 && <span className="tmnum">{items.length}</span>}
        <span className="sp" />
        {hint && <span className="rl">{hint}</span>}
      </div>
      {items.length === 0
        ? <div className="tmempty">{empty}</div>
        : shown.map(t => <TicketRow key={t.id} t={t} now={now} h={h} showStage={showStage} />)}
      {items.length > 5 && (
        <button className="ract tmmore" onClick={() => setAll(!all)}>
          {all ? 'Show less' : 'Show all ' + items.length}
        </button>
      )}
    </div>
  )
}

/* -------------------------------------------------------------- Today */

export function TodayView({ d, now, myName, h }: {
  d: TeamData; now: number; myName: string; h: BoardHandlers
}) {
  const cut = todayCut(d, now, myName)
  const loads = workload(d, now).filter(l => l.open > 0)
  const scheduled = schedulingAvailable(d)

  return (
    <>
      <div className="tmstats">
        <div className="tmstat"><b>{cut.counts.open}</b><span>Open</span></div>
        <div className={'tmstat' + (cut.counts.overdue ? ' bad' : '')}>
          <b>{cut.counts.overdue}</b><span>Overdue</span></div>
        <div className={'tmstat' + (cut.counts.stale ? ' warn' : '')}>
          <b>{cut.counts.stale}</b><span>No movement</span></div>
        <div className="tmstat"><b>{cut.approvals.length}</b><span>Awaiting approval</span></div>
        <div className="tmstat"><b>{cut.counts.closed7d}</b><span>Closed this week</span></div>
      </div>

      {!scheduled && (
        <p className="tmnote tmwarn">Tickets have no due date or priority on this workspace yet, so nothing
          can be counted as overdue. Everything below is ordered by how long it has sat still instead.
          The moment the engine carries those columns, this screen starts using them.</p>
      )}

      {cut.approvals.length > 0 && (
        <div className="card tmcardpad tmgroup">
          <div className="tmhead"><span className="lbl">Waiting on your decision</span>
            <span className="tmnum">{cut.approvals.length}</span><span className="sp" /></div>
          {cut.approvals.map(a => (
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
      )}

      <div className="tmtwo">
        <Group title="Needs attention" items={cut.attention} now={now} h={h} showStage
          hint="Overdue, stalled, or sitting with the client"
          empty="Nothing is late or stuck. This is the state you want." />
        <Group title="Assigned to you" items={cut.yours} now={now} h={h} showStage
          empty={myName ? 'Nothing is on you right now.' : 'Sign in to see what is assigned to you.'} />
      </div>

      <div className="tmtwo">
        <Group title="Nobody owns these" items={cut.unassigned} now={now} h={h} showStage
          hint="Pick an owner and they leave this list"
          empty="Everything open has an owner." />
        {scheduled
          ? <Group title="Due this week" items={cut.dueThisWeek} now={now} h={h} showStage
              empty="Nothing falls due in the next seven days." />
          : <WorkloadCard loads={loads} now={now} h={h} />}
      </div>

      {scheduled && <WorkloadCard loads={loads} now={now} h={h} />}
    </>
  )
}

function WorkloadCard({ loads, now, h }: {
  loads: ReturnType<typeof workload>; now: number; h: BoardHandlers
}) {
  const [openName, setOpenName] = useState<string | null>(null)
  const max = Math.max(1, ...loads.map(l => l.open))
  return (
    <div className="card tmcardpad tmgroup">
      <div className="tmhead"><span className="lbl">Who is carrying what</span><span className="sp" />
        <span className="rl">Open tickets per person</span></div>
      {loads.length === 0 && <div className="tmempty">No open work on the board.</div>}
      {loads.map(l => (
        <div key={l.name}>
          <div className="tmload" role="button" tabIndex={0}
            onClick={() => setOpenName(openName === l.name ? null : l.name)}
            onKeyDown={e => { if (e.key === 'Enter') setOpenName(openName === l.name ? null : l.name) }}>
            <span className={'av tmav' + (l.name === 'Unassigned' ? ' ghost' : '')}>
              {l.name === 'Unassigned' ? '?' : initialsOf(l.name)}</span>
            <span className="tmloadname">{l.name}</span>
            <span className="tmbar"><i style={{ width: Math.round(l.open / max * 100) + '%' }} /></span>
            <span className="tmloadn">{l.open}</span>
            {l.overdue > 0 && <span className="tmrisk overdue">{l.overdue} late</span>}
          </div>
          {openName === l.name && (
            <div className="tmloadopen">
              {l.tickets.map(t => <TicketRow key={t.id} t={t} now={now} h={h} showStage />)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------- Board */

export function BoardView({ d, now, h }: { d: TeamData; now: number; h: BoardHandlers }) {
  const [who, setWho] = useState('')
  const [risky, setRisky] = useState(false)
  const filter = (t: TeamTicket) => {
    if (who && t.assignee.trim() !== who) return false
    if (risky && !riskOf(t, now)) return false
    return true
  }
  const cols = board(d, now, filter)
  const total = cols.reduce((n, c) => n + c.tickets.length, 0)

  return (
    <>
      <div className="tmbar2">
        <select className="tmsel" value={who} onChange={e => setWho(e.target.value)}>
          <option value="">Everyone</option>
          {h.members.map(m => <option key={m} value={m}>{m}</option>)}
          <option value=" ">Unassigned</option>
        </select>
        <button className={'ract' + (risky ? ' on' : '')} onClick={() => setRisky(!risky)}>
          {risky ? 'Showing problems only' : 'Problems only'}
        </button>
        <span className="sp" />
        <span className="rl">{total} shown</span>
        {h.canAssign && <button className="btn p" onClick={() => h.newTicket()}>New ticket</button>}
      </div>

      <div className="tmkan">
        {cols.map(c => (
          <div key={c.stage} className="tmkcol">
            <div className="tmkhead">
              <span className="lbl">{c.stage}</span>
              <span className="tmnum">{c.tickets.length}</span>
              <span className="sp" />
              {h.canAssign && c.stage !== 'Closed' && (
                <button className="tmadd" title={'New ticket in ' + c.stage}
                  onClick={() => h.newTicket(c.stage)}>+</button>
              )}
            </div>
            <div className="tmkbody">
              {c.tickets.length === 0 && <div className="tmempty small">Nothing here.</div>}
              {c.tickets.map(t => (
                <div key={t.id} className={'tmtile' + (t.stage === 'Closed' ? ' done' : '')}
                  role="button" tabIndex={0}
                  onClick={() => h.openTicket(t.id)}
                  onKeyDown={e => { if (e.key === 'Enter') h.openTicket(t.id) }}>
                  <div className="tmtitle">{t.title || 'Untitled'}</div>
                  <div className="tmtags">
                    <Pri p={priorityOf(t)} />
                    <Risk t={t} now={now} />
                    {dueLabel(t, now) && <span className="tmdue">{dueLabel(t, now)}</span>}
                  </div>
                  <div className="tmtilefoot" onClick={e => e.stopPropagation()}>
                    <Assignee t={t} h={h} />
                    <span className="sp" />
                    <select className="tmsel mini move" value="" disabled={h.busy}
                      aria-label={'Move ' + (t.title || 'ticket') + ' to another stage'}
                      onChange={e => { const v = e.target.value as Stage; if (v) h.setStage(t, v) }}>
                      <option value="">Move to</option>
                      {STAGES.filter(s => s !== t.stage).map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="tmnote">Every change here is written to the engine immediately and appears in Activity.
        Nothing is held locally, so a teammate watching this board sees the same thing you do.</p>
    </>
  )
}
