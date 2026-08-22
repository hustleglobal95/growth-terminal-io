/** The rest of the agents, as a catalogue.
 *
 *  Three decisions worth recording.
 *
 *  Growth breaks in twelve places and this product has always said so. The
 *  catalogue is that same list, in the same order, so a customer who has read
 *  a diagnosis recognises it immediately. Ordering it by price, or by what we
 *  would rather sell, would quietly teach them the order does not mean
 *  anything.
 *
 *  Every agent states what it will not do, next to what it costs. That is not
 *  modesty. A customer who buys the conversion agent expecting it to watch
 *  their funnel overnight has been mis-sold by omission, and the refund costs
 *  more than the sale was worth.
 *
 *  Nothing here can be bought yet. The button raises a toast and no money
 *  moves, because billing is a separate change and a control that looks live
 *  and takes a card without a subscription behind it is the worst possible
 *  version of this screen. The figures are sample data and say so on the
 *  screen, not in a comment.
 */
import React, { useState } from 'react'
import { toast } from '../lib/bus'

type Agent = {
  n: number
  name: string
  soon?: boolean
  mine?: boolean
  owned?: boolean
  price: number
  title: string
  lede: string
  funnel: [string, number][]
  weak: string
  worth: string
  falsifier: string
  needs: string
  wont: string
}

/* The twelve, in the order growth actually breaks. Two are not built and say
   so rather than being quietly omitted, because a customer counting the list
   against their diagnosis will notice a gap and wonder what else is missing. */
