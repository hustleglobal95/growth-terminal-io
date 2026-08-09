import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEMO } from '../config'
import { api, AnalysisDetail } from '../lib/api'
import { analysisAccess } from '../lib/teamData'
import { Detail } from './Detail'

/** Route switch: the bundled Northlane sample keeps the full demo
 *  experience; every real analysis id renders the live detail. */
export function AnalysisRoute() {
  const { id } = useParams()
  if (DEMO || !id || id === 'northlane') return <Detail />
  return <LiveDetail id={id} />
}

/* Adaptive extraction. The v4 engine's artifact is rich and structured;
 * these helpers read it faithfully and never invent. Everything rendered
 * below is the stored output of the intelligence layers, verbatim. */
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
  const t = pick(v, ['text', 'title', 'name', 'summary', 'description', 'statement', 'label', 'metric'])
  return typeof t === 'string' ? t : ''
}
const listOf = (v: unknown): string[] => asArray(v).map(textOf).filter(Boolean)

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
  return Math.floor(ms / 60000) + 'm ' + Math.round((ms % 60000) / 1000) + 's'
}
const money = (v: unknown): string => {
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isFinite(n) && n > 0 ? '+$' + Math.round(n).toLocaleString() + ' a month' : ''
}

function Sev({ n }: { n: number }) {
  return (
    <span className="lvsev" role="img" aria-label={'Severity ' + n + ' of 10'}>
      {Array.from({ length: 10 }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}
    </span>
  )
}

/** One v4 phase, rendered in the demo's own card anatomy. */
function LivePhase({ p, n, open, toggle }: { p: Loose; n: number; open: boolean; toggle: () => void }) {
  const steps = listOf(p.steps)
  const eff = textOf(p.effort)
  return (
    <div className={'ph' + (open ? ' open' : '')}>
      <span className="wk">{textOf(p.weeks) || 'Phase ' + n}</span><span className="node" />
      <div className="pcard">
        <div className="phd" onClick={toggle}>
          <span className="no">{n}</span>
          <span className="tt">{textOf(p.title)}</span>
          {eff && <span className={'eff' + (/high/i.test(eff) ? ' hi' : '')}>{eff} effort</span>}
          <span className="chev" />
        </div>
        {textOf(p.doneWhen) && (
          <div className="dw"><b style={{ color: 'var(--text)', fontWeight: 600 }}>Done when</b> {textOf(p.doneWhen)}</div>
        )}
        <div className="pbody">
          {textOf(p.hypothesis) && <p className="hyp">{textOf(p.hypothesis)}</p>}
          <div className="grid2">
            {textOf(p.objective) && <div className="f"><span className="lbl">Objective</span><span className="v">{textOf(p.objective)}</span></div>}
            {textOf(p.whyNow) && <div className="f"><span className="lbl">Why now</span><span className="v">{textOf(p.whyNow)}</span></div>}
          </div>
          {steps.length > 0 && (
            <div style={{ marginTop: 22 }}><span className="lbl">Steps</span>
              <ol className="steps">{steps.map(s => <li key={s}>{s}</li>)}</ol></div>
          )}
          <div className="grid2" style={{ marginTop: 22 }}>
            {textOf(p.deliverable) && <div className="f"><span className="lbl">Deliverable</span><span className="v">{textOf(p.deliverable)}</span></div>}
            {textOf(p.owner) && <div className="f"><span className="lbl">Owner</span><span className="v">{textOf(p.owner)}</span></div>}
            {textOf(p.leadingIndicator) && <div className="f"><span className="lbl">Leading indicator</span><span className="v">{textOf(p.leadingIndicator)}</span></div>}
            {textOf(p.expectedImpact) && <div className="f"><span className="lbl">Expected impact</span><span className="v">{textOf(p.expectedImpact)}</span></div>}
            {textOf(p.dependency) && <div className="f"><span className="lbl">Depends on</span><span className="v">{textOf(p.dependency)}</span></div>}
          </div>
          {textOf(p.watchOut) && (
            <div className="watch"><span className="lbl">Watch out</span><span className="v">{textOf(p.watchOut)}</span></div>
          )}
        </div>
      </div>
    </div>
  )
}

export function LiveDetail({ id }: { id: string }) {
  const nav = useNavigate()
  const [d, setD] = useState<AnalysisDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openPhase, setOpenPhase] = useState(0)

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

  const raw = d?.raw
  const c = (pick(raw, ['constraintResult']) || d?.constraint) as Loose | undefined
  const headline = textOf(pick(c, ['title', 'headline'])) || textOf(pick(raw, ['primaryConstraintTitle']))
  const category = textOf(pick(c, ['category'])) || textOf(pick(raw, ['primaryConstraintCategory']))
  const sevRaw = pick(c, ['severityScore', 'severity']) ?? pick(raw, ['severityScore'])
  const sev = typeof sevRaw === 'number' ? sevRaw : parseInt(String(sevRaw || ''), 10)
  const confidence = textOf(pick(c, ['confidenceLevel', 'confidence']))
  const finding = textOf(pick(c, ['description', 'summary']))
  const causes = listOf(pick(c, ['rootCauses']) || pick(raw, ['rootCauses']))

  /* The v4 timeline: the play-bank engine's artifact. */
  const et = pick(raw, ['executionTimeline']) as Loose | undefined
  const phases = asArray(pick(et, ['phases'])) as Loose[]
  const gates = asArray(pick(et, ['decisionGates', 'gates'])) as Loose[]
  const indicators = asArray(pick(et, ['indicators']))
  const sequencing = textOf(pick(et, ['sequencingLogic']))
  const planHeadline = textOf(pick(et, ['headline']))
  const horizon = pick(et, ['horizonWeeks'])
  const subDiagnosis = textOf(pick(et, ['subDiagnosis']))

  /* Evidence, narrative, feasibility: the honest layers. */
  const ep = pick(raw, ['evidencePackage']) as Loose | undefined
  const supporting = listOf(pick(ep, ['supporting', 'supportingEvidence']))
  const contradicting = listOf(pick(ep, ['contradicting', 'contradictingEvidence']))
  const epLimitations = listOf(pick(ep, ['limitations', 'dataLimitations']) || pick(c, ['dataLimitations']))
  const narrative = pick(raw, ['claudeNarrative'])
  const narrativeText = typeof narrative === 'string' ? narrative
    : textOf(pick(narrative, ['narrative', 'summary', 'text', 'body', 'headline']))
  const feas = pick(raw, ['interventionFeasibility']) as Loose | undefined
  const upside = money(pick(feas, ['adjustedOpportunity', 'adjustedMonthlyOpportunity']) ?? pick(raw, ['estimatedMonthlyUpside']))

  /* Role gate from the Teams permission matrix. Owner sees everything, so
   * the default workspace renders exactly as before. */
  const acc = analysisAccess()
  const brainStatus = textOf(pick(raw, ['brainAnalysisStatus']))
  const engineVersion = textOf(pick(raw, ['engineVersion']))

  const fallbackPlan = pick(raw, ['executionPlan']) as Loose | undefined
  const fallbackWhy = textOf(pick(fallbackPlan, ['rationale']))

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
              <span className="lvmut">The workbook may not have had enough numeric data to score. Run it again from the Google Sheets{'™'} add-on.</span>
            </div>
          )}

          {d && complete && (
            <>
              {acc.previewing && (!acc.evidence || !acc.financials || !acc.plan) && (
                <div className="lvpanel"><span className="lbl">Role preview</span>
                  <p className="lvbody">Viewing as {acc.role}. Sections this role cannot access are hidden: {[
                    !acc.evidence && 'evidence', !acc.financials && 'financials', !acc.plan && 'the plan'
                  ].filter(Boolean).join(', ')}.</p></div>
              )}
              {category && <div className="lvcat">Constraint category<b>{category}</b></div>}
              <h1 className="lvhead">{headline || 'Constraint identified.'}</h1>
              {isFinite(sev) && sev > 0 && (
                <div className="lvsevrow">
                  <Sev n={Math.min(10, Math.max(0, sev))} />
                  <span className="lvmut">Severity {sev} of 10{confidence ? ', ' + confidence.toLowerCase() + ' confidence' : ''}</span>
                </div>
              )}

              {((acc.financials && upside) || subDiagnosis) && (
                <div className="lvcall">
                  {acc.financials && upside && <div className="lvpanel amber"><span className="lbl">If you act</span>
                    <p className="lvbody"><b className="lvfig">{upside}</b> Engine-computed: raw impact adjusted by execution and causal success probability.</p></div>}
                  {subDiagnosis && <div className="lvpanel"><span className="lbl">Sub-diagnosis</span>
                    <p className="lvbody">{subDiagnosis}</p></div>}
                </div>
              )}

              <div className="lvmeta">
                <div><span>Started</span><b>{fmtDate(d.createdAt) || 'Unknown'}</b></div>
                <div><span>Completed</span><b>{fmtDate(d.completedAt) || ''}</b></div>
                {duration(d.createdAt, d.completedAt) && <div><span>Duration</span><b>{duration(d.createdAt, d.completedAt)}</b></div>}
                {brainStatus && <div><span>Constraint selection</span><b>{brainStatus.replace(/_/g, ' ')}</b></div>}
                {engineVersion && <div><span>Engine</span><b>{engineVersion}</b></div>}
              </div>

              {finding && (
                <div className="lvpanel"><span className="lbl">What the engine found</span>
                  <p className="lvbody">{finding}</p></div>
              )}

              {narrativeText && (
                <div className="lvpanel"><span className="lbl">The verdict, in full</span>
                  <p className="lvbody lvpre">{narrativeText}</p></div>
              )}

              {causes.length > 0 && (
                <div className="lvpanel"><span className="lbl">Root causes</span>
                  <ul className="lvlist">{causes.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              )}

              {acc.evidence && (supporting.length > 0 || contradicting.length > 0) && (
                <div className="lvcall">
                  {supporting.length > 0 && <div className="lvpanel"><span className="lbl">Evidence for this call</span>
                    <ul className="lvlist">{supporting.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                  {contradicting.length > 0 && <div className="lvpanel"><span className="lbl">Evidence against it</span>
                    <ul className="lvlist">{contradicting.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                </div>
              )}

              {acc.plan && phases.length > 0 && (
                <div className="lvtimeline">
                  <div className="lvplanhead">
                    <span className="lbl">The plan, as the engine wrote it</span>
                    {planHeadline && <b className="lvplant">{planHeadline}</b>}
                    {typeof horizon === 'number' && <span className="lvmut">{horizon} weeks, {phases.length} phases, {gates.length} decision gates</span>}
                    {sequencing && <p className="lvbody">{sequencing}</p>}
                  </div>
                  <div className="plan">
                    {phases.map((p, i) => (
                      <LivePhase key={i} p={p} n={i + 1} open={openPhase === i}
                        toggle={() => setOpenPhase(openPhase === i ? -1 : i)} />
                    ))}
                  </div>
                </div>
              )}

              {acc.plan && gates.length > 0 && (
                <div className="lvpanel"><span className="lbl">Decision gates</span>
                  {gates.map((g, i) => (
                    <div key={i} className="gate" style={{ margin: '6px 0 0' }}>
                      <span className="lbl">Gate {i + 1}{textOf(g.timing) ? ', ' + textOf(g.timing) : ''}</span>
                      <div className="q">{textOf(pick(g, ['condition', 'question', 'criteria', 'checkpoint', 'description']))}</div>
                      <div className="two">
                        {textOf(g.ifPass) && <div><span className="lbl">If pass</span><span className="v">{textOf(g.ifPass)}</span></div>}
                        {textOf(g.ifMiss) && <div><span className="lbl">If miss</span><span className="v">{textOf(g.ifMiss)}</span></div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {acc.plan && indicators.length > 0 && (
                <div className="lvpanel"><span className="lbl">Indicators the engine is watching</span>
                  <ul className="lvlist">{indicators.map((x, i) => {
                    const nm = textOf(x)
                    const tgt = textOf(pick(x, ['target', 'threshold', 'goal']))
                    return <li key={i}>{nm}{tgt && nm !== tgt ? ', target ' + tgt : ''}</li>
                  })}</ul></div>
              )}

              {acc.evidence && epLimitations.length > 0 && (
                <div className="lvpanel"><span className="lbl">What would prove this wrong</span>
                  <ul className="lvlist">{epLimitations.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              )}

              {acc.plan && phases.length === 0 && (
                <div className="lvpanel">
                  <span className="lbl">The plan, as the engine wrote it</span>
                  {fallbackWhy && <p className="lvbody">{fallbackWhy}</p>}
                  <p className="lvmut" style={{ maxWidth: '62ch' }}>The engine wrote no phased timeline for this run. When it cannot observe enough to plan honestly, it says so instead of inventing one.</p>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
