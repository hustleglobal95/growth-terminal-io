/** THE FORMULA BUILDER. One agent, one job: write the formula the customer
 *  cannot write, against the sheet they actually have.
 *
 *  Three things here are deliberate.
 *
 *  It never asks what the customer already told the product. The business, the
 *  workspace, the calibration record and the shape of every column come from
 *  the portal itself. The only thing typed on this screen is the measurement,
 *  because that is the only thing the product does not already know.
 *
 *  Nothing generated is shown before it is checked. A formula pointing at a
 *  column that is not in the sheet reads exactly like a correct one, so every
 *  answer is resolved against the real tab and dry run over the sample rows
 *  before it reaches the screen. A formula that errors on every row is refused
 *  here rather than pasted into a customer's own instrument.
 *
 *  A question back is a real answer, and so is a refusal. Both render as
 *  first class results. Neither costs a credit. That is the whole reason the
 *  agent can afford to be honest about what it cannot see.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from './simple'
import { live } from '../lib/api'
import { ASSISTANT_PATH } from '../config'
import { businessLabel, useAccounts, useBusinesses, useCalibration, useMe } from '../lib/liveData'
import { readWorkbook, type ReadResult, type SheetSummary } from '../lib/sheet'
import {
  buildContext, assertNoValuesWithoutGrant, neverSend,
  type AgentContext, type BusinessFacts, type SheetFacts,
} from '../lib/agentContext'
import {
  askAgent, configured, NotConfigured,
  type AgentRequest, type AgentResponse, type Dialect, type FormulaAnswer,
  type QuestionAnswer, type RefusalAnswer,
} from '../lib/agentProtocol'
import { checkFormula, type CheckResult } from '../lib/formulaCheck'

/* The grant is per user and standing, so it is remembered rather than asked
   again. Stored against the person who gave it: a browser that signed
   somebody else in later must not inherit their decision. */
const GRANT_KEY = 'gt_values_grant'

function grantFor(name: string): boolean {
  try { return localStorage.getItem(GRANT_KEY) === name && name.length > 0 } catch { return false }
}
function setGrant(name: string, on: boolean) {
  try { if (on) localStorage.setItem(GRANT_KEY, name); else localStorage.removeItem(GRANT_KEY) } catch { /* private mode */ }
}

const transport = { post: (path: string, body: unknown) => live<unknown>(path, { method: 'POST', body: JSON.stringify(body) }) }
const client = { path: ASSISTANT_PATH, transport }

const toFacts = (s: SheetSummary): SheetFacts => ({
  title: s.title, headers: s.headers, rows: s.rows,
  numericColumns: s.numericColumns, dateColumns: s.dateColumns,
  sample: s.sample, included: s.included, reason: s.reason,
})

