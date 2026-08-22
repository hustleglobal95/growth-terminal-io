/** The rest of the agents, as a catalogue.
 *
 *  Four decisions worth recording.
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
 *  The highlighted row is the one the reading names, not the last one. On a
 *  funnel those are the same row and the difference never shows. On a channel
 *  breakdown they are not, and marking the bottom row taught the eye that the
 *  smallest number was the problem, which is the opposite of true.
 *
 *  The twelve are behind a picker rather than laid out. Twelve rows is a
 *  screenful before the reading starts, and the reading is the thing worth
 *  reading. The picker still carries the ordinal, the price and the two that
 *  are not built, so nothing that was visible in the list is lost by closing
 *  it.
 *
 *  Nothing here can be bought yet. The button raises a toast and no money
 *  moves, because billing is a separate change and a control that looks live
 *  and takes a card without a subscription behind it is the worst possible
 *  version of this screen. The figures are sample data and say so on the
 *  screen, not in a comment.
 */
import React, { useEffect, useRef, useState } from 'react'
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
  /* Which row the reading is about. On a funnel it is the last one; on a
     breakdown it is whichever channel the weak line names. */
  markRow: number
  weak: string
  worth: string
  worthRange: string
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
    funnel: [['Sessions', 12800], ['Leads', 940], ['Qualified', 318], ['Won', 61]], markRow: 3,
    weak: 'Paid search. It brings a third of the leads and two thirds of the cost.',
    worthRange: '$22,000 to $40,000',
    worth: 'Moving that spend to referral is worth between $22,000 and $40,000 a year at this volume.',
    falsifier: 'If referral only converts because those people arrived warm, moving budget there buys you nothing.',
    needs: 'Spend and outcomes by channel for two periods. Without spend it can rank channels but not price them.',
    wont: 'Change your budgets, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 2, name: 'Activation', price: 49,
    title: 'Find where new signups stop, and what it costs you',
    lede: 'It works on activation and nothing else. One step named, priced, and a short list of changes in the order to make them.',
    funnel: [['Signups', 2604], ['Set up', 1782], ['First value', 890], ['Habit', 402]], markRow: 2,
    weak: 'First value. Half of the people who finish setup never reach it.',
    worthRange: '$14,000 to $26,000',
    worth: 'Closing half that gap is worth between $14,000 and $26,000 a year at this volume.',
    falsifier: 'If the people who skip first value come back within a month anyway, this is a timing artefact and not a leak.',
    needs: 'Step counts for two periods. With one period it can name the weak step but not tell you it got worse.',
    wont: 'Make the changes for you, or watch the funnel while you are away. You run it when you want a reading.'
  },
  {
    n: 3, name: 'Retention', price: 49,
    title: 'Find the month people leave, and what holding them is worth',
    lede: 'It works on retention and nothing else. One cohort named, priced, and what the people who stayed did differently.',
    funnel: [['Month one', 1431], ['Month two', 1044], ['Month three', 806], ['Month six', 519]], markRow: 1,
    weak: 'Month two. Twenty seven of every hundred leave before it ends.',
    worthRange: '$31,000 to $52,000',
    worth: 'Holding a third of them is worth between $31,000 and $52,000 a year at this volume.',
    falsifier: 'If month two churn is concentrated in one bad cohort, this is an intake problem and not a retention one.',
    needs: 'Cohorts by start month, for at least six months. Shorter than that and it cannot see the shape.',
    wont: 'Contact anybody, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 4, name: 'Conversion', mine: true, price: 49,
    title: 'Find the step losing you the most money, and what it is worth',
    lede: 'It works on conversion and nothing else. One step named, priced, and a short list of changes in the order to make them.',
    funnel: [['Visitors', 8410], ['Signups', 2604], ['Trials', 1431], ['Paid', 157]], markRow: 3,
    weak: 'Trial to paid. Eleven of every hundred trials convert. Three months ago it was nineteen.',
    worthRange: '$18,000 to $31,000',
    worth: 'Getting back to nineteen is worth between $18,000 and $31,000 a year at this traffic.',
    falsifier: 'If those trials now arrive from a different source than they did three months ago, this is a traffic problem wearing a conversion costume.',
    needs: 'Step counts for two periods. With one period it can name the weak step but not tell you it got worse.',
    wont: 'Make the changes for you, or watch the funnel while you are away. You run it when you want a reading.'
  },
  {
    n: 5, name: 'Traffic', price: 49,
    title: 'Find whether you have a traffic problem at all',
    lede: 'It works on traffic and nothing else. Volume, mix, and whether the shape of who arrives has changed.',
    funnel: [['Direct', 3120], ['Organic', 2890], ['Referral', 1480], ['Paid', 920]], markRow: 1,
    weak: 'Organic. Down a fifth since the spring while everything else held.',
    worthRange: '$9,000 to $17,000',
    worth: 'Recovering it is worth between $9,000 and $17,000 a year at your current conversion.',
    falsifier: 'If organic fell but revenue did not, that traffic was never worth anything and this is not your constraint.',
    needs: 'Sessions by source for two periods. Without the source split it can only see the total.',
    wont: 'Publish anything, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 6, name: 'Offer', owned: true, price: 49,
    title: 'Find whether the offer or the audience is the mismatch',
    lede: 'It works on the offer and nothing else. Which segment says yes, which says no, and what the no is actually about.',
    funnel: [['Saw offer', 4210], ['Started', 1620], ['Reached price', 740], ['Bought', 198]], markRow: 3,
    weak: 'Reached price to bought. Three quarters walk at the price screen.',
    worthRange: '$24,000 to $38,000',
    worth: 'Recovering a quarter of them is worth between $24,000 and $38,000 a year.',
    falsifier: 'If the people who walk never used the product first, they are not rejecting the price, they are rejecting the unknown.',
    needs: 'Outcomes split by segment. Without the split it cannot tell an offer problem from an audience one.',
    wont: 'Change your pricing, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 7, name: 'Capacity', price: 49,
    title: 'Find whether you can serve what you are already selling',
    lede: 'It works on capacity and nothing else. What you can deliver, what you promised, and where the two part company.',
    funnel: [['Sold', 312], ['Started', 298], ['On time', 201], ['Late', 97]], markRow: 3,
    weak: 'On time delivery. Thirty one of every hundred jobs run past the date you gave.',
    worthRange: '$19,000 to $34,000',
    worth: 'Closing that is worth between $19,000 and $34,000 a year in retained work.',
    falsifier: 'If late jobs renew at the same rate as on time ones, lateness is annoying your team and not your customers.',
    needs: 'Promised and actual dates per job. Without both it can count jobs but not lateness.',
    wont: 'Reschedule anything, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 8, name: 'Churn', price: 49,
    title: 'Find who leaves, and whether you could have seen it coming',
    lede: 'It works on churn and nothing else. Which accounts go, what they did first, and how much warning there was.',
    funnel: [['Active', 806], ['At risk', 214], ['Lapsed', 131], ['Gone', 88]], markRow: 2,
    weak: 'At risk to lapsed. Six in ten of the accounts that go quiet never come back.',
    worthRange: '$27,000 to $46,000',
    worth: 'Reaching half of them in time is worth between $27,000 and $46,000 a year.',
    falsifier: 'If quiet accounts churn at the same rate as active ones, quietness is not a signal and this warning is noise.',
    needs: 'Account level activity over time. Totals alone cannot tell you who went quiet.',
    wont: 'Email anybody, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 9, name: 'Fulfilment', soon: true, price: 49,
    title: '', lede: '', funnel: [], markRow: 0, weak: '', worth: '', worthRange: '', falsifier: '', needs: '', wont: ''
  },
  {
    n: 10, name: 'Cash collection', price: 49,
    title: 'Find the money you have earned and not been paid',
    lede: 'It works on collection and nothing else. What is outstanding, how old it is, and which of it is at real risk.',
    funnel: [['Invoiced', 420], ['Paid on time', 248], ['Late', 134], ['At risk', 38]], markRow: 2,
    weak: 'Sixty to ninety days. A third of what is late sits in that band and stalls there.',
    worthRange: '$12,000 to $21,000',
    worth: 'Pulling that band forward is worth between $12,000 and $21,000 in working capital.',
    falsifier: 'If the same clients are always late and always pay, this is a cash timing problem and not a risk one.',
    needs: 'Invoice dates, due dates, and payment dates. Without due dates it cannot tell late from recent.',
    wont: 'Chase anybody, or run while you are away. You run it when you want a reading.'
  },
  {
    n: 11, name: 'Utilisation', soon: true, price: 49,
    title: '', lede: '', funnel: [], markRow: 0, weak: '', worth: '', worthRange: '', falsifier: '', needs: '', wont: ''
  },
  {
    n: 12, name: 'Pricing', price: 49,
    title: 'Find whether your price is leaving money on the table',
    lede: 'It works on pricing and nothing else. What people pay, what they nearly paid, and where the resistance actually sits.',
    funnel: [['Quoted', 680], ['Negotiated', 412], ['Discounted', 287], ['Full price', 125]], markRow: 2,
    weak: 'Discounting. Seven in ten closed deals gave something away.',
    worthRange: '$33,000 to $58,000',
    worth: 'Halving the average discount is worth between $33,000 and $58,000 a year.',
    falsifier: 'If discounted deals renew at a higher rate, the discount is buying retention and cutting it costs you more than it saves.',
    needs: 'Quoted and final amounts per deal. Without the quote it cannot see what was conceded.',
    wont: 'Change a price, or run while you are away. You run it when you want a reading.'
  }
]

