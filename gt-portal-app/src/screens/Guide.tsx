import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

/** GUIDE.
 *
 * Customer facing only. Everything on this screen is something the person
 * reading it can do from their own account, in the order they would meet it.
 * Nothing here describes how the engine reaches a conclusion, how a plan is
 * scored, or anything that lives behind the analysis: a customer stuck on a
 * screen needs to know which button to press, not how the machine thinks.
 *
 * Written as steps rather than as features. A feature list tells somebody
 * what exists; steps tell them what to do next, which is the only thing that
 * helps when they are stuck.
 *
 * Reuses the section classes the rest of the portal already uses, so this
 * screen inherits the same surfaces and never drifts from them.
 */

type Step = { n: string; t: string; d: string }
type Topic = {
  id: string
  title: string
  blurb: string
  steps: Step[]
  note?: string
}

const TOPICS: Topic[] = [
  {
    id: 'start',
    title: 'Getting started',
    blurb: 'The whole product is one loop: get your numbers in, find what is holding growth back, decide what to do, then measure whether it worked.',
    steps: [
      { n: '1', t: 'Add your business', d: 'Open Businesses and add the company you want to look at. Everything else hangs off this, so it comes first.' },
      { n: '2', t: 'Get your numbers in', d: 'Either connect the Google Sheets add-on or drag a spreadsheet onto the screen. Both end up in the same place.' },
      { n: '3', t: 'Run an analysis', d: 'Press New analysis in the top right. It reads what you sent and names the one thing limiting growth.' },
      { n: '4', t: 'Read the result', d: 'Open the analysis. It gives you a constraint, the evidence behind it, and what would prove it wrong.' },
      { n: '5', t: 'Commit a plan', d: 'If you agree with the call, commit it. That freezes what the numbers looked like on the day, so the result can be graded later.' },
      { n: '6', t: 'Come back and measure', d: 'When the plan is due, send a fresh spreadsheet and press Measure. You get a verdict against what was promised.' }
    ],
    note: 'You can stop at any step. Nothing is lost, and an analysis you never commit stays on your Analyses list.'
  },
  {
    id: 'data',
    title: 'Getting your numbers in',
    blurb: 'There are two ways in and they produce the same result. Use whichever fits how you already work.',
    steps: [
      { n: '1', t: 'From Google Sheets', d: 'Install the add-on, open your sheet, and send it from the Growth Terminal menu. Use this if your numbers live in Sheets and change often.' },
      { n: '2', t: 'By dragging a file', d: 'Go to Imports and drop an .xlsx or .csv onto the screen. Use this for a one-off, or for an export from another system.' },
      { n: '3', t: 'Check what arrived', d: 'The screen lists every tab it read, how many rows, and any tab it skipped with the reason. Read this before running anything.' },
      { n: '4', t: 'Fix anything it flagged', d: 'If a tab was skipped for having no header row, or no numbers under the headings, fix it in your spreadsheet and send it again.' }
    ],
    note: 'An .xlsx is read more accurately than a .csv. A csv carries no cell formatting, so a percentage stored as 0.12 and one stored as 12 look identical, and a date stored as a number cannot be told apart from a quantity.'
  },
  {
    id: 'run',
    title: 'Running an analysis',
    blurb: 'An analysis looks at everything you have sent for one business and names the single biggest thing limiting growth.',
    steps: [
      { n: '1', t: 'Press New analysis', d: 'Top right of any screen. Pick the business if you have more than one.' },
      { n: '2', t: 'Wait for it to finish', d: 'It runs in the background. You can leave the screen. Overview shows anything currently running.' },
      { n: '3', t: 'Open the result', d: 'It appears at the top of Analyses. Click it to read the full result.' }
    ],
    note: 'If an analysis fails, the reason is on the row. The most common one is that no tab held a header row with numbers underneath it.'
  },
  {
    id: 'read',
    title: 'Reading an analysis',
    blurb: 'Every analysis is laid out the same way, so once you can read one you can read all of them.',
    steps: [
      { n: '1', t: 'The constraint', d: 'The single thing limiting growth right now. Not a list of problems: one thing, because fixing the wrong one costs you a quarter.' },
      { n: '2', t: 'Confidence', d: 'How sure the analysis is, between 0 and 1. Lower numbers are not a failure. They mean the evidence was thinner and you should treat the call as a lead rather than a fact.' },
      { n: '3', t: 'Evidence', d: 'The readings behind the call, including any that point the other way. Evidence against is shown as prominently as evidence for.' },
      { n: '4', t: 'What would prove this wrong', d: 'Read this one properly. It states, before you do anything, the result that would mean the analysis was mistaken. If that result happens, the call was wrong and you should change course.' },
      { n: '5', t: 'What to do about it', d: 'The recommended move and what it is expected to be worth. A modeled figure is an estimate, and it is labelled as one.' },
      { n: '6', t: 'Data limitations', d: 'What the analysis could not see: rows it did not read, columns it held back, periods that were incomplete. Always worth a look before you act on a number.' }
    ]
  },
  {
    id: 'commit',
    title: 'Committing a plan',
    blurb: 'Committing turns a recommendation into something that can be graded later. It is the difference between advice and a track record.',
    steps: [
      { n: '1', t: 'Open the analysis you agree with', d: 'Only commit a call you actually intend to act on.' },
      { n: '2', t: 'Press commit', d: 'This freezes the current numbers as the baseline and records what the plan expects to achieve, along with the date it is due.' },
      { n: '3', t: 'Do the work', d: 'The plan lists the moves, who owns them and the checkpoints along the way.' }
    ],
    note: 'A frozen baseline cannot be edited afterwards. That is deliberate: a baseline you can move is a baseline that always looks like a success.'
  },
  {
    id: 'measure',
    title: 'Measuring and getting a verdict',
    blurb: 'This is the part most tools skip. When a plan is due, you find out whether it worked.',
    steps: [
      { n: '1', t: 'Send a current spreadsheet', d: 'Same way as before, with fresh numbers covering the period since you committed.' },
      { n: '2', t: 'Press Measure', d: 'On Overview or on the plan itself. Measuring never costs a credit.' },
      { n: '3', t: 'Read the verdict', d: 'You get what was promised, what actually happened, and whether it held. A miss is reported as plainly as a hit.' }
    ],
    note: 'Overview will keep telling you a plan has never been measured until you do this. That prompt is the point of the product, not a nag.'
  },
  {
    id: 'agents',
    title: 'Spreadsheet helpers',
    blurb: 'Two small tools that work on your own spreadsheet, under Agents.',
    steps: [
      { n: '1', t: 'Formula Builder', d: 'Describe the calculation you want in plain words and it writes the formula. It checks the formula before showing it, and if a check fails it tells you why instead of handing you something broken.' },
      { n: '2', t: 'Chart Builder', d: 'Say what you want to see and it builds the chart. If two columns could both be what you meant, it asks which rather than guessing.' }
    ]
  },
  {
    id: 'teams',
    title: 'Working with other people',
    blurb: 'Under Teams. Roles are about what somebody can do to a claim, not just what they can see.',
    steps: [
      { n: '1', t: 'Invite someone', d: 'An invitation does not use a seat until it is accepted.' },
      { n: '2', t: 'Choose the role', d: 'Owner can commit plans and grade verdicts. Analyst can run analyses but not commit. Viewer can read everything, including the evidence and the limitations.' },
      { n: '3', t: 'Keep grading honest', d: 'Try not to have the same person commit a plan and grade its verdict. A second owner is the simplest way to avoid marking your own homework.' }
    ]
  },
  {
    id: 'trouble',
    title: 'When something goes wrong',
    blurb: 'The three things people hit most often, and what to do about each.',
    steps: [
      { n: '1', t: '"No analyzable sheet"', d: 'The workbook had no tab with a header row and numbers underneath it. Check the first row holds column names, and that there is at least one column of figures.' },
      { n: '2', t: 'A tab is missing from the analysis', d: 'Look at the import summary. Every skipped tab is listed with the reason, usually an empty tab or a header row with nothing under it.' },
      { n: '3', t: 'A figure looks wrong', d: 'Check the data limitations on the analysis first. Large sheets are read up to a row limit, and any total for a tab that was cut describes the part that was read.' }
    ],
    note: 'If none of these fit, the analysis screen always shows what the engine could and could not see. That is usually where the answer is.'
  }
]

