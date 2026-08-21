/** SPREADSHEET INTAKE.
 *
 *  Four steps, and the third is the point of the whole screen: the customer
 *  reads what Growth Terminal understood before it is allowed to analyse
 *  anything. Every importer worth copying converged on the same spine, and
 *  the two steps that vendors skip when they can are skipped here too.
 *
 *    Choose a file  ->  Check what was read  ->  Confirm columns  ->  Analyse
 *
 *  DECISIONS TAKEN FROM THE RESEARCH, AND WHY.
 *
 *  Mapping is anchored on the customer's columns, not on our fields. Anchoring
 *  on our schema makes required field completion legible; anchoring on their
 *  columns makes "what happened to my data" legible. For a screen whose job is
 *  to show what was understood, theirs is the right list.
 *
 *  A column is never silently dropped. Flatfile excludes unmapped source
 *  fields and documents it rather than showing it, which is fine for a
 *  developer reading docs and wrong for an owner uploading a messy sheet. Here
 *  every column is recognised, needs confirming, or is explicitly not used,
 *  and the third one is a choice somebody made.
 *
 *  Completed steps collapse into a summary, not a tick. Baymard's checkout
 *  eyetracking found people routinely re-scan earlier steps before
 *  committing, which is exactly what somebody does before spending a credit.
 *
 *  There is a real Select file button, not only a drop zone. WCAG 2.2 SC 2.5.7
 *  makes a drag-only interaction a Level AA failure, and the same rule is why
 *  the column controls are selects rather than something you drag.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { readWorkbook, blockingReason, MAX_SHEETS, MAX_ROWS_PER_SHEET } from '../lib/sheet'
import type { ReadResult, SheetSummary } from '../lib/sheet'
import { intakeLive, ingest, confirm, queueAnalysis, ROLES, roleLabel, columnState } from '../lib/intake'
import type { Snapshot, ReadColumn, Correction, ColumnState } from '../lib/intake'
import { useBusinesses } from '../lib/liveData'

type Phase = 'choose' | 'reading' | 'review' | 'sending'

const ACCEPT = '.csv,.xlsx,.xls,.tsv'

export function Intake() {
  const nav = useNavigate()
  const businesses = useBusinesses()
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('choose')
  const [over, setOver] = useState(false)
  const [read, setRead] = useState<ReadResult | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [roles, setRoles] = useState<Record<string, string | null>>({})
  const [business, setBusiness] = useState<string>('')
  const [newBusiness, setNewBusiness] = useState('')
  /* Tabs the customer has taken out. A workbook often carries a Start Here
     or Notes tab full of prose, and sending it is how an engine ends up
     reasoning about a paragraph. The add-on has the same blind spot; the
     difference here is that the preview shows the tab, so somebody can see
     it and say no. */
  const [dropped, setDropped] = useState<Record<string, true>>({})
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const blocked = read ? blockingReason(read) : null

  /* ------------------------------------------------------------ reading */

  const take = useCallback(async (file: File | undefined) => {
    if (!file) return
    setError(null); setNote(null); setSnap(null); setRoles({}); setDropped({})
    setPhase('reading')
    try {
      const r = await readWorkbook(file)
      setRead(r)
      setPhase('review')
      const stop = blockingReason(r)
      if (stop) { setError(stop); return }

      /* The server reads the columns. If the intake is not wired yet, the
         screen still works up to this point and says so, rather than
         pretending it knows what the engine would have found. */
      if (!intakeLive()) {
        setNote('Reading columns needs the intake endpoint switched on. Everything above is what will be sent.')
        return
      }
      const s = await ingest(r.workbook, r.fileName)
      setSnap(s)
      const seed: Record<string, string | null> = {}
      for (const c of s.columns || []) seed[key(c)] = c.role ?? null
      setRoles(seed)
      if (s.existed) setNote('This workbook has been uploaded before, so the stored copy is being reused. You will not be charged twice.')
    } catch (e) {
      setPhase('review')
      setError(readableError(e))
    }
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setOver(false)
    take(e.dataTransfer.files?.[0])
  }, [take])

  /* ------------------------------------------------------------ sending */

  /** Re-read with the current tab selection. Changing which tabs go up
   *  changes the snapshot, so it has to be sent again rather than corrected. */
  async function reingest(next: Record<string, true>) {
    if (!read || !intakeLive()) { setDropped(next); return }
    setDropped(next); setNote(null); setError(null)
    try {
      const s = await ingest(keptWorkbook(read, next), read.fileName)
      setSnap(s)
      const seed: Record<string, string | null> = {}
      for (const c of s.columns || []) seed[key(c)] = c.role ?? null
      setRoles(seed)
    } catch (e) { setError(readableError(e)) }
  }

  async function analyse() {
    if (!read || !snap) return
    setPhase('sending'); setError(null)
    try {
      const corrections: Correction[] = (snap.columns || [])
        .filter(c => (roles[key(c)] ?? null) !== (c.role ?? null))
        .map(c => ({ sheet: c.sheet, index: c.index, header: c.header, role: roles[key(c)] ?? null }))
      await confirm(snap.snapshotId, corrections)
      const id = await queueAnalysis(snap.snapshotId, business || undefined)
      nav('/analyses/' + encodeURIComponent(id))
    } catch (e) {
      setPhase('review')
      setError(readableError(e))
    }
  }

  /* ------------------------------------------------------------- render */

  const included = read?.summaries.filter(s => s.included) || []
  const skipped = read?.summaries.filter(s => !s.included) || []
  const cols = snap?.columns || []
  const counts = useMemo(() => tally(cols, roles), [cols, roles])
  const needsWork = counts.confirm > 0

  return (
    <>
      <div className="apphdr">
        <span className="ttl">Analyse a spreadsheet</span>
        <span className="sp" />
        {read && phase !== 'sending' && (
          <button className="btn g" onClick={() => { setRead(null); setSnap(null); setPhase('choose'); setError(null); setNote(null) }}>
            Start over
          </button>
        )}
      </div>

      <div className="canvas">
        <div className="wrap intake">

          {/* step 1 ------------------------------------------------------ */}
          {phase === 'choose' || phase === 'reading' ? (
            <section className="ib">
              <h1 className="ibh">Put your numbers in.</h1>
              <p className="ibs">
                Growth Terminal reads the workbook you already keep, finds the one constraint
                holding revenue back, and writes a twelve week plan against it. You will see
                exactly what it understood before it starts.
              </p>

              <div
                className={'drop' + (over ? ' over' : '') + (phase === 'reading' ? ' busy' : '')}
                onDragOver={e => { e.preventDefault(); setOver(true) }}
                onDragLeave={() => setOver(false)}
                onDrop={onDrop}
              >
                <svg viewBox="0 0 24 24" className="dropico" aria-hidden="true">
                  <path d="M12 16V4M12 4L7.5 8.5M12 4l4.5 4.5" />
                  <path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16" />
                </svg>
                {phase === 'reading' ? (
                  <p className="dropt">Reading the file</p>
                ) : (
                  <>
                    <p className="dropt">Drag a spreadsheet here</p>
                    <p className="dropf">CSV, XLSX, XLS or TSV. Up to {MAX_SHEETS} tabs and {MAX_ROWS_PER_SHEET.toLocaleString()} rows a tab.</p>
                  </>
                )}
                <button className="btn p" onClick={() => fileRef.current?.click()} disabled={phase === 'reading'}>
                  Choose a file
                </button>
                <input
                  ref={fileRef} type="file" accept={ACCEPT} className="vh"
                  aria-label="Choose a spreadsheet to analyse"
                  onChange={e => take(e.target.files?.[0])}
                />
              </div>

              <p className="ibn">
                Exported from Google Sheets{'™'}, Excel, Xero, QuickBooks, Shopify or your CRM all work.
                Nothing is shared with anyone, and the file is read in your browser before any of it is sent.
              </p>
            </section>
          ) : null}

          {/* step 2, collapsed summary of what was read -------------------- */}
          {read && phase !== 'choose' && phase !== 'reading' && (
            <section className="card sumcard">
              <div className="sumhead">
                <div>
                  <div className="suml">File</div>
                  <div className="sumv">{read.fileName}</div>
                </div>
                <div>
                  <div className="suml">Tabs read</div>
                  <div className="sumv">{included.length}{skipped.length ? ' of ' + read.summaries.length : ''}</div>
                </div>
                <div>
                  <div className="suml">Rows</div>
                  <div className="sumv tab">{read.totalDataRows.toLocaleString()}</div>
                </div>
                {snap?.dateRange?.start && (
                  <div>
                    <div className="suml">Covers</div>
                    <div className="sumv">{fmtRange(snap.dateRange)}</div>
                  </div>
                )}
              </div>

              {skipped.length > 0 && (
                <ul className="skiplist">
                  {skipped.map(s => (
                    <li key={s.title}><b>{s.title}</b> was not read. {s.reason}</li>
                  ))}
                </ul>
              )}
              {read.truncated.map(t => (
                <p className="warnline" key={t.sheet}>
                  <b>{t.sheet}</b> has {t.total.toLocaleString()} rows and the first {t.used.toLocaleString()} were read.
                  The rest are not in this analysis.
                </p>
              ))}
            </section>
          )}

          {error && (
            <section className="card errcard" role="alert">
              <h2 className="errh">This file cannot be analysed yet</h2>
              <p>{error}</p>
              <button className="btn g" onClick={() => fileRef.current?.click()}>Choose a different file</button>
              <input ref={fileRef} type="file" accept={ACCEPT} className="vh"
                aria-label="Choose a different spreadsheet" onChange={e => take(e.target.files?.[0])} />
            </section>
          )}

          {note && !error && <p className="notecard">{note}</p>}

          {/* preview ------------------------------------------------------ */}
          {read && !blocked && included.map(s => (
            <Preview
              key={s.title}
              s={s}
              kept={!dropped[s.title]}
              onlyOne={included.length - Object.keys(dropped).length <= 1 && !dropped[s.title]}
              toggle={() => {
                const next = { ...dropped }
                if (next[s.title]) delete next[s.title]; else next[s.title] = true
                reingest(next)
              }}
            />
          ))}

          {/* step 3, the review ------------------------------------------ */}
          {snap && !blocked && (
            <section className="card">
              <h2 className="sech">What Growth Terminal understood</h2>
              <p className="secs">
                Each column below is either recognised, needs a moment from you, or is not
                being used as a signal. Nothing is dropped without you seeing it here.
              </p>

              <div className="statrow">
                <Stat n={counts.recognised} label="Recognised" tone="ok" />
                <Stat n={counts.confirm} label="Need confirming" tone="warn" />
                <Stat n={counts.unmapped} label="Not used" tone="off" />
              </div>

              <div className="maplist">
                {cols.map(c => {
                  const k = key(c)
                  const state = roles[k] ? columnState({ ...c, role: roles[k], status: null }) : 'unmapped'
                  return (
                    <div className={'maprow ' + state} key={k}>
                      <div className="mapsrc">
                        <div className="maph">{c.header || 'Column ' + ((c.index ?? 0) + 1)}</div>
                        <div className="mapmeta">
                          {c.sheet ? c.sheet + ' · ' : ''}{c.type || 'text'}
                          {c.sample?.length ? ' · ' + c.sample.slice(0, 2).map(String).join(', ') : ''}
                        </div>
                      </div>
                      <div className="mapstate">
                        <StateChip state={state} />
                      </div>
                      <label className="mapsel">
                        <span className="vh">What is {c.header || 'this column'}?</span>
                        <select
                          value={roles[k] ?? ''}
                          onChange={e => setRoles(r => ({ ...r, [k]: e.target.value || null }))}
                        >
                          <option value="">Not used</option>
                          {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                      </label>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* readiness + business + action -------------------------------- */}
          {snap && !blocked && (
            <section className="card">
              <h2 className="sech">Before it runs</h2>

              <label className="fieldl" htmlFor="biz">Which business is this?</label>
              <select id="biz" className="ract sel" value={business} onChange={e => setBusiness(e.target.value)}>
                <option value="">New business from this file</option>
                {(businesses || []).map(b => (
                  <option key={String(b.id)} value={String(b.id)}>{String(b.name)}</option>
                ))}
              </select>
              {!business && (
                <input className="ract inp" placeholder="Name it, or leave blank to use the file name"
                  value={newBusiness} onChange={e => setNewBusiness(e.target.value)} aria-label="New business name" />
              )}

              {(snap.supports?.length || snap.missing?.length) ? (
                <div className="ready">
                  {snap.supports?.length ? (
                    <div className="rdy">
                      <div className="rdyh">This file supports</div>
                      <ul>{snap.supports.map(s => <li key={s}>{s}</li>)}</ul>
                    </div>
                  ) : null}
                  {snap.missing?.length ? (
                    <div className="rdy miss">
                      <div className="rdyh">Add these and it can go further</div>
                      <ul>{snap.missing.map(s => <li key={s}>{roleLabel(s)}</li>)}</ul>
                      <p className="rdyf">
                        It will still run without them. The engine says when a finding rests on
                        something it could not see.
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {needsWork && (
                <p className="warnline">
                  {counts.confirm} {counts.confirm === 1 ? 'column needs' : 'columns need'} a moment from you above.
                  You can run it anyway, and anything left unused is simply not treated as a signal.
                </p>
              )}

              <div className="gorow">
                <button className="btn p" onClick={analyse} disabled={phase === 'sending'}>
                  {phase === 'sending' ? 'Starting' : 'Analyse business data'}
                </button>
                <span className="gof">Uses one credit. The verdict lands in Analyses.</span>
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  )
}

/* -------------------------------------------------------------- pieces */

function Preview({ s, kept, onlyOne, toggle }:
  { s: SheetSummary; kept: boolean; onlyOne: boolean; toggle: () => void }) {
  return (
    <section className={'card prev' + (kept ? '' : ' out')}>
      <div className="prevh">
        <h2 className="sech">{s.title}</h2>
        <span className="pill">{s.rows.toLocaleString()} rows, {s.columns} columns</span>
        <span className="sp" />
        <button
          className="btn g mini"
          onClick={toggle}
          disabled={kept && onlyOne}
          title={kept && onlyOne ? 'At least one tab has to be analysed.' : undefined}
        >
          {kept ? 'Do not analyse this tab' : 'Analyse this tab'}
        </button>
      </div>
      <div className="prevscroll">
        <table className="prevt">
          <thead>
            <tr>{s.headers.map((h, i) => <th key={i}>{h || <span className="dim">Column {i + 1}</span>}</th>)}</tr>
          </thead>
          <tbody>
            {s.sample.map((row, r) => (
              <tr key={r}>{row.map((c, i) => <td key={i}>{c === '' ? <span className="dim">empty</span> : String(c)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="prevf">
        {kept
          ? 'First ' + s.sample.length + ' of ' + s.rows.toLocaleString() + ' rows.'
          : 'This tab is not being sent. Notes and instructions tabs are worth taking out; the engine reasons about whatever it is given.'}
      </p>
    </section>
  )
}

function Stat({ n, label, tone }: { n: number; label: string; tone: string }) {
  return (
    <div className={'stat ' + tone}>
      <div className="statn tab">{n}</div>
      <div className="statl">{label}</div>
    </div>
  )
}

function StateChip({ state }: { state: ColumnState }) {
  const text = state === 'recognised' ? 'Recognised' : state === 'confirm' ? 'Confirm this' : 'Not used'
  return <span className={'chip ' + state}><i /> {text}</span>
}

/* --------------------------------------------------------------- utils */

/** The payload minus the tabs somebody took out. Same shape, fewer sheets,
 *  which is exactly what the add-on sends for a workbook with fewer tabs. */
function keptWorkbook(r: ReadResult, dropped: Record<string, true>) {
  return { ...r.workbook, sheets: r.workbook.sheets.filter(s => !dropped[s.title]) }
}

const key = (c: ReadColumn) => (c.sheet || '') + '::' + (c.index ?? c.header ?? '')

function tally(cols: ReadColumn[], roles: Record<string, string | null>) {
  let recognised = 0, confirm = 0, unmapped = 0
  for (const c of cols) {
    const r = roles[key(c)] ?? null
    if (!r) { unmapped++; continue }
    const st = columnState({ ...c, role: r, status: null })
    if (st === 'recognised') recognised++
    else if (st === 'confirm') confirm++
    else unmapped++
  }
  return { recognised, confirm, unmapped }
}

function fmtRange(r: { start?: string; end?: string } | null | undefined): string {
  if (!r?.start) return ''
  const f = (s?: string) => s ? new Date(s).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : ''
  return r.end ? f(r.start) + ' to ' + f(r.end) : f(r.start)
}

/** Server errors are for us. This is for the person who dropped a file in. */
function readableError(e: unknown): string {
  const m = String((e as Error)?.message || e || '')
  if (/402|credit/i.test(m)) return 'This workspace is out of credits, so the analysis cannot start. Top up on Billing and the file is still here.'
  if (/401|403|auth/i.test(m)) return 'That request was not accepted. Signing out and back in usually clears it.'
  if (/413|too large/i.test(m)) return 'That file is too large to send. Splitting it by year or by tab usually does it.'
  if (/network|fetch|Failed to fetch/i.test(m)) return 'The upload did not reach us. Check the connection and try again, nothing was charged.'
  if (/password|encrypt/i.test(m)) return 'That file is password protected, so it cannot be read. Save an unprotected copy and try again.'
  if (/unsupported|Unsupported|cannot read|corrupt/i.test(m)) return 'That file could not be opened. CSV, XLSX, XLS and TSV all work.'
  return m || 'Something went wrong reading that file.'
}
