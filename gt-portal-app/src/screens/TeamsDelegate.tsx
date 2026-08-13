/** Delegation. Who needs to do what, for which project.
 *
 *  The old screen answered one question, who owns this company, and stopped
 *  there. Ownership is not delegation. A lead with eleven unassigned tickets
 *  underneath them has been given a title, not a plan.
 *
 *  So a project here is a business plus its lead plus the actual work, and
 *  every piece of that is settable in place. The screen opens on the two
 *  things that block a project rather than on an alphabetical list: projects
 *  with nobody leading them, and work nobody has picked up.
 *
 *  Projects with no assignment and no tickets are still listed. A delegation
 *  screen that hides the businesses you have not staffed yet is hiding the
 *  only thing you came to fix.
 */
import React, { useState } from 'react'
import { TeamData, TeamAssignment, memberLabel, initialsOf } from '../lib/teamLive'
import { isOpen, isUnassigned, bySeverity, riskOf } from '../lib/teamInsight'
import { BoardHandlers, TicketRow } from './TeamsBoard'

export interface Project {
  slug: string
  name: string
  lead: string
  leadUserId: string | null
  assignment: TeamAssignment | null
  open: number
  unowned: number
  atRisk: number
  closed: number
  total: number
}

export function projects(d: TeamData, biz: { slug: string; name: string }[], now: number): Project[] {
  /* Every business the workspace knows about, plus any project slug that has
     tickets but no business row, so nothing on the board is invisible here. */
  const slugs = new Map<string, string>()
  biz.forEach(b => slugs.set(b.slug, b.name || b.slug))
  d.assignments.forEach(a => { if (!slugs.has(a.businessSlug)) slugs.set(a.businessSlug, a.businessName || a.businessSlug) })
  d.tickets.forEach(t => { if (t.projectSlug && !slugs.has(t.projectSlug)) slugs.set(t.projectSlug, t.projectSlug) })

  return Array.from(slugs.entries()).map(([slug, name]) => {
    const a = d.assignments.find(x => x.businessSlug === slug) || null
    const tk = d.tickets.filter(t => t.projectSlug === slug)
    const openTk = tk.filter(isOpen)
    return {
      slug, name,
      lead: a && a.assigneeName ? a.assigneeName : '',
      leadUserId: a ? a.userId : null,
      assignment: a,
      open: openTk.length,
      unowned: openTk.filter(isUnassigned).length,
      atRisk: openTk.filter(t => { const r = riskOf(t, now); return r === 'overdue' || r === 'stale' || r === 'waiting' }).length,
      closed: tk.length - openTk.length,
      total: tk.length
    }
  }).sort((x, y) => {
    /* Projects with work come first, worst first. A business with nothing on
       it yet is not urgent even without a lead, because there is nothing to
       delegate; it sits at the bottom waiting to be started. */
    const bad = (p: Project) => {
      if (p.total === 0) return p.lead ? 0 : 1
      return 10 + (p.lead ? 0 : 8) + (p.unowned ? 4 : 0) + (p.atRisk ? 2 : 0)
    }
    const db = bad(y) - bad(x)
    if (db) return db
    if (y.open !== x.open) return y.open - x.open
    return x.name.localeCompare(y.name)
  })
}

export interface DelegateHandlers {
  setLead: (slug: string, userId: string | null, name: string) => void
  addWork: (slug: string) => void
}

