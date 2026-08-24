import React, { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { DEMO } from '../config'
import { api, AnalysisDetail } from '../lib/api'
import { useMe } from '../lib/liveData'
import { analysisAccess } from '../lib/teamData'
import {
  CheckAnswer, CheckItem, CheckSpec, PlanMeta, Verification, WeekCommit,
  checklistFor, commitVerification, commitWeek, committedWeeks, currentWeek,
  phaseWeeks, reopenVerification, setAnswer, setVerificationNote, uncommitWeek,
  verificationOf
} from '../lib/planCommits'
import { toast } from '../lib/bus'
import { Editorial } from '../components/Editorial'
import { Detail } from './Detail'
import { Why } from '../components/Why'
import { Section, Row } from '../components/Section'

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
/** Anything the engine wrote that is not language.
 *
 *  The artifact carries internal handles beside prose in the same fields:
 *  "hyp-acquisition-1", "c_2f9a", a bare uuid, a SCREAMING_ENUM. Those are how
 *  the engine talks to itself. Printed under a heading a customer reads, one
 *  of them ends up in a board deck, and every number on the page loses a
 *  little credibility with it.
 *
 *  The test is deliberately conservative: no spaces at all, or a slug shape,
 *  or a uuid, or an all caps token. Real prose always survives it. */
const HANDLE = /^[a-z0-9]+([-_.][a-z0-9]+)+$/i
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isHandle = (s: string): boolean => {
  const v = (s || '').trim()
  if (!v) return true
  if (UUID.test(v)) return true
  if (!/\s/.test(v)) return true
  if (HANDLE.test(v)) return true
  return /^[A-Z0-9_\s]+$/.test(v) && v.length < 40
}
/** A string that is safe to show a customer, or nothing. */
const prose = (s: string): string => (s && !isHandle(s) ? s : '')
const listOf = (v: unknown): string[] => asArray(v).map(textOf).filter(x => x && !isHandle(x))

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

/** Jump to / run details rail. Every entry mirrors a real, currently
 *  rendered section below (or a real field from the analysis record) -
 *  nothing here is invented, it is the same content relocated into the
 *  inspector rail the rest of the portal already uses. */
function LiveRail({ sev, confidence, jumps, meta, plan }: {
  sev: number; confidence: string
  jumps: [string, string][]
  meta: [string, string][]
  /** Where the plan stands. Absent when this analysis has no plan, which is
   *  a real state and not an empty one. */
  plan: { weeks: number; committed: number; now: number; gates: number; nextTask: string } | null
}) {
  return (
    <aside className="rail">
      {plan && plan.weeks > 0 && (
        <div className="blk railplan">
          <div className="rt">This plan</div>
          <div className="sevbig"><b>{plan.committed}</b>
            <span>of {plan.weeks} weeks committed</span></div>
          <div className="ggauge" style={{ marginTop: 10 }}>
            <i className={plan.committed === plan.weeks ? 'ok' : 'am'}
              style={{ width: Math.round((plan.committed / plan.weeks) * 100) + '%' }} />
            {plan.now > 0 && plan.now <= plan.weeks && (
              <span style={{ left: Math.round(((plan.now - 1) / plan.weeks) * 100) + '%' }} />
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="gkv"><span className="k">Today</span><span className="v2">
              {plan.now > plan.weeks ? 'past the horizon' : 'week ' + Math.max(1, plan.now)}</span></div>
            <div className="gkv"><span className="k">Decision gates</span><span className="v2">{plan.gates}</span></div>
            <div className="gkv"><span className="k">Next</span><span className="v2">{plan.nextTask}</span></div>
          </div>
        </div>
      )}
      {isFinite(sev) && sev > 0 && (
        <div className="blk">
          <div className="rt">Severity</div>
          <div className="sevbig"><b>{Math.min(10, Math.max(0, sev))}</b>
            <span>of 10{confidence ? ', ' + confidence.toLowerCase() + ' confidence' : ''}</span></div>
          <div className="railsegs">{Array.from({ length: 10 }, (_, i) =>
            <i key={i} className={i < sev ? 'f' : ''} />)}</div>
        </div>
      )}
      {jumps.length > 0 && (
        <div className="blk">
          <div className="rt">Jump to</div>
          <nav className="jump">
            {jumps.map(([id, label], i) => (
              <a key={id} href={'#' + id} className={i === 0 ? 'on' : ''}><i />{label}</a>
            ))}
          </nav>
        </div>
      )}
      {meta.length > 0 && (
        <div className="blk">
          <div className="rt">Run details</div>
          <dl>{meta.map(([k, v]) => <div key={k} className="kv"><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      )}
    </aside>
  )
}

const stamp = (ms: number): string => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Whether a field the engine wrote is something a person can answer yes or
 *  no to. The engine sometimes fills expected impact with "None directly, it
 *  unblocks the rest", which is an honest answer and a useless checklist
 *  line. Those are left out rather than asked. */
const isClaim = (t: string): boolean =>
  t.length > 12 && !/^(none|n\/?a|not applicable|tbd|to be determined|unknown|indirect)/i.test(t.trim())

/** The week by week commitment ledger for one phase. Each planned week is
 *  committed on its own, so the record at the end of the horizon says which
 *  weeks were actually worked, when, and by whom. Nothing is scored here;
 *  this only captures. */
function WeekLedger({ weeks, now, commits, onCommit, onUndo }: {
  weeks: number[]; now: number
  commits: Record<number, WeekCommit>
  onCommit: (w: number) => void
  onUndo: (w: number) => void
}) {
  return (
    <div className="wkcommit">
      <span className="lbl">Commit each week</span>
      <div className="wkrows">
        {weeks.map(w => {
          const c = commits[w]
          const due = now > 0 && w < now && !c
          return (
            <div key={w} className={'wkrow' + (c ? ' done' : due ? ' due' : '')}>
              <span className="wkn">Week {w}</span>
              <span className="wkst">
                {c
                  ? 'Committed ' + stamp(c.committedAt) + ' by ' + c.committedByName
                  : now > 0 && w > now ? 'Not started yet'
                  : due ? 'Not committed' : 'Open now'}
              </span>
              {c
                ? <button className="wkbtn undo" onClick={() => onUndo(w)}>Undo</button>
                : <button className="wkbtn" onClick={() => onCommit(w)}>Commit</button>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The closing check. It appears only once every planned week is committed,
 *  and every line in it is one of the engine's own predictions quoted back.
 *  Answering them is how a plan becomes evidence: the engine said in advance
 *  what would be true, and this is the record of whether it was. */
function PlanVerify({ spec, items, note, sealed, onAnswer, onNote, onCommit, onReopen }: {
  spec: CheckSpec[]
  items: CheckItem[]
  note: string
  sealed: Verification | null
  onAnswer: (q: CheckSpec, a: CheckAnswer) => void
  onNote: (t: string) => void
  onCommit: () => void
  onReopen: () => void
}) {
  const groups: string[] = []
  items.forEach(i => { if (groups.indexOf(i.group) < 0) groups.push(i.group) })
  const answered = items.filter(i => i.answer).length
  const yes = items.filter(i => i.answer === 'yes').length
  const no = items.filter(i => i.answer === 'no').length
  const OPTS: [CheckAnswer, string][] = [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Cannot tell']]

  return (
    <div className={'lvpanel vfy' + (sealed ? ' done' : '')} id="verify">
      <span className="lbl">Did the plan work</span><Why k="verify" />
      <p className="lvbody" style={{ maxWidth: '62ch' }}>
        Every week is committed, so the plan is finished. Each line below is
        something the engine said would be true by now, in its own words. Answer
        them and commit, and this analysis carries its own proof.
      </p>

      {groups.map(g => (
        <div key={g} className="vfygrp">
          <span className="lbl">{g}</span>
          {items.filter(i => i.group === g).map(i => {
            const q = spec.find(x => x.id === i.id)
            return (
              <div key={i.id} className={'vfyrow' + (i.answer ? ' set' : '')}>
                <span className="vfyt">{i.text}</span>
                {sealed
                  ? <span className={'vfytag ' + (i.answer || 'unsure')}>
                      {i.answer === 'yes' ? 'Yes' : i.answer === 'no' ? 'No' : 'Cannot tell'}</span>
                  : (
                    <span className="vfyseg" role="group" aria-label={i.text}>
                      {OPTS.map(([val, label]) => (
                        <button key={val} className={i.answer === val ? 'on ' + val : ''}
                          aria-pressed={i.answer === val}
                          onClick={() => q && onAnswer(q, val)}>{label}</button>
                      ))}
                    </span>
                  )}
              </div>
            )
          })}
        </div>
      ))}

      {sealed
        ? (
          <div className="vfysealed">
            <div className="vfysum">
              <b>{yes} of {items.length} confirmed</b>
              {no > 0 && <span>, {no} did not hold</span>}
              <span className="vfyby">Committed {stamp(sealed.verifiedAt)} by {sealed.verifiedByName}</span>
            </div>
            {sealed.note && <p className="vfynoteread">{sealed.note}</p>}
            <button className="wkbtn undo" onClick={onReopen}>Reopen</button>
          </div>
        )
        : (
          <>
            <textarea className="vfynote" rows={3} value={note}
              onChange={e => onNote(e.target.value)}
              placeholder="Anything the checklist does not capture. Optional." />
            <div className="vfyfoot">
              <span className="lvmut">{answered} of {items.length} answered</span>
              <button className="btn p" disabled={answered < items.length} onClick={onCommit}>
                Commit the check</button>
            </div>
            {answered < items.length && (
              <span className="lvmut vfyhint">Answer every line to commit. Use Cannot tell where
                the number was never measured; it counts as unmeasured, not as a failure.</span>
            )}
          </>
        )}
    </div>
  )
}

/** One v4 phase, rendered in the demo's own card anatomy. */
function LivePhase({ p, n, open, toggle, weeks, now, commits, onCommit, onUndo }: {
  p: Loose; n: number; open: boolean; toggle: () => void
  weeks: number[]; now: number
  commits: Record<number, WeekCommit>
  onCommit: (w: number) => void
  onUndo: (w: number) => void
}) {
  const steps = listOf(p.steps)
  const eff = textOf(p.effort)
  const done = weeks.filter(w => commits[w]).length
  return (
    <div className={'ph' + (open ? ' open' : '') + (weeks.length > 0 && done === weeks.length ? ' committed' : '')}>
      <span className="wk">{textOf(p.weeks) || 'Phase ' + n}</span><span className="node" />
      <div className="pcard">
        <div className="phd" onClick={toggle}>
          <span className="no">{n}</span>
          <span className="tt">{textOf(p.title)}</span>
          {weeks.length > 0 && (
            <span className={'wkcount' + (done === weeks.length ? ' all' : '')}>
              {done} of {weeks.length} committed</span>
          )}
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
          {weeks.length > 0 && (
            <WeekLedger weeks={weeks} now={now} commits={commits} onCommit={onCommit} onUndo={onUndo} />
          )}
        </div>
      </div>
    </div>
  )
}

export function LiveDetail({ id }: { id: string }) {
  const nav = useNavigate()
  const me = useMe()
  const [d, setD] = useState<AnalysisDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [openPhase, setOpenPhase] = useState(0)
  /* Bumped after every commit so the ledger below re-reads from storage. */
  const [ledger, setLedger] = useState(0)
  /* The editorial layer, off by default. Off is the analysis exactly as the
   * engine wrote it, which is the state anyone reading it for the first time
   * should get. */
  const [markup, setMarkup] = useState(false)

  /* How often a running analysis is re-read.
   *
   *  This was a flat twelve seconds, which meant a run that finished one
   *  second after a poll sat finished and unseen for eleven more. On a three
   *  minute analysis that is a sixth of the wait added at the very end, where
   *  it is most noticeable, and none of it is the engine's fault.
   *
   *  A run rarely lands in the first few seconds, so the interval opens at
   *  two and a half and widens toward eight. Fast where the answer might
   *  arrive, unhurried while the engine is clearly still working, and never
   *  more requests in total than the flat twelve second version made. */
  useEffect(() => {
    let live = true
    let timer: number | undefined
    let waits = 0
    const nextDelay = (): number => Math.min(8000, 2500 + waits++ * 900)
    const load = () => api.getAnalysis(id).then(x => {
      if (!live) return
      setD(x); setErr(null)
      const st = (x.status || '').toLowerCase()
      if (st === 'queued' || st === 'running' || st === 'processing') {
        timer = window.setTimeout(load, nextDelay())
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
  /* The engine sends the category in caps. The design system is explicit that
     readouts are language rather than shouting, so it is cased here rather
     than styled into submission, which would leave the raw value in the DOM
     for anything that copies it. */
  const categoryRaw = textOf(pick(c, ['category'])) || textOf(pick(raw, ['primaryConstraintCategory']))
  const category = categoryRaw && categoryRaw === categoryRaw.toUpperCase()
    ? categoryRaw.toLowerCase().replace(/(^|[\s/_-])([a-z])/g, (_m, p1, p2) => p1 + p2.toUpperCase()).replace(/_/g, ' ')
    : categoryRaw
  const sevRaw = pick(c, ['severityScore', 'severity']) ?? pick(raw, ['severityScore'])
  const sev = typeof sevRaw === 'number' ? sevRaw : parseInt(String(sevRaw || ''), 10)
  const confidence = textOf(pick(c, ['confidenceLevel', 'confidence']))
  const finding = prose(textOf(pick(c, ['description', 'summary'])))
  const causes = listOf(pick(c, ['rootCauses']) || pick(raw, ['rootCauses']))

  /* The v4 timeline: the play-bank engine's artifact. */
  const et = pick(raw, ['executionTimeline']) as Loose | undefined
  const phases = asArray(pick(et, ['phases'])) as Loose[]
  const gates = asArray(pick(et, ['decisionGates', 'gates'])) as Loose[]
  const indicators = asArray(pick(et, ['indicators']))
  const sequencing = prose(textOf(pick(et, ['sequencingLogic'])))
  const planHeadline = prose(textOf(pick(et, ['headline'])))
  const horizon = pick(et, ['horizonWeeks'])
  /* Sub-diagnosis is sometimes a sentence and sometimes an internal handle
     like "hyp-acquisition-1". A handle is not an explanation, and printing one
     under a heading a customer reads is how an engine identifier ends up in a
     board deck. Anything that does not read as prose is dropped. */
  const subDiagnosisRaw = textOf(pick(et, ['subDiagnosis']))
  const subDiagnosis = prose(subDiagnosisRaw)

  /* Evidence, narrative, feasibility: the honest layers. */
  const ep = pick(raw, ['evidencePackage']) as Loose | undefined
  const supporting = listOf(pick(ep, ['supporting', 'supportingEvidence']))
  const contradicting = listOf(pick(ep, ['contradicting', 'contradictingEvidence']))
  const epLimitations = listOf(pick(ep, ['limitations', 'dataLimitations']) || pick(c, ['dataLimitations']))
  const narrative = pick(raw, ['claudeNarrative'])
  const narrativeText = typeof narrative === 'string' ? narrative
    : textOf(pick(narrative, ['narrative', 'summary', 'text', 'body', 'headline']))
  /* Feasibility is an array of per-constraint entries. The entry that backs
   * the headline is the one matching the deterministic selection; the first
   * entry is only a fallback. The engine's impactP10/impactP90 bound the RAW
   * impact, so they are scaled here by the same execution and causal discount
   * that produced adjustedOpportunity - one coherent quantity, not a point
   * from one distribution shown inside bounds from another. */
  const feasRaw = pick(raw, ['interventionFeasibility'])
  const feasList = (Array.isArray(feasRaw) ? feasRaw : feasRaw ? [feasRaw] : []) as Loose[]
  const selectedId = textOf(pick(raw, ['constraintDecision', 'selectedConstraintId'])
    ?? pick(pick(raw, ['constraintDecision']) as Loose, ['selectedConstraintId']))
  const feasEntry = feasList.find(f => selectedId && textOf(pick(f, ['constraintId'])) === selectedId) ?? feasList[0]
  const upside = money(pick(feasEntry, ['adjustedOpportunity', 'adjustedMonthlyOpportunity']) ?? pick(raw, ['estimatedMonthlyUpside']))
  const upsideFromFunnel = textOf(pick(feasEntry, ['impactSource'])) === 'funnel_posterior'
  const upsideStage = textOf(pick(feasEntry, ['impactStage'])).replace(/_/g, ' ').replace(/\s*(?:->|\u2192)\s*/g, ' to ')
  const numOf = (v: unknown): number => { const n = typeof v === 'number' ? v : parseFloat(String(v)); return isFinite(n) ? n : NaN }
  const upDiscount = numOf(pick(feasEntry, ['executionProbability'])) * numOf(pick(feasEntry, ['causalSuccessProbability']))
  const upLow = money(numOf(pick(feasEntry, ['impactP10'])) * upDiscount)
  const upHigh = money(numOf(pick(feasEntry, ['impactP90'])) * upDiscount)
  const upsideRange = upsideFromFunnel && upLow && upHigh ? { low: upLow, high: upHigh } : null

  /* Role gate from the Teams permission matrix. Owner sees everything, so
   * the default workspace renders exactly as before. */
  const acc = analysisAccess()
  const brainStatus = textOf(pick(raw, ['brainAnalysisStatus']))
  const engineVersion = textOf(pick(raw, ['engineVersion']))

  const fallbackPlan = pick(raw, ['executionPlan']) as Loose | undefined
  const fallbackWhy = prose(textOf(pick(fallbackPlan, ['rationale'])))

  /* Jump to / run details: built only from sections that actually render
   * below, using their real, already-shipped labels. */
  const jumps: [string, string][] = []
  if (finding) jumps.push(['verdict', 'What the engine found'])
  if (narrativeText) jumps.push(['narrative', 'The verdict, in full'])
  if (causes.length > 0) jumps.push(['causes', 'Root causes'])
  if (acc.evidence && (supporting.length > 0 || contradicting.length > 0)) jumps.push(['evidence', 'Evidence'])
  if (acc.plan && phases.length > 0) jumps.push(['plan', 'The plan'])
  if (acc.plan && gates.length > 0) jumps.push(['gates', 'Decision gates'])
  if (acc.plan && indicators.length > 0) jumps.push(['indicators', 'Watch conditions'])
  if (acc.evidence && epLimitations.length > 0) jumps.push(['limits', 'What would prove this wrong'])

  /* The week map the plan actually covers. Each phase owns the weeks its own
   * label names; the first phase to claim a week keeps it, so nothing is
   * committed twice. This map is also the yardstick the record is scored
   * against later: a week nobody committed is a week that shows as missed. */
  const claimed = new Set<number>()
  const phaseWeekMap: number[][] = phases.map((p, i) => {
    const ws = phaseWeeks(textOf(p.weeks), i).filter(w => !claimed.has(w))
    ws.forEach(w => claimed.add(w))
    return ws
  })
  const plannedWeeks = phaseWeekMap.reduce((n, ws) => n + ws.length, 0)

  const startedAt = d?.createdAt ? new Date(d.createdAt).getTime() : 0
  const planMeta: PlanMeta = {
    businessName: d?.businessName || '',
    startedAt: isFinite(startedAt) ? startedAt : 0,
    horizonWeeks: typeof horizon === 'number' ? horizon : plannedWeeks,
    phaseCount: phases.length
  }
  const nowWeek = planMeta.startedAt ? currentWeek(planMeta.startedAt) : 0
  /* ledger is read here so a commit re-renders the whole plan section. */
  void ledger
  const commits: Record<number, WeekCommit> = {}
  committedWeeks(id).forEach(c => { commits[c.week] = c })
  const committedCount = Object.keys(commits).length

  const doCommit = (week: number, phaseIndex: number, phaseTitle: string) => {
    commitWeek(id, planMeta, week, phaseIndex, phaseTitle, '', me ? me.name : '')
    setLedger(v => v + 1)
    toast('Week ' + week + ' committed. It is on the record for this plan.')
  }
  const doUndo = (week: number) => {
    uncommitWeek(id, week)
    setLedger(v => v + 1)
    toast('Week ' + week + ' commit removed.')
  }

  /* The closing check, built entirely from the engine's own claims. Every
   * line is a prediction it made in advance: a phase's done-when, an
   * indicator and its target, a decision gate's condition, a phase's expected
   * impact. Nothing here is written by the portal except the last line, which
   * asks the only question the whole analysis was for. */
  const checkSpec: CheckSpec[] = []
  const G_LAND = 'What was supposed to land'
  const G_MOVE = 'What the engine said would move'
  const G_CALL = 'The call itself'
  phases.forEach((p, i) => {
    const dw = textOf(p.doneWhen)
    if (dw) checkSpec.push({ id: 'done-' + i, group: G_LAND, text: dw })
  })
  phases.forEach((p, i) => {
    const del = textOf(p.deliverable)
    if (del && !textOf(p.doneWhen)) checkSpec.push({ id: 'del-' + i, group: G_LAND, text: del + ' was delivered' })
  })
  indicators.forEach((x, i) => {
    const nm = textOf(x)
    const tgt = textOf(pick(x, ['target', 'threshold', 'goal']))
    if (nm) checkSpec.push({
      id: 'ind-' + i, group: G_MOVE,
      text: tgt && tgt !== nm ? nm + ' reached ' + tgt : nm + ' moved as the engine expected'
    })
  })
  gates.forEach((g, i) => {
    const q = textOf(pick(g, ['condition', 'question', 'criteria', 'checkpoint', 'description']))
    if (q) checkSpec.push({ id: 'gate-' + i, group: G_MOVE, text: q })
  })
  phases.forEach((p, i) => {
    const ei = textOf(p.expectedImpact)
    if (ei && isClaim(ei)) checkSpec.push({ id: 'imp-' + i, group: G_MOVE, text: ei })
  })
  if (headline) checkSpec.push({
    id: 'verdict', group: G_CALL,
    text: 'The constraint this analysis named is no longer the thing holding growth back.'
  })

  const planFinished = plannedWeeks > 0 && committedCount === plannedWeeks
  /* The rail only ever lists sections that actually render, so this entry
   * arrives with the panel and sits directly under the plan it closes. */
  if (acc.plan && planFinished && checkSpec.length > 0) {
    const at = jumps.findIndex(j => j[0] === 'plan')
    const entry: [string, string] = ['verify', 'Did the plan work']
    if (at >= 0) jumps.splice(at + 1, 0, entry)
    else jumps.push(entry)
  }
  const savedVerification = verificationOf(id)
  const sealed = savedVerification && savedVerification.verifiedAt ? savedVerification : null
  const checkItems = sealed ? sealed.items : checklistFor(id, checkSpec)
  const checkNote = savedVerification ? savedVerification.note : ''

  const doAnswer = (q: CheckSpec, a: CheckAnswer) => {
    setAnswer(id, planMeta, q, a)
    setLedger(v => v + 1)
  }
  const doNote = (t: string) => {
    setVerificationNote(id, planMeta, t)
    setLedger(v => v + 1)
  }
  const doVerify = () => {
    commitVerification(id, planMeta, checkSpec, me ? me.name : '')
    setLedger(v => v + 1)
    toast('Check committed. This analysis now carries its own result.')
  }
  const doReopen = () => {
    reopenVerification(id)
    setLedger(v => v + 1)
    toast('Check reopened. Your answers are still here.')
  }

  const metaRows: [string, string][] = []
  if (fmtDate(d?.createdAt)) metaRows.push(['Started', fmtDate(d?.createdAt)])
  if (fmtDate(d?.completedAt)) metaRows.push(['Completed', fmtDate(d?.completedAt)])
  if (duration(d?.createdAt, d?.completedAt)) metaRows.push(['Duration', duration(d?.createdAt, d?.completedAt)])
  if (brainStatus) metaRows.push(['Constraint selection', brainStatus.replace(/_/g, ' ')])
  if (engineVersion) metaRows.push(['Engine', engineVersion])

  /* ---------------------------------------------------------------------
     The derivation, as a ledger.

     Every row is a field the engine actually sent, or arithmetic over two of
     them. Nothing here is written by the portal. The raw central figure is
     recovered by dividing the adjusted number back out by the same two
     discounts that produced it, so the chain reads in the order the engine
     applied it rather than in the order the payload happens to arrive.
     --------------------------------------------------------------------- */
  type Step = { k: string; v: string; note?: string; num?: number; rule?: boolean; res?: boolean }
  const dollars = (n: number): string =>
    isFinite(n) && n > 0 ? '$' + Math.round(n).toLocaleString() : ''
  const chain: Step[] = []
  if (acc.financials && upside) {
    const p10 = numOf(pick(feasEntry, ['impactP10']))
    const p90 = numOf(pick(feasEntry, ['impactP90']))
    const adj = numOf(pick(feasEntry, ['adjustedOpportunity', 'adjustedMonthlyOpportunity']))
    const exec = numOf(pick(feasEntry, ['executionProbability']))
    const causal = numOf(pick(feasEntry, ['causalSuccessProbability']))
    let n = 0
    if (upsideStage) chain.push({ k: 'Stage the impact was measured at', v: upsideStage, num: ++n })
    if (isFinite(p10) && isFinite(p90) && p10 > 0) {
      chain.push({ k: 'Modelled monthly impact, 10th percentile', v: dollars(p10), num: ++n })
      chain.push({ k: 'Modelled monthly impact, 90th percentile', v: dollars(p90), num: ++n })
    }
    if (isFinite(adj) && isFinite(upDiscount) && upDiscount > 0) {
      chain.push({ k: 'Central impact before discounting', v: dollars(adj / upDiscount), num: ++n, rule: true })
    }
    if (isFinite(exec)) chain.push({ k: 'Execution probability', note: 'team size, tooling, prior plans', v: '\u00d7\u2009' + exec.toFixed(2) })
    if (isFinite(causal)) chain.push({ k: 'Causal success probability', note: 'strength of the evidence', v: '\u00d7\u2009' + causal.toFixed(2) })
    if (isFinite(adj) && adj > 0) {
      chain.push({ k: 'Adjusted monthly opportunity', v: dollars(adj), res: true })
    }
    if (upsideRange) {
      chain.push({
        k: 'Range carried to the headline',
        note: 'both ends through the same two discounts',
        v: upsideRange.low.replace('+', '').replace(' a month', '') + ' to ' + upsideRange.high.replace('+', '').replace(' a month', '')
      })
    }
  }
  const copyChain = () => {
    const txt = chain.map(s => s.k + (s.note ? ' (' + s.note + ')' : '') + ': ' + s.v).join('\n')
    navigator.clipboard?.writeText(txt)
      .then(() => toast('Derivation copied.'), () => toast('Could not copy.'))
  }

  /* The strip needs to know which phase owns this week, because committing a
     week is a claim about a specific phase and the record stores both. */
  const nowPhase = phaseWeekMap.findIndex(ws => ws.indexOf(nowWeek) >= 0)
  const canCommitNow = acc.plan && nowPhase >= 0 && nowWeek > 0 && !commits[nowWeek]
  const planState = plannedWeeks === 0 ? 'No plan'
    : planFinished ? 'Complete'
      : committedCount > 0 ? 'Running' : 'Not started'
  const jumpTo = (anchor: string) => {
    const el = document.getElementById(anchor)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.origin + '/analyses/' + id)
      .then(() => toast('Link copied.'), () => toast('Could not copy.'))
  }

  return (
    <div className="scr on">
      <div className="apphdr">
        <button className="back" aria-label="Back" onClick={() => nav('/analyses')}>
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M10 3L5 8l5 5" /></svg>
        </button>
        <span className="ttl">{d && d.businessName && d.businessName !== 'Untitled business' ? d.businessName : 'Analysis'}</span>
        {d && <span className={'stat' + (complete ? ' ok' : running ? ' run' : '')} style={{ marginLeft: 10 }}>
          <i />{complete ? 'Complete' : failed ? 'Failed' : running ? 'Running' : d.status}</span>}
        <span className="sp" />
        {d && complete && (
          <button className={'btn g edtoggle' + (markup ? ' on' : '')} aria-pressed={markup}
            onClick={() => setMarkup(!markup)}>{markup ? 'Done marking' : 'Mark up'}</button>
        )}
      </div>

      {/* The live status strip. Where the plan stands, before anything is
          read. It is the difference between a document about a diagnosis and
          a surface that is running one. */}
      {d && complete && acc.plan && plannedWeeks > 0 && (
        <div className="gstrip">
          <div className="gstripc"><span className="k">Plan</span>
            <span className="v">
              <i className={'dot' + (planState === 'Running' ? ' run' : planState === 'Complete' ? ' ok' : '')} />
              {planState}</span></div>
          <div className="gstripc"><span className="k">Progress</span>
            <span className="v">{nowWeek > plannedWeeks ? 'Past week ' + plannedWeeks : 'Week ' + Math.max(1, nowWeek) + ' of ' + plannedWeeks}</span>
            <span className="gstripbar"><i style={{ width: Math.min(100, Math.round((Math.max(0, nowWeek) / plannedWeeks) * 100)) + '%' }} /></span></div>
          <div className="gstripc"><span className="k">Weeks committed</span>
            <span className="v">{committedCount} of {plannedWeeks}</span></div>
          {gates.length > 0 && (
            <div className="gstripc"><span className="k">Decision gates</span>
              <span className="v">{gates.length} set in advance</span></div>
          )}
          {indicators.length > 0 && (
            <div className="gstripc"><span className="k">Watching</span>
              <span className="v">{indicators.length} {indicators.length === 1 ? 'indicator' : 'indicators'}</span></div>
          )}
          {canCommitNow && (
            <div className="gstripact">
              <button className="btn g" style={{ padding: '6px 12px', fontSize: 12, minHeight: 0 }}
                onClick={() => doCommit(nowWeek, nowPhase, textOf(phases[nowPhase].title))}>
                Commit week {nowWeek}</button>
            </div>
          )}
        </div>
      )}

      <div className="canvas" style={d && complete ? undefined : { gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap lvwrap gwrap">

          {!d && !err && (
            <div className="gcenter" aria-busy="true">
              <span className="skel" style={{ width: 220 }} />
              <span className="skel" style={{ width: 320 }} />
              <span className="skel" style={{ width: 180 }} />
            </div>
          )}

          {err && (
            <div className="gcenter">
              <b>Could not load this analysis.</b>
              <span>{err}</span>
            </div>
          )}

          {d && running && (
            <div className="gcenter">
              <span className="lvpulse" aria-hidden="true" />
              <b>The engine is working.</b>
              <span>Started {fmtDate(d.createdAt)}. Verdicts usually land in under ten minutes; this page refreshes itself.</span>
            </div>
          )}

          {d && failed && (
            <div className="gcenter">
              <b>This analysis failed.</b>
              <span>The workbook may not have had enough numeric data to score. Run it again from the Google Sheets{'\u2122'} add-on.</span>
            </div>
          )}

          {d && complete && (
            <>
              {acc.previewing && (!acc.evidence || !acc.financials || !acc.plan) && (
                <Section title="Role preview" qualifier={acc.role}>
                  <p className="gbody">Sections this role cannot access are hidden: {[
                    !acc.evidence && 'evidence', !acc.financials && 'financials', !acc.plan && 'the plan'
                  ].filter(Boolean).join(', ')}.</p>
                </Section>
              )}

              {/* The finding: the claim, the money, and the controls that act
                  on both. Everything below this block exists to be attacked. */}
              <div className="gfind">
                <div className="gtagrow">
                  {category && <span className="gtag"><i />{category}<Why k="category" /></span>}
                  {isFinite(sev) && sev > 0 && (
                    <span className="gtagm">Severity {Math.min(10, Math.max(0, sev))} of 10
                      {confidence ? ', ' + confidence.toLowerCase() + ' confidence' : ''}<Why k="severity" /></span>
                  )}
                </div>
                <h1 className="ghl">{headline || 'Constraint identified.'}</h1>
                {acc.financials && upside && (
                  <div className="gimpact">
                    {upsideRange ? (
                      <>
                        <span className="f">{upsideRange.low.replace('+', '').replace(' a month', '')} to {upsideRange.high.replace('+', '').replace(' a month', '')}</span>
                        <span className="s">a month · central estimate {upside.replace('+', '').replace(' a month', '')}
                          {upsideStage ? ' · measured at the ' + upsideStage + ' stage' : ''}</span>
                      </>
                    ) : (
                      <>
                        <span className="f">{upside.replace('+', '').replace(' a month', '')}</span>
                        <span className="s">a month · modelled from category benchmarks, not yet measured from your funnel</span>
                      </>
                    )}
                    <Why k="upside" />
                  </div>
                )}
                <div className="gacts">
                  {acc.plan && phases.length > 0 && (
                    <button className="btn d" onClick={() => jumpTo('plan')}>
                      Open the {typeof horizon === 'number' ? horizon + ' week' : ''} plan</button>
                  )}
                  {acc.evidence && (supporting.length > 0 || contradicting.length > 0) && (
                    <button className="btn g" onClick={() => jumpTo('evidence')}>See the evidence</button>
                  )}
                  {narrativeText && <button className="btn g" onClick={() => jumpTo('narrative')}>Read the verdict</button>}
                  <button className="btn g" onClick={copyLink}>Copy link</button>
                </div>
              </div>

              {acc.financials && upside && chain.length > 0 && (
                <Section
                  id="derivation"
                  title="Derivation"
                  qualifier={chain.length + ' steps'}
                  verbs={[{ label: 'Copy the numbers', onClick: copyChain }]}
                >
                  <div className="gchain">
                    {chain.map((s, i) => (
                      <div key={s.k} className={'gstep' + (s.rule ? ' rule' : '') + (s.res ? ' res' : '')}>
                        <span className="i">{s.res || !s.num ? '' : s.num}</span>
                        <span className="n">{s.k}{s.note && <em>{'  ' + s.note}</em>}</span>
                        <span className="v">{s.v}</span>
                      </div>
                    ))}
                  </div>
                  <p className="gchainnote">{upsideFromFunnel
                    ? 'Every figure above is read from your own workbook or scored by the engine. The two multipliers are separate questions the engine answers separately: whether this team executes the change, and whether the change causes the outcome. Change either and the range moves with it.'
                    : 'This run had no measured funnel to model against, so the impact came from category benchmarks rather than your numbers. Adding lead, opportunity and win counts to the sheet replaces the benchmark with a measured range.'}</p>
                </Section>
              )}

              {subDiagnosis && (
                <Section title="Sub-diagnosis">
                  <Why k="subDiagnosis" />
                  <p className="gbody">{subDiagnosis}</p>
                </Section>
              )}

              {finding && (
                <Section id="verdict" title="What the engine found">
                    <Why k="verdict" />
                    <p className="gbody">{finding}</p>
                  </Section>
              )}

              {narrativeText && (
                <Section id="narrative" title="The verdict, in full" qualifier="unedited">
                    <Why k="narrative" />
                    <p className="gbody pre">{narrativeText}</p>
                  </Section>
              )}

              {causes.length > 0 && (
                <Section id="causes" title="Root causes" qualifier={causes.length + (causes.length === 1 ? ' cause' : ' causes')}>
                    <Why k="causes" />
                    <ul className="glist2">{causes.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </Section>
              )}

              {acc.evidence && (supporting.length > 0 || contradicting.length > 0) && (
                <Section
                    id="evidence"
                    title="Evidence"
                    qualifier={supporting.length + ' for, ' + contradicting.length + ' against'}
                    flush
                  >
                    <div className="gtwo">
                      {supporting.length > 0 && (
                        <div><span className="k">For this call<Why k="supporting" /></span>
                          <ul className="glist2">{supporting.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                      )}
                      {contradicting.length > 0 && (
                        <div><span className="k">Against it<Why k="contradicting" /></span>
                          <ul className="glist2">{contradicting.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
                      )}
                    </div>
                  </Section>
              )}

              {acc.plan && indicators.length > 0 && (
                <Section
                    id="indicators"
                    title="Watch conditions"
                    qualifier={indicators.length + ', none read yet'}
                    verbs={gates.length > 0 ? [{ label: 'See the gates', onClick: () => jumpTo('gates') }] : undefined}
                    flush
                  >
                    <p className="gwatchnote">Each of these was named before the work started. The engine reads
                      them against your workbook at the gate that closes the phase they belong to, and a condition
                      that breaks withdraws the finding rather than lowering it.</p>
                    <div className="gwatch">
                      {indicators.map((x, i) => {
                        const nm = prose(textOf(x)) || textOf(x)
                        const tgt = prose(textOf(pick(x, ['target', 'threshold', 'goal'])))
                        /* Which gate will score this one. Indicators and gates
                           are both ordered by the phase they belong to, so the
                           gate that closes the phase this indicator sits in is
                           the one that reads it. */
                        const gi = gates.length ? Math.min(gates.length - 1, Math.floor(i * gates.length / Math.max(1, indicators.length))) : -1
                        const gt = gi >= 0 ? textOf(gates[gi].timing) : ''
                        return (
                          <div key={i} className="gwc">
                            <div className="gwch">
                              <span className="n">{nm}</span>
                              {gi >= 0 && <span className="w">{gt ? 'read at ' + gt : 'gate ' + (gi + 1)}</span>}
                            </div>
                            <div className="gwct">{tgt && tgt !== nm
                              ? <>Holds while <b>{tgt}</b></>
                              : 'No threshold was set for this one'}</div>
                            <div className="gwcm">
                              <span className="gst none">{tgt && tgt !== nm ? 'Not read yet' : 'Cannot pass or fail'}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </Section>
              )}

              {acc.evidence && epLimitations.length > 0 && (
                <Section id="limits" title="What would prove this wrong" qualifier="stated in advance">
                    <Why k="limits" />
                    <ul className="glist2">{epLimitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </Section>
              )}

              {acc.plan && gates.length > 0 && (
                <Section id="gates" title="Decision gates" qualifier="set before the work started" flush>
                    <div className="ggates">
                      {gates.map((g, i) => (
                        <div key={i} className="ggate">
                          <div className="gh"><b>Gate {i + 1}</b>
                            {textOf(g.timing) && <span>{textOf(g.timing)}</span>}
                            {i === 0 && <Why k="gates" />}</div>
                          <div className="q">{prose(textOf(pick(g, ['condition', 'question', 'criteria', 'checkpoint', 'description'])))}</div>
                          {(textOf(g.ifPass) || textOf(g.ifMiss)) && (
                            <div className="x">
                              {prose(textOf(g.ifPass)) && <div>If it passes, <b>{prose(textOf(g.ifPass))}</b></div>}
                              {prose(textOf(g.ifMiss)) && <div>If it misses, <b>{prose(textOf(g.ifMiss))}</b></div>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Section>
              )}

              {acc.plan && phases.length > 0 && (
                <Section
                    id="plan"
                    title="The plan"
                    qualifier={(typeof horizon === 'number' ? horizon + ' weeks, ' : '') + phases.length + ' phases, ' + gates.length + ' gates'}
                    verbs={[{ label: 'Jump to gates', onClick: () => jumpTo('gates'), disabled: gates.length === 0 }]}
                    flush
                  >
                    <div className="lvtimeline">
                      <div className="lvplanhead">
                        <Why k="plan" />
                        {planHeadline && <b className="lvplant">{planHeadline}</b>}
                        {sequencing && <p className="gbody">{sequencing}</p>}
                        {plannedWeeks > 0 && (
                          <div className="planprog">
                            <span className="lbl">Plan progress</span><Why k="planprog" />
                            <div className="planbar" role="img"
                              aria-label={committedCount + ' of ' + plannedWeeks + ' weeks committed'
                                + (nowWeek > 0 ? '. Today is week ' + nowWeek + ' of ' + plannedWeeks : '')}>
                              <i className="fill"
                                style={{ width: Math.round((committedCount / plannedWeeks) * 100) + '%' }} />
                              {nowWeek > 0 && nowWeek <= plannedWeeks && (
                                <span className="now"
                                  style={{ left: Math.round(((nowWeek - 1) / plannedWeeks) * 100) + '%' }} />
                              )}
                            </div>
                            <div className="planlegend">
                              <span className="pk"><i className="sw done" />
                                {committedCount} of {plannedWeeks} weeks committed</span>
                              {nowWeek > 0 && nowWeek <= plannedWeeks && (
                                <span className="pk"><i className="sw now" />
                                  Today, week {nowWeek} of {plannedWeeks}</span>
                              )}
                              {nowWeek > plannedWeeks && (
                                <span className="pk"><i className="sw now" />
                                  The {plannedWeeks} week plan has ended</span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="plan">
                        {phases.map((p, i) => (
                          <LivePhase key={i} p={p} n={i + 1} open={openPhase === i}
                            toggle={() => setOpenPhase(openPhase === i ? -1 : i)}
                            weeks={phaseWeekMap[i]} now={nowWeek} commits={commits}
                            onCommit={w => doCommit(w, i, textOf(p.title))}
                            onUndo={doUndo} />
                        ))}
                      </div>
                    </div>
                  </Section>
              )}

              {acc.plan && planFinished && checkSpec.length > 0 && (
                <div id="verify">
                  <PlanVerify spec={checkSpec} items={checkItems} note={checkNote} sealed={sealed}
                    onAnswer={doAnswer} onNote={doNote} onCommit={doVerify} onReopen={doReopen} />
                </div>
              )}

              {acc.plan && phases.length === 0 && (
                <Section title="The plan" qualifier="none written">
                  {fallbackWhy && <p className="gbody">{fallbackWhy}</p>}
                  <p className="gbody">The engine wrote no phased timeline for this run. When it cannot observe
                    enough to plan honestly, it says so instead of inventing one.</p>
                </Section>
              )}

              {/* Mounted last so the sections it reaches into already exist. */}
              <Editorial analysisId={id} on={markup} />
            </>
          )}

        </div>
        {d && complete && <LiveRail sev={sev} confidence={confidence} jumps={jumps} meta={metaRows}
          plan={acc.plan && plannedWeeks > 0 ? {
            weeks: plannedWeeks, committed: committedCount, now: nowWeek, gates: gates.length,
            nextTask: nowWeek > plannedWeeks ? 'the horizon has passed'
              : commits[nowWeek] ? 'week ' + nowWeek + ' is committed'
                : nowWeek > 0 ? 'commit week ' + nowWeek : 'commit week 1'
          } : null} />}
      </div>
    </div>
  )
}
