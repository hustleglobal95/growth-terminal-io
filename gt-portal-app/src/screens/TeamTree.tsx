/** WHO SITS WHERE.
 *
 *  The Tree and Directory halves of the Teams directive. The Work board is
 *  untouched and still lives on the Teams page, because rule 7 says the flat
 *  Teams and its tickets keep working whether or not a tree has been built.
 *
 *  TWO THINGS THIS SCREEN IS CAREFUL ABOUT.
 *
 *  It never claims to enforce. Titles decide what this screen draws. They do
 *  not decide what the engine accepts, because this bundle is readable by
 *  anyone who opens devtools, and a Viewer who cannot see a Complete button
 *  can still send the request. Every "cannot" in the directive is the
 *  engine's, and the screen says so rather than implying otherwise.
 *
 *  It never pretends the team can see this. The engine stores no tree, so the
 *  shape is held in the owner's browser. For a structure whose entire purpose
 *  is that everybody knows who sits where, that is a real limitation and it is
 *  stated at the top of the screen, not buried.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from './simple'
import { Section } from '../components/Section'
import { toast } from '../lib/bus'
import { useAccounts, accountName } from '../lib/liveData'
import { fetchTeam, memberLabel } from '../lib/teamLive'
import type { TeamMember } from '../lib/teamLive'
import {
  TITLES, categories, assignable, titleById, canComplete,
  seatsUsed, inviteState, seatCeiling, SEATS_INCLUDED, SEATS_MAX, COPY,
} from '../lib/teamTitles'
import type { TitleId } from '../lib/teamTitles'
import {
  readTree, writeTree, withRoot, rootOf, childrenOf, seatedOn, nodesFor,
  seatedMembers, addNode, renameNode, archiveNode, assignTitle,
  removeFromNode, treeLive,
} from '../lib/teamTree'
import type { Tree } from '../lib/teamTree'

type View = 'tree' | 'directory'

export function TeamTree() {
  const nav = useNavigate()
  const accs = useAccounts()
  const acc = accs && accs.length ? accs[0] : null

  const [view, setView] = useState<View>('tree')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [tree, setTree] = useState<Tree | null>(null)
  const [openNode, setOpenNode] = useState<string | null>(null)
  const [picking, setPicking] = useState<{ memberId: string; nodeId: string } | null>(null)

  useEffect(() => {
    if (!acc) return
    setTree(withRoot(readTree(acc.id), accountName(accs)))
    fetchTeam(acc.id, acc.name)
      .then(d => setMembers(d.members))
      .catch(() => { /* the tree still draws; it just has nobody to seat */ })
  }, [acc, accs])

  const save = (next: Tree) => {
    if (!acc) return
    setTree(next)
    writeTree(acc.id, next)
  }

  /* A seat is a person on the account, not a title and not a node. Somebody
     invited but not yet seated anywhere still holds their seat, so the count is
     the account's people unioned with anyone holding a title, deduplicated. */
  const used = tree
    ? seatsUsed([...members.map(m => m.user_id || m.id), ...seatedMembers(tree)])
    : 0
  const ceiling = tree ? seatCeiling(tree.overflow) : SEATS_INCLUDED
  const invite = tree ? inviteState(used, tree.overflow) : 'ok'
  const root = tree ? rootOf(tree) : null

  if (!acc || !tree) {
    return (
      <div className="scr on">
        <Header title="Team tree" />
        <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          <div className="wrap"><p className="dsm">Opening your workspace.</p></div>
        </div>
      </div>
    )
  }

  return (
    <div className="scr on">
      <Header title="Team tree">
        <div className="seg">
          <button className={view === 'tree' ? 'on' : ''} onClick={() => setView('tree')}>Tree</button>
          <button className={view === 'directory' ? 'on' : ''} onClick={() => setView('directory')}>Directory</button>
        </div>
        <button className="btn g" onClick={() => nav('/teams')}>Work</button>
      </Header>

      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">

          {!treeLive() && (
            <div className="ldsample">
              <p><b>This tree is a draft in your browser.</b> The engine stores no team
                structure yet, so nobody else can see it. Titles here decide what this screen
                shows and nothing more: what a person is actually allowed to do is still the
                engine's to decide, and it does not know about titles yet.</p>
            </div>
          )}

          <SeatMeter used={used} ceiling={ceiling} overflow={tree.overflow}
            onOverflow={() => save({ ...tree, overflow: true })} />

          {view === 'tree' && (
            <TreeView
              tree={tree} members={members} root={root}
              openNode={openNode} setOpenNode={setOpenNode}
              onAdd={(parentId, name) => save(addNode(tree, name, parentId))}
              onRename={(id, name) => save(renameNode(tree, id, name))}
              onArchive={id => {
                save(archiveNode(tree, id))
                if (openNode === id) setOpenNode(null)
                toast('Archived. Its tickets and history stay attached to it.')
              }}
              onSeat={(memberId, nodeId) => setPicking({ memberId, nodeId })}
              onUnseat={(memberId, nodeId) => save(removeFromNode(tree, memberId, nodeId))}
              invite={invite}
            />
          )}

          {view === 'directory' && (
            <Directory tree={tree} members={members} />
          )}

          {picking && (
            <TitlePicker
              onPick={id => {
                save(assignTitle(tree, picking.memberId, picking.nodeId, id))
                setPicking(null)
              }}
              onClose={() => setPicking(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Seats ───────────────────────────────────────────────────────────────────

function SeatMeter({ used, ceiling, overflow, onOverflow }: {
  used: number; ceiling: number; overflow: boolean; onOverflow: () => void
}) {
  const full = used >= ceiling
  return (
    <div className="setupcard ttseats">
      <div className="ttseath">
        <span className="lbl">Seats</span>
        <b className={full ? 'full' : ''}>{used} of {ceiling}</b>
        {!overflow && used >= SEATS_INCLUDED && (
          <button className="dsbtn" onClick={onOverflow}>Add 5 more seats</button>
        )}
      </div>
      {full && (
        <p className="ttseatnote">{ceiling === SEATS_MAX ? COPY.atFifteen : COPY.atTen}</p>
      )}
      <p className="sfine">A seat is a person. Somebody sitting on three nodes with three
        titles is still one seat.</p>
    </div>
  )
}

// ── Tree ────────────────────────────────────────────────────────────────────

function TreeView(p: {
  tree: Tree
  members: TeamMember[]
  root: ReturnType<typeof rootOf>
  openNode: string | null
  setOpenNode: (id: string | null) => void
  onAdd: (parentId: string | null, name: string) => void
  onRename: (id: string, name: string) => void
  onArchive: (id: string) => void
  onSeat: (memberId: string, nodeId: string) => void
  onUnseat: (memberId: string, nodeId: string) => void
  invite: string
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const [name, setName] = useState('')

  if (!p.root) return null

  /* The root always exists, so an empty tree is still a tree with one row on
     it. The guidance belongs above that row and inside the same card: a
     standalone "nothing built yet" panel sitting over a visible node reads as
     a contradiction. */
  const seated = seatedMembers(p.tree)
  const bare = seated.length === 0 && childrenOf(p.tree, p.root.id).length === 0
  const live = p.tree.nodes.filter(n => !n.archived).length

  return (
    <Section title="The tree" qualifier={live + (live === 1 ? ' node' : ' nodes')} flush>
      {bare && <p className="ttempty">{COPY.emptyTree}</p>}
      <Branch {...p} node={p.root} depth={1} adding={adding} setAdding={setAdding}
        name={name} setName={setName} />
    </Section>
  )
}

function Branch(p: {
  tree: Tree
  members: TeamMember[]
  node: { id: string; name: string }
  depth: number
  openNode: string | null
  setOpenNode: (id: string | null) => void
  onAdd: (parentId: string | null, name: string) => void
  onRename: (id: string, name: string) => void
  onArchive: (id: string) => void
  onSeat: (memberId: string, nodeId: string) => void
  onUnseat: (memberId: string, nodeId: string) => void
  adding: string | null
  setAdding: (id: string | null) => void
  name: string
  setName: (v: string) => void
}) {
  const kids = childrenOf(p.tree, p.node.id)
  const here = seatedOn(p.tree, p.node.id)
  const open = p.openNode === p.node.id
  const isRoot = p.depth === 1

  /* Depth is an offset of the row's content, never of the row's box: a margin
     here would push each child's right edge past the card. */
  return (
    <div className="ttnode" style={{ ['--d' as never]: (p.depth - 1) * 22 + 'px' }}>
      <div className={'ttrow' + (open ? ' on' : '')}>
        <button className="ttname" onClick={() => p.setOpenNode(open ? null : p.node.id)}>
          <b>{p.node.name}</b>
          <i>{here.length === 0 ? 'nobody yet' : here.length + (here.length === 1 ? ' person' : ' people')}</i>
        </button>
        <span className="sp" />
        {p.depth < 4 && (
          <button className="dsbtn" onClick={() => { p.setAdding(p.node.id); p.setName('') }}>Add team</button>
        )}
        {!isRoot && <button className="dsbtn q" onClick={() => p.onArchive(p.node.id)}>Archive</button>}
      </div>

      {p.adding === p.node.id && (
        <form className="ttadd" onSubmit={e => {
          e.preventDefault()
          if (p.name.trim()) { p.onAdd(p.node.id, p.name.trim()); p.setAdding(null); p.setName('') }
        }}>
          <input className="tminput" autoFocus value={p.name} placeholder="Team name"
            onChange={e => p.setName(e.target.value)} />
          <button className="btn g" type="submit">Add</button>
          <button className="btn g" type="button" onClick={() => p.setAdding(null)}>Cancel</button>
        </form>
      )}

      {open && (
        <div className="ttpanel">
          {here.length > 0 && here.map(a => {
            const m = p.members.find(x => x.user_id === a.memberId || x.id === a.memberId)
            const t = titleById(a.titleId)
            return (
              <div key={a.memberId} className="ttseat">
                <b>{m ? memberLabel(m) : a.memberId}</b>
                <span className="tttitle">{t ? t.name : a.titleId}</span>
                {t && !canComplete(t.id) && <span className="ttflag">cannot complete work</span>}
                <span className="sp" />
                <button className="dsbtn q" onClick={() => p.onUnseat(a.memberId, p.node.id)}>Remove</button>
              </div>
            )
          })}
          <div className="ttseatadd">
            <span className="lbl">Seat someone here</span>
            <div className="ttpeople">
              {p.members.filter(m => !here.some(a => a.memberId === (m.user_id || m.id)))
                .map(m => (
                  <button key={m.id} className="dsbtn"
                    onClick={() => p.onSeat(m.user_id || m.id, p.node.id)}>
                    {memberLabel(m)}
                  </button>
                ))}
              {p.members.length === 0 && (
                <span className="sfine">Nobody on the account yet. Invites are on the Work page.</span>
              )}
            </div>
          </div>
        </div>
      )}

      {kids.map(k => (
        <Branch key={k.id} {...p} node={k} depth={p.depth + 1} />
      ))}
    </div>
  )
}

// ── Directory ───────────────────────────────────────────────────────────────

function Directory({ tree, members }: { tree: Tree; members: TeamMember[] }) {
  const rows = useMemo(() => members.map(m => {
    const id = m.user_id || m.id
    const seats = nodesFor(tree, id).map(a => ({
      node: tree.nodes.find(n => n.id === a.teamNodeId),
      title: titleById(a.titleId),
    }))
    return { m, id, seats }
  }), [tree, members])

  return (
    <Section title="Directory" qualifier={members.length + ' on the account'} flush>
      {rows.length === 0 && (
        <div className="ldempty"><b>Nobody yet</b>
          <span>People appear here once they are on the account. Invites are on the Work page.</span></div>
      )}
      {rows.map(r => (
        <div key={r.m.id} className="ttdir">
          <b>{memberLabel(r.m)}</b>
          {r.seats.length === 0 && <span className="ttnone">No title yet</span>}
          {r.seats.map((s, i) => (
            <span key={i} className="ttchip">
              {s.title ? s.title.name : 'Unknown'}
              <i>on {s.node ? s.node.name : 'a removed team'}</i>
            </span>
          ))}
        </div>
      ))}
    </Section>
  )
}

// ── Title picker ────────────────────────────────────────────────────────────

function TitlePicker({ onPick, onClose }: {
  onPick: (id: TitleId) => void
  onClose: () => void
}) {
  const [cat, setCat] = useState<string>(categories()[0])
  const inCat = assignable().filter(t => t.category === cat)
  return (
    <div className="palov on" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="namodal ttpicker">
      <div className="shead"><h2>Choose a title</h2></div>
      <p className="ssub">{COPY.picker}</p>
      <div className="ttcats">
        {categories().map(c => (
          <button key={c} className={'orchip' + (c === cat ? ' on' : '')}
            onClick={() => setCat(c)}>{c}</button>
        ))}
      </div>
      <div className="tttitles">
        {inCat.map(t => (
          <button key={t.id} className="tttitlerow" onClick={() => onPick(t.id)}>
            <b>{t.name}</b>
            {t.scope && <i>{t.scope}</i>}
            <span className="sp" />
            <span className="ttbuckets">{workWord(t.buckets)}</span>
          </button>
        ))}
      </div>
      <div className="act"><button className="btn g" onClick={onClose}>Cancel</button></div>
      </div>
    </div>
  )
}

/** The one thing a reader actually needs from a title, in words. A count of
 *  permission buckets tells nobody anything: what matters is whether this
 *  person can be given work and can close it. */
function workWord(buckets: readonly string[]): string {
  if (buckets.includes('tickets_full')) return 'Assigns and completes work'
  if (buckets.includes('tickets_complete')) return 'Completes work'
  if (buckets.includes('tickets_comment')) return 'Comments on work'
  return 'Reads only'
}
