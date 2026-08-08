import React, { useRef, useState } from 'react'
import { api } from '../lib/api'
import { toast } from '../lib/bus'

/** New analysis, launched from the portal. Business name plus the raw
 *  numbers, pasted or dropped as a CSV file. A light client pre-flight
 *  refuses obviously empty input before a credit is at stake; the server
 *  runs the real one. */
export function NewAnalysis({ close }: { close: () => void }) {
  const [name, setName] = useState('')
  const [csv, setCsv] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const hasNumbers = /\d/.test(csv) && csv.trim().split('\n').length >= 2
  const ready = name.trim().length > 1 && hasNumbers && !busy

  const pickFile = (f: File | undefined) => {
    if (!f) return
    if (f.size > 2 * 1024 * 1024) { setErr('That file is over 2 MB. Export a leaner sheet.'); return }
    f.text().then(t => { setCsv(t); setErr(null); toast(f.name + ' loaded.') })
  }

  const run = async () => {
    if (!ready) return
    setBusy(true); setErr(null)
    try {
      await api.runAnalysis(name.trim(), csv)
      setDone(true)
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : 'The analysis could not be started.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="palov on" onClick={e => { if (e.target === e.currentTarget && !busy) close() }}>
      <div className="namodal">
        {!done ? (
          <>
            <h2>New analysis</h2>
            <p className="ssub">Name the business, give it the numbers. The engine scores twelve
              constraints against this data and names the one capping revenue.</p>
            <label className="lbl" htmlFor="nab">Business name</label>
            <input id="nab" value={name} onChange={e => setName(e.target.value)}
              placeholder="Northlane Supply Co." autoComplete="off" autoFocus />
            <label className="lbl" htmlFor="nac">The numbers, as CSV</label>
            <textarea id="nac" value={csv} onChange={e => setCsv(e.target.value)}
              placeholder={'Month, Revenue, Customers, Ad spend\nJan, 84200, 312, 9100\nFeb, 87900, 334, 9400'}
              spellCheck={false} />
            <div className="narow">
              <button className="btn g" onClick={() => fileRef.current?.click()}>Upload a CSV file</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }}
                onChange={e => pickFile(e.target.files?.[0])} />
              <span className="nahint">{csv ? csv.trim().split('\n').length + ' rows loaded' : 'Twenty four months beats six.'}</span>
            </div>
            {err && <div className="note bad">{err}</div>}
            <div className="setupnav" style={{ marginTop: 4 }}>
              <button className="btn g" disabled={busy} onClick={close}>Cancel</button>
              <span className="sp" />
              {!hasNumbers && csv.length > 0 && <span className="stephint">Needs at least two rows with numbers.</span>}
              <button className="btn p" disabled={!ready} onClick={run}>
                {busy ? 'Starting' : 'Run analysis'}</button>
            </div>
            <span className="fine" style={{ marginTop: 6 }}>Uses one credit. Identical data submitted twice within the hour runs once.</span>
          </>
        ) : (
          <>
            <h2>Queued.</h2>
            <p className="ssub">The engine has {name.trim()} and is working. Verdicts usually land
              in under five minutes; the run is on the Analyses screen now with a live status.</p>
            <div className="setupnav">
              <span className="sp" />
              <button className="btn p" onClick={() => window.location.assign('/analyses')}>Go to Analyses</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
