/** The voice agent, inside the portal.
 *
 *  Three decisions worth recording, because each of them was the alternative
 *  being cheaper and worse.
 *
 *  The widget script loads here and nowhere else. It is third party JavaScript
 *  with full access to whatever page it sits on, and every other screen in this
 *  product renders a customer's revenue figures, their clients and their team.
 *  Putting the embed in index.html would have been one line and would have put
 *  that script on the analysis pages. It loads on mount, on this screen only.
 *
 *  With no agent configured this screen says so. It does not render a dead
 *  microphone button, and it does not render a fake transcript. A control that
 *  looks live and does nothing is worse than an honest empty state, and this
 *  product is sold on not overstating.
 *
 *  The agent id is public by design. ElevenLabs widgets are embedded on public
 *  marketing pages; the credential stays with them and never enters this
 *  bundle. If anyone ever proposes putting an API key in here to make a
 *  different kind of assistant work, the answer is no: this bundle is readable
 *  by anyone who opens devtools.
 *
 *  The second half of this screen is the customer's own agent. It cannot be
 *  created from here yet, because the engine has no route for it and this
 *  bundle must not hold a write scoped key. So the form raises a real ticket
 *  on the real Teams board rather than showing a button that does nothing.
 *  The day AGENT_CREATE_PATH is set, the same form posts to the engine and
 *  the ticket path retires. Nothing else about the screen changes.
 */
import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Header, QuickActions } from './simple'
import { VOICE_AGENT_ID } from '../config'
import { AgentSpec, agentCreateConfigured, createAgent, getWorkspaceId } from '../lib/api'
import { brandConfigured } from '../lib/brandApi'
import { businessLabel, useAccounts, useBusinesses, useMe } from '../lib/liveData'
import { teamApi } from '../lib/teamLive'
import { toast } from '../lib/bus'
import { MoreAgents } from './MoreAgents'

const SCRIPT = 'https://unpkg.com/@elevenlabs/convai-widget-embed'
const SCRIPT_ID = 'gt-convai-embed'

/* What the agent is briefed to help with. This list is the agent's system
   prompt in summary, so if the prompt changes this changes with it. Saying
   what it can answer is what stops somebody asking it for their revenue
   figures and concluding the product is broken when it says no. */
const ANSWERS = [
  'What the twelve constraint categories are, and how one gets chosen',
  'What severity and confidence mean, and why they are separate',
  'What a decision gate is, and what happens when one is missed',
  'How the Google Sheets add-on connects, and why nothing is uploaded',
  'What each screen in the portal is for',
  'What a run costs in credits, and where to see it'
]

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'elevenlabs-convai': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'agent-id'?: string
      }
    }
  }
}

