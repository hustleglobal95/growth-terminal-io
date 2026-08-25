import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../lib/bus'
import { Header } from './simple'
import { BrandGate } from '../components/BrandGate'
import { WORKSPACE_SLUG } from './Brand'
import { useBusinesses } from '../lib/liveData'
import { Section, Row, Empty, Fig, Status } from '../components/Section'
import { FilterBar, FilterGroup, FilterState, groupFrom, matches, loadFilters, saveFilters, activeCount } from '../components/Filters'
import { listSocial, socialConfigured, ConnectedAccount, problemText } from '../lib/social'
import { listThreads, threadsConfigured, ThreadsAccount } from '../lib/threads'
import { listSuggestions, listQueue, feedConfigured, Suggestion, QueuedPost } from '../lib/feed'

/** Content: the console for the engine that writes and publishes.
 *
 *  Everything on this screen used to be a constant in this file. The handles
 *  were one workspace's handles, shown to every customer who opened it; the
 *  creative bank held 148 assets and the engine had published 96 posts no
 *  matter whose account it was; an engagement curve climbed from 2.1 to 6.1
 *  for everybody, and four sentences described what the engine had learned
 *  from posts it had never made.
 *
 *  A number a customer cannot trace is worse than no number, and a number
 *  that belongs to somebody else is worse than that. Everything here now
 *  comes from the engine: connected accounts from the social and Threads
 *  endpoints, the bank and the queue from the feed. Anything the engine does
 *  not measure yet has been removed rather than modelled, and each section
 *  says what it is missing instead of filling the space.
 */

type Load<T> = { st: 'loading' | 'ready' | 'off'; v: T }