export function Guide() {
  const nav = useNavigate()
  const [open, setOpen] = useState<string>('start')

  return (
    <div className="gwrap">
      <div className="ghead">
        <h1>How to use Growth Terminal.</h1>
        <p>Every part of the portal you can use, in the order you meet it. Come back here whenever you are stuck.</p>
      </div>

      {TOPICS.map(topic => {
        const isOpen = open === topic.id
        return (
          <section className="gsec" key={topic.id}>
            <div
              className="gsh"
              onClick={() => setOpen(isOpen ? '' : topic.id)}
              style={{ cursor: 'pointer' }}
            >
              <span className="t">{topic.title}</span>
              <span className="q">{topic.steps.length} steps</span>
              <span className="sp" />
              <button className="v" type="button">{isOpen ? 'Hide' : 'Show'}</button>
            </div>

            <div className="gsb flush">
              <div className="gsb">
                <p className="sfine" style={{ marginTop: 0 }}>{topic.blurb}</p>

                {isOpen && (
                  <div className="glist">
                    {topic.steps.map(s => (
                      <div className="grow" key={s.n} style={{ alignItems: 'flex-start' }}>
                        <span
                          className="n"
                          style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              flex: 'none', width: 22, height: 22, borderRadius: 6,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 11, fontWeight: 600, marginTop: 1,
                              background: 'rgba(249,115,22,.12)', color: '#C2410C'
                            }}
                          >{s.n}</span>
                          <span>
                            <strong style={{ display: 'block' }}>{s.t}</strong>
                            <span className="sfine" style={{ display: 'block', marginTop: 2 }}>{s.d}</span>
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {isOpen && topic.note && (
                  <p className="sfine" style={{ marginBottom: 0 }}>{topic.note}</p>
                )}
              </div>
            </div>
          </section>
        )
      })}

      <section className="gsec">
        <div className="gsh">
          <span className="t">Still stuck</span>
          <span className="sp" />
          <button className="v" type="button" onClick={() => nav('/analyses')}>Open Analyses</button>
        </div>
        <div className="gsb flush"><div className="gsb">
          <p className="sfine" style={{ margin: 0 }}>
            Every analysis screen carries its own evidence and its own data limitations,
            so the explanation for a specific number is usually on the analysis that
            produced it rather than in this guide.
          </p>
        </div></div>
      </section>
    </div>
  )
}