const usd = (n: number) => '$' + n.toLocaleString('en-GB')
const num = (n: number) => n.toLocaleString('en-GB')
const WORD = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven']

/* Scoped rather than added to portal.css. The accent here is the logo amber,
   which the rest of the portal does not use yet, and the row grid is its own
   thing: the shared .rrow has a fixed 54px value column that clipped five
   figure numbers and pushed the right hand labels off the screen. Keeping it
   local means this screen can be deleted in one file. */
const CSS = `
.magents{--am:#FC5802;--amtint:rgba(252,88,2,.09);--amedge:rgba(252,88,2,.24)}
.magents .marow{display:grid;grid-template-columns:minmax(0,1fr) minmax(80px,190px) 84px;
  gap:18px;align-items:center;padding:14px 18px;border-bottom:1px solid var(--border);
  width:100%;text-align:left}
.magents .marow:last-child{border-bottom:0}
.magents .marow .i{font-size:13px;color:var(--faint);font-variant-numeric:tabular-nums}
.magents .marow .nm{font-size:14.5px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.magents .marow .bar{height:6px;border-radius:2px;background:var(--border);overflow:hidden}
.magents .marow .bar i{display:block;height:100%;background:var(--border2)}
.magents .marow .sc{font-size:14px;font-weight:500;font-variant-numeric:tabular-nums;
  color:var(--muted);text-align:right;white-space:nowrap}
.magents .marow.mark .nm{font-weight:600}
.magents .marow.mark .bar i{background:var(--am)}
.magents .marow.mark .sc{color:var(--am)}
.magents .malbl{display:block;font-size:12.5px;font-weight:500;color:var(--faint);margin-bottom:6px}
.magents .mabody{font-size:15px;line-height:1.55;margin:0;overflow-wrap:anywhere}
.magents .maq{font-size:15px;line-height:1.55;margin:0;color:var(--am);overflow-wrap:anywhere}
.magents .macard{border:1px solid var(--border);border-radius:var(--r2);background:var(--elev);
  padding:22px 24px;overflow:hidden}
.magents .mah{font-size:20px;font-weight:600;letter-spacing:-.018em;line-height:1.28;margin:8px 0 10px}
.magents .malede{font-size:15px;line-height:1.55;color:var(--muted);margin:0;max-width:64ch}
.magents .mastakes{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:22px}
.magents .mastake{padding:18px 20px;border-radius:var(--r2);border:1px solid var(--border);min-width:0}
.magents .mastake.key{border-color:var(--amedge);background:var(--amtint)}
.magents .mastake .v{display:block;margin-top:8px;font-size:23px;font-weight:600;letter-spacing:-.02em;
  font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.magents .mastake.key .v{color:var(--am)}
.magents .mastake .n{display:block;margin-top:7px;color:var(--muted);font-size:13.5px;line-height:1.5}
.magents .mapair{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:22px}
.magents .mapair>div{min-width:0}
.magents .mafull{margin-top:22px}
.magents .maruncap{display:flex;align-items:baseline;gap:14px;margin:26px 0 12px}
.magents .maruncap .hint{margin-left:auto;font-size:12.5px;color:var(--faint);white-space:nowrap}

/* The picker. A menu that sits over the reading rather than pushing it down,
   so choosing an agent costs no vertical space at all. */
.magents .masel{position:relative;max-width:460px;margin-bottom:4px}
.magents .matrig{display:grid;grid-template-columns:22px minmax(0,1fr) auto 10px;gap:13px;
  align-items:center;width:100%;padding:13px 16px;border:1px solid var(--border2);
  border-radius:var(--r2);background:var(--card);box-shadow:var(--shadow-sm);
  font:inherit;color:inherit;text-align:left;cursor:pointer;
  transition:background .18s var(--ease),border-color .18s var(--ease)}
.magents .matrig:hover{background:var(--s2)}
.magents .matrig:focus-visible{outline:2px solid var(--am);outline-offset:2px}
.magents .matrig .chev{width:8px;height:8px;border-right:1.5px solid var(--faint);
  border-bottom:1.5px solid var(--faint);transform:rotate(45deg) translate(-2px,-2px);
  transition:transform .22s var(--ease)}
.magents .matrig[aria-expanded="true"] .chev{transform:rotate(225deg) translate(-2px,-2px)}
.magents .mamenu{position:absolute;z-index:60;top:calc(100% + 7px);left:0;right:0;
  border:1px solid var(--border2);border-radius:var(--r2);background:var(--card);
  box-shadow:var(--lift-2);max-height:min(72vh,580px);overflow-y:auto;padding:5px}
.magents .maopt{display:grid;grid-template-columns:22px minmax(0,1fr) auto;gap:13px;
  align-items:center;width:100%;padding:10px 11px;border:0;border-radius:var(--r3);
  background:none;font:inherit;color:inherit;text-align:left;cursor:pointer}
.magents .maopt:hover:not(:disabled){background:var(--s2)}
.magents .maopt:focus-visible{outline:2px solid var(--am);outline-offset:-2px}
.magents .maopt[aria-selected="true"]{background:var(--s2)}
.magents .maopt:disabled{opacity:.5;cursor:default}
.magents .maopt.mark .nm{font-weight:600}
.magents .maopt.mark .sc{color:var(--am)}
@media(max-width:820px){
  .magents .mastakes,.magents .mapair{grid-template-columns:1fr}
  .magents .masel{max-width:none}
  .magents .matrig,.magents .maopt{gap:11px}
  .magents .marow{grid-template-columns:minmax(0,1fr) 72px;gap:12px;padding:13px 14px}
  .magents .marow .bar{display:none}
  .magents .maruncap{flex-wrap:wrap;gap:6px}
  .magents .maruncap .hint{margin-left:0;width:100%}
}
`

