/** The verify agent.
 *
 *  This screen used to be a catalogue of twelve agents, one per constraint,
 *  each priced. It was wrong and it is worth writing down why, because the
 *  mistake is easy to make again.
 *
 *  The analysis already diagnoses, forecasts and plans. It returns a severity
 *  with a stated confidence, root causes, evidence for and against, a twelve
 *  week plan in six phases with owners and done-when criteria, three decision
 *  gates with if-pass and if-miss routing, and a falsifier that lists what it
 *  could not see. Twelve agents that each name a weak step and price it were
 *  selling that same output back, narrower and cheaper, which makes both look
 *  worse.
 *
 *  Worse, the catalogue duplicated something the engine already does. The
 *  gates route between constraints on their own: an acquisition plan whose
 *  first gate comes back near zero tells you to stop and go to conversion. So
 *  a customer never needed twelve subscriptions to cover twelve constraints.
 *
 *  What the analysis genuinely cannot do is reach outside the spreadsheet for
 *  evidence it says it is missing, and watch a number every week for twelve
 *  weeks. Both are Verify, the fourth step of the method, and nothing does
 *  them today. That is one agent.
 *
 *  No price on this screen. The published prices are the template, Professional
 *  and Agency; this is not one of them yet, so the button raises a toast and
 *  no money moves.
 */
import React from 'react'
import { toast } from '../lib/bus'

/* What the engine asks for, and what having it changes. These are evidence
   classes the engine names in its own falsifier section, not figures. */
const EVIDENCE: [string, string][] = [
  ['Lead volume', 'Turns an unobserved acquisition stage into a demand gap you can size.'],
  ['Traffic and impressions', 'Separates a demand problem from a conversion one instead of assuming.'],
  ['Pipeline stages', 'Shows where deals stall, rather than only that they do.'],
  ['Win rate and deal size', 'Lets the plan be sized off pipeline math instead of an estimate.'],
  ['Retention and churn', 'Rules the whole retention branch in or out rather than leaving it open.']
]

const CSS = `
.vagent{--am:#FC5802;--amtint:rgba(252,88,2,.09);--amedge:rgba(252,88,2,.24)}
.vagent .macard{border:1px solid var(--border);border-radius:var(--r2);background:var(--elev);
  padding:22px 24px;overflow:hidden}
.vagent .malbl{display:block;font-size:12.5px;font-weight:500;color:var(--faint);margin-bottom:6px}
.vagent .mah{font-size:20px;font-weight:600;letter-spacing:-.018em;line-height:1.28;margin:8px 0 10px}
.vagent .malede{font-size:15px;line-height:1.55;color:var(--muted);margin:0;max-width:64ch}
.vagent .mabody{font-size:15px;line-height:1.55;margin:0;overflow-wrap:anywhere;max-width:70ch}
.vagent .maq{font-size:15px;line-height:1.55;margin:0;color:var(--am);overflow-wrap:anywhere;max-width:70ch}
.vagent .mafull{margin-top:22px}

/* What it actually does for you. Three plain sentences in the order a person
   thinks about it, before anything else on the screen. */
.vagent .madoes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;
  background:var(--border);border:1px solid var(--border);border-radius:var(--r2);
  overflow:hidden;margin-top:14px}
.vagent .madoes>div{background:var(--card);padding:16px 18px;min-width:0}
.vagent .madoes .s{display:block;font-size:12.5px;font-weight:500;color:var(--faint);margin-bottom:7px}
.vagent .madoes p{margin:0;font-size:14px;line-height:1.5;overflow-wrap:anywhere}

/* The two jobs. Side by side where there is room, because they are one job
   split in half rather than a sequence. */
.vagent .majobs{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}
.vagent .majob{border:1px solid var(--border);border-radius:var(--r2);background:var(--card);
  padding:19px 21px;min-width:0}
.vagent .majob h4{margin:6px 0 9px;font-size:16px;font-weight:600;letter-spacing:-.014em}
.vagent .majob p{margin:0;font-size:14px;line-height:1.55}
.vagent .majob p+p{margin-top:11px;color:var(--muted)}

.vagent .maev{border:1px solid var(--border);border-radius:var(--r2);background:var(--card);
  overflow:hidden;margin-top:14px}
.vagent .maev>div{display:grid;grid-template-columns:minmax(120px,190px) minmax(0,1fr);gap:18px;
  padding:13px 18px;border-bottom:1px solid var(--border);align-items:baseline}
.vagent .maev>div:last-child{border-bottom:0}
.vagent .maev .evk{font-family:var(--sans);font-size:14px;font-weight:500}
.vagent .maev .evv{font-family:var(--sans);font-size:14px;line-height:1.5;color:var(--muted);min-width:0}

.vagent .mapair{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:22px}
.vagent .mapair>div{min-width:0}

@media(max-width:820px){
  .vagent .madoes,.vagent .majobs,.vagent .mapair{grid-template-columns:1fr}
  .vagent .maev>div{grid-template-columns:1fr;gap:5px;padding:13px 15px}
}
`

