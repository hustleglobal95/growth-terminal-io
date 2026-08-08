import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from '../lib/bus'
import { Header } from './simple'
import { Spark } from '../components/charts'

/** Content: the Automated Content Engine's console. An always-on system
 *  that builds on-brand posts from the creative bank, publishes across
 *  every connected platform on a daily schedule, and tracks what performs
 *  so the feed sharpens over time.
 *
 *  Sample data below renders the complete experience; it swaps for the
 *  content API when the backend routes exist, the same pattern the
 *  Analyses screens followed before their live wiring. */

const PLATFORMS = [
  { n: 'Instagram', h: '@growthterminal', slot: 'Daily, 6:00 PM', last: 'Posted today, 6:00 PM', on: true },
  { n: 'Facebook', h: 'Growth Terminal', slot: 'Daily, 6:15 PM', last: 'Posted today, 6:15 PM', on: true },
  { n: 'Threads', h: '@growthterminal', slot: 'Daily, 7:00 PM', last: 'Posted today, 7:00 PM', on: true },
  { n: 'TikTok', h: '@growthterminal', slot: 'Daily, 8:30 PM', last: 'Posts tonight, 8:30 PM', on: true }
]

const QUEUE = [
  { when: 'Tonight, 8:30 PM', pf: 'TikTok', fmt: 'Reel', cap: 'Three pricing mistakes that quietly cap revenue', src: 'reel_pricing_03' },
  { when: 'Tomorrow, 6:00 PM', pf: 'Instagram', fmt: 'Carousel', cap: 'The twelve constraints, explained in nine slides', src: 'carousel_twelve_02' },
  { when: 'Tomorrow, 6:15 PM', pf: 'Facebook', fmt: 'Static', cap: 'One constraint at a time. That is the whole method.', src: 'static_method_11' },
  { when: 'Tomorrow, 7:00 PM', pf: 'Threads', fmt: 'Text', cap: 'Your CAC did not rise. Your retention fell. Thread on telling the difference.', src: 'thread_retention_05' },
  { when: 'Wed, 6:00 PM', pf: 'Instagram', fmt: 'Reel', cap: 'Reading a verdict screen in 40 seconds', src: 'reel_portal_01' },
  { when: 'Wed, 8:30 PM', pf: 'TikTok', fmt: 'Reel', cap: 'What agencies get wrong about audits', src: 'reel_agency_07' }
]

const LEARNED = [
  { t: 'Reels with the claim on the first frame hold attention 2.4x longer.', d: 'Applied to every Reel built since 28 Jul.' },
  { t: 'The 6:00 PM slot beats noon by 38% on engagement.', d: 'All platforms moved to evening slots.' },
  { t: 'Carousels lose readers at slide 3 when it is a chart.', d: 'Charts now land on slide 2, verdicts on slide 3.' },
  { t: 'Question captions underperform statement captions here.', d: 'Caption generator weights statements 3 to 1.' }
]

const RECENT = [
  { pf: 'Instagram', fmt: 'Reel', cap: 'Reading a verdict screen in 40 seconds', d: 'Today', reach: '18.4k', eng: '6.1%', kept: true },
  { pf: 'TikTok', fmt: 'Reel', cap: 'Three pricing mistakes that quietly cap revenue', d: 'Yesterday', reach: '31.2k', eng: '7.8%', kept: true },
  { pf: 'Threads', fmt: 'Text', cap: 'Your CAC did not rise. Your retention fell.', d: 'Yesterday', reach: '4.1k', eng: '3.9%', kept: true },
  { pf: 'Facebook', fmt: 'Static', cap: 'One constraint at a time. That is the whole method.', d: '2 days ago', reach: '2.2k', eng: '1.1%', kept: false },
  { pf: 'Instagram', fmt: 'Carousel', cap: 'The twelve constraints, explained in nine slides', d: '3 days ago', reach: '9.7k', eng: '4.6%', kept: true }
]

const ENG_TREND = [2.1, 2.4, 2.2, 2.8, 3.1, 2.9, 3.4, 3.8, 3.6, 4.2, 4.7, 4.5, 5.2, 5.8, 6.1]

const FORMATS = [
  { f: 'Reels', x: 3.1, w: 100 },
  { f: 'Carousels', x: 1.9, w: 61 },
  { f: 'Text posts', x: 1.4, w: 45 },
  { f: 'Statics', x: 0.7, w: 23 }
]

