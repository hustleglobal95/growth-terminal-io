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

/** Jump to / run details rail. Every entry mirrors a real, currently
 *  rendered section below (or a real field from the analysis record) -
 *  nothing here is invented, it is the same content relocated into the
 *  inspector rail the rest of the portal already uses. */
function LiveRail({ sev, confidence, jumps, meta }: {
  sev: number; confidence: string
  jumps: [string, string][]
  meta: [string, string][]
}) {
  return (
    <aside className="rail">
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
      <span className="lbl">Did the plan work</span>
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

  /* Jump to / run details: built only from sections that actually render
   * below, using their real, already-shipped labels. */
  const jumps: [string, string][] = []
  if (finding) jumps.push(['verdict', 'What the engine found'])
  if (narrativeText) jumps.push(['narrative', 'The verdict, in full'])
  if (causes.length > 0) jumps.push(['causes', 'Root causes'])
  if (acc.evidence && (supporting.length > 0 || contradicting.length > 0)) jumps.push(['evidence', 'What the data said'])
  if (acc.plan && phases.length > 0) jumps.push(['plan', 'The 90 day plan'])
  if (acc.plan && gates.length > 0) jumps.push(['gates', 'Decision gates'])
  if (acc.plan && indicators.length > 0) jumps.push(['indicators', 'Indicators'])
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
      <div className="canvas" style={d && complete ? undefined : { gridTemplateColumns: 'minmax(0,1fr)' }}>
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

              {finding && (
                <div className="lvpanel" id="verdict"><span className="lbl">What the engine found</span>
                  <p className="lvbody">{finding}</p></div>
              )}

              {narrativeText && (
                <div className="lvpanel" id="narrative"><span className="lbl">The verdict, in full</span>
                  <p className="lvbody lvpre">{narrativeText}</p></div>
              )}

              {causes.length > 0 && (
                <div className="lvpanel" id="causes"><span className="lbl">Root causes</span>
                  <ul className="lvlist">{causes.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
              )}

              {acc.evidence && (supporting.length > 0 || contradicting.length > 0) && (
                <div className="lvcall" id="evidence">
                  {supporting.length > 0 && <div className="lvpanel"><span className="lbl">Evidence for this call</span>
                    <ul className="lvlist">{supporting.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                  {contradicting.length > 0 && <div className="lvpanel"><span className="lbl">Evidence against it</span>
                    <ul className="lvlist">{contradicting.map((x, i) => <li key={i}>{x}</li>)}</ul></div>}
                </div>
              )}

              {acc.plan && phases.length > 0 && (
                <div className="lvtimeline" id="plan">
                  <div className="lvplanhead">
                    <span className="lbl">The plan, as the engine wrote it</span>
                    {planHeadline && <b className="lvplant">{planHeadline}</b>}
                    {typeof horizon === 'number' && <span className="lvmut">{horizon} weeks, {phases.length} phases, {gates.length} decision gates</span>}
                    {sequencing && <p className="lvbody">{sequencing}</p>}
                    {plannedWeeks > 0 && (
                      <div className="planprog">
                        <span className="lbl">Plan progress</span>
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
              )}

              {acc.plan && planFinished && checkSpec.length > 0 && (
                <PlanVerify spec={checkSpec} items={checkItems} note={checkNote} sealed={sealed}
                  onAnswer={doAnswer} onNote={doNote} onCommit={doVerify} onReopen={doReopen} />
              )}

              {acc.plan && gates.length > 0 && (
                <div className="lvpanel" id="gates"><span className="lbl">Decision gates</span>
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
                <div className="lvpanel" id="indicators"><span className="lbl">Indicators the engine is watching</span>
                  <ul className="lvlist">{indicators.map((x, i) => {
                    const nm = textOf(x)
                    const tgt = textOf(pick(x, ['target', 'threshold', 'goal']))
                    return <li key={i}>{nm}{tgt && nm !== tgt ? ', target ' + tgt : ''}</li>
                  })}</ul></div>
              )}

              {acc.evidence && epLimitations.length > 0 && (
                <div className="lvpanel" id="limits"><span className="lbl">What would prove this wrong</span>
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
        {d && complete && <LiveRail sev={sev} confidence={confidence} jumps={jumps} meta={metaRows} />}
      </div>
    </div>
  )
}