export function MoreAgents() {
  return (
    <div className="vagent">
      <style>{CSS}</style>

      <p className="pgintro">The analysis diagnoses, forecasts and plans in one pass. What it cannot do is go and get
        data it does not have, or watch a number every week for twelve weeks. That is this
        agent.</p>

      <div className="shead" style={{ marginTop: 26 }}>
        <h2>The verify agent</h2>
        <span className="hint">Not live yet</span>
      </div>

      <div className="macard">
        <span className="malbl">What it is</span>
        <h3 className="mah">Close the evidence gaps, then watch the plan hold</h3>
        <p className="malede">It works on one analysis at a time. It fills in the evidence the
          engine said was missing, runs the reading again against it, and checks the indicators
          every week until the twelve weeks are up.</p>

        <div className="mafull">
          <span className="malbl">What it actually does for you</span>
          <div className="madoes">
            <div>
              <span className="s">You give it</span>
              <p>A connection to wherever your numbers already live, and one analysis you have run.</p>
            </div>
            <div>
              <span className="s">It works out</span>
              <p>Which of the missing pieces it can now fill, and whether the plan is still on the line the engine drew.</p>
            </div>
            <div>
              <span className="s">You get back</span>
              <p>The reading re-run on real evidence, and a weekly note the moment something drifts.</p>
            </div>
          </div>
        </div>

        <div className="majobs">
          <div className="majob">
            <span className="malbl">Job one</span>
            <h4>Close the evidence gaps</h4>
            <p>Every analysis prints what it could not see. A reading built on absent data is
              capped at medium confidence, and the engine says so in plain words rather than
              hiding it.</p>
            <p>The agent goes to where those numbers already live, fills what it can, and runs
              the analysis again. Same engine, better evidence, a call you can defend in front
              of a client.</p>
          </div>
          <div className="majob">
            <span className="malbl">Job two</span>
            <h4>Watch the plan hold</h4>
            <p>The engine sets indicators with targets and directions, and gates that say what
              to do if the reading turns out to be wrong. Nothing checks them today.</p>
            <p>A gate that says stop building demand if the gap comes back near zero is only
              worth something if somebody is measuring the gap. The agent measures it, weekly,
              and tells you the moment a gate trips.</p>
          </div>
        </div>

        <div className="mafull">
          <span className="malbl">The evidence it goes after</span>
          <div className="maev">
            {EVIDENCE.map(([k, v]) => (
              <div key={k}>
                <span className="evk">{k}</span>
                <span className="evv">{v}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mafull">
          <span className="malbl">What would prove this wrong</span>
          <p className="maq">It earns its place when the falsifier section is a list, not when
                               it is empty.</p>
        </div>

        <div className="mapair">
          <div>
            <span className="malbl">What it needs</span>
            <p className="mabody">A connection to wherever the missing numbers live, and at least
              one completed analysis to work against. With no analysis it has no indicators to
              watch and nothing to re-run.</p>
          </div>
          <div>
            <span className="malbl">What it will not do</span>
            <p className="mabody">Change your plan, commit a week on your behalf, or
                                    re-diagnose on its own. It brings evidence and it reports
                                    drift.</p>
          </div>
        </div>

        <div className="act" style={{ marginTop: 26 }}>
          <button
            className="btn p"
            style={{ background: 'var(--am)' }}
            onClick={() => toast('The verify agent is not live yet. This screen is what it will do.')}
          >Add the verify agent</button>
        </div>
      </div>
    </div>
  )
}
