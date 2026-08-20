import React, { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { data, Phase } from '../lib/api'
import { toast } from '../lib/bus'
import { GapChart, Spark, Gantt, SevSegs } from '../components/charts'

const initials = (s: string) => s.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

function Rail() {
  const KV: [string, string, boolean?][] = [
    ['Qualified leads', '1,803 / mo'], ['Required', '2,610 / mo'], ['Gap', '807 / mo', true],
    ['Cost per acquisition', '$51.09'], ['Plan length', '12 weeks']
  ]
  const RUN: [string, string][] = [
    ['Analysis', '6ec4e976'], ['Started', '7 Aug, 23:04'], ['Duration', '4m 12s'],
    ['Source', 'Sheets add-on'], ['Read', '5 tabs, 2,088 rows'], ['Constraints scored', '12']
  ]
  return (
    <aside className="rail">
      <div className="blk">
        <div className="rt">Severity</div>
        <div className="sevbig"><b>8</b><span>of 10, high confidence</span></div>
        <div className="railsegs">{Array.from({ length: 10 }, (_, i) => <i key={i} className={i < 8 ? 'f' : ''} />)}</div>
      </div>
      <div className="blk">
        <div className="rt">Headline numbers</div>
        <dl>{KV.map(([k, v, am]) => (
          <div key={k} className="kv"><dt>{k}</dt><dd className={am ? 'am' : ''}>{v}</dd></div>))}</dl>
      </div>
      <div className="blk">
        <div className="rt">Jump to</div>
        <nav className="jump">
          {/* Only sections that carry an id are listed. Five of these used to
              be rendered against href="#" with the click cancelled, so they
              looked like navigation and did nothing. */}
          {[['The 90 day plan', '#plan']].map(([t, href]) => (
            <a key={t} href={href} className="on"><i />{t}</a>
          ))}
        </nav>
      </div>
      <div className="blk">
        <div className="rt">Run details</div>
        <dl>{RUN.map(([k, v]) => <div key={k} className="kv"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      </div>
      <div className="blk">
        <div className="rt">Calibration</div>
        <dl>
          <div className="kv"><dt>Forecasts logged</dt><dd>3</dd></div>
          <div className="kv"><dt>Resolved</dt><dd>0</dd></div>
          <div className="kv"><dt>Accuracy</dt><dd>Not yet scored</dd></div>
        </dl>
      </div>
    </aside>
  )
}

function PhaseCard({ p, open, toggle }: { p: Phase; open: boolean; toggle: () => void }) {
  const gate = data.GATES[String(p.n)]
  return (
    <>
      <div className={'ph' + (open ? ' open' : '')}>
        <span className="wk">{p.wk}</span><span className="node" />
        <div className="pcard">
          <div className="phd" onClick={toggle}>
            <span className="no">{p.n}</span>
            <span className="tt">{p.t}</span>
            <span className={'eff' + (p.eff === 'High' ? ' hi' : '')}>{p.eff} effort</span>
            <span className="chev" />
          </div>
          <div className="dw"><b style={{ color: 'var(--text)', fontWeight: 600 }}>Done when</b> {p.dw}</div>
          <div className="pbody">
            <p className="hyp">{p.hyp}</p>
            <div className="grid2">
              <div className="f"><span className="lbl">Objective</span><span className="v">{p.obj}</span></div>
              <div className="f"><span className="lbl">Why now</span><span className="v">{p.why}</span></div>
            </div>
            <div style={{ marginTop: 22 }}><span className="lbl">Steps</span>
              <ol className="steps">{p.steps.map(s => <li key={s}>{s}</li>)}</ol></div>
            <div className="grid2" style={{ marginTop: 22 }}>
              <div className="f"><span className="lbl">Deliverable</span><span className="v">{p.del}</span></div>
              <div className="f"><span className="lbl">Done when</span><span className="v strong">{p.dw}</span></div>
              <div className="f"><span className="lbl">Owner</span><span className="v">{p.own}</span></div>
              <div className="f"><span className="lbl">Leading indicator</span><span className="v">{p.li}</span></div>
            </div>
            <div className="watch"><span className="lbl">Watch out</span><span className="v">{p.watch}</span></div>
          </div>
        </div>
      </div>
      {gate && (
        <div className="gate">
          <span className="lbl">Decision gate, {gate.t}</span>
          <div className="q">{gate.q}</div>
          <div className="two">
            <div><span className="lbl">If pass</span><span className="v">{gate.pass}</span></div>
            <div><span className="lbl">If miss</span><span className="v">{gate.miss}</span></div>
          </div>
        </div>
      )}
    </>
  )
}

function OverviewView({ open, setOpen }: { open: number; setOpen: (n: number) => void }) {
  return (
    <>
      <div className="verdict">
        <div className="bigpill">
          <div><span className="lbl" style={{ color: 'var(--amber)' }}>Constraint category</span>
            <span className="cat">Acquisition</span></div>
          <span className="of">Chosen from twelve. Scored highest on impact and controllability.</span>
        </div>
        <div className="vgrid">
          <div>
            <h1>Insufficient lead volume is capping revenue growth.</h1>
            <p className="sub">Demand entering the funnel is below what the pipeline maths requires to hit
              target. Every downstream stage is performing inside its normal range, so the shortfall is
              being created at the top and inherited everywhere after it.</p>
            <div className="meter"><SevSegs n={8} /><span className="meterv">Severity 8 of 10, high confidence</span></div>
            <div className="stakes">
              <div className="stake key">
                <span className="lbl am">If you act</span><span className="v">+30% revenue</span>
                <span className="n">Uplift against the current run rate over 90 days.</span>
              </div>
              <div className="stake">
                <span className="lbl">If you wait</span><span className="v">Growth stays capped</span>
                <span className="n">The gap compounds each cycle it is not closed.</span>
              </div>
            </div>
            <div className="acts">
              <a className="btn p" href="#plan">Open the 90 day plan</a>
              <a className="btn g" onClick={() => toast('Preparing the PDF.')}>Export PDF</a>
              <a className="btn g" onClick={() => toast('Share links are workspace only.')}>Share with team</a>
            </div>
          </div>
          <div className="chartcard">
            <div className="ct">Qualified leads per month against requirement</div>
            <div className="cs">Production is rising. The volume the pipeline needs is rising faster,
              so the shortfall widens even in a good month.</div>
            <GapChart />
            <div className="keyrow">
              <span className="legk"><i />Produced</span>
              <span className="legk"><i className="n" />Required to hit target</span>
            </div>
          </div>
        </div>
      </div>

      <section>
        <div className="shead">
          <span className="lbl">Why this call</span>
          <h2>Twelve constraints scored. This one won by 26 points.</h2>
          <span className="hint">88% selection consistency across runs</span>
        </div>
        <div className="rank">
          {data.RANK.map((r, i) => (
            <div key={r[0]} className={'rrow' + (r[2] ? ' win' : '')}>
              <span className="i">{i + 1}</span><span className="nm">{r[0]}</span>
              <span className="bar"><i style={{ width: r[1] + '%' }} /></span>
              <span className="sc">{r[1]}</span>
            </div>
          ))}
        </div>
        <div className="rmeta">
          <div><span className="lbl">Controllability</span><span className="v">High. The business can act on this directly.</span></div>
          <div><span className="lbl">Stability</span><span className="v">Selected in 88% of repeated runs.</span></div>
          <div><span className="lbl">Required resources</span><span className="v" style={{ color: 'var(--faint)' }}>To be assessed</span></div>
        </div>
      </section>

      <section>
        <div className="shead">
          <span className="lbl am">Verified, not vibes</span>
          <h2>Every claim traces to a column.</h2>
          <span className="hint">Click a figure to open the source rows</span>
        </div>
        <div className="ev">
          {data.EV.map(e => (
            <div key={e[0]} className="evc">
              <span className="lbl">{e[0]}</span><span className="fig">{e[1]}</span>
              <span className="cap">{e[2]}</span>
              <Spark series={e[5]} />
              <span className="src"><b>{e[3]}</b> · {e[4]}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="shead">
          <span className="lbl">What would prove this wrong</span>
          <h2>The two findings that would overturn the call.</h2>
        </div>
        <div className="rank">
          {['Lead volume is healthy but conversion rate is low.', 'Ample leads exist but sales capacity is the bottleneck.'].map((t, i) => (
            <div key={t} className="rrow" style={{ gridTemplateColumns: '22px 1fr' }}>
              <span className="i">{i + 1}</span><span className="nm" style={{ color: 'var(--muted)' }}>{t}</span>
            </div>
          ))}
        </div>
      </section>

      <section id="plan">
        <div className="shead">
          <span className="lbl">The 90 day plan</span>
          <h2>Six phases, twelve weeks, three decision gates.</h2>
          <span className="hint">Expand a phase for steps and owners</span>
        </div>
        <div className="gantt">
          <span className="ganthint" style={{ display: 'none' }}>Scroll sideways to see all twelve weeks.</span>
          <Gantt open={open} />
        </div>
        <div className="plan">
          {data.PHASES.map(p => (
            <PhaseCard key={p.n} p={p} open={open === p.n} toggle={() => setOpen(open === p.n ? 0 : p.n)} />
          ))}
        </div>
      </section>

      <section>
        <div className="shead"><span className="lbl">Track weekly</span><h2>Indicators.</h2></div>
        <div className="ind">
          <div className="r h"><span>Type</span><span>Indicator</span><span>Target</span><span style={{ textAlign: 'right' }}>Cadence</span></div>
          {data.IND.map(r => (
            <div key={r[1]} className="r">
              <span className={'k' + (r[0] === 'Leading' ? ' l' : '')}>{r[0]}</span>
              <span>{r[1]}</span><span className="tgt">{r[2]}</span><span className="cad">{r[3]}</span>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <div><span className="lbl">Encryption</span><span className="v">TLS 1.3 in transit, AES-256 at rest</span></div>
        <div><span className="lbl">Distribution</span><span className="v">Workspace members only, not for redistribution</span></div>
        <div><span className="lbl">Prepared by</span><span className="v">Growth Terminal, growthterminal.io</span></div>
        <div><span className="lbl">Legal</span><span className="v">(c) 2026 Growth Terminal LLC</span></div>
      </footer>
    </>
  )
}

function DeepDive() {
  const max = Math.max(...data.TWELVE.map(t => t[1]))
  const TILES: [string, string, number[] | null, boolean][] = [
    ['Qualified leads per month', '1,803', data.D.produced, false],
    ['The gap to close', '807', data.D.gap, true],
    ['Cost per acquisition', '$51.09', data.D.cac, false],
    ['Weeks to close it', '12', null, false]
  ]
  return (
    <>
      <div className="dd-band">
        {TILES.map(t => (
          <div key={t[0]} className="tile">
            <span className="lbl">{t[0]}</span>
            <span className={'fig' + (t[3] ? ' am' : '')}>{t[1]}</span>
            <span className="cap">Last 24 months</span>
            {t[2] && <Spark series={t[2]} />}
          </div>
        ))}
      </div>

      <div className="dd-two">
        <div className="chartcard">
          <div className="ct">Where the constraint sits</div>
          <div className="cs">All twelve constraints scored on the same data. Darker is more binding.</div>
          <div className="mapgrid">
            {data.TWELVE.map(t => {
              const o = 0.06 + 0.94 * Math.pow(t[1] / max, 1.6)
              const win = t[1] === max
              return (
                <div key={t[0]} className={'cell' + (win ? ' win' : '') + (o > 0.48 ? ' ink' : '')}>
                  <span className="fill" style={{ opacity: +o.toFixed(3) }} />
                  <span className="nm">{t[0]}</span><span className="sc">{t[1]}</span>
                </div>
              )
            })}
          </div>
          <div className="ramp"><span>Less binding</span><span className="bar" /><span>More binding</span></div>
        </div>
        <div className="chartcard">
          <div className="ct">The shortfall, month by month</div>
          <div className="cs">Produced volume against the volume the pipeline requires. The shaded
            band is the gap you are closing.</div>
          <GapChart />
          <div className="keyrow">
            <span className="legk"><i />Produced</span>
            <span className="legk"><i className="n" />Required to hit target</span>
          </div>
        </div>
      </div>

      <div className="shead">
        <span className="lbl am">Execution</span>
        <h2>Thirty steps. Each one spells out the method, the input, the finish line and the failure mode.</h2>
      </div>

      {data.PHASES.map(p => {
        const steps = data.STEPS[String(p.n)] || []
        const gate = data.GATES[String(p.n)]
        return (
          <React.Fragment key={p.n}>
            <div className="pb">
              <span className="num">{p.n}</span>
              <div className="pb-head"><h3>{p.t}</h3>
                <span className="meta">{p.wk} · {p.eff} effort · {p.own}</span></div>
              <p className="pb-obj">{p.obj}</p>
              <div className="sgrid">
                {steps.map((st, i) => (
                  <div key={st.t} className="sc-card">
                    <div className="sc-top">
                      <span className="sc-no">{i + 1}</span>
                      <span className="sc-t">{st.t}</span>
                      <span className="sc-d">{st.d} {st.d === 1 ? 'day' : 'days'}</span>
                    </div>
                    <div className="sc-how"><span className="lbl">Do this</span>
                      <ol>{st.how.map(h => <li key={h}>{h}</li>)}</ol></div>
                    <dl className="sc-rows">
                      <dt>Needs first</dt><dd>{st.need}</dd>
                      <dt>Done when</dt><dd>{st.done}</dd>
                      <dt>Produces</dt><dd className="out">{st.out}</dd>
                    </dl>
                    <div className="sc-care"><span className="lbl">Where this goes wrong</span>
                      <span className="v">{st.care}</span></div>
                    <div className="sc-own"><span className="av">{initials(st.own)}</span>{st.own}</div>
                  </div>
                ))}
              </div>
              <div className="deliver">
                <span className="lbl" style={{ color: 'var(--amber)', flex: '0 0 auto' }}>Phase deliverable</span>
                <span className="v">{p.del}</span>
              </div>
            </div>
            {gate && (
              <div className="branch">
                <span className="lbl">Decision gate, {gate.t}</span>
                <div className="q">{gate.q}</div>
                <div className="paths">
                  <div className="path yes"><div className="h"><i />If this is true</div><span className="v">{gate.pass}</span></div>
                  <div className="path"><div className="h"><i />If it is not</div><span className="v">{gate.miss}</span></div>
                </div>
              </div>
            )}
          </React.Fragment>
        )
      })}
    </>
  )
}

export function Detail() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [deep, setDeep] = useState(sp.get('view') === 'deep')
  const [open, setOpen] = useState(4)
  return (
    <div className="scr on">
      <div className="apphdr">
        <button className="back" aria-label="Back" onClick={() => nav('/analyses')}>
          <svg viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" /></svg>
        </button>
        <span className="ttl">Northlane Supply Co.</span>
        <span className="sep" />
        <span className="st"><i />Complete</span>
        <span className="sp" />
        <div className={'seg' + (deep ? ' right' : '')}>
          <span className="thumb" />
          <button className={deep ? '' : 'on'} onClick={() => { setDeep(false); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Overview</button>
          <button className={deep ? 'on' : ''} onClick={() => { setDeep(true); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Deep dive</button>
        </div>
        <span className="sep" />
        <button className="iconbtn" aria-label="Export PDF" onClick={() => toast('Preparing the PDF.')}>
          <svg viewBox="0 0 16 16"><path d="M8 2v8M8 10L5 7M8 10l3-3" /><path d="M3 11v2h10v-2" /></svg>
        </button>
        <button className="iconbtn" aria-label="Share" onClick={() => toast('Share links are workspace only.')}>
          <svg viewBox="0 0 16 16"><circle cx="12" cy="4" r="2" /><circle cx="4" cy="8" r="2" /><circle cx="12" cy="12" r="2" /><path d="M5.8 7L10.2 5M5.8 9l4.4 2" /></svg>
        </button>
      </div>
      <div className="canvas">
        <div className="wrap">
          <div className="crumb">
            <a href="#" onClick={e => { e.preventDefault(); nav('/analyses') }}>Analyses</a>
            <span className="sep">/</span>
            <a href="#" onClick={e => e.preventDefault()} style={{ color: 'var(--muted)' }}>Northlane Supply Co.</a>
            <span className="meta">7 Aug 2026 · Google Sheets{'™'} · 5 tabs, 2,088 rows</span>
          </div>
          {deep ? <DeepDive /> : <OverviewView open={open} setOpen={setOpen} />}
        </div>
        <Rail />
      </div>
    </div>
  )
}