const AGENTS: Agent[] = [
  {
    n: 1, name: 'Acquisition', owned: true, price: 49,
    title: 'Find the channel paying for itself, and the ones being carried',
    lede: 'It works on acquisition and nothing else. One channel named, its real cost per customer, and what to stop.',
    funnel: [['Sessions', 12800], ['Leads', 940], ['Qualified', 318], ['Won', 61]],
    weak: 'Paid search. It brings a third of the leads and two thirds of the cost.',
    worth: 'Moving that spend to referral is worth between 22,000 and 40,000 a year at this volume.',
    falsifier: 'If referral only converts because those people arrived warm, moving budget there buys you nothing.',
    needs: 'Spend and outcomes by channel for two periods. Without spend it can rank channels but not price them.',
    wont: 'Change your budgets, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 2, name: 'Activation', price: 49,
    title: 'Find where new signups stop, and what it costs you',
    lede: 'It works on activation and nothing else. One step named, priced, and a short list of changes in the order to make them.',
    funnel: [['Signups', 2604], ['Set up', 1782], ['First value', 890], ['Habit', 402]],
    weak: 'First value. Half of the people who finish setup never reach it.',
    worth: 'Closing half that gap is worth between 14,000 and 26,000 a year at this volume.',
    falsifier: 'If the people who skip first value come back within a month anyway, this is a timing artefact and not a leak.',
    needs: 'Step counts for two periods. With one period it can name the weak step but not tell you it got worse.',
    wont: 'Make the changes for you, or watch the funnel while you are away. You run it when you want a reading.'
  },
  {
    n: 3, name: 'Retention', price: 49,
    title: 'Find the month people leave, and what holding them is worth',
    lede: 'It works on retention and nothing else. One cohort named, priced, and what the people who stayed did differently.',
    funnel: [['Month one', 1431], ['Month two', 1044], ['Month three', 806], ['Month six', 519]],
    weak: 'Month two. Twenty seven of every hundred leave before it ends.',
    worth: 'Holding a third of them is worth between 31,000 and 52,000 a year at this volume.',
    falsifier: 'If month two churn is concentrated in one bad cohort, this is an intake problem and not a retention one.',
    needs: 'Cohorts by start month, for at least six months. Shorter than that and it cannot see the shape.',
    wont: 'Contact anybody, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 4, name: 'Conversion', mine: true, price: 49,
    title: 'Find the step losing you the most money, and what it is worth',
    lede: 'It works on conversion and nothing else. One step named, priced, and a short list of changes in the order to make them.',
    funnel: [['Visitors', 8410], ['Signups', 2604], ['Trials', 1431], ['Paid', 157]],
    weak: 'Trial to paid. Eleven of every hundred trials convert. Three months ago it was nineteen.',
    worth: 'Getting back to nineteen is worth between 18,000 and 31,000 a year at this traffic.',
    falsifier: 'If those trials now arrive from a different source than they did three months ago, this is a traffic problem wearing a conversion costume.',
    needs: 'Step counts for two periods. With one period it can name the weak step but not tell you it got worse.',
    wont: 'Make the changes for you, or watch the funnel while you are away. You run it when you want a reading.'
  },
  {
    n: 5, name: 'Traffic', price: 49,
    title: 'Find whether you have a traffic problem at all',
    lede: 'It works on traffic and nothing else. Volume, mix, and whether the shape of who arrives has changed.',
    funnel: [['Direct', 3120], ['Organic', 2890], ['Referral', 1480], ['Paid', 920]],
    weak: 'Organic. Down a fifth since the spring while everything else held.',
    worth: 'Recovering it is worth between 9,000 and 17,000 a year at your current conversion.',
    falsifier: 'If organic fell but revenue did not, that traffic was never worth anything and this is not your constraint.',
    needs: 'Sessions by source for two periods. Without the source split it can only see the total.',
    wont: 'Publish anything, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 6, name: 'Offer', owned: true, price: 49,
    title: 'Find whether the offer or the audience is the mismatch',
    lede: 'It works on the offer and nothing else. Which segment says yes, which says no, and what the no is actually about.',
    funnel: [['Saw offer', 4210], ['Started', 1620], ['Reached price', 740], ['Bought', 198]],
    weak: 'Reached price to bought. Three quarters walk at the price screen.',
    worth: 'Recovering a quarter of them is worth between 24,000 and 38,000 a year.',
    falsifier: 'If the people who walk never used the product first, they are not rejecting the price, they are rejecting the unknown.',
    needs: 'Outcomes split by segment. Without the split it cannot tell an offer problem from an audience one.',
    wont: 'Change your pricing, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 7, name: 'Capacity', price: 49,
    title: 'Find whether you can serve what you are already selling',
    lede: 'It works on capacity and nothing else. What you can deliver, what you promised, and where the two part company.',
    funnel: [['Sold', 312], ['Started', 298], ['On time', 201], ['Late', 97]],
    weak: 'On time delivery. Thirty one of every hundred jobs run past the date you gave.',
    worth: 'Closing that is worth between 19,000 and 34,000 a year in retained work.',
    falsifier: 'If late jobs renew at the same rate as on time ones, lateness is annoying your team and not your customers.',
    needs: 'Promised and actual dates per job. Without both it can count jobs but not lateness.',
    wont: 'Reschedule anything, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 8, name: 'Churn', price: 49,
    title: 'Find who leaves, and whether you could have seen it coming',
    lede: 'It works on churn and nothing else. Which accounts go, what they did first, and how much warning there was.',
    funnel: [['Active', 806], ['At risk', 214], ['Lapsed', 131], ['Gone', 88]],
    weak: 'At risk to lapsed. Six in ten of the accounts that go quiet never come back.',
    worth: 'Reaching half of them in time is worth between 27,000 and 46,000 a year.',
    falsifier: 'If quiet accounts churn at the same rate as active ones, quietness is not a signal and this warning is noise.',
    needs: 'Account level activity over time. Totals alone cannot tell you who went quiet.',
    wont: 'Email anybody, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 9, name: 'Fulfilment', soon: true, price: 49,
    title: '', lede: '', funnel: [], weak: '', worth: '', falsifier: '', needs: '', wont: ''
  },
  {
    n: 10, name: 'Cash collection', price: 49,
    title: 'Find the money you have earned and not been paid',
    lede: 'It works on collection and nothing else. What is outstanding, how old it is, and which of it is at real risk.',
    funnel: [['Invoiced', 420], ['Paid on time', 248], ['Late', 134], ['At risk', 38]],
    weak: 'Sixty to ninety days. A third of what is late sits in that band and stalls there.',
    worth: 'Pulling that band forward is worth between 12,000 and 21,000 in working capital.',
    falsifier: 'If the same clients are always late and always pay, this is a cash timing problem and not a risk one.',
    needs: 'Invoice dates, due dates, and payment dates. Without due dates it cannot tell late from recent.',
    wont: 'Chase anybody, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 11, name: 'Utilisation', soon: true, price: 49,
    title: '', lede: '', funnel: [], weak: '', worth: '', falsifier: '', needs: '', wont: ''
  },
  {
    n: 12, name: 'Pricing', price: 49,
    title: 'Find whether your price is leaving money on the table',
    lede: 'It works on pricing and nothing else. What people pay, what they nearly paid, and where the resistance actually sits.',
    funnel: [['Quoted', 680], ['Negotiated', 412], ['Discounted', 287], ['Full price', 125]],
    weak: 'Discounting. Seven in ten closed deals gave something away.',
    worth: 'Halving the average discount is worth between 33,000 and 58,000 a year.',
    falsifier: 'If discounted deals renew at a higher rate, the discount is buying retention and cutting it costs you more than it saves.',
    needs: 'Quoted and final amounts per deal. Without the quote it cannot see what was conceded.',
    wont: 'Change a price, or run while you are away. You run it when you want a reading.'
  }
]

const num = (n: number) => n.toLocaleString('en-GB')

