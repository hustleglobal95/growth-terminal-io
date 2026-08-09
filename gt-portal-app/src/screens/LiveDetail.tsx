import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEMO } from '../config'
import { api, AnalysisDetail } from '../lib/api'
import { Detail } from './Detail'

/** Route switch: the bundled Northlane sample keeps the full demo
 *  experience; every real analysis id renders the live detail. */
export function AnalysisRoute() {
  const { id } = useParams()
  if (DEMO || !id || id === 'northlane') return <Detail />
  return <LiveDetail id={id} />
}

/* Adaptive extraction, the same dialect the Sheets add-on speaks: the
 * engine's plan payload varies in field names, so we pick, never assume. */
type Loose = Record<string, unknown>
const pick = (o: unknown, keys: string[]): unknown => {
  if (!o || typeof o !== 'object') return undefined
  for (const k of keys) {
    const v = (o as Loose)[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}
const asArray = (v: unknown): unknown[] => Array.isArray(v) ? v : v ? [v] : []
const textOf = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number') return String(v)
  const t = pick(v, ['text', 'title', 'action', 'description', 'summary', 'label'])
  return typeof t === 'string' ? t : ''
}

function extractPhases(plan: unknown): unknown[] {
  if (!plan) return []
  if (Array.isArray(plan)) return plan
  const inner = pick(plan, ['phases', 'steps', 'actions', 'weeks', 'items'])
  return asArray(inner)
}

function fmtDate(s?: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}
function duration(a?: string | null, b?: string | null): string {
  if (!a || !b) return ''
  const ms = new Date(b).getTime() - new Date(a).getTime()
  if (!isFinite(ms) || ms <= 0) return ''
  const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000)
  return m + 'm ' + s + 's'
}

