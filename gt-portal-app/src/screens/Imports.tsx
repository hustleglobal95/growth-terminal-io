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
import { toast } from '../lib/bus'

type Stage = 'choose' | 'map' | 'report'

const n = (x: number): string => x.toLocaleString('en-US')

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
  const fileRef = useRef<HTMLInputElement | null>(null)

  const reset = useCallback(() => {
    setStage('choose'); setFileName(''); setTable(null); setSuggestions([])
    setMapping(null); setEvents([]); setReport(null); setGate(null); setHeaderError(null)
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
                    <button className="btn p" onClick={() => toast(n(events.length) + ' events ready. Choose the start and return events next.')}>
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
        </div>
      </div>
    </div>
  )
}