export function Agents() {
  const [failed, setFailed] = useState(false)
  const [tab, setTab] = useState<'yours' | 'more'>('yours')
  const configured = VOICE_AGENT_ID.length > 0

  useEffect(() => {
    if (!configured) return
    if (document.getElementById(SCRIPT_ID)) return
    const s = document.createElement('script')
    s.id = SCRIPT_ID
    s.src = SCRIPT
    s.async = true
    s.type = 'text/javascript'
    /* If the embed cannot load, say so rather than leaving an empty rectangle
       where a control was promised. */
    s.onerror = () => setFailed(true)
    document.body.appendChild(s)
  }, [configured])

  return (
    <div className="scr on">
      <Header title="Agents">
        <div className="seg">
          <button className={tab === 'yours' ? 'on' : ''} onClick={() => setTab('yours')}>Yours</button>
          <button className={tab === 'more' ? 'on' : ''} onClick={() => setTab('more')}>More Agents</button>
        </div>
      </Header>
      <div className="canvas">
        <div className="wrap">
          {tab === 'yours' && (<>
          <p className="pgintro">Two kinds of agent live here. The Growth Terminal guide, which
            answers questions about the product and about this portal, and your own, which is
            briefed on one of your businesses and the analyses run against it.</p>

          <BrandFirst />

          <div className="shead" style={{ marginTop: 30 }}>
            <h2>The Growth Terminal guide</h2>
          </div>

          {!configured && (
            <div className="emptypage">
              <span className="lbl">Not connected yet</span>
              <h2>The agent is not switched on for this workspace.</h2>
              <p>Nothing is wrong. The agent is configured once, and this workspace has not had
                it done yet. When it is, this screen becomes a call button and you can talk to
                it from here.</p>
            </div>
          )}

          {configured && failed && (
            <div className="emptypage">
              <span className="lbl">Could not load</span>
              <h2>The agent did not load.</h2>
              <p>The voice agent is served by a third party and their script did not arrive.
                This says nothing about your workspace. Reloading is worth one try.</p>
              <div className="act">
                <button className="btn p" onClick={() => window.location.reload()}>Try again</button>
              </div>
            </div>
          )}

          {configured && !failed && (
            <>
              <div className="agentcard">
                <span className="lbl">Talk to it</span>
                <p className="agentnote">Press the control below to start a call. It listens,
                  answers, and stops when you do. The call runs on ElevenLabs, who ask you to
                  accept their recording terms before it connects; nothing from it is written
                  into your workspace.</p>
                <div className="agentmount">
                  <elevenlabs-convai agent-id={VOICE_AGENT_ID} />
                </div>
              </div>

              <div className="shead" style={{ marginTop: 26 }}>
                <h2>What it can answer</h2>
              </div>
              <div className="tbl">
                {ANSWERS.map(a => (
                  <div key={a} className="agentrow"><span>{a}</span></div>
                ))}
              </div>

              <p className="sfine" style={{ marginTop: 16 }}>It cannot see your workspace, so it
                does not know your figures, your clients or your team. Ask it what a screen
                means and it will tell you where to look; ask it what your severity is and it
                will say it cannot see that, which is the truthful answer.</p>
            </>
          )}

          <YourAgents />
          </>)}

          {tab === 'more' && <MoreAgents />}
        </div>
        <QuickActions />
      </div>
    </div>
  )
}

/** The brand agent, put first because the order is the product.
 *
 *  Every assistant after this one is briefed from the brand record: what the
 *  business is, who it is for, how it sounds, what it must never say. Building
 *  a lead response assistant before that record exists means asking the
 *  customer the same seven questions again, and then again for the next one,
 *  and getting a slightly different answer each time. One record, read by all
 *  of them, is the whole point.
 *
 *  So this sits above the guide rather than below it, and it says what it is
 *  for rather than only what it is.
 */