function Sev({ n }: { n: number }) {
  return (
    <span className="lvsev" role="img" aria-label={'Severity ' + n + ' of 10'}>
      {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  )
}

export function LiveDetail({ id }: { id: string }) {
  const nav = useNavigate()
  const [d, setD] = useState<AnalysisDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    let timer: number | undefined
    const load = () => api.getAnalysis(id).then(x => {
      if (!live) return
      setD(x); setErr(null)
      const st = (x.status || '').toLowerCase()
      if (st === 'queued' || st === 'running' || st === 'processing') {
        timer = window.setTimeout(load, 12000)
      }
    }).catch(e => { if (live) setErr(e instanceof Error ? e.message : 'Could not load the analysis.') })
    load()
    return () => { live = false; if (timer) window.clearTimeout(timer) }
  }, [id])

  const st = (d?.status || '').toLowerCase()
  const running = st === 'queued' || st === 'running' || st === 'processing'
  const complete = st === 'complete' || st === 'completed'
  const failed = st === 'failed' || st === 'error'

  const c = d?.constraint as Loose | null | undefined
  const headline = textOf(pick(c, ['headline', 'title'])) || textOf(pick(d?.raw, ['primaryConstraintTitle', 'title']))
  const category = textOf(pick(c, ['category'])) || textOf(pick(d?.raw, ['primaryConstraintCategory']))
  const sevRaw = pick(c, ['severity']) ?? pick(d?.raw, ['severityScore'])
  const sev = typeof sevRaw === 'number' ? sevRaw : parseInt(String(sevRaw || ''), 10)
  const confidence = textOf(pick(c, ['confidence', 'confidenceLabel']))

  const plan = d ? extractPhases(d.executionPlan) : []
  const description = textOf(pick(d?.raw, ['description', 'summary', 'finding'])) ||
    textOf(pick(d?.executionPlan, ['description', 'summary', 'finding']))
  const causes = asArray(pick(d?.raw, ['rootCauses', 'root_causes', 'causes']))
  const actGain = textOf(pick(d?.raw, ['actGain', 'ifYouAct']))
  const waitLose = textOf(pick(d?.raw, ['waitLose', 'ifYouWait']))
  const criteria = asArray(pick(d?.raw, ['successCriteria', 'success_criteria', 'milestones']))

  return (
    <div className="scr on">
      <div className="apphdr">
        <button className="back" aria-label="Back" onClick={() => nav('/analyses')}>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M10 3L5 8l5 5" /></svg>
        </button>
        <span className="ttl">{d?.businessName || 'Analysis'}</span>
        {d && <span className={'stat' + (complete ? ' ok' : running ? ' run' : '')} style={{ marginLeft: 10 }}>
          <i />{complete ? 'Complete' : failed ? 'Failed' : running ? 'Running' : d.status}</span>}
        <span className="sp" />
        <a className="btn g" href={'https://growthterminal.io/portal/analyses/' + id}
          target="_blank" rel="noreferrer">Open in classic portal</a>
      </div>
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap lvwrap">

          {!d && !err && (
            <div className="lvpanel lvcenter" aria-busy="true">
              <span className="skel" style={{ width: 220 }} />
              <span className="skel" style={{ width: 320 }} />
              <span className="skel" style={{ width: 180 }} />
            </div>
          )}

          {err && (
            <div className="lvpanel lvcenter">
              <b>Could not load this analysis.</b>
              <span className="lvmut">{err}</span>
            </div>
          )}

          {d && running && (
            <div className="lvpanel lvcenter">
              <span className="lvpulse" aria-hidden="true" />
              <b>The engine is working.</b>
              <span className="lvmut">Started {fmtDate(d.createdAt)}. Verdicts usually land in under ten minutes; this page refreshes itself.</span>
            </div>
          )}

          {d && failed && (
            <div className="lvpanel lvcenter">
              <b>This analysis failed.</b>
              <span className="lvmut">The workbook may not have had enough numeric data to score. Run it again from the Google Sheets{'™'} add-on; failed runs do not use a credit twice on the same data.</span>
            </div>
          )}

          {d && complete && (
            <>
              {category && <div className="lvcat">Constraint category<b>{category}</b></div>}
              <h1 className="lvhead">{headline || 'Constraint identified.'}</h1>
              {isFinite(sev) && sev > 0 && (
                <div className="lvsevrow">
                  <Sev n={Math.min(10, Math.max(0, sev))} />
                  <span className="lvmut">Severity {sev} of 10{confidence ? ', ' + confidence.toLowerCase() + ' confidence' : ''}</span>
                </div>
              )}

              <div className="lvmeta">
                <div><span>Started</span><b>{fmtDate(d.createdAt) || 'Unknown'}</b></div>
                <div><span>Completed</span><b>{fmtDate(d.completedAt) || 'Just now'}</b></div>
                {duration(d.createdAt, d.completedAt) && <div><span>Duration</span><b>{duration(d.createdAt, d.completedAt)}</b></div>}
                <div><span>Analysis</span><b>{id.slice(0, 8)}</b></div>
              </div>

              {description && (
                <div className="lvpanel"><span className="lbl">What the engine found</span>
                  <p className="lvbody">{description}</p></div>
              )}

              {causes.length > 0 && (
                <div className="lvpanel"><span className="lbl">Root causes</span>
                  <ul className="lvlist">{causes.map((x, i) => <li key={i}>{textOf(x)}</li>)}</ul></div>
              )}

              {(actGain || waitLose) && (
                <div className="lvcall">
                  {actGain && <div className="lvpanel amber"><span className="lbl">If you act</span>
                    <p className="lvbody">{actGain}</p></div>}
                  {waitLose && <div className="lvpanel"><span className="lbl">If you wait</span>
                    <p className="lvbody">{waitLose}</p></div>}
                </div>
              )}

              {plan.length > 0 && (
                <div className="lvpanel">
                  <span className="lbl">The 90 day plan</span>
                  <div className="lvphases">
                    {plan.map((p, i) => {
                      const label = textOf(pick(p, ['week', 'weeks', 'timeframe', 'phase', 'label'])) || 'Phase ' + (i + 1)
                      const action = textOf(pick(p, ['action', 'title', 'task', 'step', 'description'])) || textOf(p)
                      const done = textOf(pick(p, ['criteria', 'successCriteria', 'doneWhen', 'completion']))
                      const owner = textOf(pick(p, ['owner', 'role', 'responsible']))
                      return (
                        <div key={i} className="lvphase">
                          <span className="lvweek">{label}</span>
                          <div className="lvphasebody">
                            <b>{action}</b>
                            {done && <span className="lvdone">Done when: {done}</span>}
                            {owner && <span className="lvowner">{owner}</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {criteria.length > 0 && (
                <div className="lvpanel"><span className="lbl">Success criteria</span>
                  <ul className="lvlist">{criteria.map((x, i) => {
                    const when = textOf(pick(x, ['when', 'timeframe', 'by', 'milestone']))
                    const target = textOf(pick(x, ['target', 'criterion', 'text', 'description'])) || textOf(x)
                    return <li key={i}>{when ? when + ': ' + target : target}</li>
                  })}</ul></div>
              )}

              {plan.length === 0 && !description && (
                <div className="lvpanel lvcenter">
                  <b>The verdict is in; the written plan is still forming.</b>
                  <span className="lvmut">The engine finished scoring but returned no plan detail yet. The classic portal may show more while this view catches up.</span>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
