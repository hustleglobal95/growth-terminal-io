/**
 * Whether it worked.
 *
 * The panel that turns an analysis from a claim into a record. It shows the
 * promise exactly as it was frozen, the rate measured since the customer
 * committed, and every reason the engine gave for declining to conclude
 * something. Nothing here is computed in the browser.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Section } from './Section'
import { toast } from '../lib/bus'
import {
  ClaimRow, CommitmentRow, GateResult, RunRow, VERDICT_LABEL, GATE_LABEL,
  addPeriods, appendRun, commitPlan, comparePeriods, getCommitment,
  listCommitments, listRuns, money, monthName, pct, points, stepLabel, thisPeriod,
} from '../lib/verified'
import { blockingReason, readWorkbook } from '../lib/sheet'
import { confirm as confirmSnapshot, ingest, intakeLive } from '../lib/intake'

/* ------------------------------------------------------------------ */
/* The rate line                                                       */
/* ------------------------------------------------------------------ */

/** One series in amber, two neutral reference lines, endpoint labels only.
 *  A single run is a point, not a trend, and is drawn as one. */
function RateLine({ runs, diagnosis, baseline }: {
  runs: RunRow[]; diagnosis: number | null; baseline: number | null
}) {
  const pts = runs
    .map(r => ({ at: r.observedThrough || r.createdAt.slice(0, 10), v: r.resultJson.evaluation.rate }))
    .filter(p => p.v !== null) as { at: string; v: number }[]
  if (!pts.length) return null

  const W = 620
  const H = 132
  const padL = 8
  const padR = 132   /* room for the two reference labels, which sit outside the plot */
  const padT = 14
  const padB = 22

  const values = [...pts.map(p => p.v), diagnosis, baseline].filter(v => v !== null) as number[]
  const lo = Math.max(0, Math.min(...values) - 0.06)
  const hi = Math.min(1, Math.max(...values) + 0.06)
  const y = (v: number) => padT + (1 - (v - lo) / Math.max(hi - lo, 0.01)) * (H - padT - padB)
  const x = (i: number) => pts.length === 1
    ? padL + (W - padL - padR) / 2
    : padL + (i / (pts.length - 1)) * (W - padL - padR)

  const d = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ')
  const last = pts[pts.length - 1]

  return (
    <div className="vfchart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img"
        aria-label={`Rate since committing, ${pts.length} measurement${pts.length === 1 ? '' : 's'}, latest ${pct(last.v)}`}>
        {baseline !== null && (
          <g>
            <line className="vfref" x1={padL} x2={W - padR} y1={y(baseline)} y2={y(baseline)} />
            <text className="vfreft" x={W - padR + 10} y={y(baseline) + 4}>{pct(baseline, 0)} before</text>
          </g>
        )}
        {diagnosis !== null && (
          <g>
            <line className="vfref dash" x1={padL} x2={W - padR} y1={y(diagnosis)} y2={y(diagnosis)} />
            <text className="vfreft" x={W - padR + 10} y={y(diagnosis) + 4}>{pct(diagnosis, 0)} at diagnosis</text>
          </g>
        )}
        {pts.length > 1 && <path className="vfline" d={d} />}
        {pts.map((p, i) => (
          <circle key={p.at + i} className={'vfdot' + (i === pts.length - 1 ? ' end' : '')}
            cx={x(i)} cy={y(p.v)} r={i === pts.length - 1 ? 4 : 2.5} />
        ))}
        <text className="vfendt" x={x(pts.length - 1) + 9} y={y(last.v) + 4}>{pct(last.v)}</text>
        <text className="vfaxis" x={padL} y={H - 6}>{pts[0].at}</text>
        {pts.length > 1 && <text className="vfaxis end" x={W - padR} y={H - 6}>{last.at}</text>}
      </svg>
    </div>
  )
}


/* ------------------------------------------------------------------ */
/* The measurement                                                     */
/* ------------------------------------------------------------------ */

/** Drop a fresh workbook and it is measured against the frozen claim.
 *
 *  Deliberately the same drop zone as every other place a workbook enters
 *  this product. A workbook arrives one way here, not two, and somebody who
 *  has uploaded once should not have to learn a second control to do the one
 *  thing the product is sold on.
 *
 *  The steps are named while they run because three network calls happen
 *  behind this button and a spinner that says nothing for eight seconds reads
 *  as a hang. */
