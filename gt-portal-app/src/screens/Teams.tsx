/** Teams, wired to the engine.
 *
 *  Seven tabs, the same seven this screen was designed with: Team, Tickets,
 *  History, Business Assignment, Activity, Collaboration and Approvals. What
 *  changed is where the contents come from. Members, tickets, ticket
 *  comments, business assignments, business discussion and approvals are all
 *  real rows on the engine now, read and written through teamLive.
 *
 *  Two things the engine cannot answer yet, and both say so on screen rather
 *  than pretending:
 *
 *  The five portal roles have no column on the members table, so the role a
 *  teammate has been given is remembered in this browser. The matrix is still
 *  enforced on analysis pages, but only for whoever set it.
 *
 *  Tickets have no column for priority, due date, tags, checklist, watchers,
 *  a ticket code, or who closed one. Those controls are not on this screen.
 *  Adding the columns brings them straight back.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Header } from './simple'
import { DEMO } from '../config'
import { toast } from '../lib/bus'
import { useAccounts, useBusinesses, useMe } from '../lib/liveData'
import { TodayView, BoardView, BoardHandlers } from './TeamsBoard'
import { UpdatesPanel, UpdatesPill, useLiveUpdates } from './TeamsUpdates'
import { DelegateView, DelegateHandlers } from './TeamsDelegate'
import { lastSeen, markSeen, unseen } from '../lib/teamSeen'
import { Role, ROLES, PERMS, roleOf, setRoleOf, viewAs, setViewAs, effectiveRole } from '../lib/teamData'
import {
  TeamData, TeamTicket, TeamApproval, Stage, ItemType, InviteRole,
  STAGES, ITEM_TYPES, INVITE_ROLES,
  fetchTeam, teamApi, memberLabel, initialsOf, stageProgress, parseTs, buildActivity
} from '../lib/teamLive'

const TABS = ['Today', 'Board', 'Team', 'Tickets', 'History', 'Business Assignment', 'Activity', 'Collaboration', 'Approvals'] as const
type Tab = typeof TABS[number]

const fmtTs = (ts: number) => ts
  ? new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : ''
const fmtTime = (ts: number) => ts ? new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : ''
const fmtDay = (ts: number) => ts ? new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : ''

/** Day headings for History: the two most recent days read as words, which
 *  is how people talk about work that just landed. */