export function DelegateView({ d, biz, now, h, dh, canAssign }: {
  d: TeamData
  biz: { slug: string; name: string }[]
  now: number
  h: BoardHandlers
  dh: DelegateHandlers
  canAssign: boolean
}) {
  const list = projects(d, biz, now)
  /* Open the first project that actually has something on it. Opening an
     empty one greets a manager with a blank panel. */
  const [openSlug, setOpenSlug] = useState<string | null>(() => {
    const first = list.find(p => p.open > 0)
    return first ? first.slug : null
  })
  const noLead = list.filter(p => !p.lead && p.open > 0).length
  const unowned = list.reduce((n, p) => n + p.unowned, 0)
  const sorter = bySeverity(now)

  const LeadPicker = ({ p }: { p: Project }) => (
    <select className="tmsel" value={p.lead} disabled={h.busy}
      onClick={e => e.stopPropagation()}
      onChange={e => {
        e.stopPropagation()
        const name = e.target.value
        const m = d.members.find(x => memberLabel(x) === name)
        dh.setLead(p.slug, m ? m.user_id : null, name)
      }}>
      <option value="">No lead</option>
      {h.members.map(m => <option key={m} value={m}>{m}</option>)}
      {p.lead && h.members.indexOf(p.lead) < 0 && <option value={p.lead}>{p.lead}</option>}
    </select>
  )

  return (
    <>
      <div className="tmhead" style={{ marginBottom: 12 }}>
        <span className="cs">Every project, who is leading it, and who is doing the work.</span>
      </div>

      {(noLead > 0 || unowned > 0) && (
        <div className="dgbanner">
          {noLead > 0 && (
            <span><b>{noLead}</b> project{noLead === 1 ? '' : 's'} with work but no lead</span>
          )}
          {noLead > 0 && unowned > 0 && <span className="dgdot" />}
          {unowned > 0 && (
            <span><b>{unowned}</b> open task{unowned === 1 ? '' : 's'} nobody has picked up</span>
          )}
        </div>
      )}

      {list.length === 0 && (
        <div className="emptyblock">
          <b>No projects yet.</b>
          <span>Add a business and it appears here, ready to be staffed.</span>
        </div>
      )}

      {list.map(p => {
        const isOpenCard = openSlug === p.slug
        const tk = d.tickets.filter(t => t.projectSlug === p.slug && isOpen(t)).sort(sorter)
        return (
          <div key={p.slug} className={'card tmcardpad dgcard' + (p.lead ? '' : ' nolead')}>
            <div className="dghead" role="button" tabIndex={0}
              onClick={() => setOpenSlug(isOpenCard ? null : p.slug)}
              onKeyDown={e => { if (e.key === 'Enter') setOpenSlug(isOpenCard ? null : p.slug) }}>
              <span className={'dgcaret' + (isOpenCard ? ' on' : '')} aria-hidden="true" />
              <span className="dgname">
                {p.name}
                {!p.lead && <span className="tmrisk unassigned">No lead</span>}
              </span>

              <span className="dgstats">
                {p.open > 0 && <span className="dgstat"><b>{p.open}</b> open</span>}
                {p.unowned > 0 && <span className="dgstat warn"><b>{p.unowned}</b> unowned</span>}
                {p.atRisk > 0 && <span className="dgstat bad"><b>{p.atRisk}</b> at risk</span>}
                {p.total > 0 && p.open === 0 && <span className="dgstat done">All {p.total} closed</span>}
                {p.total === 0 && <span className="dgstat quiet">No work yet</span>}
              </span>

              <span className="dglead" onClick={e => e.stopPropagation()}>
                <span className="lbl">Lead</span>
                {canAssign
                  ? <LeadPicker p={p} />
                  : <span className="tmwho">{p.lead
                      ? <><span className="av tmav">{initialsOf(p.lead)}</span>{p.lead}</>
                      : 'Nobody'}</span>}
              </span>
            </div>

            {isOpenCard && (
              <div className="dgbody">
                {tk.length === 0
                  ? <div className="tmempty">
                      Nothing open on this project.
                      {canAssign && <> <button className="ract" onClick={() => dh.addWork(p.slug)}>Add the first task</button></>}
                    </div>
                  : <>
                      {tk.map(t => <TicketRow key={t.id} t={t} now={now} h={h} showStage />)}
                      {canAssign && (
                        <button className="ract dgadd" onClick={() => dh.addWork(p.slug)}>
                          Add a task to {p.name}
                        </button>
                      )}
                    </>}
              </div>
            )}
          </div>
        )
      })}

      <p className="tmnote">The lead owns the project. Each task can sit with somebody else, and both are
        written to the engine as you change them.</p>
    </>
  )
}