const slotText = (s: string): string => {
  if (!s) return 'No slot set'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

const queueTone = (st: QueuedPost['state']): 'ok' | 'run' | undefined =>
  st === 'published' ? 'ok' : st === 'queued' ? 'run' : undefined

const queueLabel = (p: QueuedPost): string =>
  p.state === 'held' && p.heldReason ? 'Held: ' + p.heldReason
    : p.state === 'held' ? 'Held'
      : p.state === 'failed' ? 'Failed'
        : p.state === 'published' ? 'Published' : 'Scheduled'

export function Content() {
  const nav = useNavigate()
  const businesses = useBusinesses()
  const rows = (businesses || []).filter(b => b && b.slug)
  const slug = rows.length ? rows[0].slug : WORKSPACE_SLUG

  const [social, setSocial] = useState<Load<ConnectedAccount[]>>({ st: socialConfigured() ? 'loading' : 'off', v: [] })
  const [threads, setThreads] = useState<Load<ThreadsAccount | null>>({ st: threadsConfigured() ? 'loading' : 'off', v: null })
  const [bank, setBank] = useState<Load<Suggestion[]>>({ st: feedConfigured() ? 'loading' : 'off', v: [] })
  const [queue, setQueue] = useState<Load<QueuedPost[]>>({ st: feedConfigured() ? 'loading' : 'off', v: [] })
  const [busy, setBusy] = useState(false)
  /* Queue and bank filters. Both are built from what the workspace actually
     holds: a customer publishing to one platform never sees a platform
     filter, and a bank where nothing has been used yet never offers to hide
     the used ones. Choices are remembered across visits. */
  const [qf, setQf] = useState<FilterState>(() => loadFilters('content.queue'))
  const [bf, setBf] = useState<FilterState>(() => loadFilters('content.bank'))
  const setQueueFilters = (n: FilterState) => { setQf(n); saveFilters('content.queue', n) }
  const setBankFilters = (n: FilterState) => { setBf(n); saveFilters('content.bank', n) }

  const load = React.useCallback(() => {
    if (socialConfigured()) {
      listSocial().then(s => setSocial({ st: 'ready', v: s.accounts }), () => setSocial({ st: 'ready', v: [] }))
    }
    if (threadsConfigured()) {
      listThreads().then(t => setThreads({ st: 'ready', v: t }), () => setThreads({ st: 'ready', v: null }))
    }
    if (feedConfigured()) {
      listSuggestions(slug).then(s => setBank({ st: 'ready', v: s }), () => setBank({ st: 'ready', v: [] }))
      listQueue(slug).then(q => setQueue({ st: 'ready', v: q }), () => setQueue({ st: 'ready', v: [] }))
    }
  }, [slug])

  useEffect(() => { load() }, [load])

  const refresh = async () => {
    if (busy) return
    setBusy(true)
    load()
    /* The four requests are independent and none of them is slow enough to
       be worth a spinner per section, so the control settles on a fixed beat
       rather than pretending to track four promises. */
    setTimeout(() => { setBusy(false); toast('Content refreshed.') }, 600)
  }

  /* Threads is a separate connection from the Meta accounts, so the count is
     the two added together rather than either one on its own. */
  const accountCount = social.v.length + (threads.v ? 1 : 0)
  const live = bank.v.filter(s => s.state !== 'retired')
  const scheduled = queue.v.filter(q => q.state === 'queued')
  const anythingOff = social.st === 'off' && threads.st === 'off' && bank.st === 'off'

  const queueGroups: FilterGroup[] = [
    groupFrom('pf', queue.v, (p: QueuedPost) => p.platform, { label: 'Platform' }),
    groupFrom('st', queue.v, (p: QueuedPost) => p.state, {
      label: 'State',
      format: v => v.charAt(0).toUpperCase() + v.slice(1),
    }),
  ]
  const queueRows = queue.v.filter(p => matches(qf, { pf: p.platform, st: p.state }))
  const queueNarrowed = activeCount(qf, queueGroups)

  const bankGroups: FilterGroup[] = [
    groupFrom('use', live, (s: Suggestion) => (s.usedCount > 0 ? 'Used' : 'Not used yet'), { label: 'Use' }),
  ]
  const bankRows = live.filter(s => matches(bf, { use: s.usedCount > 0 ? 'Used' : 'Not used yet' }))
  const bankNarrowed = activeCount(bf, bankGroups)

  return (
    <div className="scr on">
      <Header title="Content">
        <button className="btn g" onClick={() => nav('/content/setup')}>Set up a machine</button>
        <button className="btn p" onClick={() => nav('/feed')}>Feed the engine</button>
      </Header>
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="gwrap">

          <div className="ghead">
            {/* This used to read "The engine posts every day. You feed the
                bank." Two short declaratives with a matched cadence is the
                shape of a slogan, and a slogan belongs on the site that sells
                the product, not inside the workstation somebody has already
                bought and signed into. Nobody standing in a console at nine in
                the morning needs to be sold the console.

                The three content engine screens now say what each of them
                governs, in the same shape: what the engine has to work with
                (Feed), what it writes and where it goes (here), and where it
                is allowed to post (Connections). */}
            <h1>What the engine writes, and where it goes.</h1>
            <p>Every post is drafted against the brand record you confirmed and published to
              the accounts you have connected, on a schedule you set once.</p>
          </div>

          {/* On brand means something specific, and this is where it is
              defined. The gate sits above the numbers rather than in setup,
              because the record is the thing a customer wants to change the
              moment they see what the engine is writing. */}
          <BrandGate businessSlug={slug} />

          <Section
            title="Engine"
            qualifier={anythingOff ? 'not switched on for this workspace' : 'live'}
            verbs={[
              { label: busy ? 'Refreshing' : 'Refresh', onClick: refresh, disabled: busy },
              { label: 'Schedule', onClick: () => nav('/content/setup') }
            ]}
            flush
          >
            <div className="gstats">
              <div className="gstat">
                <span className="k">Accounts connected</span>
                {/* The figure was rendered in the accent when the count was
                    zero, which put the product's primary colour on the absence
                    of a thing rather than on the thing to do about it. Orange
                    means "this is the next action" everywhere else in the app,
                    and it cannot also mean "this is empty" without meaning
                    neither. The caption underneath already says it in words. */}
                <Fig value={social.st === 'loading' ? '·' : accountCount} />
                <span className="c">{accountCount === 0 ? 'nothing can publish yet' : 'able to receive posts'}</span>
              </div>
              <div className="gstat">
                <span className="k">Creative bank</span>
                <Fig value={bank.st === 'loading' ? '·' : live.length} />
                <span className="c">{bank.st === 'off' ? 'the feed is not switched on' : 'suggestions the engine can build from'}</span>
              </div>
              <div className="gstat">
                <span className="k">Scheduled</span>
                <Fig value={queue.st === 'loading' ? '·' : scheduled.length} />
                <span className="c">posts waiting to go out</span>
              </div>
              <div className="gstat">
                <span className="k">Published</span>
                <Fig value={queue.st === 'loading' ? '·' : queue.v.filter(q => q.state === 'published').length} />
                <span className="c">recorded by the engine</span>
              </div>
            </div>
          </Section>

          <Section
            title="Accounts"
            qualifier={social.st === 'loading' ? 'loading' : accountCount + (accountCount === 1 ? ' connected' : ' connected')}
            verbs={[{ label: 'Manage connections', onClick: () => nav('/connections') }]}
            flush
          >
            <div className="glist">
              {social.v.map(a => (
                <Row key={a.platform + a.id} cols="112px minmax(0,1fr) 150px" onClick={() => nav('/connections')}>
                  <span className="m">{a.platform === 'instagram' ? 'Instagram' : 'Facebook'}</span>
                  <span className="n">{a.name || 'Connected account'}
                    {a.pageName && <span className="sub">{'via ' + a.pageName}</span>}
                    {a.problem && <span className="sub">{problemText(a.problem).title}</span>}
                  </span>
                  <Status label={a.problem ? 'Needs attention' : 'Connected'} tone={a.problem ? undefined : 'ok'} />
                </Row>
              ))}
              {threads.v && (
                <Row cols="112px minmax(0,1fr) 150px" onClick={() => nav('/connections')}>
                  <span className="m">Threads</span>
                  <span className="n">{threads.v.username ? '@' + threads.v.username : threads.v.name || 'Connected account'}</span>
                  <Status label={threads.v.problem ? 'Reconnect needed' : 'Connected'} tone={threads.v.problem ? undefined : 'ok'} />
                </Row>
              )}
              {social.st !== 'loading' && threads.st !== 'loading' && accountCount === 0 && (
                <Empty
                  title="No accounts connected."
                  body="The engine can write posts without an account, but it cannot publish one. Connecting takes a minute and can be revoked from the same screen."
                  action={{ label: 'Open connections', onClick: () => nav('/connections') }}
                />
              )}
            </div>
          </Section>

          <Section
            title="Queue"
            qualifier={queue.st === 'loading' ? 'loading'
              : scheduled.length + ' scheduled' + (queueNarrowed > 0 ? ', ' + queueRows.length + ' shown' : '')}
            verbs={[
              ...(queueNarrowed > 0 ? [{ label: 'Clear filters', onClick: () => setQueueFilters({}) }] : []),
              { label: 'Feed the engine', onClick: () => nav('/feed') },
            ]}
            flush
          >
            {queueGroups.some(g => g.options.length > 1) && (
              <div className="toolrow gtool">
                <FilterBar groups={queueGroups} state={qf} onChange={setQueueFilters} />
              </div>
            )}
            <div className="glist">
              {queueRows.slice(0, 12).map(p => (
                <Row key={p.id} cols="170px 104px minmax(0,1fr) 150px">
                  <span className="m">{slotText(p.slot)}</span>
                  <span className="m">{p.platform || 'Unassigned'}</span>
                  <span className="n">{p.layout || 'Post'}</span>
                  <Status label={queueLabel(p)} tone={queueTone(p.state)} />
                </Row>
              ))}
              {queue.st === 'off' && (
                <Empty
                  title="The queue is not switched on for this workspace."
                  body="Nothing is scheduled and nothing will publish. This is a workspace setting rather than something you can turn on from here."
                />
              )}
              {queue.st === 'ready' && queue.v.length === 0 && (
                <Empty
                  title="Nothing is scheduled."
                  body="The engine builds posts from the creative bank. Feed it a few lines and the queue fills itself on the schedule you set."
                  action={{ label: 'Feed the engine', onClick: () => nav('/feed') }}
                />
              )}
            </div>
          </Section>

          <Section
            title="Creative bank"
            qualifier={bank.st === 'loading' ? 'loading'
              : live.length + (live.length === 1 ? ' suggestion' : ' suggestions')
                + (bankNarrowed > 0 ? ', ' + bankRows.length + ' shown' : '')}
            verbs={[
              ...(bankNarrowed > 0 ? [{ label: 'Clear filters', onClick: () => setBankFilters({}) }] : []),
              { label: 'Add a suggestion', onClick: () => nav('/feed') },
            ]}
            flush
          >
            {bankGroups.some(g => g.options.length > 1) && (
              <div className="toolrow gtool">
                <FilterBar groups={bankGroups} state={bf} onChange={setBankFilters} />
              </div>
            )}
            <div className="glist">
              {bankRows.slice(0, 10).map(s => (
                <Row key={s.id} cols="minmax(0,1fr) 108px 130px" onClick={() => nav('/feed')}>
                  <span className="n">{s.line}</span>
                  <span className="m">{s.usedCount === 0 ? 'not used yet' : s.usedCount + (s.usedCount === 1 ? ' post' : ' posts')}</span>
                  <Status label={s.state === 'in_use' ? 'In use' : 'New'} tone={s.state === 'in_use' ? 'ok' : undefined} />
                </Row>
              ))}
              {bank.st === 'off' && (
                <Empty
                  title="The feed is not switched on for this workspace."
                  body="The creative bank is where the engine gets its material. Until the feed is enabled there is nothing for it to read."
                />
              )}
              {bank.st === 'ready' && live.length === 0 && (
                <Empty
                  title="The bank is empty."
                  body="One line is enough to start: something you would say to a customer who asked what you do. The engine shapes it into posts and tells you which shapes it kept."
                  action={{ label: 'Add a suggestion', onClick: () => nav('/feed') }}
                />
              )}
            </div>
          </Section>

          {/* Performance used to live here as four invented insights and two
              invented charts. The engine does not report per post reach or
              engagement to the portal yet, so the section is absent rather
              than modelled. It returns when there is a number behind it. */}

        </div>
      </div>
    </div>
  )
}