export function Content() {
  const nav = useNavigate()
  const [paused, setPaused] = useState(false)
  return (
    <div className="scr on">
      <Header title="Content">
        <button className="btn g" onClick={() => nav('/content/setup')}>Set up a machine</button>
        <button className="btn g" onClick={() => {
          setPaused(p => !p)
          toast(paused ? 'Engine resumed. Tonight’s post is back on.' : 'Engine paused. Nothing publishes until you resume.')
        }}>{paused ? 'Resume engine' : 'Pause engine'}</button>
        <button className="btn p" onClick={() => toast('Drop files or paste links. The bank takes video, images and copy.')}>
          Add to creative bank</button>
      </Header>
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">

          <div className="greet">
            <h1>The engine posts every day. You feed the bank.</h1>
            <p>On-brand posts built from your creative bank, published across every platform on schedule. It tracks what performs, so the feed sharpens over time.</p>
          </div>

          <div className="tilegrid">
            <div className="tile"><span className="lbl">Engine</span>
              <span className="fig">{paused ? 'Paused' : 'Running'}</span>
              <span className="cap">{paused ? 'Publishing is on hold' : 'Next post tonight, 8:30 PM'}</span></div>
            <div className="tile"><span className="lbl">Creative bank</span><span className="fig">148</span>
              <span className="cap">assets, 12 added this week</span></div>
            <div className="tile"><span className="lbl">Published</span><span className="fig">96</span>
              <span className="cap">posts in the last 30 days</span></div>
            <div className="tile"><span className="lbl">Best format</span><span className="fig">Reels</span>
              <span className="cap">3.1x the average engagement</span></div>
          </div>

          <div className="ctgrid">
            <div className="card">
              <div className="cthead"><span className="lbl">Platforms</span>
                <span className="ctsub">Every account posts on its own daily slot.</span></div>
              {PLATFORMS.map(p => (
                <div key={p.n} className="pfrow">
                  <span className="pfchip">{p.n}</span>
                  <span className="pfmeta"><b>{p.h}</b><span>{p.slot}</span></span>
                  <span className={'stat' + (p.on && !paused ? ' ok' : '')}><i />{paused ? 'Paused' : p.last}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="cthead"><span className="lbl">What the engine learned</span>
                <span className="ctsub">Every post feeds the next one.</span></div>
              {LEARNED.map(l => (
                <div key={l.t} className="learnrow">
                  <b>{l.t}</b><span>{l.d}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="ovgrid">
            <div className="chartcard">
              <div className="ct">Engagement per post</div>
              <div className="cs">Average rate across platforms, last 15 posts. Severity of the climb is the point: the engine keeps what works.</div>
              <div className="ctspark"><Spark series={ENG_TREND} /></div>
              <div className="ctlegend"><span><i className="dotA" />6.1% latest</span><span>2.1% fifteen posts ago</span></div>
            </div>
            <div className="chartcard">
              <div className="ct">Format performance</div>
              <div className="cs">Engagement against the account average. Weak formats get retired on their own.</div>
              <div className="fmtbars">
                {FORMATS.map(f => (
                  <div key={f.f} className="fmtrow">
                    <span className="fmtn">{f.f}</span>
                    <span className="fmttrack"><span className="fmtfill" style={{ width: f.w + '%' }} /></span>
                    <span className="fmtx">{f.x}x</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card ctblock">
            <div className="cthead"><span className="lbl">Queue, next 7 days</span>
              <span className="ctsub">Built from the bank, scheduled without you.</span></div>
            {QUEUE.map((qi, i) => (
              <div key={i} className="qrow" role="button" tabIndex={0}
                onClick={() => toast('Post preview opens when the content API lands.')}
                onKeyDown={e => { if (e.key === 'Enter') toast('Post preview opens when the content API lands.') }}>
                <span className="qwhen">{qi.when}</span>
                <span className="pfchip">{qi.pf}</span>
                <span className="qfmt">{qi.fmt}</span>
                <span className="qcap">{qi.cap}</span>
                <span className="qsrc hidem">{qi.src}</span>
                <span className={'stat' + (paused ? '' : ' ok')}><i />{paused ? 'Held' : 'Scheduled'}</span>
              </div>
            ))}
          </div>

          <div className="card ctblock">
            <div className="cthead"><span className="lbl">Recent posts</span>
              <span className="ctsub">Kept means the format earns another run. Retired means the engine stops making that shape.</span></div>
            {RECENT.map((r, i) => (
              <div key={i} className="qrow">
                <span className="qwhen">{r.d}</span>
                <span className="pfchip">{r.pf}</span>
                <span className="qfmt">{r.fmt}</span>
                <span className="qcap">{r.cap}</span>
                <span className="qsrc hidem">{r.reach} reach, {r.eng} engagement</span>
                <span className={'stat' + (r.kept ? ' ok' : '')}><i />{r.kept ? 'Kept' : 'Retired'}</span>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  )
}