export function MoreAgents() {
  const [openN, setOpenN] = useState<number>(4)
  const open = AGENTS.find(a => a.n === openN) || AGENTS[3]

  const owned = AGENTS.filter(a => a.owned)
  const monthly = owned.reduce((s, a) => s + a.price, 0)

  const top = open.funnel.length ? Math.max(...open.funnel.map(r => r[1])) : 1

  return (
    <>
      <p className="pgintro">Growth gets stuck in twelve places, and there is an agent for each of
        them. One constraint each, so the answer is one thing you can act on rather than a report.
        You already have {owned.length === 1 ? 'one' : owned.length === 2 ? 'two' : String(owned.length)},
        at {num(monthly)} a month.</p>

      <div className="shead" style={{ marginTop: 26 }}>
        <h2>The twelve</h2>
        <span className="hint">Your diagnosis put you at number {open.n === 4 ? '4' : '4'}</span>
      </div>

      <div className="tbl">
        {AGENTS.map(a => (
          <div
            key={a.n}
            className={'rrow' + (a.mine ? ' win' : '')}
            role={a.soon ? undefined : 'button'}
            tabIndex={a.soon ? undefined : 0}
            onClick={a.soon ? undefined : () => setOpenN(a.n)}
            onKeyDown={a.soon ? undefined : e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenN(a.n) } }}
            style={{
              cursor: a.soon ? 'default' : 'pointer',
              opacity: a.soon ? .55 : 1,
              background: a.n === openN && !a.soon ? 'var(--s2)' : undefined
            }}
          >
            <span className="i">{a.n}</span>
            <span className="nm">{a.name}</span>
            <span className="bar"><i style={{ width: `${(a.n / 12) * 100}%` }} /></span>
            <span className="sc">
              {a.soon ? 'Soon' : a.owned ? 'Added' : a.mine ? 'Yours' : num(a.price)}
            </span>
          </div>
        ))}
      </div>

      {!open.soon && (
        <>
          <div className="shead" style={{ marginTop: 34 }}>
            <h2>{open.name} agent</h2>
            <span className="hint">{open.n} of 12</span>
          </div>

          <div className="card">
            <span className="lbl">What it finds</span>
            <h3 style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-.015em', margin: '8px 0 10px' }}>
              {open.title}
            </h3>
            <p style={{ color: 'var(--muted)', margin: 0, maxWidth: '62ch' }}>{open.lede}</p>

            <div className="shead" style={{ marginTop: 26, marginBottom: 12 }}>
              <span className="lbl">A run on sample figures</span>
              <span className="hint">Sample data, not your workspace</span>
            </div>

            <div className="tbl">
              {open.funnel.map((r, i) => (
                <div key={r[0]} className={'rrow' + (i === open.funnel.length - 1 ? ' win' : '')}>
                  <span className="i" />
                  <span className="nm">{r[0]}</span>
                  <span className="bar"><i style={{ width: `${Math.max(1.5, (r[1] / top) * 100)}%` }} /></span>
                  <span className="sc">{num(r[1])}</span>
                </div>
              ))}
            </div>

            <div className="rmeta" style={{ marginTop: 22 }}>
              <div style={{ flex: '1 1 260px' }}>
                <span className="lbl">Weakest step</span>
                <span className="v">{open.weak}</span>
              </div>
            </div>

            <div className="stakes">
              <div className="stake key">
                <span className="lbl">What the fix is worth</span>
                <span className="v">{open.worth.match(/[\d,]+ and [\d,]+/)?.[0].replace(' and ', ' to ') || ''}</span>
                <span className="n">{open.worth}</span>
              </div>
              <div className="stake">
                <span className="lbl">What it costs</span>
                <span className="v">{num(open.price)} a month</span>
                <span className="n">Cancel any time. Your analyses stay.</span>
              </div>
            </div>

            <div className="rmeta" style={{ marginTop: 22 }}>
              <div style={{ flex: '1 1 100%' }}>
                <span className="lbl">What would prove this wrong</span>
                <span className="v" style={{ color: 'var(--amber)' }}>{open.falsifier}</span>
              </div>
            </div>

            <div className="rmeta" style={{ marginTop: 18 }}>
              <div style={{ flex: '1 1 260px' }}>
                <span className="lbl">What it needs</span>
                <span className="v">{open.needs}</span>
              </div>
              <div style={{ flex: '1 1 260px' }}>
                <span className="lbl">What it will not do</span>
                <span className="v">{open.wont}</span>
              </div>
            </div>

            <div className="act" style={{ marginTop: 24 }}>
              {open.owned
                ? <button className="btn g" disabled>Already added</button>
                : <button
                    className="btn p"
                    onClick={() => toast('Agents cannot be added yet. This screen is the catalogue; billing comes next.')}
                  >Add this agent</button>}
            </div>
          </div>
        </>
      )}

      {open.soon && (
        <div className="emptypage" style={{ marginTop: 30 }}>
          <span className="lbl">Not built yet</span>
          <h2>The {open.name.toLowerCase()} agent is not ready.</h2>
          <p>It is on the list because growth genuinely breaks here, and leaving it out would make
            the twelve look like eleven. There is nothing to buy and nothing to try yet.</p>
        </div>
      )}
    </>
  )
}