const dayKey = (ts: number) => new Date(ts).toDateString()
const dayLabel = (ts: number) => {
  const k = dayKey(ts)
  const now = Date.now()
  if (k === dayKey(now)) return 'Today'
  if (k === dayKey(now - 86400000)) return 'Yesterday'
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const APPROVAL_LABEL: Record<string, string> = {
  pending: 'Pending', approved: 'Approved',
  changes_requested: 'Changes requested', rejected: 'Rejected'
}
const ITEM_LABEL: Record<ItemType, string> = {
  report: 'Report', forecast: 'Forecast', decision_memo: 'Decision memo', plan: 'Plan'
}

export function Teams() {
  const accs = useAccounts()
  const bizRows = useBusinesses()
  const me = useMe()
  const [now] = useState(() => Date.now())
  const [d, setD] = useState<TeamData | null>(null)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('Today')
  const [openId, setOpenId] = useState<string | null>(null)
  const [invite, setInvite] = useState(false)
  const [newTicket, setNewTicket] = useState(false)
  const [seedProject, setSeedProject] = useState('')
  const [newAssign, setNewAssign] = useState(false)
  const [askApproval, setAskApproval] = useState<TeamTicket | true | null>(null)
  const [preview, setPreview] = useState<Role | null>(viewAs())
  const [updatesOpen, setUpdatesOpen] = useState(false)
  const [seenAt, setSeenAt] = useState<number | null>(null)
  const shownOnce = React.useRef(false)

  const acc = accs && accs.length ? accs[0] : null

  const refresh = useCallback(async () => {
    if (!acc) return
    try {
      setD(await fetchTeam(acc.id, acc.name))
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [acc])

  useEffect(() => { void refresh() }, [refresh])

  /** Every mutation runs the same way: call the engine, then refetch. No
   *  optimistic local copy, because a ticket that looks moved but was
   *  rejected server side is worse than a moment of waiting. */
  const run = async (fn: () => Promise<unknown>, done?: string) => {
    if (busy) return
    setBusy(true)
    try {
      await fn()
      await refresh()
      if (done) toast(done)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  /* What changed while this person was elsewhere.
   *
   *  These four hooks have to run on every render, including the ones where
   *  the team has not arrived yet, so they sit above the early returns and
   *  tolerate a null d. Putting them below the returns is what made this
   *  screen throw: the hook count changed the moment the fetch resolved. */
  const myName = me ? (me.name || '') : ''
  const allEvents = useMemo(() => (d ? buildActivity(d) : []), [d])
  const since = seenAt !== null ? seenAt : (d ? lastSeen(d.accountId, myName) : null)
  const newEvents = useMemo(
    () => unseen(allEvents, since, myName),
    [allEvents, since, myName])

  useLiveUpdates(allEvents, d !== null && since !== null)

  /* Open once, on arrival, and only when there is something to say. A first
     visit has no mark, so it stays quiet and simply records the position. */
  useEffect(() => {
    if (!d || shownOnce.current) return
    shownOnce.current = true
    if (since === null) { markSeen(d.accountId, myName, Date.now()); return }
    if (newEvents.length > 0) setUpdatesOpen(true)
  }, [d, since, newEvents.length, myName])

  const clearUpdates = () => {
    if (!d) return
    const ts = Date.now()
    markSeen(d.accountId, myName, ts)
    setSeenAt(ts)
    setUpdatesOpen(false)
  }

  if (DEMO) return (
    <div className="scr on">
      <Header title="Teams" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap"><div className="emptyblock">
          <b>Teams needs a signed in workspace.</b>
          <span>This is a demo build, so there is no account to read a team from.</span>
        </div></div>
      </div>
    </div>
  )

  if (failed) return (
    <div className="scr on">
      <Header title="Teams" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap"><div className="emptyblock">
          <b>Could not reach the team.</b>
          <span>The workspace loaded but its team routes did not answer.
            <button className="ract" style={{ marginLeft: 8 }} onClick={() => void refresh()}>Try again</button></span>
        </div></div>
      </div>
    </div>
  )

  if (!d) return (
    <div className="scr on">
      <Header title="Teams" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap"><span className="skel" style={{ width: '40%' }} /></div>
      </div>
    </div>
  )

  const role = preview || effectiveRole()
  const perms = PERMS[role]

  const open = openId ? d.tickets.find(t => t.id === openId) || null : null
  const pendingApprovals = d.approvals.filter(a => a.status === 'pending')

  /* Assignee is a plain string on the tickets table, not a member id, so the
     picker offers the names of real members and stores what it is given. */
  const memberNames = d.members.map(m => memberLabel(m))
  const bizList = (bizRows || []).map(b => ({ slug: b.slug, name: b.name }))

  const MemberSelect = ({ value, onPick }: { value: string; onPick: (name: string) => void }) => (
    <select className="tmsel" value={value} onChange={e => onPick(e.target.value)}>
      <option value="">Unassigned</option>
      {memberNames.map(n => <option key={n} value={n}>{n}</option>)}
      {value && memberNames.indexOf(value) < 0 && <option value={value}>{value}</option>}
    </select>
  )

  const Avatar = ({ name }: { name: string }) => (
    <span className="av tmav" title={name}>{initialsOf(name)}</span>
  )

  /* Everything Today and Board can do, in one object. They never call the
     engine themselves; they hand back an intention and the same run() that
     serves every other tab performs it, so one refetch keeps all nine views
     in step. */
  const boardHandlers: BoardHandlers = {
    openTicket: setOpenId,
    setStage: (t, stage) => void run(
      () => teamApi.patchTicket(d.accountId, t.id, { stage }), 'Moved to ' + stage + '.'),
    setAssignee: (t, assignee) => void run(
      () => teamApi.patchTicket(d.accountId, t.id, { assignee }),
      assignee ? 'Assigned to ' + assignee + '.' : 'Owner cleared.'),
    decideApproval: (a, ok) => void run(
      () => teamApi.decideApproval(d.accountId, a.id, ok ? 'approved' : 'changes_requested', ''),
      ok ? 'Approved.' : 'Changes requested.'),
    newTicket: () => setNewTicket(true),
    canAssign: perms.assign,
    canApprove: perms.approve,
    members: memberNames,
    busy
  }

  const delegateHandlers: DelegateHandlers = {
    setLead: (slug, userId, name) => void run(
      () => teamApi.assignBusiness(d.accountId, slug, userId),
      name ? name + ' now leads this project.' : 'Lead cleared.'),
    addWork: slug => { setSeedProject(slug); setNewTicket(true) }
  }

  /* ------------------------------------------------ Team */
  const TeamTab = () => (
    <>
      {preview && (
        <div className="tmpreview">Previewing the portal as <b>{preview}</b>. Analysis pages and actions are limited to that role right now.
          <button className="ract" onClick={() => { setViewAs(null); setPreview(null) }}>Stop preview</button></div>
      )}
      <div className="tmsplit">
        <div className="card tmcardpad">
          <div className="tmhead"><span className="lbl">Members</span><span className="sp" />
            {perms.manageTeam && <button className="btn p" onClick={() => setInvite(true)}>Invite member</button>}
          </div>
          {d.members.map(m => {
            const name = memberLabel(m)
            const r = roleOf(m.user_id, m.role)
            const p = d.perf.find(x => x.userId === m.user_id)
            return (
              <div key={m.id} className="tmrow">
                <span className="av">{initialsOf(name)}</span>
                <span className="tmmeta"><span className="nm">{name}</span><br />
                  <span className="rl">
                    {m.identity_status === 'missing'
                      ? 'Invited, has not signed in yet'
                      : (m.email || 'On the team since ' + fmtDay(parseTs(m.created_at)))}
                    {m.identity_status !== 'missing' && p && p.analysesCompleted30d > 0
                      ? ' · ' + p.analysesCompleted30d + ' analyses in 30 days' : ''}
                  </span></span>
                <span className="sp" />
                {r === 'Owner'
                  ? <span className="pfchip">Owner</span>
                  : perms.manageTeam
                    ? <select className="tmsel" value={r}
                        onChange={e => { setRoleOf(m.user_id, e.target.value as Role); void refresh() }}>
                        {ROLES.filter(x => x !== 'Owner').map(x => <option key={x}>{x}</option>)}
                      </select>
                    : <span className="pfchip">{r}</span>}
              </div>
            )
          })}
          {d.members.length === 0 && <div className="rl" style={{ padding: '8px 0' }}>Nobody on this account yet.</div>}
          {d.invites.length > 0 && (
            <>
              <div className="lbl" style={{ marginTop: 14 }}>Open invite links</div>
              {d.invites.map(i => (
                <div key={i.id} className="tmrow">
                  <span className="tmmeta"><span className="nm">{i.role}</span><br />
                    <span className="rl">Expires {fmtDay(parseTs(i.expiresAt))}</span></span>
                  <span className="sp" />
                  <button className="ract" onClick={() => {
                    navigator.clipboard.writeText(i.url)
                      .then(() => toast('Invite link copied.'))
                      .catch(() => toast('Could not reach the clipboard.'))
                  }}>Copy link</button>
                  <button className="ract" onClick={() => void run(() => teamApi.revokeInvite(d.accountId, i.id), 'Invite revoked.')}>Revoke</button>
                </div>
              ))}
            </>
          )}
        </div>
        <div className="card tmcardpad">
          <div className="tmhead"><span className="lbl">What each role can see and do</span><span className="sp" />
            <select className="tmsel" value={preview || ''}
              onChange={e => { const v = (e.target.value || null) as Role | null; setViewAs(v); setPreview(v) }}>
              <option value="">Preview a role...</option>
              {ROLES.filter(r2 => r2 !== 'Owner').map(r2 => <option key={r2}>{r2}</option>)}
            </select>
          </div>
          <div className="tmmatrix">
            <div className="tmmh"><span>Role</span><span>Manage team</span><span>Assign</span><span>Approve</span><span>Diagnosis</span><span>Evidence</span><span>Financials</span><span>Full plan</span></div>
            {ROLES.map(r2 => {
              const p = PERMS[r2]
              const dot = (b: boolean) => <span className={'tmdot' + (b ? ' on' : '')} />
              return <div key={r2} className={'tmmr' + (r2 === role ? ' cur' : '')}>
                <span className="nm">{r2}</span>{dot(p.manageTeam)}{dot(p.assign)}{dot(p.approve)}
                {dot(p.analysis.diagnosis)}{dot(p.analysis.evidence)}{dot(p.analysis.financials)}{dot(p.analysis.plan)}
              </div>
            })}
          </div>
          <p className="tmnote">The matrix is enforced on analysis pages. Preview a role to see the portal exactly as that teammate would.</p>
          <p className="tmnote tmwarn">The account itself knows two roles, owner and member. These five are held in this browser
            until the members table carries a portal role, so a role set here applies to what you see, not to what your teammate sees.</p>
        </div>
      </div>
    </>
  )

  /* ------------------------------------------------ Tickets */
  const TicketCard = ({ t }: { t: TeamTicket }) => (
    <div className={'tmcard' + (t.stage === 'Closed' ? ' done' : '')} role="button" tabIndex={0}
      onClick={() => setOpenId(t.id)} onKeyDown={e => { if (e.key === 'Enter') setOpenId(t.id) }}>
      <div className="tmcardtop"><span className="tmcode">{t.projectSlug}</span><span className="sp" />
        {t.assignee && <Avatar name={t.assignee} />}</div>
      <div className="tmtitle">{t.title}</div>
      <div className="tmprog"><i style={{ width: stageProgress(t.stage) + '%' }} /></div>
      <div className="tmcardbot">
        <span className="rl">{t.stage === 'Closed' ? 'closed ' + fmtTime(parseTs(t.updatedAt)) : stageProgress(t.stage) + '%'}</span>
        <span className="sp" />
        {t.comments.length > 0 && <span className="rl">{t.comments.length} comment{t.comments.length === 1 ? '' : 's'}</span>}</div>
    </div>
  )

  const TicketsTab = () => (
    <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">Every ticket carries its stage, its comments and the moves that got it there, so anyone can pick it up with context.</span>
        <span className="sp" /><button className="btn p" onClick={() => setNewTicket(true)}>New ticket</button>
      </div>
      <div className="tmboard">
        {STAGES.map(s => {
          const col = d.tickets.filter(t => t.stage === s)
          return <div key={s} className="tmcol">
            <div className="tmcolh"><span>{s}</span><span className="tmcount">{col.length}</span></div>
            {col.map(t => <TicketCard key={t.id} t={t} />)}
            {col.length === 0 && <div className="tmempty">Nothing here</div>}
          </div>
        })}
      </div>
    </>
  )

  /** History: every closed ticket, newest first, grouped by the day it
   *  landed. There is no completedAt column, so the day a ticket was last
   *  touched is the closest honest answer and the heading says so. */
  const HistoryTab = () => {
    const done = d.tickets.filter(t => t.stage === 'Closed')
      .sort((a, b) => parseTs(b.updatedAt) - parseTs(a.updatedAt))
    if (done.length === 0) {
      return <div className="emptyblock">
        <b>No tickets closed yet.</b>
        <span>Move a ticket to Closed and it lands here with the day it was last worked on.</span>
      </div>
    }
    const groups: { label: string; items: TeamTicket[] }[] = []
    done.forEach(t => {
      const label = dayLabel(parseTs(t.updatedAt))
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(t)
      else groups.push({ label, items: [t] })
    })
    return <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">{done.length} ticket{done.length === 1 ? '' : 's'} closed, grouped by the day each was last touched.
          Reopen one and it goes back on the board.</span>
      </div>
      {groups.map(g => (
        <div key={g.label} className="tmhistgroup">
          <div className="tmhistday">{g.label}</div>
          <div className="tmhistlist">
            {g.items.map(t => (
              <div key={t.id} className="tmhistrow">
                <span className="tmcode">{t.projectSlug}</span>
                <span className="tmhistmeta" role="button" tabIndex={0} onClick={() => setOpenId(t.id)}
                  onKeyDown={e => { if (e.key === 'Enter') setOpenId(t.id) }}>
                  <span className="nm">{t.title}</span>
                  <span className="rl">{t.assignee ? t.assignee + ' · ' : ''}last touched {fmtTime(parseTs(t.updatedAt))}</span>
                </span>
                <span className="sp" />
                {t.assignee && <Avatar name={t.assignee} />}
                <button className="ract" onClick={() => setOpenId(t.id)}>Open</button>
                <button className="ract" onClick={() => void run(
                  () => teamApi.patchTicket(d.accountId, t.id, { stage: 'In Progress' }),
                  'Back on the board.')}>Reopen</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  }

  /* ------------------------------------------------ Business Assignment */
  const AssignTab = () => (
    <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">Who owns which company.</span>
        <span className="sp" />
        {perms.assign && <button className="btn p" onClick={() => setNewAssign(true)}>Assign a business</button>}
      </div>
      {d.assignments.length === 0 && <div className="emptyblock">No businesses assigned yet. Assign one to a teammate and it shows up here.</div>}
      {d.assignments.map(a => {
        const tk = d.tickets.filter(t => t.projectSlug === a.businessSlug)
        const done = tk.filter(t => t.stage === 'Closed').length
        return <div key={a.id} className="card tmcardpad" style={{ marginBottom: 10 }}>
          <div className="tmrow">
            <span className="tmmeta"><span className="nm">{a.businessName || a.businessSlug}</span><br />
              <span className="rl">{a.assigneeName || 'Unassigned'}
                {a.assignedAt ? ' · since ' + fmtDay(parseTs(a.assignedAt)) : ''}</span></span>
            <span className="sp" />
            {perms.assign && (
              <MemberSelect value={a.assigneeName || ''} onPick={name => {
                const m = d.members.find(x => memberLabel(x) === name)
                void run(() => teamApi.assignBusiness(d.accountId, a.businessSlug, m ? m.user_id : null),
                  name ? 'Assigned to ' + name + '.' : 'Assignment cleared.')
              }} />
            )}
          </div>
          {tk.length > 0 && <>
            <div className="tmprog" style={{ margin: '10px 0 6px' }}><i style={{ width: Math.round(done / tk.length * 100) + '%' }} /></div>
            <div className="rl">{done} of {tk.length} tickets closed</div>
          </>}
        </div>
      })}
    </>
  )

  /* ------------------------------------------------ Activity */
  const ActivityTab = () => {
    const feed = useMemo(() => buildActivity(d), [])
    return (
      <>
        <div className="tmhead" style={{ marginBottom: 10 }}>
          <span className="cs">Built from the timestamps on real tickets, comments, assignments and approvals.</span>
        </div>
        <ul className="actfeed" style={{ marginTop: 4 }}>
          {feed.slice(0, 60).map(a => (
            <li key={a.id}>
              <span className="pfchip">{a.kind}</span>
              <span className="actt"><b>{a.actor}</b> {a.text}</span>
              <span className="rl" style={{ flex: 'none' }}>{fmtTs(a.ts)}</span>
            </li>
          ))}
          {feed.length === 0 && <li><span className="actt">No activity yet.</span></li>}
        </ul>
      </>
    )
  }

  /* ------------------------------------------------ Collaboration */
  /** The engine's discussion is scoped to a business, not to a free standing
   *  thread, so this groups the account's comments by the company they are
   *  about. That is the thread. */
  const CollabTab = () => {
    const byBiz = new Map<string, TeamTicket[]>()
    d.tickets.forEach(t => {
      if (!t.comments.length) return
      const k = t.projectSlug || 'general'
      byBiz.set(k, (byBiz.get(k) || []).concat(t))
    })
    const groups = Array.from(byBiz.entries())
    return <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">Every conversation on the account, grouped by the project it belongs to.
          Open a ticket to add to one.</span>
      </div>
      {groups.length === 0 && <div className="emptyblock">No conversations yet. Comment on a ticket and it shows up here.</div>}
      {groups.map(([slug, list]) => (
        <div key={slug} className="card tmcardpad" style={{ marginBottom: 10 }}>
          <div className="lbl" style={{ marginBottom: 6 }}>{slug}</div>
          {list.map(t => (
            <div key={t.id} className="tmrow tmthread" role="button" tabIndex={0} onClick={() => setOpenId(t.id)}
              onKeyDown={e => { if (e.key === 'Enter') setOpenId(t.id) }}>
              <span className="tmmeta"><span className="nm">{t.title}</span><br />
                <span className="rl">{t.comments.length} comment{t.comments.length === 1 ? '' : 's'}
                  {' · last '}{fmtTs(parseTs(t.comments[t.comments.length - 1].createdAt))}</span></span>
              <span className="sp" /><span className="ract">Open</span>
            </div>
          ))}
        </div>
      ))}
    </>
  }

  /* ------------------------------------------------ Approvals */
  const ApprovalsTab = () => (
    <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">An approval is attached to a deliverable: a report, a forecast, a decision memo or a plan.</span>
        <span className="sp" />
        <button className="btn p" onClick={() => setAskApproval(true)}>Request approval</button>
      </div>
      {d.approvals.length === 0 && <div className="emptyblock">Nothing waiting. Request approval on a deliverable and it lands here for a decision.</div>}
      {d.approvals.map(a => (
        <div key={a.id} className="card tmcardpad" style={{ marginBottom: 10 }}>
          <div className="tmrow">
            <span className="tmmeta"><span className="nm">{a.title}</span><br />
              <span className="rl">{ITEM_LABEL[a.itemType] || a.itemType}
                {' · '}{a.businessName || a.businessSlug}
                {' · '}{a.requesterName || 'Someone'} on {fmtDay(parseTs(a.createdAt))}</span></span>
            <span className="sp" />
            <span className={'stat' + (a.status === 'approved' ? ' ok' : '')}><i />{APPROVAL_LABEL[a.status] || a.status}</span>
          </div>
          {a.status === 'pending' && perms.approve &&
            <ApproveRow onDecide={(ok, note) => void run(
              () => teamApi.decideApproval(d.accountId, a.id, ok ? 'approved' : 'changes_requested', note),
              ok ? 'Approved.' : 'Changes requested.')} />}
          {a.status === 'pending' && !perms.approve && <p className="tmnote">Your role cannot approve. An Owner or Admin decides this.</p>}
          {a.reviewNote && <p className="tmnote">Decision note: {a.reviewNote}</p>}
        </div>
      ))}
    </>
  )

  /* ------------------------------------------------ render */
  return (
    <div className="scr on">
      <Header title="Teams">
        <UpdatesPill count={updatesOpen ? 0 : newEvents.length} onClick={() => setUpdatesOpen(true)} />
        {(tab === 'Tickets' || tab === 'Today') && <button className="btn p" onClick={() => setNewTicket(true)}>New ticket</button>}
        {tab === 'Team' && perms.manageTeam && <button className="btn p" onClick={() => setInvite(true)}>Invite member</button>}
      </Header>
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          <div className="tmtabs">
            {TABS.map(t => (
              <button key={t} className={'tmtab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t}
                {t === 'Approvals' && pendingApprovals.length > 0 && <span className="tmbadge">{pendingApprovals.length}</span>}
              </button>
            ))}
          </div>
          {tab === 'Today' && <TodayView d={d} now={now} myName={me ? (me.name || '') : ''} h={boardHandlers} />}
          {tab === 'Board' && <BoardView d={d} now={now} h={boardHandlers} />}
          {tab === 'Team' && <TeamTab />}
          {tab === 'Tickets' && <TicketsTab />}
          {tab === 'History' && <HistoryTab />}
          {tab === 'Business Assignment' && (
            <DelegateView d={d} biz={bizList} now={now} h={boardHandlers}
              dh={delegateHandlers} canAssign={perms.assign} />
          )}
          {tab === 'Activity' && <ActivityTab />}
          {tab === 'Collaboration' && <CollabTab />}
          {tab === 'Approvals' && <ApprovalsTab />}
        </div>
      </div>

      {open && <TicketDrawer t={open} canComment={perms.comment} busy={busy}
        onClose={() => setOpenId(null)}
        onStage={(s, note) => void run(
          () => note
            ? teamApi.addTicketComment(d.accountId, open.id, { body: note, authorName: d.accountName, stageTransition: s, newStage: s })
            : teamApi.patchTicket(d.accountId, open.id, { stage: s }),
          'Moved to ' + s + '.')}
        onPatch={f => void run(() => teamApi.patchTicket(d.accountId, open.id, f))}
        onComment={body => void run(() => teamApi.addTicketComment(d.accountId, open.id, { body, authorName: d.accountName }))}
        onApproval={() => setAskApproval(open)}
        onDelete={() => void run(() => teamApi.deleteTicket(d.accountId, open.id).then(() => setOpenId(null)), 'Ticket deleted.')}
        MemberSelect={MemberSelect} />}

      {invite && <InviteModal onClose={() => setInvite(false)}
        onCreate={r => void run(() => teamApi.createInvite(d.accountId, r).then(() => setInvite(false)), 'Invite link created.')} />}

      {updatesOpen && (
        <UpdatesPanel items={newEvents} now={now} workspaceName={d.accountName}
          onDismiss={clearUpdates}
          onOpenActivity={() => { clearUpdates(); setTab('Activity') }} />
      )}

      {newTicket && <TicketModal projects={bizList} seedProject={seedProject}
        onClose={() => { setNewTicket(false); setSeedProject('') }}
        onCreate={f => void run(
          () => teamApi.createTicket(d.accountId, { ...f, creatorName: d.accountName }).then(() => { setNewTicket(false); setSeedProject('') }),
          'Ticket created.')}
        MemberSelect={MemberSelect} />}

      {newAssign && <AssignModal businesses={bizList} names={memberNames} onClose={() => setNewAssign(false)}
        onCreate={(slug, name) => {
          const m = d.members.find(x => memberLabel(x) === name)
          void run(() => teamApi.assignBusiness(d.accountId, slug, m ? m.user_id : null).then(() => setNewAssign(false)), 'Assigned.')
        }} />}

      {askApproval && <ApprovalModal businesses={bizList}
        seed={askApproval === true ? null : askApproval}
        onClose={() => setAskApproval(null)}
        onCreate={f => void run(() => teamApi.requestApproval(d.accountId, f).then(() => { setAskApproval(null); setTab('Approvals') }), 'Approval requested.')} />}
    </div>
  )
}

/* ================================================== subcomponents */

function ApproveRow({ onDecide }: { onDecide: (ok: boolean, note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <div className="tmcbar" style={{ marginTop: 10 }}>
      <input className="tminput" placeholder="Decision note (optional)" value={note} onChange={e => setNote(e.target.value)} />
      <button className="btn p" onClick={() => onDecide(true, note)}>Approve</button>
      <button className="btn g" onClick={() => onDecide(false, note)}>Request changes</button>
    </div>
  )
}

function TicketDrawer({ t, onClose, onStage, onPatch, onComment, onApproval, onDelete, canComment, busy, MemberSelect }: {
  t: TeamTicket
  onClose: () => void
  onStage: (s: Stage, note: string) => void
  onPatch: (f: Partial<{ assignee: string; title: string; description: string }>) => void
  onComment: (body: string) => void
  onApproval: () => void
  onDelete: () => void
  canComment: boolean
  busy: boolean
  MemberSelect: (p: { value: string; onPick: (name: string) => void }) => React.JSX.Element
}) {
  const [text, setText] = useState('')
  const [moveNote, setMoveNote] = useState('')
  const idx = STAGES.indexOf(t.stage)
  const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null

  return (
    <div className="tmoverlay" onClick={onClose}>
      <div className="tmdrawer" onClick={e => e.stopPropagation()}>
        <div className="tmhead">
          <span className="tmcode">{t.projectSlug}</span>
          <span className="sp" />
          <button className="ract" onClick={onDelete}>Delete</button>
          <button className="ract" onClick={onClose}>Close</button>
        </div>
        <div className="tmtitle" style={{ fontSize: 17, marginTop: 2 }}>{t.title}</div>
        {t.description && <p className="tmdesc">{t.description}</p>}

        <div className="tmsteps">
          {STAGES.map((s, i) => (
            <button key={s} className={'tmstep' + (i < idx ? ' past' : '') + (i === idx ? ' cur' : '')}
              disabled={busy} onClick={() => onStage(s, moveNote.trim())}>{s}</button>
          ))}
        </div>
        <div className="tmprog" style={{ margin: '8px 0 2px' }}><i style={{ width: stageProgress(t.stage) + '%' }} /></div>
        <div className="rl">{stageProgress(t.stage)}% through the stages</div>

        <input className="tminput" style={{ marginTop: 10 }} placeholder="Note to attach to the next move (optional)"
          value={moveNote} onChange={e => setMoveNote(e.target.value)} />

        {next
          ? <button className="btn p tmcommit" disabled={busy} onClick={() => onStage(next, moveNote.trim())}>
              {next === 'Closed' ? 'Close this ticket' : 'Commit this step'}
              <span>moves to {next}</span>
            </button>
          : <button className="btn g tmcommit" disabled={busy} onClick={() => onStage('In Progress', moveNote.trim())}>
              Reopen<span>back to In Progress</span>
            </button>}

        <div className="tmgrid">
          <label className="rl">Assignee<MemberSelect value={t.assignee} onPick={name => onPatch({ assignee: name })} /></label>
          <label className="rl">Project<input className="tminput" defaultValue={t.projectSlug} disabled /></label>
        </div>

        <button className="btn g" style={{ marginTop: 12 }} onClick={onApproval}>Request approval on a deliverable</button>

        <div className="lbl" style={{ marginTop: 16 }}>Comments</div>
        <div className="tmcomments">
          {t.comments.map(c => (
            <div key={c.id} className="tmcomment">
              <span className="av tmav">{initialsOf(c.authorName || 'Someone')}</span>
              <div>
                <div className="rl"><b style={{ color: 'var(--ink, #000000)' }}>{c.authorName || 'Someone'}</b>
                  {' · '}{fmtTs(parseTs(c.createdAt))}
                  {c.stageTransition ? ' · moved to ' + c.stageTransition : ''}</div>
                <div className="tmctext">{c.body}</div>
              </div>
            </div>
          ))}
          {t.comments.length === 0 && <div className="rl" style={{ padding: '8px 0' }}>No comments yet. Leave the first one so the next person has context.</div>}
          {canComment
            ? <div className="tmcbar">
                <input className="tminput" placeholder="Write a comment..." value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onComment(text.trim()); setText('') } }} />
                <button className="btn p" disabled={busy} onClick={() => { if (text.trim()) { onComment(text.trim()); setText('') } }}>Send</button>
              </div>
            : <p className="tmnote">Your role can view this conversation but not post in it.</p>}
        </div>

        <div className="lbl" style={{ marginTop: 16 }}>History</div>
        <ul className="actfeed">
          <li><span className="actt"><b>{t.creatorName || 'Someone'}</b> opened this ticket</span>
            <span className="rl" style={{ flex: 'none' }}>{fmtTs(parseTs(t.createdAt))}</span></li>
          {t.comments.filter(c => c.stageTransition).map(c => (
            <li key={c.id}><span className="actt"><b>{c.authorName || 'Someone'}</b> moved it to {c.stageTransition}</span>
              <span className="rl" style={{ flex: 'none' }}>{fmtTs(parseTs(c.createdAt))}</span></li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ================================================== modals */

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="tmoverlay" onClick={onClose}>
      <div className="tmmodal" onClick={e => e.stopPropagation()}>
        <div className="tmhead"><span className="nm" style={{ fontSize: 15 }}>{title}</span><span className="sp" />
          <button className="ract" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  )
}

/** Inviting is a link, not an email. The engine mints a single use join URL
 *  that carries the role and expires in seven days; sending it is up to you,
 *  which is why the link is what this hands back. */
function InviteModal({ onClose, onCreate }: { onClose: () => void; onCreate: (r: InviteRole) => void }) {
  const [r, setR] = useState<InviteRole>('member')
  return (
    <Modal title="Invite a member" onClose={onClose}>
      <label className="rl">Role on the account<select className="tmsel" value={r} onChange={e => setR(e.target.value as InviteRole)}>
        {INVITE_ROLES.map(x => <option key={x} value={x}>{x}</option>)}</select></label>
      <p className="tmnote">This creates a join link that expires in seven days. Copy it from the members list and send it however you like.
        The portal role, the one in the matrix, is set after they join.</p>
      <button className="btn p" onClick={() => onCreate(r)}>Create invite link</button>
    </Modal>
  )
}

function TicketModal({ onClose, onCreate, projects, MemberSelect, seedProject }: {
  onClose: () => void
  onCreate: (f: { projectSlug: string; title: string; description: string; assignee: string }) => void
  projects: { slug: string; name: string }[]
  MemberSelect: (p: { value: string; onPick: (name: string) => void }) => React.JSX.Element
  /** Set when the task was started from a project card, so the picker opens
   *  on that project instead of making somebody choose it twice. */
  seedProject?: string
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [projectSlug, setProjectSlug] = useState(seedProject || '')
  const [assignee, setAssignee] = useState('')
  return (
    <Modal title="New ticket" onClose={onClose}>
      <label className="rl">Title<input className="tminput" value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing" /></label>
      <label className="rl">Details<textarea className="tminput tmarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Context so anyone can pick this up" /></label>
      <label className="rl">Project<input className="tminput" list="tmproj" value={projectSlug} onChange={e => setProjectSlug(e.target.value)} placeholder="general" />
        <datalist id="tmproj">{projects.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}</datalist></label>
      <label className="rl">Assignee<MemberSelect value={assignee} onPick={setAssignee} /></label>
      <button className="btn p" disabled={!title.trim()}
        onClick={() => onCreate({ title: title.trim(), description: description.trim(), projectSlug: projectSlug.trim() || 'general', assignee })}>
        Create ticket</button>
    </Modal>
  )
}

function AssignModal({ onClose, onCreate, businesses, names }: {
  onClose: () => void
  onCreate: (slug: string, name: string) => void
  businesses: { slug: string; name: string }[]
  names: string[]
}) {
  const [slug, setSlug] = useState(businesses.length ? businesses[0].slug : '')
  const [who, setWho] = useState(names.length ? names[0] : '')
  return (
    <Modal title="Assign a business" onClose={onClose}>
      <label className="rl">Business<select className="tmsel" value={slug} onChange={e => setSlug(e.target.value)}>
        {businesses.map(b => <option key={b.slug} value={b.slug}>{b.name || b.slug}</option>)}
        {businesses.length === 0 && <option value="">No businesses yet</option>}
      </select></label>
      <label className="rl">Assign to<select className="tmsel" value={who} onChange={e => setWho(e.target.value)}>
        <option value="">Unassigned</option>
        {names.map(n => <option key={n} value={n}>{n}</option>)}
      </select></label>
      <button className="btn p" disabled={!slug} onClick={() => onCreate(slug, who)}>Assign</button>
    </Modal>
  )
}

/** Approvals hang off a deliverable, so this asks which one. When it is
 *  opened from a ticket the title comes prefilled, because that is almost
 *  always what the approval is about. */
function ApprovalModal({ onClose, onCreate, businesses, seed }: {
  onClose: () => void
  onCreate: (f: { businessSlug: string; itemType: ItemType; itemId: string; title: string }) => void
  businesses: { slug: string; name: string }[]
  seed: TeamTicket | null
}) {
  const [slug, setSlug] = useState(seed && seed.projectSlug ? seed.projectSlug : (businesses.length ? businesses[0].slug : ''))
  const [itemType, setItemType] = useState<ItemType>('decision_memo')
  const [title, setTitle] = useState(seed ? seed.title : '')
  return (
    <Modal title="Request approval" onClose={onClose}>
      <label className="rl">Business<input className="tminput" list="tmbiz3" value={slug} onChange={e => setSlug(e.target.value)} placeholder="Company slug" />
        <datalist id="tmbiz3">{businesses.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}</datalist></label>
      <label className="rl">What is being approved<select className="tmsel" value={itemType} onChange={e => setItemType(e.target.value as ItemType)}>
        {ITEM_TYPES.map(x => <option key={x} value={x}>{ITEM_LABEL[x]}</option>)}</select></label>
      <label className="rl">Title<input className="tminput" value={title} onChange={e => setTitle(e.target.value)} placeholder="What the approver is looking at" /></label>
      <button className="btn p" disabled={!slug.trim() || !title.trim()}
        onClick={() => onCreate({ businessSlug: slug.trim(), itemType, itemId: seed ? seed.id : title.trim(), title: title.trim() })}>
        Send for approval</button>
    </Modal>
  )
}
