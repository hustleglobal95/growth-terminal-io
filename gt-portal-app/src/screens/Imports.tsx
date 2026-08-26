/** EVENT IMPORT.
 *
 *  Where a customer's activity log becomes cohort retention. Four states, and
 *  the screen never skips one:
 *
 *    Choose a file  ->  Confirm the columns  ->  Read the report  ->  Model
 *
 *  The third state is the one that earns its keep. Every other import screen
 *  in this category parses quietly and shows a spinner, and the customer finds
 *  out something was wrong when a chart looks strange three screens later. This
 *  one stops and says what it read, what it dropped, and which line each
 *  dropped row was on, before anything reaches the engine.
 *
 *  The gate at the end is a refusal to model, not a refusal to show. A file of
 *  eleven accounts over nine days still uploads and still displays its counts;
 *  it simply does not get to produce a severity score, because a score from
 *  that is noise wearing a number.
 */

import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Header } from './simple'
import {
  FIELD_LABEL, Field, ImportReport, Mapping, REQUIRED_FIELDS, Readiness,
  ingest, mappingFrom, missingColumns, parseDelimited, readiness, suggestMapping,
  MIN_ACCOUNTS, MIN_SPAN_DAYS, type ImportedEvent, type Suggestion, type Table,
} from '../lib/retentionImport'
import {
  DEFAULT_CHECKPOINTS, buildInputs, checkDefinition, eventCatalog, prune, suggestDefinition,
  type Definition, type DefinitionCheck, type EventFact,
} from '../lib/retentionDefine'
import {
  computeRetention, correlateSignals, rollingRetention,
  type Grain, type Period, type RetentionMatrix, type RollingPoint, type SignalFinding,
} from '../lib/retention'
import { diagnose, type RetentionDiagnostic } from '../lib/retentionDiagnose'
import { RetentionCurve, RetentionHeatmap } from '../components/RetentionHeatmap'
import { toast } from '../lib/bus'

type Stage = 'choose' | 'map' | 'report' | 'define' | 'result'

const PERIOD_LABEL: Record<Period, string> = { day: 'days', week: 'weeks', month: 'months' }
const GRAIN_LABEL: Record<Grain, string> = { account: 'per account', user: 'per person' }

interface Measured {
  matrix: RetentionMatrix
  rolling: RollingPoint[]
  signals: SignalFinding[]
  diagnostic: RetentionDiagnostic
}

const n = (x: number): string => x.toLocaleString('en-US')

const pct = (v: number | null): string => (v === null ? 'no reading' : Math.round(v * 100) + '%')

/** A cohort smaller than this is drawn but never carries a verdict. Shared
 *  with the matrix and the diagnosis so all three agree on what is too small. */
const MIN_COHORT = 20

