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
 */
import React, { useEffect, useState } from 'react'
import { Header, QuickActions } from './simple'
import { VOICE_AGENT_ID } from '../config'

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
      <Header title="Agents" />
      <div className="canvas">
        <div className="wrap">
          <p className="pgintro">A voice agent that answers questions about Growth Terminal and
            about this portal. It is here so you can ask out loud rather than read, which is
            usually faster when the question is what does this screen mean.</p>

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
        </div>
        <QuickActions />
      </div>
    </div>
  )
}