function Measure({ busy, step, over, setOver, fileRef, measure, live, runs }: {
  busy: boolean; step: string; over: boolean; setOver: (b: boolean) => void
  fileRef: React.MutableRefObject<HTMLInputElement | null>
  measure: (f: File | null) => void; live: boolean; runs: number
}) {
  if (!live) {
    return (
      <div className="vfmeasure">
        <p className="gbody">Measuring needs the data intake, which is not switched on for this
          workspace, so this panel would be showing a button that throws. It says so instead.</p>
      </div>
    )
  }
  return (
    <div className={'vfmeasure drop' + (over ? ' over' : '') + (busy ? ' busy' : '')}
      onDragOver={e => { e.preventDefault(); setOver(true) }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { e.preventDefault(); setOver(false); measure(e.dataTransfer.files && e.dataTransfer.files[0]) }}
    >
      <p className="dropt">{runs ? 'Measure it again' : 'Measure it now'}</p>
      <p className="dropf">{busy
        ? step + '\u2026'
        : 'The current workbook for this business. Free, and no analysis is run.'}</p>
      <button className="btn p" disabled={busy} onClick={() => fileRef.current?.click()}>
        {busy ? step || 'Working' : 'Choose a file'}
      </button>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="vh"
        aria-label="Choose the current workbook to measure against this plan"
        onChange={e => { measure(e.target.files && e.target.files[0]); e.currentTarget.value = '' }} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function Verified({ analysisId }: { analysisId: string }) {
  const [ready, setReady] = useState(false)
  const [reachable, setReachable] = useState(true)
  const [commitment, setCommitment] = useState<CommitmentRow | null>(null)
  const [claim, setClaim] = useState<ClaimRow | null>(null)
  const [runs, setRuns] = useState<RunRow[]>([])
  const [busy, setBusy] = useState(false)
  const [why, setWhy] = useState<string | null>(null)
  const [step, setStep] = useState('')
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setReady(false)
    try {
      const rows = await listCommitments(analysisId)
      const list = Array.isArray(rows) ? rows : []
      const latest = list.length ? list[list.length - 1] : null
      setCommitment(latest)
      if (!latest) { setClaim(null); setRuns([]); setReady(true); return }
      const [full, rr] = await Promise.all([getCommitment(latest.id), listRuns(latest.id)])
      setClaim(full.claims && full.claims.length ? full.claims[0] : null)
      setRuns(Array.isArray(rr) ? rr : [])
      setReady(true)
    } catch (e) {
      /* The routes may not be live in this environment. The panel stays quiet
         rather than pretending the work was never committed. */
      setReachable(false)
      setReady(true)
      setWhy(e instanceof Error ? e.message : 'Could not reach the verification records.')
    }
  }, [analysisId])

  useEffect(() => { void load() }, [load])

  const commit = useCallback(async () => {
    setBusy(true)
    try {
      await commitPlan(analysisId, thisPeriod())
      toast('Committed. The next measurement will be judged against this.')
      await load()
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not commit the plan.')
    } finally { setBusy(false) }
  }, [analysisId, load])

  /* THE CALL THAT CLOSES THE LOOP.
   *
   *  Read the workbook here, refuse here for the same two reasons the intake
   *  refuses, send it up as a snapshot, confirm it, and append it against the
   *  frozen claim. No analysis is queued, so nothing is charged: this is the
   *  same lifecycle measured again by the same engine, which is the whole
   *  point of having frozen the claim in the first place.
   *
   *  A refusal from the engine is shown in its own words rather than reduced
   *  to "something went wrong". "Verification requires a confirmed snapshot"
   *  and "no measurable lifecycle" are answers, and the customer can act on
   *  both of them. */
  const measure = useCallback(async (file: File | null) => {
    if (!file || !commitment || !claim) return
    setBusy(true); setWhy(null); setStep('Reading the file')
    try {
      const read = await readWorkbook(file)
      const blocked = blockingReason(read)
      if (blocked) { setWhy(blocked); return }

      setStep('Sending it up')
      const snap = await ingest(read.workbook, read.fileName)

      setStep('Confirming it')
      await confirmSnapshot(snap.snapshotId)

      setStep('Measuring against the promise')
      const out = await appendRun(commitment.id, claim.id, snap.snapshotId)

      toast(out.existed
        ? 'That workbook had already been measured against this plan.'
        : 'Measured. The verdict is below.')
      await load()
    } catch (e) {
      setWhy(e instanceof Error ? e.message : 'The measurement did not finish.')
    } finally { setBusy(false); setStep('') }
  }, [commitment, claim, load])

  const latest = runs.length ? runs[runs.length - 1] : null
  const c = claim ? claim.claimJson : null
  const v = latest ? latest.resultJson : null

  /* WHEN A MEASUREMENT IS OWED, worked out rather than waited for. Every gate
   *  in the frozen claim carries duePeriods and the commitment carries the
   *  period it started, so the month each gate falls due has been knowable
   *  since the day it was committed. It was simply never shown, which is how a
   *  product that sells verification ends up silent about it. */
  const due = useMemo(() => {
    if (!commitment || !c || !c.gates || !c.gates.length) return null
    const now = thisPeriod()
    const rows = c.gates.map(g => {
      const at = addPeriods(commitment.committedPeriod, g.duePeriods)
      return { id: g.id, label: g.label, at, arrived: comparePeriods(at, now) <= 0 }
    })
    const soonest = rows.reduce((a, b) => (comparePeriods(a.at, b.at) <= 0 ? a : b))
    /* Covered means a measurement has been taken that observed through the due
       month or later. A run from before the gate came due does not close it. */
    const observed = runs
      .map(r => (r.observedThrough || '').slice(0, 7))
      .filter(Boolean)
      .sort()
    const through = observed.length ? observed[observed.length - 1] : null
    const uncovered = rows.filter(r => r.arrived && (!through || comparePeriods(through, r.at) < 0))
    /* Every gate that has come due has been measured through. Saying "next due
       August" about a gate that was measured in August is the kind of small
       lie that makes somebody stop trusting the rest of the panel. */
    const allCovered = Boolean(through) && rows.every(r => comparePeriods(through as string, r.at) >= 0)
    return { rows, soonest, through, uncovered, allCovered }
  }, [commitment, c, runs])

  const gatesByStatus = useMemo(() => {
    const g: GateResult[] = v ? v.gates : []
    const order = { missed: 0, passed: 1, not_evaluable: 2, not_yet_due: 3 } as const
    return [...g].sort((a, b) => order[a.status] - order[b.status])
  }, [v])

  if (!ready || !reachable) return null
  if (!commitment) {
    return (
      <Section id="verified" title="Whether it worked" qualifier="not being tracked yet">
        <p className="gbody">Nothing is being verified yet. Committing to this plan freezes what it
          promised, so the next measurement of your data can be judged against it instead of against
          a memory of what the report said.</p>
        <div className="vfact">
          <button type="button" className="btn g" onClick={commit} disabled={busy}>
            {busy ? 'Committing' : 'Commit this plan'}
          </button>
          <span className="hint">Starts the clock in {monthName(thisPeriod())}. It cannot be moved afterwards.</span>
        </div>
        {why && <p className="edwarn">{why}</p>}
      </Section>
    )
  }

  const from = c ? stepLabel(c.from) : ''
  const to = c ? stepLabel(c.to) : ''

  return (
    <Section
      id="verified"
      title="Whether it worked"
      qualifier={'committed ' + monthName(commitment.committedPeriod) + ', ' + runs.length + (runs.length === 1 ? ' measurement since' : ' measurements since')}
      flush
    >
      <div className="vfwrap">

        {c && (
          <div className="vfpromise">
            <span className="lbl">What was promised, frozen on the day</span>
            <p className="gbody">
              <b>{from}</b> to <b>{to}</b> had fallen from {pct(c.baseline.rate)} to {pct(c.atDiagnosis.rate)}
              {' '}({c.atDiagnosis.numerator} of {c.atDiagnosis.denominator} records).
              {c.predictedImpactPerPeriod !== null
                ? <> Recovering {Math.round(c.recoveryTarget * 100)}% of that gap was worth {money(c.predictedImpactPerPeriod)} a month.</>
                : <> No monthly figure was attached, because not every term could be measured.</>}
            </p>
          </div>
        )}

        {due && (
          <div className={'vfdue' + (due.uncovered.length ? ' now' : '')}>
            <span className="lbl">{due.uncovered.length
              ? (due.uncovered.length === 1 ? 'A gate is due to be measured' : due.uncovered.length + ' gates are due to be measured')
              : due.allCovered ? 'Every gate has been measured' : 'Next due'}</span>
            <p className="gbody">{due.uncovered.length
              ? <>Due since {monthName(due.uncovered[0].at)}
                  {due.through
                    ? <>, and the last measurement only reaches {monthName(due.through)}.</>
                    : <>.</>}</>
              : due.allCovered
                ? <>Measured through {monthName(due.through as string)}, which covers every gate.
                    Measuring again adds a point rather than replacing one.</>
                : <>First gate falls due in {monthName(due.soonest.at)}. You can measure sooner;
                    it will say it is not due yet.</>}</p>
          </div>
        )}

        {!v && (
          <div className="vfempty">
            <p className="gbody">Nothing measured against this yet, so there is a promise here and no
              verdict. Uploading will not do it: that starts a new analysis, which asks a different
              question.</p>
          </div>
        )}

        <Measure
          busy={busy} step={step} over={over} setOver={setOver}
          fileRef={fileRef} measure={measure} live={intakeLive()} runs={runs.length}
        />

        {why && <p className="vfwhy">{why}</p>}

        {v && c && (
          <>
            <div className="vfverdict">
              <div className={'vfv ' + v.verdict}>
                <i />
                <div>
                  <b>{VERDICT_LABEL[v.verdict]}</b>
                  <span>
                    {v.evaluation.rate === null
                      ? 'Nothing eligible to measure yet'
                      : <>{pct(v.evaluation.rate)} since committing, from {pct(v.atDiagnosis.rate)} at diagnosis, {points(v.changePoints)}</>}
                  </span>
                </div>
              </div>
              <div className="vfnums">
                <div><span className="lbl">Measured over</span><b className="num">{v.evaluation.numerator} of {v.evaluation.denominator}</b><span className="hint">{v.evaluation.periods.length ? v.evaluation.periods[0] + ' to ' + v.evaluation.periods[v.evaluation.periods.length - 1] : 'no eligible cohort'}</span></div>
                <div><span className="lbl">Smallest change visible</span><b className="num">{v.minimumDetectableChange === null ? 'not measured' : points(v.minimumDetectableChange, 1).replace('+', '')}</b><span className="hint">at this volume</span></div>
                <div><span className="lbl">Of the gap recovered</span><b className="num">{v.recoveryAchieved === null ? 'not stated' : Math.round(v.recoveryAchieved * 100) + '%'}</b><span className="hint">{c.gapPoints ? points(c.gapPoints).replace('+', '') + ' gap' : ''}</span></div>
                <div><span className="lbl">Promised, then measured</span><b className="num">{money(v.predictedImpactPerPeriod)} · {money(v.realizedImpactPerPeriod)}</b><span className="hint">a month</span></div>
              </div>
            </div>

            <RateLine runs={runs} diagnosis={v.atDiagnosis.rate} baseline={c.baseline.rate} />

            {gatesByStatus.length > 0 && (
              <div className="vfgates">
                <span className="lbl">Gates, set before the work started</span>
                {gatesByStatus.map(g => (
                  <div key={g.id} className={'vfgate ' + g.status}>
                    <i />
                    <div className="t">{g.label}</div>
                    <div className="s">{GATE_LABEL[g.status]}{g.duePeriod ? ', due ' + monthName(g.duePeriod) : ''}</div>
                    <div className="r">{g.reason}</div>
                  </div>
                ))}
              </div>
            )}

            {(v.volume.changedMaterially || v.composition.some(x => x.shifted) || v.sideEffects.some(s => s.significant && s.changePoints < 0)) && (
              <div className="vfchecks">
                <span className="lbl">Reasons to read the result carefully</span>
                {v.volume.changedMaterially && (
                  <p className="gbody">Record volume moved from {v.volume.atDiagnosisPerPeriod?.toFixed(1)} to {v.volume.nowPerPeriod?.toFixed(1)} a month, which changes what a rate means on its own.</p>
                )}
                {v.composition.filter(x => x.shifted).map(x => (
                  <p className="gbody" key={x.column}>The mix of {stepLabel(x.column)} moved {(x.distance * 100).toFixed(0)} points against {x.usualDrift === null ? 'no established' : (x.usualDrift * 100).toFixed(0) + ' points of'} ordinary drift. {x.topMoves.slice(0, 2).map(m => m.value + ' ' + (m.before * 100).toFixed(0) + ' to ' + (m.after * 100).toFixed(0)).join(', ')}.</p>
                ))}
                {v.sideEffects.filter(s => s.significant && s.changePoints < 0).map(s => (
                  <p className="gbody" key={s.from + s.to}>{stepLabel(s.from)} to {stepLabel(s.to)} fell {points(s.changePoints).replace('+', '')} over the same window, which may be the cost of this fix.</p>
                ))}
              </div>
            )}

            {(v.notes.length > 0 || v.excludedForImmaturity.length > 0 || c.refusals.length > 0) && (
              <div className="vfnotes">
                <span className="lbl">What this does not claim</span>
                <ul className="glist2">
                  {v.notes.map((n, i) => <li key={'n' + i}>{n}</li>)}
                  {v.excludedForImmaturity.length > 0 && (
                    <li>{v.excludedForImmaturity.join(', ')} {v.excludedForImmaturity.length === 1 ? 'is' : 'are'} still maturing and {v.excludedForImmaturity.length === 1 ? 'was' : 'were'} left out.</li>
                  )}
                  {c.refusals.map((n, i) => <li key={'r' + i}>{n}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  )
}
