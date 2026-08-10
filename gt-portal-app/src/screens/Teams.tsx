/** Teams: full team management. Six tabs: Team (members, roles, permission
 *  matrix, view-as), Tickets (stage board with drawer, checklist, comments,
 *  watchers), Business Assignment, Activity, Collaboration (threads), and
 *  Approvals. All state is real and persisted per workspace; see teamData. */
import React, { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Header } from './simple'
import { useMe } from '../lib/liveData'
import { useAnalyses } from '../lib/liveData'
import { toast } from '../lib/bus'
import {
  TeamState, Ticket, Role, Stage, Priority, Member,
  ROLES, STAGES, PRIORITIES, PERMS, ME,
  loadTeam, saveTeam, act, uid, memberName, initialsOf, progressOf, effectiveRole,
  isOnBoard, completedTickets, markDone, clearDone
} from '../lib/teamData'

const TABS = ['Team', 'Tickets', 'History', 'Business Assignment', 'Activity', 'Collaboration', 'Approvals'] as const
type Tab = typeof TABS[number]

const fmtTs = (ts: number) => new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const fmtTime = (ts: number) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const prioCls: Record<Priority, string> = { Low: 'lo', Medium: 'md', High: 'hi', Urgent: 'ur' }

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

export function Teams() {
  const me = useMe()
  const an = useAnalyses()
  const [st, setSt] = useState<TeamState | null>(null)
  const [tab, setTab] = useState<Tab>('Team')
  const [openId, setOpenId] = useState<string | null>(null)
  const [invite, setInvite] = useState(false)
  const [newTicket, setNewTicket] = useState(false)
  const [newAssign, setNewAssign] = useState(false)
  const [newThread, setNewThread] = useState(false)
  const [openThread, setOpenThread] = useState<string | null>(null)

  React.useEffect(() => {
    setSt(loadTeam(me ? me.name : 'Workspace owner', 'hustleglobal95@gmail.com'))
  }, [me])

  const bizNames = useMemo(() => {
    const set = new Set<string>()
    if (an.st === 'ready') an.rows.forEach(r => { if (r.b) set.add(r.b) })
    return Array.from(set)
  }, [an])

  if (!st) return <div className="scr on"><Header title="Teams" /><div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}><div className="wrap"><span className="skel" style={{ width: '40%' }} /></div></div></div>

  const commit = (next: TeamState) => { saveTeam(next); setSt({ ...next }) }
  const role = effectiveRole(st)
  const perms = PERMS[role]
  const open = openId ? st.tickets.find(t => t.id === openId) || null : null

  /* ------------------------------------------------ mutations */
  const doInvite = (name: string, email: string, r: Role, title: string) => {
    st.members.push({ id: uid(), name, email, role: r, title, status: 'Invited', addedAt: Date.now() })
    act(st, ME, 'team', 'invited ' + name + ' as ' + r)
    commit(st); toast('Invite recorded for ' + name + '.')
  }
  const setMemberRole = (m: Member, r: Role) => {
    m.role = r; act(st, ME, 'team', 'set ' + m.name + ' to ' + r); commit(st)
  }
  const removeMember = (m: Member) => {
    st.members = st.members.filter(x => x.id !== m.id)
    st.tickets.forEach(t => { if (t.assignee === m.id) t.assignee = '' })
    act(st, ME, 'team', 'removed ' + m.name + ' from the team'); commit(st)
  }
  const createTicket = (f: { title: string; desc: string; business: string; assignee: string; priority: Priority; due: string; analysisId: string }) => {
    const t: Ticket = {
      id: uid(), code: 'GT-' + st.nextCode, title: f.title, desc: f.desc,
      business: f.business, analysisId: f.analysisId, assignee: f.assignee, reporter: ME,
      priority: f.priority, stage: 'Backlog', due: f.due, tags: [], checklist: [],
      comments: [], watchers: [ME], createdAt: Date.now(), updatedAt: Date.now(),
      completedAt: null, completedBy: ''
    }
    st.nextCode += 1
    st.tickets.unshift(t)
    act(st, ME, 'ticket', 'opened ' + t.code + ' "' + t.title + '"')
    commit(st); setOpenId(t.id)
  }
  const patchTicket = (t: Ticket, fn: (t: Ticket) => string) => {
    const line = fn(t); t.updatedAt = Date.now()
    act(st, ME, 'ticket', line + ' on ' + t.code); commit(st)
  }
  /** Stage changes are where History is written. Reaching Done stamps who
   *  finished it and when; moving back out clears the stamp so a reopened
   *  ticket is live work again, not a completed one. */
  const moveStage = (t: Ticket, s: Stage) => patchTicket(t, x => {
    const was = x.stage
    x.stage = s
    if (s === 'Done' && was !== 'Done') { markDone(x, ME); return 'completed' }
    if (was === 'Done' && s !== 'Done') { clearDone(x); return 'reopened into ' + s }
    return 'moved to ' + s
  })
  const reopen = (t: Ticket) => {
    t.stage = 'In progress'; clearDone(t); t.updatedAt = Date.now()
    act(st, ME, 'ticket', 'reopened ' + t.code + ' from History')
    commit(st); toast(t.code + ' is back on the board.')
  }
  const requestApproval = (t: Ticket) => {
    st.approvals.unshift({
      id: uid(), subject: t.code + ' ' + t.title, ticketId: t.id, requestedBy: ME,
      approver: '', status: 'Pending', note: '', ts: Date.now(), decidedAt: null
    })
    t.stage = 'Approval'; t.updatedAt = Date.now()
    act(st, ME, 'approval', 'requested approval for ' + t.code)
    commit(st); toast('Approval requested. It is waiting in the Approvals tab.')
  }
  const decide = (id: string, ok: boolean, note: string) => {
    const a = st.approvals.find(x => x.id === id); if (!a) return
    a.status = ok ? 'Approved' : 'Changes requested'
    a.approver = ME; a.note = note; a.decidedAt = Date.now()
    const t = st.tickets.find(x => x.id === a.ticketId)
    if (t) {
      t.stage = ok ? 'Done' : 'In progress'
      if (ok) markDone(t, ME); else clearDone(t)
      t.updatedAt = Date.now()
    }
    act(st, ME, 'approval', (ok ? 'approved ' : 'requested changes on ') + a.subject)
    commit(st)
  }
  const createAssignment = (business: string, lead: string, memberIds: string[], notes: string) => {
    st.assignments.unshift({ id: uid(), business, lead, memberIds, status: 'Onboarding', notes, createdAt: Date.now() })
    act(st, ME, 'assign', 'assigned ' + business + ' to ' + memberName(st, lead))
    commit(st)
  }
  const createThreadFn = (title: string, first: string, ticketId: string) => {
    st.threads.unshift({
      id: uid(), title, ticketId, createdBy: ME, createdAt: Date.now(),
      comments: first ? [{ id: uid(), author: ME, ts: Date.now(), text: first }] : []
    })
    act(st, ME, 'thread', 'started the thread "' + title + '"')
    commit(st)
  }

  /* ------------------------------------------------ pieces */
  const Avatar = ({ id }: { id: string }) => (
    <span className="av tmav" title={memberName(st, id)}>{initialsOf(memberName(st, id))}</span>
  )
  const MemberSelect = ({ value, onPick }: { value: string; onPick: (id: string) => void }) => (
    <select className="tmsel" value={value} onChange={e => onPick(e.target.value)}>
      <option value="">Unassigned</option>
      {st.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  )

  const ticketsFor = (biz: string) => st.tickets.filter(t => t.business === biz)

  /* ------------------------------------------------ tabs */
  const TeamTab = () => (
    <>
      {st.viewAs && (
        <div className="tmpreview">Previewing the portal as <b>{st.viewAs}</b>. Analysis pages and actions are limited to that role right now.
          <button className="ract" onClick={() => { st.viewAs = null; commit(st) }}>Stop preview</button></div>
      )}
      <div className="tmsplit">
        <div className="card tmcardpad">
          <div className="tmhead"><span className="lbl">Members</span><span className="sp" />
            {perms.manageTeam && <button className="btn p" onClick={() => setInvite(true)}>Invite member</button>}
          </div>
          {st.members.map(m => (
            <div key={m.id} className="tmrow">
              <span className="av">{initialsOf(m.name)}</span>
              <span className="tmmeta"><span className="nm">{m.name}</span><br />
                <span className="rl">{m.email || m.title}{m.status === 'Invited' ? ' · invite pending' : ''}</span></span>
              <span className="sp" />
              {m.id === ME
                ? <span className="pfchip">Owner</span>
                : perms.manageTeam
                  ? <>
                      <select className="tmsel" value={m.role} onChange={e => setMemberRole(m, e.target.value as Role)}>
                        {ROLES.filter(r => r !== 'Owner').map(r => <option key={r}>{r}</option>)}
                      </select>
                      <button className="ract" onClick={() => removeMember(m)}>Remove</button>
                    </>
                  : <span className="pfchip">{m.role}</span>}
            </div>
          ))}
        </div>
        <div className="card tmcardpad">
          <div className="tmhead"><span className="lbl">What each role can see and do</span><span className="sp" />
            <select className="tmsel" value={st.viewAs || ''} onChange={e => { st.viewAs = (e.target.value || null) as Role | null; commit(st) }}>
              <option value="">Preview a role…</option>
              {ROLES.filter(r => r !== 'Owner').map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="tmmatrix">
            <div className="tmmh"><span>Role</span><span>Manage team</span><span>Assign</span><span>Approve</span><span>Diagnosis</span><span>Evidence</span><span>Financials</span><span>Full plan</span></div>
            {ROLES.map(r => {
              const p = PERMS[r]
              const dot = (b: boolean) => <span className={'tmdot' + (b ? ' on' : '')} />
              return <div key={r} className={'tmmr' + (r === role ? ' cur' : '')}>
                <span className="nm">{r}</span>{dot(p.manageTeam)}{dot(p.assign)}{dot(p.approve)}
                {dot(p.analysis.diagnosis)}{dot(p.analysis.evidence)}{dot(p.analysis.financials)}{dot(p.analysis.plan)}
              </div>
            })}
          </div>
          <p className="tmnote">The matrix is enforced on analysis pages. Preview a role to see the portal exactly as that teammate would.</p>
        </div>
      </div>
    </>
  )

  const TicketCard = ({ t }: { t: Ticket }) => (
    <div className={'tmcard' + (t.stage === 'Done' ? ' done' : '')} role="button" tabIndex={0} onClick={() => setOpenId(t.id)}
      onKeyDown={e => { if (e.key === 'Enter') setOpenId(t.id) }}>
      <div className="tmcardtop"><span className="tmcode">{t.code}</span>
        <span className={'tmprio ' + prioCls[t.priority]} title={t.priority} /><span className="sp" />
        {t.assignee && <Avatar id={t.assignee} />}</div>
      <div className="tmtitle">{t.title}</div>
      {t.business && <div className="tmbiz">{t.business}</div>}
      <div className="tmprog"><i style={{ width: progressOf(t) + '%' }} /></div>
      <div className="tmcardbot"><span className="rl">{progressOf(t)}%</span><span className="sp" />
        {t.comments.length > 0 && <span className="rl">{t.comments.length} comments</span>}
        {t.stage === 'Done' && t.completedAt
          ? <span className="rl">done {fmtTime(t.completedAt)}</span>
          : t.due && <span className="rl">due {t.due}</span>}</div>
    </div>
  )

  const TicketsTab = () => (
    <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">Every ticket carries its stage, checklist, comments and history, so anyone can pick it up with context.</span>
        <span className="sp" /><button className="btn p" onClick={() => setNewTicket(true)}>New ticket</button>
      </div>
      <div className="tmboard">
        {STAGES.map(s => {
          const now = Date.now()
          const col = st.tickets.filter(t => t.stage === s && isOnBoard(t, now))
          const archived = s === 'Done' ? st.tickets.filter(t => t.stage === 'Done' && !isOnBoard(t, now)).length : 0
          return <div key={s} className="tmcol">
            <div className="tmcolh"><span>{s}</span><span className="tmcount">{col.length}</span></div>
            {col.map(t => <TicketCard key={t.id} t={t} />)}
            {col.length === 0 && <div className="tmempty">{s === 'Done' ? 'Nothing finished today' : 'Nothing here'}</div>}
            {archived > 0 && (
              <button className="tmarchived" onClick={() => setTab('History')}>
                {archived} more in History
              </button>
            )}
          </div>
        })}
      </div>
    </>
  )

  /** History: every completed ticket, newest first, grouped by the day it
   *  landed. The board shows what finished today; this is the full record. */
  const HistoryTab = () => {
    const done = completedTickets(st)
    if (done.length === 0) {
      return <div className="emptyblock">
        <b>No tickets completed yet.</b>
        <span>Move a ticket to Done and it lands here with who finished it and when. The board keeps it for a day, then it lives here for good.</span>
      </div>
    }
    const groups: { label: string; items: Ticket[] }[] = []
    done.forEach(t => {
      const ts = t.completedAt || t.updatedAt
      const label = dayLabel(ts)
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(t)
      else groups.push({ label, items: [t] })
    })
    return <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">{done.length} ticket{done.length === 1 ? '' : 's'} completed. Reopen one and it goes back on the board.</span>
      </div>
      {groups.map(g => (
        <div key={g.label} className="tmhistgroup">
          <div className="tmhistday">{g.label}</div>
          <div className="tmhistlist">
            {g.items.map(t => {
              const ts = t.completedAt || t.updatedAt
              return (
                <div key={t.id} className="tmhistrow">
                  <span className="tmcode">{t.code}</span>
                  <span className="tmhistmeta" role="button" tabIndex={0} onClick={() => setOpenId(t.id)}
                    onKeyDown={e => { if (e.key === 'Enter') setOpenId(t.id) }}>
                    <span className="nm">{t.title}</span>
                    <span className="rl">{t.business ? t.business + ' · ' : ''}completed by {memberName(st, t.completedBy || t.assignee)} at {fmtTime(ts)}</span>
                  </span>
                  <span className="sp" />
                  {t.assignee && <Avatar id={t.assignee} />}
                  <button className="ract" onClick={() => setOpenId(t.id)}>Open</button>
                  <button className="ract" onClick={() => reopen(t)}>Reopen</button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  }

  const AssignTab = () => (
    <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">Who owns which company, and how its work is moving.</span>
        <span className="sp" />
        {perms.assign && <button className="btn p" onClick={() => setNewAssign(true)}>Assign a business</button>}
      </div>
      {st.assignments.length === 0 && <div className="emptyblock">No businesses assigned yet. Assign one to a lead and it shows up here with live ticket progress.</div>}
      {st.assignments.map(a => {
        const tk = ticketsFor(a.business)
        const done = tk.filter(t => t.stage === 'Done').length
        return <div key={a.id} className="card tmcardpad" style={{ marginBottom: 10 }}>
          <div className="tmrow">
            <span className="tmmeta"><span className="nm">{a.business}</span><br />
              <span className="rl">Lead: {memberName(st, a.lead)} · team of {a.memberIds.length || 1}</span></span>
            <span className="sp" />
            <select className="tmsel" value={a.status} onChange={e => { a.status = e.target.value as typeof a.status; act(st, ME, 'assign', 'set ' + a.business + ' to ' + a.status); commit(st) }}>
              <option>Onboarding</option><option>Active</option><option>Paused</option>
            </select>
          </div>
          <div className="tmprog" style={{ margin: '10px 0 6px' }}><i style={{ width: (tk.length ? Math.round(done / tk.length * 100) : 0) + '%' }} /></div>
          <div className="rl">{done} of {tk.length} tickets done{a.notes ? ' · ' + a.notes : ''}</div>
        </div>
      })}
    </>
  )

  const ActivityTab = () => (
    <ul className="actfeed" style={{ marginTop: 4 }}>
      {st.activity.slice(0, 60).map(a => (
        <li key={a.id}>
          <span className="pfchip">{a.kind}</span>
          <span className="actt"><b>{a.actor}</b> {a.text}</span>
          <span className="rl" style={{ flex: 'none' }}>{fmtTs(a.ts)}</span>
        </li>
      ))}
      {st.activity.length === 0 && <li><span className="actt">No activity yet.</span></li>}
    </ul>
  )

  const CollabTab = () => {
    const th = openThread ? st.threads.find(x => x.id === openThread) : null
    if (th) {
      const linked = th.ticketId ? st.tickets.find(t => t.id === th.ticketId) : null
      return <div className="card tmcardpad">
        <div className="tmhead"><button className="ract" onClick={() => setOpenThread(null)}>Back</button>
          <span className="nm" style={{ marginLeft: 8 }}>{th.title}</span><span className="sp" />
          {linked && <button className="ract" onClick={() => { setTab('Tickets'); setOpenId(linked.id) }}>Open {linked.code}</button>}
        </div>
        <CommentBlock comments={th.comments} onAdd={text => {
          th.comments.push({ id: uid(), author: ME, ts: Date.now(), text })
          act(st, ME, 'thread', 'commented in "' + th.title + '"'); commit(st)
        }} canComment={perms.comment} stt={st} />
      </div>
    }
    return <>
      <div className="tmhead" style={{ marginBottom: 10 }}>
        <span className="cs">Open discussion for the whole team. Link a thread to a ticket so context never gets lost.</span>
        <span className="sp" /><button className="btn p" onClick={() => setNewThread(true)}>New thread</button>
      </div>
      {st.threads.length === 0 && <div className="emptyblock">No threads yet. Start one and the whole team can pick it up here.</div>}
      {st.threads.map(t => (
        <div key={t.id} className="tmrow tmthread" role="button" tabIndex={0} onClick={() => setOpenThread(t.id)}
          onKeyDown={e => { if (e.key === 'Enter') setOpenThread(t.id) }}>
          <span className="tmmeta"><span className="nm">{t.title}</span><br />
            <span className="rl">{memberName(st, t.createdBy)} · {t.comments.length} comments · {fmtTs(t.createdAt)}</span></span>
          <span className="sp" /><span className="ract">Open</span>
        </div>
      ))}
    </>
  }

  const ApprovalsTab = () => (
    <>
      {st.approvals.length === 0 && <div className="emptyblock">Nothing waiting. Request approval from any ticket and it lands here for a decision.</div>}
      {st.approvals.map(a => (
        <div key={a.id} className="card tmcardpad" style={{ marginBottom: 10 }}>
          <div className="tmrow">
            <span className="tmmeta"><span className="nm">{a.subject}</span><br />
              <span className="rl">Requested by {memberName(st, a.requestedBy)} · {fmtTs(a.ts)}</span></span>
            <span className="sp" />
            <span className={'stat' + (a.status === 'Approved' ? ' ok' : '')}><i />{a.status}</span>
          </div>
          {a.status === 'Pending' && perms.approve && <ApproveRow onDecide={(ok, note) => decide(a.id, ok, note)} />}
          {a.status === 'Pending' && !perms.approve && <p className="tmnote">Your role cannot approve. An Owner or Admin decides this.</p>}
          {a.note && <p className="tmnote">Decision note: {a.note}</p>}
        </div>
      ))}
    </>
  )

  /* ------------------------------------------------ render */
  return (
    <div className="scr on">
      <Header title="Teams">
        {tab === 'Tickets' && <button className="btn p" onClick={() => setNewTicket(true)}>New ticket</button>}
        {tab === 'Team' && perms.manageTeam && <button className="btn p" onClick={() => setInvite(true)}>Invite member</button>}
      </Header>
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          <div className="tmtabs">
            {TABS.map(t => (
              <button key={t} className={'tmtab' + (t === tab ? ' on' : '')} onClick={() => setTab(t)}>{t}
                {t === 'Approvals' && st.approvals.some(a => a.status === 'Pending') &&
                  <span className="tmbadge">{st.approvals.filter(a => a.status === 'Pending').length}</span>}
              </button>
            ))}
          </div>
          {tab === 'Team' && <TeamTab />}
          {tab === 'Tickets' && <TicketsTab />}
          {tab === 'History' && <HistoryTab />}
          {tab === 'Business Assignment' && <AssignTab />}
          {tab === 'Activity' && <ActivityTab />}
          {tab === 'Collaboration' && <CollabTab />}
          {tab === 'Approvals' && <ApprovalsTab />}
        </div>
      </div>

      {open && <TicketDrawer t={open} stt={st} canComment={perms.comment} canApprove={perms.approve}
        planAccess={PERMS[role].analysis.plan}
        onClose={() => setOpenId(null)}
        onStage={s => moveStage(open, s)}
        onPatch={fn => patchTicket(open, fn)}
        onApproval={() => requestApproval(open)}
        onDelete={() => { st.tickets = st.tickets.filter(x => x.id !== open.id); act(st, ME, 'ticket', 'deleted ' + open.code); commit(st); setOpenId(null) }}
        MemberSelect={MemberSelect} />}

      {invite && <InviteModal onClose={() => setInvite(false)} onCreate={(n, e, r, t) => { doInvite(n, e, r, t); setInvite(false) }} />}
      {newTicket && <TicketModal bizNames={bizNames} stt={st} onClose={() => setNewTicket(false)}
        onCreate={f => { createTicket(f); setNewTicket(false); }} MemberSelect={MemberSelect} />}
      {newAssign && <AssignModal bizNames={bizNames} stt={st} onClose={() => setNewAssign(false)}
        onCreate={(b, l, ms, n) => { createAssignment(b, l, ms, n); setNewAssign(false) }} />}
      {newThread && <ThreadModal stt={st} onClose={() => setNewThread(false)}
        onCreate={(t, f, tk) => { createThreadFn(t, f, tk); setNewThread(false) }} />}
    </div>
  )
}

/* ================================================== subcomponents */

function CommentBlock({ comments, onAdd, canComment, stt }: {
  comments: { id: string; author: string; ts: number; text: string }[]
  onAdd: (text: string) => void; canComment: boolean; stt: TeamState
}) {
  const [text, setText] = useState('')
  return (
    <div className="tmcomments">
      {comments.map(c => (
        <div key={c.id} className="tmcomment">
          <span className="av tmav">{initialsOf(memberName(stt, c.author))}</span>
          <div><div className="rl"><b style={{ color: 'var(--ink, #000000)' }}>{memberName(stt, c.author)}</b> · {fmtTs(c.ts)}</div>
            <div className="tmctext">{c.text}</div></div>
        </div>
      ))}
      {comments.length === 0 && <div className="rl" style={{ padding: '8px 0' }}>No comments yet. Leave the first one so the next person has context.</div>}
      {canComment
        ? <div className="tmcbar">
            <input className="tminput" placeholder="Write a comment…" value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && text.trim()) { onAdd(text.trim()); setText('') } }} />
            <button className="btn p" onClick={() => { if (text.trim()) { onAdd(text.trim()); setText('') } }}>Send</button>
          </div>
        : <p className="tmnote">Your role can view this conversation but not post in it.</p>}
    </div>
  )
}

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

function TicketDrawer({ t, stt, onClose, onStage, onPatch, onApproval, onDelete, canComment, canApprove, planAccess, MemberSelect }: {
  t: Ticket; stt: TeamState; onClose: () => void
  onStage: (s: Stage) => void
  onPatch: (fn: (t: Ticket) => string) => void
  onApproval: () => void; onDelete: () => void
  canComment: boolean; canApprove: boolean; planAccess: boolean
  MemberSelect: (p: { value: string; onPick: (id: string) => void }) => React.JSX.Element
}) {
  const [check, setCheck] = useState('')
  const idx = STAGES.indexOf(t.stage)
  /** The next stage along. One button commits the ticket to it, so work moves
   *  a step at a time without hunting for the right chip. */
  const next = idx >= 0 && idx < STAGES.length - 1 ? STAGES[idx + 1] : null
  const related = stt.activity.filter(a => a.text.includes(t.code)).slice(0, 12)
  return (
    <div className="tmoverlay" onClick={onClose}>
      <div className="tmdrawer" onClick={e => e.stopPropagation()}>
        <div className="tmhead">
          <span className="tmcode">{t.code}</span>
          <span className={'tmprio ' + prioCls[t.priority]} title={t.priority} />
          <span className="sp" />
          <button className="ract" onClick={onDelete}>Delete</button>
          <button className="ract" onClick={onClose}>Close</button>
        </div>
        <div className="tmtitle" style={{ fontSize: 17, marginTop: 2 }}>{t.title}</div>
        {t.desc && <p className="tmdesc">{t.desc}</p>}

        <div className="tmsteps">
          {STAGES.map((s, i) => (
            <button key={s} className={'tmstep' + (i < idx ? ' past' : '') + (i === idx ? ' cur' : '')}
              onClick={() => onStage(s)}>{s}</button>
          ))}
        </div>
        <div className="tmprog" style={{ margin: '8px 0 2px' }}><i style={{ width: progressOf(t) + '%' }} /></div>
        <div className="rl">{progressOf(t)}% complete</div>

        {next
          ? <button className="btn p tmcommit" onClick={() => onStage(next)}>
              {next === 'Done' ? 'Complete this ticket' : 'Commit this step'}
              <span>moves to {next}</span>
            </button>
          : <button className="btn g tmcommit" onClick={() => onStage('In progress')}>
              Reopen<span>back to In progress</span>
            </button>}

        {t.stage === 'Done' && t.completedAt && (
          <div className="tmdonestamp">Completed by {memberName(stt, t.completedBy || t.assignee)} on {fmtTs(t.completedAt)}</div>
        )}

        <div className="tmgrid">
          <label className="rl">Assignee<MemberSelect value={t.assignee} onPick={id => onPatch(x => { x.assignee = id; return 'assigned ' + (memberName(stt, id)) })} /></label>
          <label className="rl">Priority
            <select className="tmsel" value={t.priority} onChange={e => onPatch(x => { x.priority = e.target.value as Priority; return 'set priority ' + e.target.value })}>
              {PRIORITIES.map(p => <option key={p}>{p}</option>)}
            </select></label>
          <label className="rl">Due
            <input className="tminput" type="date" value={t.due} onChange={e => onPatch(x => { x.due = e.target.value; return 'set due date' })} /></label>
          <label className="rl">Business
            <input className="tminput" value={t.business} placeholder="Company name" onChange={e => onPatch(x => { x.business = e.target.value; return 'linked business' })} /></label>
        </div>

        {t.analysisId && (planAccess
          ? <Link className="ract tmlink" to={'/analyses/' + t.analysisId}>Open the linked analysis</Link>
          : <p className="tmnote">The linked analysis is hidden for your role.</p>)}

        <div className="lbl" style={{ marginTop: 14 }}>Checklist</div>
        {t.checklist.map(c => (
          <label key={c.id} className="tmcheck">
            <input type="checkbox" checked={c.done}
              onChange={() => onPatch(x => { const i = x.checklist.find(y => y.id === c.id); if (!i) return 'updated the checklist'; i.done = !i.done; return (i.done ? 'ticked' : 'unticked') + ' "' + c.t + '"' })} />
            <span className={c.done ? 'donetext' : ''}>{c.t}</span>
          </label>
        ))}
        <div className="tmcbar">
          <input className="tminput" placeholder="Add a checklist step…" value={check} onChange={e => setCheck(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && check.trim()) { onPatch(x => { x.checklist.push({ id: uid(), t: check.trim(), done: false }); return 'added a checklist step' }); setCheck('') } }} />
        </div>

        <div className="tmhead" style={{ marginTop: 14 }}>
          <span className="lbl">Watchers</span><span className="sp" />
          <button className="ract" onClick={() => onPatch(x => {
            const on = x.watchers.includes(ME)
            x.watchers = on ? x.watchers.filter(w => w !== ME) : [...x.watchers, ME]
            return on ? 'stopped watching' : 'started watching'
          })}>{t.watchers.includes(ME) ? 'Stop watching' : 'Watch'}</button>
        </div>
        <div className="tmwatch">{t.watchers.map(w => <span key={w} className="av tmav" title={memberName(stt, w)}>{initialsOf(memberName(stt, w))}</span>)}
          {t.watchers.length === 0 && <span className="rl">Nobody is watching this ticket.</span>}</div>

        {t.stage !== 'Done' && (canApprove || t.stage !== 'Approval') && (
          <button className="btn g" style={{ marginTop: 12 }} onClick={onApproval}>Request approval</button>
        )}

        <div className="lbl" style={{ marginTop: 16 }}>Comments</div>
        <CommentBlock comments={t.comments} canComment={canComment} stt={stt}
          onAdd={text => onPatch(x => { x.comments.push({ id: uid(), author: ME, ts: Date.now(), text }); return 'commented' })} />

        <div className="lbl" style={{ marginTop: 16 }}>History</div>
        <ul className="actfeed">
          {related.map(a => <li key={a.id}><span className="actt"><b>{a.actor}</b> {a.text}</span>
            <span className="rl" style={{ flex: 'none' }}>{fmtTs(a.ts)}</span></li>)}
          {related.length === 0 && <li><span className="actt rl">No history yet.</span></li>}
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

function InviteModal({ onClose, onCreate }: { onClose: () => void; onCreate: (n: string, e: string, r: Role, t: string) => void }) {
  const [n, setN] = useState(''); const [e, setE] = useState(''); const [r, setR] = useState<Role>('Analyst'); const [t, setT] = useState('')
  return (
    <Modal title="Invite a member" onClose={onClose}>
      <label className="rl">Name<input className="tminput" value={n} onChange={x => setN(x.target.value)} placeholder="Full name" /></label>
      <label className="rl">Email<input className="tminput" value={e} onChange={x => setE(x.target.value)} placeholder="name@company.com" /></label>
      <label className="rl">Title<input className="tminput" value={t} onChange={x => setT(x.target.value)} placeholder="Growth analyst" /></label>
      <label className="rl">Role<select className="tmsel" value={r} onChange={x => setR(x.target.value as Role)}>
        {ROLES.filter(x => x !== 'Owner').map(x => <option key={x}>{x}</option>)}</select></label>
      <p className="tmnote">The invite email itself sends once team accounts are wired to the backend. The member, role and permissions are live in this workspace now.</p>
      <button className="btn p" disabled={!n.trim()} onClick={() => onCreate(n.trim(), e.trim(), r, t.trim())}>Add member</button>
    </Modal>
  )
}

function TicketModal({ onClose, onCreate, bizNames, stt, MemberSelect }: {
  onClose: () => void
  onCreate: (f: { title: string; desc: string; business: string; assignee: string; priority: Priority; due: string; analysisId: string }) => void
  bizNames: string[]; stt: TeamState
  MemberSelect: (p: { value: string; onPick: (id: string) => void }) => React.JSX.Element
}) {
  const [title, setTitle] = useState(''); const [desc, setDesc] = useState('')
  const [business, setBusiness] = useState(''); const [assignee, setAssignee] = useState(ME)
  const [priority, setPriority] = useState<Priority>('Medium'); const [due, setDue] = useState('')
  return (
    <Modal title="New ticket" onClose={onClose}>
      <label className="rl">Title<input className="tminput" value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing" /></label>
      <label className="rl">Details<textarea className="tminput tmarea" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Context so anyone can pick this up" /></label>
      <label className="rl">Business<input className="tminput" list="tmbiz" value={business} onChange={e => setBusiness(e.target.value)} placeholder="Company this is for" />
        <datalist id="tmbiz">{bizNames.map(b => <option key={b} value={b} />)}</datalist></label>
      <div className="tmgrid">
        <label className="rl">Assignee<MemberSelect value={assignee} onPick={setAssignee} /></label>
        <label className="rl">Priority<select className="tmsel" value={priority} onChange={e => setPriority(e.target.value as Priority)}>
          {PRIORITIES.map(p => <option key={p}>{p}</option>)}</select></label>
        <label className="rl">Due<input className="tminput" type="date" value={due} onChange={e => setDue(e.target.value)} /></label>
      </div>
      <button className="btn p" disabled={!title.trim()} onClick={() => onCreate({ title: title.trim(), desc: desc.trim(), business: business.trim(), assignee, priority, due, analysisId: '' })}>Create ticket</button>
    </Modal>
  )
}

function AssignModal({ onClose, onCreate, bizNames, stt }: {
  onClose: () => void; onCreate: (b: string, lead: string, memberIds: string[], notes: string) => void
  bizNames: string[]; stt: TeamState
}) {
  const [b, setB] = useState(''); const [lead, setLead] = useState(ME)
  const [ms, setMs] = useState<string[]>([ME]); const [notes, setNotes] = useState('')
  return (
    <Modal title="Assign a business" onClose={onClose}>
      <label className="rl">Business<input className="tminput" list="tmbiz2" value={b} onChange={e => setB(e.target.value)} placeholder="Company name" />
        <datalist id="tmbiz2">{bizNames.map(x => <option key={x} value={x} />)}</datalist></label>
      <label className="rl">Lead<select className="tmsel" value={lead} onChange={e => setLead(e.target.value)}>
        {stt.members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <div className="rl" style={{ marginTop: 8 }}>Team on this business</div>
      <div className="tmwatch">
        {stt.members.map(m => (
          <button key={m.id} className={'pfchip tmpick' + (ms.includes(m.id) ? ' on' : '')}
            onClick={() => setMs(ms.includes(m.id) ? ms.filter(x => x !== m.id) : [...ms, m.id])}>{m.name}</button>
        ))}
      </div>
      <label className="rl">Notes<input className="tminput" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anything the team should know" /></label>
      <button className="btn p" disabled={!b.trim()} onClick={() => onCreate(b.trim(), lead, ms, notes.trim())}>Assign</button>
    </Modal>
  )
}

function ThreadModal({ onClose, onCreate, stt }: {
  onClose: () => void; onCreate: (title: string, first: string, ticketId: string) => void; stt: TeamState
}) {
  const [title, setTitle] = useState(''); const [first, setFirst] = useState(''); const [tk, setTk] = useState('')
  return (
    <Modal title="New thread" onClose={onClose}>
      <label className="rl">Topic<input className="tminput" value={title} onChange={e => setTitle(e.target.value)} placeholder="What is this about" /></label>
      <label className="rl">First message<textarea className="tminput tmarea" value={first} onChange={e => setFirst(e.target.value)} placeholder="Set the context" /></label>
      <label className="rl">Link a ticket (optional)<select className="tmsel" value={tk} onChange={e => setTk(e.target.value)}>
        <option value="">None</option>
        {stt.tickets.map(t => <option key={t.id} value={t.id}>{t.code} {t.title}</option>)}</select></label>
      <button className="btn p" disabled={!title.trim()} onClick={() => onCreate(title.trim(), first.trim(), tk)}>Start thread</button>
    </Modal>
  )
}