export function MoreAgents() {
  const [openN, setOpenN] = useState<number>(4)
  const [listOpen, setListOpen] = useState(false)
  const box = useRef<HTMLDivElement | null>(null)
  const trig = useRef<HTMLButtonElement | null>(null)
  const menu = useRef<HTMLDivElement | null>(null)
  const open = AGENTS.find(a => a.n === openN) || AGENTS[3]

  /* A menu that stays open after you have clicked past it is a bug people
     blame on the page, not on the menu. */
  useEffect(() => {
    if (!listOpen) return
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setListOpen(false)
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setListOpen(false); trig.current?.focus() }
    }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', away)
      document.removeEventListener('keydown', key)
    }
  }, [listOpen])

  /* Open on the row you are already on, so the list starts where the eye is. */
  useEffect(() => {
    if (!listOpen) return
    menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
  }, [listOpen])

  const arrows = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const all = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('.maopt:not(:disabled)') || [])
    if (!all.length) return
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const to = e.key === 'ArrowDown' ? at + 1 : at - 1
    all[(to + all.length) % all.length].focus()
  }

  const badge = (a: Agent) => (a.soon ? 'Soon' : a.owned ? 'Added' : a.mine ? 'Yours' : usd(a.price))

  const owned = AGENTS.filter(a => a.owned)
  const monthly = owned.reduce((s, a) => s + a.price, 0)
  const mine = AGENTS.find(a => a.mine)

  const top = open.funnel.length ? Math.max(...open.funnel.map(r => r[1])) : 1

  return (
    <div className="magents">
      <style>{CSS}</style>

      <p className="pgintro">Growth gets stuck in twelve places, and there is an agent for each of
        them. One constraint each, so what comes back is one thing you can act on rather than a
        report. You have {WORD[owned.length] || owned.length} of them, at {usd(monthly)} a month.</p>

      <div className="shead" style={{ marginTop: 26 }}>
        <h2>The twelve</h2>
        {mine && <span className="hint">Your diagnosis put you at number {mine.n}</span>}
      </div>

      <div className="masel" ref={box}>
        <button
          ref={trig}
          type="button"
          className="matrig"
          aria-haspopup="listbox"
          aria-expanded={listOpen}
          onClick={() => setListOpen(v => !v)}
          onKeyDown={e => { if (e.key === 'ArrowDown' && !listOpen) { e.preventDefault(); setListOpen(true) } }}
        >
          <span className="i">{open.n}</span>
          <span className="nm">{open.name} agent</span>
          <span className="sc">{badge(open)}</span>
          <span className="chev" aria-hidden="true" />
        </button>

        {listOpen && (
          <div className="mamenu" role="listbox" aria-label="The twelve agents" ref={menu} onKeyDown={arrows}>
            {AGENTS.map(a => (
              <button
                key={a.n}
                type="button"
                role="option"
                aria-selected={a.n === openN}
                disabled={a.soon}
                className={'maopt' + (a.mine ? ' mark' : '')}
                onClick={() => { setOpenN(a.n); setListOpen(false); trig.current?.focus() }}
              >
                <span className="i">{a.n}</span>
                <span className="nm">{a.name}</span>
                <span className="sc">{badge(a)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {open.soon ? (
        <div className="emptypage" style={{ marginTop: 22 }}>
          <span className="lbl">Not built yet</span>
          <h2>The {open.name.toLowerCase()} agent is not ready.</h2>
          <p>It is on the list because growth genuinely breaks here, and leaving it out would make
            the twelve look like eleven. There is nothing to buy and nothing to try yet.</p>
        </div>
      ) : (
        <>
          <div className="macard" style={{ marginTop: 22 }}>
            <span className="malbl">What it finds</span>
            <h3 className="mah">{open.title}</h3>
            <p className="malede">{open.lede}</p>

            <div className="maruncap">
              <span className="malbl" style={{ marginBottom: 0 }}>A run on sample figures</span>
              <span className="hint">Sample data, not your workspace</span>
            </div>

            <div className="tbl">
              {open.funnel.map((r, i) => (
                <div key={r[0]} className={'marow' + (i === open.markRow ? ' mark' : '')}>
                  <span className="nm">{r[0]}</span>
                  <span className="bar"><i style={{ width: `${Math.max(2, (r[1] / top) * 100)}%` }} /></span>
                  <span className="sc">{num(r[1])}</span>
                </div>
              ))}
            </div>

            <div className="mafull">
              <span className="malbl">Weakest step</span>
              <p className="mabody">{open.weak}</p>
            </div>

            <div className="mastakes">
              <div className="mastake key">
                <span className="malbl">What the fix is worth</span>
                <span className="v">{open.worthRange}</span>
                <span className="n">{open.worth}</span>
              </div>
              <div className="mastake">
                <span className="malbl">What it costs</span>
                <span className="v">{usd(open.price)} a month</span>
                <span className="n">Cancel any time. Your analyses stay.</span>
              </div>
            </div>

            <div className="mafull">
              <span className="malbl">What would prove this wrong</span>
              <p className="maq">{open.falsifier}</p>
            </div>

            <div className="mapair">
              <div>
                <span className="malbl">What it needs</span>
                <p className="mabody">{open.needs}</p>
              </div>
              <div>
                <span className="malbl">What it will not do</span>
                <p className="mabody">{open.wont}</p>
              </div>
            </div>

            <div className="act" style={{ marginTop: 26 }}>
              {open.owned
                ? <button className="btn g" disabled>Already added</button>
                : <button
                    className="btn p"
                    style={{ background: 'var(--am)' }}
                    onClick={() => toast('Agents cannot be added yet. This screen is the catalogue; billing comes next.')}
                  >Add this agent</button>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