export function Imports() {
  const [stage, setStage] = useState<Stage>('choose')
  const [fileName, setFileName] = useState('')
  const [table, setTable] = useState<Table | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [events, setEvents] = useState<ImportedEvent[]>([])
  const [report, setReport] = useState<ImportReport | null>(null)
  const [gate, setGate] = useState<Readiness | null>(null)
  const [drag, setDrag] = useState(false)
  const [headerError, setHeaderError] = useState<string | null>(null)
  const [def, setDef] = useState<Definition | null>(null)
  const [measured, setMeasured] = useState<Measured | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const reset = useCallback(() => {
    setStage('choose'); setFileName(''); setTable(null); setSuggestions([])
    setMapping(null); setEvents([]); setReport(null); setGate(null); setHeaderError(null)
    setDef(null); setMeasured(null)
  }, [])

  const take = useCallback(async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      toast('That file is over 25 MB. Split it or export a narrower date range.')
      return
    }
    const text = await file.text()
    const t = parseDelimited(text)
    if (!t.headers.length || !t.rows.length) {
      setHeaderError('That file has no readable header row and no data rows.')
      setStage('choose')
      return
    }
    const s = suggestMapping(t.headers)
    const m = mappingFrom(s)
    const missing = missingColumns(m)

    setFileName(file.name)
    setTable(t)
    setSuggestions(s)
    setMapping(m)
    /* The header check happens before a single row is parsed. A file missing
       the account column is not a file with bad rows, it is the wrong file,
       and saying so now costs the customer one sentence instead of a
       spreadsheet full of blanks. */
    setHeaderError(missing.length
      ? 'This file is missing ' + missing.map(f => FIELD_LABEL[f].toLowerCase()).join(', ') + '. Point each one at a column below, or export again with those columns included.'
      : null)
    setStage('map')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void take(f)
  }, [take])

  const run = useCallback(() => {
    if (!table || !mapping) return
    if (missingColumns(mapping).length) return
    const { events: ev, report: r } = ingest(table, mapping)
    setEvents(ev); setReport(r); setGate(readiness(r)); setStage('report')
  }, [table, mapping])

  const preview = useMemo(() => (table ? table.rows.slice(0, 4) : []), [table])

  /* Everything below is the definition step. It runs entirely on the events
     already parsed in this browser, so every number the customer sees while
     choosing is measured from their own file rather than assumed. */

  const catalog: EventFact[] = useMemo(
    () => (def ? eventCatalog(events, def.grain) : []),
    [events, def],
  )

  const check: DefinitionCheck | null = useMemo(
    () => (def ? checkDefinition(events, def) : null),
    [events, def],
  )

  const openDefine = useCallback(() => {
    setDef(suggestDefinition(events, 'account'))
    setStage('define')
  }, [events])

  const setGrain = useCallback((grain: Grain) => {
    /* The grain changes what a member is, so the proposal is recomputed from
       scratch rather than carried across. Keeping the old start event here is
       how you end up measuring people against an account level event. */
    setDef(suggestDefinition(events, grain))
  }, [events])

  const toggleReturn = useCallback((name: string) => {
    setDef(d => {
      if (!d) return d
      const has = d.returnEvents.indexOf(name) >= 0
      return { ...d, returnEvents: has ? d.returnEvents.filter(x => x !== name) : d.returnEvents.concat(name) }
    })
  }, [])

  const measure = useCallback(() => {
    if (!def || !check || !check.ok || !report) return
    const d = prune(def, check)
    const built = buildInputs(events, d)
    const opts = {
      period: d.period,
      cohortPeriod: d.cohortPeriod,
      returnEvents: d.returnEvents,
      checkpoints: d.checkpoints,
      observationHorizon: built.horizon ?? undefined,
      minCohortSize: MIN_COHORT,
      signalEvents: d.signalEvents,
    }
    const matrix = computeRetention(built.members, built.rows, opts)
    const rolling = rollingRetention(matrix)
    const signals = correlateSignals(built.members, built.rows, opts)
    const diagnostic = diagnose(matrix, rolling, signals, opts)
    setMeasured({ matrix, rolling, signals, diagnostic })
    setStage('result')
  }, [def, check, report, events])

  return (
    <div className="scr on">
      <Header title="Imports">
        {stage !== 'choose' && (
          <button className="btn g" onClick={reset}>Start again</button>
        )}
      </Header>
      <div className="canvas">
        <div className="wrap">
          <p className="pgintro">Activity logs come in here and become cohort retention. One row
            per event: which account it belongs to, who did it, what it was, and when. Nothing
            reaches the diagnostic engine until the file has been read back to you.</p>

          {stage === 'choose' && (
            <>
              <div
                className={'impdrop' + (drag ? ' over' : '')}
                onDragOver={e => { e.preventDefault(); setDrag(true) }}
                onDragLeave={() => setDrag(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click() }}
              >
                <b>Drop a CSV or TSV here</b>
                <span>or choose a file. Up to 25 MB.</span>
                <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
                  onChange={e => { const f = e.target.files?.[0]; if (f) void take(f) }} />
              </div>
              {headerError && <p className="edwarn">{headerError}</p>}
              <div className="impcols">
                <span className="lbl">The four columns this needs</span>
                <ul className="glist2">
                  {REQUIRED_FIELDS.map(f => (
                    <li key={f}><b>{FIELD_LABEL[f]}</b>{f === 'user_id'
                      ? '. The person who did it. May be empty on events that belong to the account rather than to anybody.'
                      : f === 'timestamp'
                      ? '. ISO 8601, a plain date, or epoch seconds or milliseconds. All four are read without asking.'
                      : f === 'event_name'
                      ? '. Whatever your system calls it. You pick which ones start the clock and which count as coming back after the import.'
                      : '. The account, company or workspace the event belongs to. This is what a cohort is made of.'}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {stage === 'map' && table && mapping && (
            <>
              <div className="shead" style={{ marginTop: 26 }}>
                <h2>Confirm the columns</h2>
                <span className="hint">{fileName}, {n(table.rows.length)} rows</span>
              </div>
              {headerError && <p className="edwarn">{headerError}</p>}
              <div className="impmap">
                {suggestions.map(s => (
                  <div className="impmaprow" key={s.field}>
                    <div className="t">
                      <b>{FIELD_LABEL[s.field]}</b>
                      <span>{s.column
                        ? (s.confidence >= 1 ? 'named exactly in your file' : 'guessed: ' + s.reason + ', please confirm')
                        : s.reason}</span>
                    </div>
                    <select
                      className="tmsel"
                      value={mapping[s.field] ?? ''}
                      onChange={e => setMapping(m => (m ? { ...m, [s.field]: e.target.value || null } : m))}
                    >
                      <option value="">Not in this file</option>
                      {table.headers.map(h => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div className="shead" style={{ marginTop: 26 }}>
                <h2>The first few rows</h2>
                <span className="hint">as they will be read</span>
              </div>
              <div className="rtscroll">
                <table className="rtmap imppre">
                  <thead>
                    <tr>{REQUIRED_FIELDS.map(f => <th key={f} className="rtc">{FIELD_LABEL[f]}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i}>
                        {REQUIRED_FIELDS.map(f => {
                          const col = mapping[f]
                          const idx = col ? table.headers.indexOf(col) : -1
                          const v = idx >= 0 ? (r[idx] ?? '') : ''
                          return <td key={f} className="rtc">{v || <span className="rtdash" />}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="vfact">
                <button className="btn p" disabled={missingColumns(mapping).length > 0} onClick={run}>
                  Read the file
                </button>
                <span className="hint">
                  {missingColumns(mapping).length
                    ? 'Point every column at something first.'
                    : 'Nothing is sent anywhere yet. This reads the file in your browser and shows you what it found.'}
                </span>
              </div>
            </>
          )}

          {stage === 'report' && report && gate && (
            <>
              <div className="shead" style={{ marginTop: 26 }}>
                <h2>What was read</h2>
                <span className="hint">{fileName}</span>
              </div>

              <div className="vfnums">
                <div>
                  <span className="lbl">Events kept</span>
                  <b className="num">{n(report.accepted)}</b>
                  <span className="hint">of {n(report.totalRows)} rows</span>
                </div>
                <div>
                  <span className="lbl">Accounts</span>
                  <b className="num">{n(report.uniqueAccounts)}</b>
                  <span className="hint">{n(report.uniqueUsers)} people</span>
                </div>
                <div>
                  <span className="lbl">History</span>
                  <b className="num">{report.spanDays} days</b>
                  <span className="hint">{report.firstEvent ? report.firstEvent.slice(0, 10) : ''} to {report.lastEvent ? report.lastEvent.slice(0, 10) : ''}</span>
                </div>
                <div>
                  <span className="lbl">Dropped</span>
                  <b className="num">{n(report.totalRows - report.accepted)}</b>
                  <span className="hint">{report.duplicatesRemoved} duplicates</span>
                </div>
              </div>

              {report.eventNames.length > 0 && (
                <div className="impevents">
                  <span className="lbl">Events found</span>
                  <div className="impchips">
                    {report.eventNames.slice(0, 14).map(e => (
                      <span className="chip" key={e.name}><i />{e.name}<b>{n(e.count)}</b></span>
                    ))}
                    {report.eventNames.length > 14 && (
                      <span className="hint">and {report.eventNames.length - 14} more</span>
                    )}
                  </div>
                </div>
              )}

              {report.warnings.length > 0 && (
                <div className="impwarn">
                  <span className="lbl">What happened to the rest</span>
                  <ul className="glist2">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                  {report.failureSamples.length > 0 && (
                    <div className="impfail">
                      <span className="lbl">Lines whose time could not be read</span>
                      <ul className="glist2">
                        {report.failureSamples.map(s => (
                          <li key={s.line}>Line {s.line}: {s.value}</li>
                        ))}
                        {report.failureLines.length > report.failureSamples.length && (
                          <li>and {report.failureLines.length - report.failureSamples.length} more, at lines {report.failureLines.slice(report.failureSamples.length, report.failureSamples.length + 12).join(', ')}
                            {report.failureLines.length > report.failureSamples.length + 12 ? ' and beyond' : ''}</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              <div className="shead" style={{ marginTop: 26 }}>
                <h2>Retention health</h2>
                <span className="hint">{gate.ready ? 'ready to model' : 'not enough to model yet'}</span>
              </div>

              {gate.ready ? (
                <>
                  {gate.cautions.length > 0 && (
                    <ul className="glist2">{gate.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                  )}
                  <div className="vfact">
                    <button className="btn p" onClick={openDefine}>
                      Choose the start and return events
                    </button>
                    <span className="hint">You pick which event starts a cohort and which counts as coming back. Retention is undefined until you do, and guessing on your behalf is how a report ends up measuring the wrong thing.</span>
                  </div>
                </>
              ) : (
                <div className="impgate">
                  <b>Retention health needs at least {MIN_ACCOUNTS} accounts and {MIN_SPAN_DAYS} days of account event history.</b>
                  <ul className="glist2">{gate.blocking.map((b, i) => <li key={i}>{b}</li>)}</ul>
                  <p className="gbody">The file is loaded and the counts above are real. This part stays
                    closed because a severity score from this much data would move on chance rather
                    than on your business, and a number nobody can trust is worse than no number.</p>
                </div>
              )}
            </>
          )}

          {stage === 'define' && def && check && (
            <>
              <div className="shead">
                <h2>What counts as retention here</h2>
                <span className="hint">{n(events.length)} events, {n(catalog.length)} event names</span>
              </div>
              <p className="pgintro">Two people can point this at the same file, answer these
                questions differently, and get opposite answers. That is why nothing below is
                filled in for you silently: every choice is a proposal you can see the numbers
                behind, and the ones that cannot produce an honest matrix are refused outright.</p>

              <div className="impmap">
                <div className="impmaprow">
                  <div>
                    <b>A cohort is a group of</b>
                    <span>{def.grain === 'account'
                      ? 'Accounts. Every row in the file can join.'
                      : 'People. Rows with an empty person column cannot join.'}</span>
                  </div>
                  <select className="keyinput impsel" value={def.grain}
                    onChange={e => setGrain(e.target.value as Grain)}>
                    <option value="account">Accounts</option>
                    <option value="user">People</option>
                  </select>
                </div>

                <div className="impmaprow">
                  <div>
                    <b>The clock starts at</b>
                    <span>{def.startEvent
                      ? 'guessed: this is the first thing ' + n(catalog.find(c => c.name === def.startEvent)?.firstFor ?? 0) + ' members ever did, please confirm'
                      : 'nothing chosen yet'}</span>
                  </div>
                  <select className="keyinput impsel" value={def.startEvent}
                    onChange={e => setDef({ ...def, startEvent: e.target.value })}>
                    {catalog.map(c => (
                      <option key={c.name} value={c.name}>
                        {c.name} ({n(c.members)} {def.grain === 'account' ? 'accounts' : 'people'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="impmaprow">
                  <div>
                    <b>Measured in</b>
                    <span>Checkpoints are counted in these. Cohorts are grouped by {def.cohortPeriod}.</span>
                  </div>
                  <select className="keyinput impsel" value={def.period}
                    onChange={e => {
                      const period = e.target.value as Period
                      setDef({ ...def, period, checkpoints: DEFAULT_CHECKPOINTS[period].slice() })
                    }}>
                    <option value="day">Days</option>
                    <option value="week">Weeks</option>
                    <option value="month">Months</option>
                  </select>
                </div>

                <div className="impmaprow">
                  <div>
                    <b>Cohorts grouped by</b>
                    <span>Separate from the checkpoints on purpose. Grouping daily when most
                      businesses sign one account a day gives cohorts of one.</span>
                  </div>
                  <select className="keyinput impsel" value={def.cohortPeriod}
                    onChange={e => setDef({ ...def, cohortPeriod: e.target.value as Period })}>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                  </select>
                </div>
              </div>

              <div className="shead" style={{ marginTop: 26 }}>
                <h2>Coming back means any of these</h2>
                <span className="hint">{def.returnEvents.length} of {catalog.length} selected</span>
              </div>
              <div className="impret">
                {catalog.map(c => {
                  const on = def.returnEvents.indexOf(c.name) >= 0
                  const isStart = c.name === def.startEvent
                  return (
                    <button key={c.name} type="button"
                      className={'impretrow' + (on ? ' on' : '') + (isStart ? ' off' : '')}
                      disabled={isStart}
                      onClick={() => toggleReturn(c.name)}>
                      <span className="impretname">{c.name}</span>
                      <span className="impretnum">{n(c.count)} times, {n(c.members)} {def.grain === 'account' ? 'accounts' : 'people'}</span>
                      <span className="impretstate">{isStart ? 'starts the clock' : on ? 'counts' : 'ignored'}</span>
                    </button>
                  )
                })}
              </div>

              {check.refusals.length > 0 && (
                <div className="impgate">
                  <b>This definition cannot produce an honest matrix.</b>
                  <ul className="glist2">{check.refusals.map((r, i) => <li key={i}>{r}</li>)}</ul>
                  <p className="gbody">Each of these describes a chart that would still draw. That
                    is the reason for stopping here rather than after you have shown it to
                    somebody.</p>
                </div>
              )}

              {check.cautions.length > 0 && (
                <div className="impwarn">
                  <span className="lbl">Worth knowing before you read the result</span>
                  <ul className="glist2">{check.cautions.map((c, i) => <li key={i}>{c}</li>)}</ul>
                </div>
              )}

              <div className="vfnums" style={{ marginTop: 18 }}>
                <div><span className="lbl">Members in a cohort</span><b>{n(check.facts.cohortMembers)}</b><span className="hint">fired {def.startEvent || 'nothing'}</span></div>
                <div><span className="lbl">Return events fire</span><b>{n(check.facts.returnFires)}</b><span className="hint">times in the file</span></div>
                <div><span className="lbl">Watched at most</span><b>{n(check.facts.maxObservablePeriods)}</b><span className="hint">{PERIOD_LABEL[def.period]}</span></div>
                <div><span className="lbl">Rows in play</span><b>{n(check.facts.attributableRows)}</b><span className="hint">{n(check.facts.unattributedRows)} without a member</span></div>
              </div>

              <div className="vfact">
                <button className="btn p" disabled={!check.ok} onClick={measure}>Measure retention</button>
                <button className="ract" onClick={() => setStage('report')}>Back to the file</button>
                <span className="hint">{check.ok
                  ? 'Runs here in your browser. Nothing is sent anywhere and nothing is stored yet.'
                  : 'Blocked until the refusals above are resolved.'}</span>
              </div>
            </>
          )}

          {stage === 'result' && measured && def && (
            <>
              <div className="shead">
                <h2>{def.name}</h2>
                <span className="hint">{GRAIN_LABEL[def.grain]}, measured in {PERIOD_LABEL[def.period]}</span>
              </div>

              <div className="vfnums">
                <div>
                  <span className="lbl">Through {PERIOD_LABEL[def.period].replace(/s$/, '')} {measured.diagnostic.headline.period}</span>
                  <b>{pct(measured.diagnostic.headline.rate)}</b>
                  <span className="hint">{n(measured.diagnostic.headline.retained)} of {n(measured.diagnostic.headline.denominator)}</span>
                </div>
                <div>
                  <span className="lbl">Severity</span>
                  <b>{measured.diagnostic.retention_severity} of 10</b>
                  <span className="hint">{measured.diagnostic.severity_basis === 'measured_decline'
                    ? 'from a measured decline'
                    : measured.diagnostic.severity_basis === 'level_against_band'
                    ? 'from the level, not a decline'
                    : 'not enough to judge'}</span>
                </div>
                <div>
                  <span className="lbl">Confidence</span>
                  <b>{measured.diagnostic.confidence_level}</b>
                  <span className="hint">{n(measured.matrix.totals.cohorts)} cohorts</span>
                </div>
                <div>
                  <span className="lbl">Members</span>
                  <b>{n(measured.matrix.totals.members)}</b>
                  <span className="hint">{n(measured.matrix.totals.events)} events counted</span>
                </div>
              </div>

              <p className="pgintro">{measured.diagnostic.severity_reason}</p>

              <p className="rtnote">
                Each column counts activity inside its own window
                {measured.matrix.cohorts.length
                  ? ' (' + measured.matrix.cohorts[0].cells.map(c => c.windowStart + ' to ' + c.period).join(', ') + ')'
                  : ''}. The windows differ in width, so read down a column, not across a row.
                Cohorts are only ever compared to each other within one column.
              </p>
              <div className="rtwrap">
                <RetentionHeatmap matrix={measured.matrix} minCohortSize={MIN_COHORT} />
              </div>

              <div className="shead" style={{ marginTop: 26 }}>
                <h2>The curve</h2>
                <span className="hint">amber is the average across cohorts</span>
              </div>
              <div className="rtwrap">
                <RetentionCurve matrix={measured.matrix} rolling={measured.rolling} minCohortSize={MIN_COHORT} />
              </div>

              {measured.diagnostic.trend && measured.diagnostic.trend.significant && (
                <>
                  <div className="shead" style={{ marginTop: 26 }}>
                    <h2>The decline</h2>
                    <span className="hint">clears both tests</span>
                  </div>
                  <div className="impfail">
                    <span className="lbl">Early cohorts against recent</span>
                    <ul className="glist2">
                      <li>{pct(measured.diagnostic.trend.earlyRate)} ({n(measured.diagnostic.trend.earlyCounts.retained)} of {n(measured.diagnostic.trend.earlyCounts.denominator)}) in the earliest cohorts.</li>
                      <li>{pct(measured.diagnostic.trend.recentRate)} ({n(measured.diagnostic.trend.recentCounts.retained)} of {n(measured.diagnostic.trend.recentCounts.denominator)}) in the most recent.</li>
                      <li>Two proportion test p = {measured.diagnostic.trend.pValue === null ? 'no reading' : measured.diagnostic.trend.pValue.toFixed(4)}, and the drop clears the ordinary spread of the series.</li>
                    </ul>
                  </div>
                </>
              )}

              {measured.diagnostic.watch_conditions.length > 0 && (
                <>
                  <div className="shead" style={{ marginTop: 26 }}>
                    <h2>What would prove this wrong</h2>
                    <span className="hint">checked against the next import</span>
                  </div>
                  <ul className="glist2">
                    {measured.diagnostic.watch_conditions.map(w => (
                      <li key={w.id}>
                        {w.label}. {w.comparator === 'below' ? 'Falls below' : 'Rises above'}{' '}
                        {Math.round(w.threshold * 100)}% at {w.period} {PERIOD_LABEL[def.period]}
                        {w.observed === null
                          ? ' and nothing is observable there yet.'
                          : ', against ' + pct(w.observed) + ' now, so it is ' + (w.status === 'breached' ? 'already breached.' : 'holding.')}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {measured.diagnostic.retention_signals.findings.length > 0 && (
                <>
                  <div className="shead" style={{ marginTop: 26 }}>
                    <h2>Associated with staying</h2>
                    <span className="hint">{measured.diagnostic.retention_signals.tested} tested</span>
                  </div>
                  <div className="impfail">
                    <ul className="glist2">
                      {measured.diagnostic.retention_signals.findings.slice(0, 6).map((f, i) => (
                        <li key={i}>
                          {f.eventName}: {pct(f.withSignal.rate)} of the {n(f.withSignal.total)} who did it,
                          against {pct(f.withoutSignal.rate)} of the {n(f.withoutSignal.total)} who did not
                          {f.withheld ? '. ' + f.withheld : f.significant ? '.' : ', which is inside chance.'}
                        </li>
                      ))}
                    </ul>
                    <p className="gbody">{measured.diagnostic.retention_signals.caveat}</p>
                  </div>
                </>
              )}

              {measured.diagnostic.refusals.length > 0 && (
                <>
                  <div className="shead" style={{ marginTop: 26 }}>
                    <h2>What this does not claim</h2>
                  </div>
                  <ul className="glist2">
                    {measured.diagnostic.refusals.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </>
              )}

              <div className="vfact" style={{ marginTop: 22 }}>
                <button className="ract" onClick={() => setStage('define')}>Change the definition</button>
                <span className="hint">This result lives in this browser tab. Storing a definition
                  and running it against tomorrow's events needs the engine endpoints, which do not
                  exist yet.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