function BrandFirst() {
  return (
    <div className="agentcard">
      <span className="lbl">Start here</span>
      <h2 style={{ margin: '6px 0 0', fontSize: 18, fontWeight: 600, letterSpacing: '-.02em' }}>
        The brand agent
      </h2>
      <p className="agentnote">It reads your website and drafts a record of what your business
        is, who it is for, how it sounds and what it must never say. You correct it line by
        line, next to the sentence each line was read from. Nothing it drafts counts until you
        confirm it.</p>
      <p className="agentnote">Every assistant you build after this one is briefed from that
        record, so it is the only time you have to answer these questions.</p>
      {/* The card does not invite a click into a wall. With no brand route on
          the engine the screen behind this one can only explain itself, so
          this says that here rather than letting the customer find out by
          pressing a primary button. */}
      {brandConfigured() ? (
        <div className="act">
          <Link className="btn p" to="/agents/brand">Set up the brand agent</Link>
        </div>
      ) : (
        <>
          <p className="agentnote">It is not switched on for this workspace yet. Reading a site
            happens on the engine, and the engine does not have that route today.</p>
          <div className="act">
            <Link className="btn g" to="/agents/brand">See what it will do</Link>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ your agents */

/** What the customer's own agent would be able to do. Written as capabilities
 *  rather than promises: every line is something the analysis record already
 *  holds, so none of it depends on work that has not been done. */
const OWN_AGENT_CAN = [
  'Talk through the constraint named for a business, in plain language',
  'Explain the severity and confidence on that call, and what separates them',
  'Walk the ninety day plan phase by phase, including what each gate asks',
  'Say what the evidence against the call was, not only the evidence for it'
]

type Phase = 'idle' | 'form' | 'sending' | 'sent'

function YourAgents() {
  const nav = useNavigate()
  const accs = useAccounts()
  const businesses = useBusinesses()
  const me = useMe()
  const [phase, setPhase] = useState<Phase>('idle')

  const acc = accs && accs.length ? accs[0] : null
  const biz = businesses || []
  /* No account means the workspace has not resolved yet. Opening a form that
     cannot be submitted is worse than saying so and waiting. */
  const ready = Boolean(acc) || agentCreateConfigured()

  return (
    <>
      <div className="shead" style={{ marginTop: 30 }}>
        <h2>Your agents</h2>
      </div>

      {phase === 'sent' ? (
        <div className="emptypage wide">
          <span className="lbl">Request logged</span>
          <h2>It is on your board.</h2>
          <p>The request was written to Teams as a ticket, so everyone on the account can see it
            and it moves through the same stages as any other work. The agent appears on this
            screen once it has been built and switched on.</p>
          <div className="act">
            <button className="btn p" onClick={() => nav('/teams')}>Open Teams</button>
          </div>
        </div>
      ) : (
        <div className="emptypage wide">
          <span className="lbl">None yet</span>
          <h2>You have not set up an agent of your own.</h2>
          <p>Yours is briefed on one of your businesses and on the analyses run against it, so the
            people who need to understand a verdict can ask it out loud instead of reading the
            whole report. You say which business it may speak for, who is allowed to talk to it,
            and what it must never say.</p>
          {!ready && (
            <p style={{ marginTop: 10 }}>Your workspace is still loading. Give it a moment and the
              button turns on.</p>
          )}
          <div className="act">
            <button className="btn p" disabled={!ready} onClick={() => setPhase('form')}>
              Create your first agent
            </button>
          </div>
        </div>
      )}

      <div className="tbl" style={{ marginTop: 14 }}>
        {OWN_AGENT_CAN.map(a => (
          <div key={a} className="agentrow"><span>{a}</span></div>
        ))}
      </div>

      <p className="sfine" style={{ marginTop: 16 }}>
        {agentCreateConfigured()
          ? 'It is built against the business you pick and nothing else in your workspace.'
          : 'Agents are built by hand today rather than generated on the spot, which is why this raises a ticket instead of finishing in one click. That is the honest state of it. The engine has no route for creating one yet, and the credential that would let this browser create one itself is a credential anyone could read straight out of the page.'}
      </p>

      {(phase === 'form' || phase === 'sending') && (
        <RequestModal
          busy={phase === 'sending'}
          /* businessLabel, not b.name. An auto created business row carries the
             account identifier as its name, so printing it raw puts
             "acct-9d7211d5-4be0-428f-a8bf-4b273b13955c" in a customer facing
             picker. The helper falls back to the account name. */
          businesses={biz.map(b => ({ slug: b.slug, name: businessLabel(b.name, accs) }))}
          onClose={() => setPhase('idle')}
          onSubmit={async spec => {
            setPhase('sending')
            try {
              if (agentCreateConfigured()) {
                await createAgent(spec)
                toast('Agent created.')
                setPhase('sent')
                return
              }
              if (!acc) throw new Error('Your workspace has not finished loading.')
              await teamApi.createTicket(acc.id, {
                projectSlug: spec.businessSlug || 'general',
                title: 'Agent for ' + (spec.businessName || spec.businessSlug || 'this workspace'),
                description: ticketBody(spec),
                assignee: '',
                creatorName: (me && me.name) || 'Workspace owner'
              })
              setPhase('sent')
            } catch (e) {
              toast(e instanceof Error ? e.message : 'That did not go through.')
              setPhase('form')
            }
          }}
        />
      )}
    </>
  )
}

/** The ticket body. Headed sections rather than a paragraph, because whoever
 *  picks this up is building an agent from it and the guardrail has to be
 *  impossible to skim past. The workspace id rides along so the build does not
 *  open with someone asking which account this was. */
function ticketBody(s: AgentSpec): string {
  const ws = getWorkspaceId() || 'unknown'
  return [
    'AGENT REQUEST',
    '',
    'Business it speaks for: ' + (s.businessName || s.businessSlug || 'not specified'),
    'Business slug: ' + (s.businessSlug || 'not specified'),
    'Workspace: ' + ws,
    'Who talks to it: ' + (s.audience === 'client' ? 'The client, directly' : 'The internal team'),
    '',
    'WHAT IT IS FOR',
    s.purpose.trim() || 'Not specified.',
    '',
    'WHAT IT MUST NEVER SAY',
    s.mustNotSay.trim() || 'Nothing specified. Confirm with the requester before building.',
    '',
    'STANDING RULES FOR EVERY AGENT',
    'Never state an accuracy percentage for the engine forecasts.',
    'Never give financial or investment advice.',
    'Say so plainly when it does not know, rather than guessing.'
  ].join('\n')
}

function RequestModal({ businesses, onClose, onSubmit, busy }: {
  businesses: { slug: string; name: string }[]
  onClose: () => void
  onSubmit: (s: AgentSpec) => void
  busy: boolean
}) {
  const [slug, setSlug] = useState(businesses.length ? businesses[0].slug : '')
  const [audience, setAudience] = useState<'team' | 'client'>('team')
  const [purpose, setPurpose] = useState('')
  const [mustNot, setMustNot] = useState('')
  const picked = businesses.find(b => b.slug === slug)

  return (
    <div className="tmoverlay" onClick={busy ? undefined : onClose}>
      <div className="tmmodal" onClick={e => e.stopPropagation()}>
        <div className="tmhead">
          <span className="nm" style={{ fontSize: 15 }}>Create an agent</span>
          <span className="sp" />
          <button className="ract" onClick={onClose} disabled={busy}>Close</button>
        </div>

        <label className="rl">Business it speaks for
          <select className="tmsel" value={slug} onChange={e => setSlug(e.target.value)} disabled={busy}>
            {businesses.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            {businesses.length === 0 && <option value="">No businesses analysed yet</option>}
          </select>
        </label>

        <label className="rl">Who talks to it
          <select className="tmsel" value={audience} disabled={busy}
            onChange={e => setAudience(e.target.value as 'team' | 'client')}>
            <option value="team">My team, internally</option>
            <option value="client">The client, directly</option>
          </select>
        </label>

        <label className="rl">What it is for
          <textarea className="tminput tmarea" value={purpose} disabled={busy}
            onChange={e => setPurpose(e.target.value)}
            placeholder="Who asks it questions, and what they need answered" />
        </label>

        <label className="rl">What it must never say
          <textarea className="tminput tmarea" value={mustNot} disabled={busy}
            onChange={e => setMustNot(e.target.value)}
            placeholder="Figures, names or subjects that are off limits" />
        </label>

        <p className="tmnote">{audience === 'client'
          ? 'A client facing agent can repeat anything in the analysis out loud, including the severity and the revenue impact. Whatever should not reach them belongs in the box above.'
          : 'An internal agent still speaks the numbers out loud. Anything that should stay written down belongs in the box above.'}</p>

        <button className="btn p" disabled={busy || !slug || !purpose.trim()}
          onClick={() => onSubmit({
            businessSlug: slug,
            businessName: (picked && picked.name) || '',
            audience,
            purpose,
            mustNotSay: mustNot
          })}>
          {busy ? 'Sending' : agentCreateConfigured() ? 'Create agent' : 'Send request'}
        </button>
      </div>
    </div>
  )
}
