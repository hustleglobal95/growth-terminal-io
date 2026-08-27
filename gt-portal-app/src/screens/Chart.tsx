/** THE CHART BUILDER. Say what you want to see and it draws it.
 *
 *  Four things here are deliberate.
 *
 *  IT LISTENS IN THE BROWSER AND THINKS IN THE BROWSER. Speech recognition is
 *  the browser's own, and the sentence is resolved against the real headers by
 *  rules that ship in this file's neighbours. Nothing is uploaded, nothing is
 *  generated, and a chart costs nothing. The workbook never leaves the machine
 *  it was dropped on.
 *
 *  IT SHOWS WHAT IT HEARD BEFORE IT SHOWS THE CHART. "You said spend and I
 *  used Marketing Spend" is a correction somebody can make in one glance. A
 *  chart drawn from the wrong column looks exactly like a chart drawn from the
 *  right one, so the resolution is put on the page rather than assumed.
 *
 *  IT WILL NOT GUESS BETWEEN TWO COLUMNS. A workbook holding both Ad Spend and
 *  Marketing Spend answers the word "spend" twice, and picking one is how a
 *  chart quietly lies. It asks instead.
 *
 *  THE ENGINE IS AN OFFER, NEVER A FALLBACK THAT JUST HAPPENS. When the rules
 *  cannot resolve a sentence they say which words they could not place, and
 *  the button that sends it on says what it costs. Nothing spends a credit on
 *  a customer's behalf because a rule came up short.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Header } from './simple'
import { live } from '../lib/api'
import { ASSISTANT_PATH } from '../config'
import { businessLabel, useAccounts, useBusinesses, useMe } from '../lib/liveData'
import { readWorkbook, type ReadResult, type SheetSummary } from '../lib/sheet'
import { buildContext, columnKind, type BusinessFacts, type SheetFacts } from '../lib/agentContext'
import { askAgent, configured, NotConfigured, type AgentRequest, type ChartAnswer } from '../lib/agentProtocol'
import { readAsk, readiness, type Field, type Intent } from '../lib/chartIntent'
import { plan as buildPlan, type Cell, type Plan } from '../lib/chartPlan'
import { ChartTable, ChartView, safeName, toCsv, toPng } from '../components/ChartView'
import { dictate, dictationSupported } from '../lib/dictate'

const GRANT_KEY = 'gt_values_grant'
const grantFor = (name: string): boolean => {
  try { return localStorage.getItem(GRANT_KEY) === name && name.length > 0 } catch { return false }
}

const transport = { post: (path: string, body: unknown) => live<unknown>(path, { method: 'POST', body: JSON.stringify(body) }) }
const client = { path: ASSISTANT_PATH, transport }

const toFacts = (s: SheetSummary): SheetFacts => ({
  title: s.title, headers: s.headers, rows: s.rows,
  numericColumns: s.numericColumns, dateColumns: s.dateColumns,
  sample: s.sample, included: s.included, reason: s.reason,
})

const HOW: Record<string, string> = {
  exact: 'said outright', words: 'both words said', part: 'part of the name',
  synonym: 'a word for it',
}

export function Chart() {
  const me = useMe()
  const accs = useAccounts()
  const businesses = useBusinesses()

  const [slug, setSlug] = useState('')
  const [read, setRead] = useState<ReadResult | null>(null)
  const [tab, setTab] = useState('')
  const [ask, setAsk] = useState('')
  const [interim, setInterim] = useState('')
  const [listening, setListening] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState<{ intent: Intent; plan: Plan | null; why: string; fromEngine: boolean } | null>(null)
  const [showTable, setShowTable] = useState(false)
  const [over, setOver] = useState(false)

  const fileRef = useRef<HTMLInputElement | null>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  const canHear = useMemo(() => dictationSupported(), [])
  useEffect(() => () => { if (stopRef.current) stopRef.current() }, [])

  const biz: BusinessFacts[] = useMemo(() => (businesses || [])
    .filter(b => b && b.slug)
    .map(b => ({ id: b.id, slug: b.slug, name: b.name, label: businessLabel(b.name, accs), syncedAt: b.derivedInputsSyncedAt })),
    [businesses, accs])
  useEffect(() => { if (!slug && biz.length) setSlug(biz[0].slug) }, [biz, slug])

  const sheets = useMemo(() => (read?.summaries || []).filter(s => s.included), [read])
  useEffect(() => { if (sheets.length && !sheets.some(s => s.title === tab)) setTab(sheets[0].title) }, [sheets, tab])

  /* The tab in play, with its full grid. The grid never leaves this browser:
     the chart is drawn from it here, and the engine, on the one path that
     reaches it, is sent column names and types rather than rows. */
  const active = useMemo(() => {
    if (!read || !tab) return null
    const summary = read.summaries.find(s => s.title === tab && s.included)
    const payload = read.workbook.sheets.find(s => s.title === tab)
    if (!summary || !payload) return null
    return { summary, headers: summary.headers, rows: payload.values.slice(1) as Cell[][] }
  }, [read, tab])

  const fields: Field[] = useMemo(() => {
    if (!active) return []
    const facts = toFacts(active.summary)
    return active.headers.filter(Boolean).map(h => ({ header: h, kind: columnKind(facts, h) }))
  }, [active])

  const onFile = async (f: File | null) => {
    if (!f) return
    setErr(''); setResult(null)
    setBusy(true)
    try { setRead(await readWorkbook(f)) }
    catch (e) { setErr(e instanceof Error ? e.message : 'That file could not be read.') }
    finally { setBusy(false) }
  }

  const halt = () => { if (stopRef.current) { stopRef.current(); stopRef.current = null } setListening(false); setInterim('') }

  const listen = () => {
    setErr('')
    if (listening) { halt(); return }
    const handle = dictate({
      onFinal: text => { setAsk(prev => (prev ? prev.replace(/\s+$/, '') + ' ' : '') + text.trim()); setInterim('') },
      onInterim: setInterim,
      onError: setErr,
      onStop: () => { setListening(false); setInterim('') },
    })
    if (!handle) { setErr('This browser has no speech recognition. Type it instead.'); return }
    stopRef.current = handle
    setListening(true)
  }

  const draw = () => {
    if (!active) return
    halt()
    setErr(''); setShowTable(false)
    const intent = readAsk(ask, { fields })
    const ready = readiness(intent)
    if (!ready.ok) { setResult({ intent, plan: null, why: ready.why, fromEngine: false }); return }
    const p = buildPlan({ intent, headers: active.headers, rows: active.rows, sheetTitle: tab })
    setResult(p
      ? { intent, plan: p, why: '', fromEngine: false }
      : { intent, plan: null, why: 'Every row that could have been a point was blank or unreadable in those columns, so there is nothing to draw.', fromEngine: false })
  }

  /* The one path that spends a credit, and only ever because somebody pressed
     the button that says so. What comes back is resolved against the real
     headers before anything is drawn: an engine naming a column this sheet
     does not have is refused here rather than rendered as an empty axis. */
  const sendOn = async () => {
    if (!active || !me || !result) return
    setBusy(true); setErr('')
    try {
      const context = buildContext({
        user: { name: me.name, workspace: me.workspace, role: accs && accs.length ? accs[0].role : '' },
        business: biz.find(b => b.slug === slug) || null,
        businesses: biz,
        analysis: null,
        workbook: read ? { fileName: read.fileName, sheets: read.summaries.map(toFacts), totalDataRows: read.totalDataRows } : null,
        calibration: null,
        valuesGranted: grantFor(me.name || ''),
        sheetTitle: tab,
      })
      const req: AgentRequest = { ask: ask.trim(), context, dialect: 'sheets' }
      const out = await askAgent(client, req)
      if (out.answer.kind === 'refusal') { setResult({ ...result, why: out.answer.because, fromEngine: true }); return }
      if (out.answer.kind === 'question') { setResult({ ...result, why: out.answer.question, fromEngine: true }); return }
      if (out.answer.kind !== 'chart') {
        setResult({ ...result, why: 'The engine sent back something this screen does not draw, so nothing is shown rather than something half drawn.', fromEngine: true })
        return
      }
      const checked = fromEngine(out.answer, active.headers, fields)
      if (!checked.ok) { setResult({ ...result, why: checked.why, fromEngine: true }); return }
      const p = buildPlan({ intent: checked.intent, headers: active.headers, rows: active.rows, sheetTitle: tab })
      setResult(p
        ? { intent: checked.intent, plan: p, why: '', fromEngine: true }
        : { intent: checked.intent, plan: null, why: 'The columns it chose hold nothing that can be drawn on this tab.', fromEngine: true })
    } catch (e) {
      if (e instanceof NotConfigured) setErr(e.message)
      else setErr(e instanceof Error ? e.message : 'The request did not finish.')
    } finally { setBusy(false) }
  }

  const savePng = async () => {
    if (!svgRef.current || !result?.plan) return
    try { await toPng(svgRef.current, result.plan.title) }
    catch (e) { setErr(e instanceof Error ? e.message : 'The chart could not be saved as an image here.') }
  }

  const saveCsv = () => {
    if (!result?.plan) return
    const blob = new Blob([toCsv(result.plan)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = safeName(result.plan.title) + '.csv'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  const ready = Boolean(active && ask.trim().length > 2 && !busy)

  return (
    <>
      <Header title="Chart builder" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">

          <div className="setupcard">
            <h2>Say what you want to see.</h2>
            <p className="ssub">It reads your tab names, your headers and the type of every column,
              so you never describe your sheet to it. The chart is drawn here, in this browser, from
              the file you dropped. Nothing is uploaded and nothing is spent.</p>

            <label className="lbl" htmlFor="cbiz">Business</label>
            <select id="cbiz" className="tmsel" value={slug} onChange={e => setSlug(e.target.value)} disabled={busy}>
              {biz.map(b => <option key={b.slug} value={b.slug}>{b.label}</option>)}
              {biz.length === 0 && <option value="">No businesses in this workspace yet</option>}
            </select>

            <label className="lbl">Your workbook</label>
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
                aria-label="Choose a spreadsheet to chart"
                onChange={e => onFile(e.target.files && e.target.files[0])} />
            </div>

            {sheets.length > 1 && (
              <>
                <label className="lbl" htmlFor="ctab">Tab</label>
                <select id="ctab" className="tmsel" value={tab} onChange={e => { setTab(e.target.value); setResult(null) }} disabled={busy}>
                  {sheets.map(s => <option key={s.title} value={s.title}>{s.title}</option>)}
                </select>
              </>
            )}

            <label className="lbl" htmlFor="cask">What do you want to see</label>
            <div className="cbrow">
              <textarea id="cask" className="tminput" rows={2} value={ask + (interim ? ' ' + interim : '')}
                maxLength={600} disabled={busy}
                onChange={e => { setAsk(e.target.value); setInterim('') }}
                placeholder="Revenue by month, or top ten customers by spend" />
              {canHear && (
                <button className={'btn g cbtalk' + (listening ? ' on' : '')} onClick={listen} disabled={busy}
                  aria-pressed={listening}>
                  <span className={'cbdot' + (listening ? ' live' : '')} aria-hidden="true" />
                  {listening ? 'Stop' : 'Talk to it'}
                </button>
              )}
            </div>
            <p className="sfine">{canHear
              ? 'Recognition is the browser’s own, so nothing here is uploaded by Growth Terminal and no credit is spent. Chrome sends the audio to Google to transcribe, which is worth knowing before you say a figure out loud.'
              : 'This browser has no speech recognition, so type it. Chrome and Edge can listen.'}</p>

            {active && <p className="sfine">{fields.length} column{fields.length === 1 ? '' : 's'} on {tab}: {fields.map(f => f.header).join(', ')}.</p>}
            {err && <p className="brerr">{err}</p>}

            <div className="act">
              <button className="btn p" disabled={!ready} onClick={draw}>Draw it</button>
            </div>
          </div>

          {result && result.plan && (
            <Drawn plan={result.plan} intent={result.intent} fromEngine={result.fromEngine}
              svgRef={svgRef} showTable={showTable} setShowTable={setShowTable}
              savePng={savePng} saveCsv={saveCsv} />
          )}

          {result && !result.plan && (
            <Stuck why={result.why} intent={result.intent} busy={busy} fromEngine={result.fromEngine}
              canSend={configured(client) && !result.fromEngine} onSend={sendOn} />
          )}

        </div>
      </div>
    </>
  )
}

/* ----------------------------------------------------------------- drawn -- */

function Drawn({ plan, intent, fromEngine, svgRef, showTable, setShowTable, savePng, saveCsv }: {
  plan: Plan; intent: Intent; fromEngine: boolean
  svgRef: React.MutableRefObject<SVGSVGElement | null>
  showTable: boolean; setShowTable: (b: boolean) => void
  savePng: () => void; saveCsv: () => void
}) {
  return (
    <>
      <div className="setupcard">
        <h2>{plan.title}</h2>
        <p className="ssub">{plan.because}</p>
        <ChartView plan={plan} svgRef={svgRef} />

        <label className="lbl">What it shows</label>
        <p className="ssub">{plan.reads}</p>

        {plan.notes.length > 0 && (
          <>
            <label className="lbl">What was left out</label>
            <ul className="glist2">{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </>
        )}

        <div className="act chartacts">
          <button className="btn p" onClick={savePng}>Save as PNG</button>
          <button className="btn g" onClick={saveCsv}>Save the numbers</button>
          <button className="btn g" onClick={() => setShowTable(!showTable)}>
            {showTable ? 'Hide the numbers' : 'See the numbers'}
          </button>
        </div>

        {showTable && <ChartTable plan={plan} />}
      </div>

      <div className="setupcard">
        <h2>What it heard.</h2>
        <p className="ssub">Shown so you can correct it in one glance. A chart drawn from the wrong
          column looks exactly like a chart drawn from the right one.</p>
        <ul className="heardrows">
          {intent.matched.map((m, i) => (
            <li key={i}>
              <span className="hw">&ldquo;{m.heard}&rdquo;</span>
              <span className="hh">{HOW[m.how] || m.how}</span>
              <b>{m.header}</b>
            </li>
          ))}
        </ul>
        {intent.declined && (
          <p className="sfine">You asked for {intent.declined.asked}. {intent.declined.because} This
            is {intent.declined.instead === 'bar' ? 'a bar chart' : 'a ' + intent.declined.instead + ' chart'} instead.</p>
        )}
        <p className="sfine">{fromEngine
          ? 'The columns were chosen on the engine and then checked against this sheet before anything was drawn.'
          : 'Resolved in this browser by rule. Nothing was uploaded and no credit was spent.'}</p>
      </div>
    </>
  )
}

/* ----------------------------------------------------------------- stuck -- */

function Stuck({ why, intent, busy, canSend, fromEngine, onSend }: {
  why: string; intent: Intent; busy: boolean; canSend: boolean; fromEngine: boolean; onSend: () => void
}) {
  return (
    <div className="setupcard">
      <h2>{intent.ambiguous.length ? 'Two columns answer to that.' : 'It could not place that.'}</h2>
      <p className="ssub">{why}</p>
      {intent.matched.length > 0 && (
        <>
          <label className="lbl">What it did place</label>
          <ul className="heardrows">
            {intent.matched.map((m, i) => (
              <li key={i}><span className="hw">&ldquo;{m.heard}&rdquo;</span><span className="hh" /><b>{m.header}</b></li>
            ))}
          </ul>
        </>
      )}
      {canSend && (
        <>
          <label className="lbl">Or hand it to the engine</label>
          <p className="ssub">The rules here understand the shapes people usually say. The engine
            understands more of them, and it costs one credit. Your rows are not sent: it is given
            the column names and their types, and whatever it picks is checked against this sheet
            before anything is drawn.</p>
          <div className="act">
            <button className="btn p" disabled={busy} onClick={onSend}>Send it on, one credit</button>
          </div>
        </>
      )}
      {fromEngine && <p className="sfine">That came back from the engine.</p>}
      {!canSend && !fromEngine && (
        <p className="sfine">The engine is not switched on for this workspace, so rewording it here
          is the way through.</p>
      )}
    </div>
  )
}

/* --------------------------------------------------------- engine answers -- */

/** An engine answer turned into the same intent the rules produce, so it runs
 *  through exactly the same planner and the same checks. A header the sheet
 *  does not have is caught here. Nothing the engine says is drawn on trust. */
function fromEngine(a: ChartAnswer, headers: string[], fields: Field[]):
  { ok: true; intent: Intent } | { ok: false; why: string } {
  const named = (a.series || []).map(s => s && s.header).filter(Boolean) as string[]
  const missing = [...named, ...(a.categoryHeader ? [a.categoryHeader] : [])]
    .filter(h => headers.indexOf(h) < 0)
  if (missing.length) return {
    ok: false,
    why: `It answered with ${missing.map(m => '"' + m + '"').join(' and ')}, which ${missing.length === 1 ? 'is not a column' : 'are not columns'} on this tab. Nothing is drawn from a column that does not exist.`,
  }
  const measures = named.filter(h => fields.some(f => f.header === h && f.kind === 'number'))
  if (!measures.length) return {
    ok: false,
    why: 'It did not name a numeric column to plot, so there is nothing to put on the y axis.',
  }
  const kind = (['line', 'bar', 'column', 'scatter', 'area'] as const).find(k => k === a.chart) || null
  return {
    ok: true,
    intent: {
      measures, dimension: a.categoryHeader || null, kind,
      aggregate: 'none', order: 'none', limit: null,
      heard: a.title || '', matched: [], unmatched: [], ambiguous: [], declined: null,
    },
  }
}