export function Formula() {
  const me = useMe()
  const accs = useAccounts()
  const businesses = useBusinesses()
  const calibration = useCalibration()

  const [slug, setSlug] = useState('')
  const [read, setRead] = useState<ReadResult | null>(null)
  const [tab, setTab] = useState('')
  const [dialect, setDialect] = useState<Dialect>('sheets')
  const [ask, setAsk] = useState('')
  const [granted, setGranted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [res, setRes] = useState<AgentResponse | null>(null)
  const [check, setCheck] = useState<CheckResult | null>(null)
  const [reply, setReply] = useState('')
  const [over, setOver] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => { setGranted(grantFor(me?.name || '')) }, [me])

  const biz: BusinessFacts[] = useMemo(() => (businesses || [])
    .filter(b => b && b.slug)
    .map(b => ({ id: b.id, slug: b.slug, name: b.name, label: businessLabel(b.name, accs), syncedAt: b.derivedInputsSyncedAt })),
    [businesses, accs])

  useEffect(() => { if (!slug && biz.length) setSlug(biz[0].slug) }, [biz, slug])

  const sheets = useMemo(() => (read?.summaries || []).filter(s => s.included), [read])
  useEffect(() => { if (sheets.length && !sheets.some(s => s.title === tab)) setTab(sheets[0].title) }, [sheets, tab])

  const context: AgentContext | null = useMemo(() => {
    if (!me) return null
    return buildContext({
      user: { name: me.name, workspace: me.workspace, role: accs && accs.length ? accs[0].role : '' },
      business: biz.find(b => b.slug === slug) || null,
      businesses: biz,
      analysis: null,
      workbook: read ? { fileName: read.fileName, sheets: read.summaries.map(toFacts), totalDataRows: read.totalDataRows } : null,
      calibration: calibration ? {
        predictions: calibration.totals.predictions,
        graded: calibration.totals.graded,
        coverage: calibration.intervalCalibration.coverage,
        targetCoverage: calibration.intervalCalibration.targetCoverage,
        sampleSize: calibration.intervalCalibration.sampleSize,
      } : null,
      valuesGranted: granted,
      sheetTitle: tab,
    })
  }, [me, accs, biz, slug, read, calibration, granted, tab])

  const onFile = async (f: File | null) => {
    if (!f) return
    setErr(''); setRes(null); setCheck(null)
    setBusy(true)
    try { setRead(await readWorkbook(f)) }
    catch (e) { setErr(e instanceof Error ? e.message : 'That file could not be read.') }
    finally { setBusy(false) }
  }

  const send = async (answering?: { questionId: string; reply: string }) => {
    if (!context) return
    setErr(''); setBusy(true)
    if (!answering) { setRes(null); setCheck(null) }
    try {
      assertNoValuesWithoutGrant(context)
      const req: AgentRequest = { ask: ask.trim(), context, dialect, answering }
      const out = await askAgent(client, req)
      setRes(out)
      setReply('')
      if (out.answer.kind === 'formula') {
        const facts = sheets.map(toFacts).find(s => s.title === (out.answer as FormulaAnswer).sheet) || sheets.map(toFacts)[0]
        setCheck(facts ? checkFormula({
          formula: (out.answer as FormulaAnswer).formula,
          dialect: (out.answer as FormulaAnswer).dialect,
          sheet: facts,
          columns: context.columns,
        }) : null)
      } else setCheck(null)
    } catch (e) {
      if (e instanceof NotConfigured) setErr(e.message)
      else setErr(e instanceof Error ? e.message : 'The request did not finish.')
    } finally { setBusy(false) }
  }

  if (!configured(client)) return <NotOn />

  const held = (context?.columns || []).filter(c => neverSend(c.header)).map(c => c.header)
  const ready = Boolean(context && read && tab && ask.trim().length > 3 && !busy)

  return (
    <>
      <Header title="Formula builder" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">

          <div className="setupcard">
            <h2>Say what you want to measure.</h2>
            <p className="ssub">Point it at the workbook and it reads the tab names, the
                                  headers and the shape of every column.</p>

            <label className="lbl" htmlFor="fbiz">Business</label>
            <select id="fbiz" className="tmsel" value={slug} onChange={e => setSlug(e.target.value)} disabled={busy}>
              {biz.map(b => <option key={b.slug} value={b.slug}>{b.label}</option>)}
              {biz.length === 0 && <option value="">No businesses in this workspace yet</option>}
            </select>

            <label className="lbl">Your workbook</label>
            {/* The same drop zone the upload screen uses. A workbook arrives one
                way in this product, not two. */}
            <div className={'drop' + (over ? ' over' : '') + (busy ? ' busy' : '')}
              onDragOver={e => { e.preventDefault(); setOver(true) }}
              onDragLeave={() => setOver(false)}
              onDrop={e => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files && e.dataTransfer.files[0]) }}
            >
              <svg viewBox="0 0 24 24" className="dropico" aria-hidden="true">
                <path d="M12 16V4M12 4L7.5 8.5M12 4l4.5 4.5" />
                <path d="M4 16v2.5A1.5 1.5 0 005.5 20h13a1.5 1.5 0 001.5-1.5V16" />
              </svg>
              <p className="dropt">{read ? read.fileName : 'Drag your spreadsheet here'}</p>
              <p className="dropf">{read
                ? `${sheets.length} tab${sheets.length === 1 ? '' : 's'} read, ${read.totalDataRows} data rows. The file stays in this browser.`
                : 'CSV, XLSX, XLS or TSV. It is read here, not uploaded.'}</p>
              <button className="btn p" disabled={busy} onClick={() => fileRef.current?.click()}>
                {read ? 'Choose a different file' : 'Choose a file'}
              </button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.tsv" className="vh"
                aria-label="Choose a spreadsheet to write a formula against"
                onChange={e => onFile(e.target.files && e.target.files[0])} />
            </div>

            {sheets.length > 1 && (
              <>
                <label className="lbl" htmlFor="ftab">Tab</label>
                <select id="ftab" className="tmsel" value={tab} onChange={e => setTab(e.target.value)} disabled={busy}>
                  {sheets.map(s => <option key={s.title} value={s.title}>{s.title}</option>)}
                </select>
              </>
            )}

            <label className="lbl" htmlFor="fdial">Which app</label>
            <select id="fdial" className="tmsel" value={dialect} onChange={e => setDialect(e.target.value as Dialect)} disabled={busy}>
              <option value="sheets">Google Sheets</option>
              <option value="excel">Excel</option>
            </select>

            <label className="lbl" htmlFor="fask">What do you want to measure</label>
            <textarea id="fask" className="tminput" rows={3} value={ask} maxLength={2000}
              disabled={busy} onChange={e => setAsk(e.target.value)}
              placeholder="Month over month growth in revenue, handling the first month" />

            {err && <p className="brerr">{err}</p>}

            <div className="act">
              <button className="btn p" disabled={!ready} onClick={() => send()}>Write the formula</button>
            </div>
          </div>

          {context && <Grant ctx={context} on={granted} held={held}
            toggle={() => { const n = !granted; setGranted(n); setGrant(me?.name || '', n) }} />}

          {res && <Answer res={res} check={check} reply={reply} setReply={setReply} busy={busy}
            onReply={qid => send({ questionId: qid, reply: reply.trim() })} />}

          {context && context.blind.length > 0 && (
            <div className="setupcard">
              <h2>What it is working without.</h2>
              <p className="ssub">Listed rather than hidden. Every line here is a reason an answer
                might hedge, and most of them you can close.</p>
              <ul className="glist">{context.blind.map((b, i) => <li key={i}>{b}</li>)}</ul>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ grant -- */

function Grant({ ctx, on, held, toggle }: { ctx: AgentContext; on: boolean; held: string[]; toggle: () => void }) {
  return (
    <div className="setupcard">
      <h2>{on ? 'It can read your rows.' : 'It is working from column names only.'}</h2>
      <p className="ssub">{on
        ? 'Given once, it stays on until you turn it off. It is sent the columns your question is about, never the whole workbook.'
        : 'Without your rows it can see that a column is a date and not what any date says, so a count that has to match a word will come back as a question instead of a guess.'}</p>
      {on && held.length > 0 && (
        <p className="sfine">Held back regardless: {held.join(', ')}. A formula has never needed them.</p>
      )}
      <p className="sfine">{ctx.columns.length} column{ctx.columns.length === 1 ? '' : 's'} resolved
        on this tab{ctx.workbook ? ' of ' + ctx.workbook.fileName : ''}.</p>
      <div className="act">
        <button className="btn g" onClick={toggle}>{on ? 'Stop sharing my rows' : 'Let it read my rows'}</button>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- answer -- */

function Answer({ res, check, reply, setReply, busy, onReply }: {
  res: AgentResponse; check: CheckResult | null
  reply: string; setReply: (s: string) => void; busy: boolean
  onReply: (questionId: string) => void
}) {
  const a = res.answer
  if (a.kind === 'formula') return <Formula1 a={a} check={check} sawValues={res.sawValues} />
  if (a.kind === 'question') return <Ask a={a} reply={reply} setReply={setReply} busy={busy} onReply={onReply} />
  if (a.kind === 'refusal') return <No a={a} />
  return (
    <div className="setupcard">
      <h2>That answer is not drawn here yet.</h2>
      <p className="ssub">It came back as a {a.kind}, and this screen renders formulas, questions
        and refusals. Nothing is shown rather than something half drawn.</p>
    </div>
  )
}

function Formula1({ a, check, sawValues }: { a: FormulaAnswer; check: CheckResult | null; sawValues: boolean }) {
  const bad = check && !check.ok
  return (
    <div className="setupcard">
      <h2>{bad ? 'It did not survive the check.' : 'Paste this into ' + (a.placement || 'your sheet') + '.'}</h2>
      {bad && <p className="ssub">The formula below was written against your sheet and then run over
        your own sample rows, and it failed. It is shown so you can see what it tried, not so you
        can use it.</p>}
      <pre className="tmcode">{a.formula}</pre>

      {check && check.problems.length > 0 && (
        <ul className="glist">{check.problems.map((p, i) => <li key={i}>{p.says}</li>)}</ul>
      )}

      {check && check.preview.length > 0 && (
        <>
          <label className="lbl">What it returns on your rows</label>
          <div className="minirows">
            {check.preview.map(p => (
              <div className="trow" key={p.row}><span>Row {p.row}</span><b>{p.value || 'blank'}</b></div>
            ))}
          </div>
        </>
      )}

      {a.explanation && <><label className="lbl">What it does</label><p className="ssub">{a.explanation}</p></>}
      {a.placement && <><label className="lbl">Where it goes</label><p className="ssub">{a.placement}{a.sheet ? ', on ' + a.sheet : ''}</p></>}
      {a.compatibility.length > 0 && (
        <><label className="lbl">Sheets and Excel</label>
          <ul className="glist">{a.compatibility.map((c, i) => <li key={i}>{c}</li>)}</ul></>
      )}
      {a.errors && <><label className="lbl">When it is blank or errors</label><p className="ssub">{a.errors}</p></>}
      {check && check.notes.length > 0 && (
        <ul className="glist">{check.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}

      {a.alternative && a.alternative.formula && (
        <>
          <label className="lbl">Another way</label>
          <pre className="tmcode">{a.alternative.formula}</pre>
          <p className="ssub">{a.alternative.why}</p>
          {a.alternative.needs && <p className="sfine">Needs {a.alternative.needs}.</p>}
        </>
      )}

      <p className="sfine">{sawValues
        ? 'Written with your rows in front of it.'
        : 'Written from your column names and types alone.'}</p>
    </div>
  )
}

function Ask({ a, reply, setReply, busy, onReply }: {
  a: QuestionAnswer; reply: string; setReply: (s: string) => void
  busy: boolean; onReply: (questionId: string) => void
}) {
  return (
    <div className="setupcard">
      <h2>It needs one thing first.</h2>
      <p className="ssub">{a.question}</p>
      {a.choices && a.choices.length > 0 ? (
        <div className="act">
          {a.choices.map(c => (
            <button key={c} className="btn g" disabled={busy}
              onClick={() => { setReply(c); setTimeout(() => onReply(a.questionId), 0) }}>{c}</button>
          ))}
        </div>
      ) : (
        <>
          <input value={reply} disabled={busy} onChange={e => setReply(e.target.value)}
            placeholder="Your answer" autoComplete="off" />
          <div className="act">
            <button className="btn p" disabled={busy || reply.trim().length === 0}
              onClick={() => onReply(a.questionId)}>Send it back</button>
          </div>
        </>
      )}
      {a.unlocks && <p className="sfine">{a.unlocks}</p>}
      <p className="sfine">A question costs nothing.</p>
    </div>
  )
}

function No({ a }: { a: RefusalAnswer }) {
  return (
    <div className="setupcard">
      <h2>It will not write this one.</h2>
      <p className="ssub">{a.because}</p>
      {a.wouldNeed.length > 0 && (
        <><label className="lbl">What would change that</label>
          <ul className="glist">{a.wouldNeed.map((w, i) => <li key={i}>{w}</li>)}</ul></>
      )}
      <p className="sfine">A refusal costs nothing.</p>
    </div>
  )
}

function NotOn() {
  return (
    <>
      <Header title="Formula builder" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          <div className="setupcard">
            <h2>Not switched on for this workspace yet.</h2>
            <p className="ssub">Formulas are written on the engine, and that route does not
                                  answer today.</p>
          </div>
        </div>
      </div>
    </>
  )
}
