import React from 'react'
import { Link } from 'react-router-dom'

/** New analysis. Two ways in, and the order is deliberate.
 *
 *  Uploading is first because it depends on nothing: no install, no approval,
 *  no add-on. The add-on is second because it is better once you have it,
 *  reading the workbook you already keep and writing the plan back into it,
 *  but it is a convenience rather than the only door. Until this screen
 *  existed it was the only door, which meant one approval gated every
 *  analysis anyone could run. */
export function NewAnalysis({ close }: { close: () => void }) {
  return (
    <div className="palov on" onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className="namodal">
        <h2>Two ways to start.</h2>
        <p className="ssub"><b>Upload a spreadsheet</b> and you will see exactly what Growth Terminal
          understood before it analyses anything. Works with any CSV or Excel file, nothing to install.</p>
        <p className="ssub">Or use the Google Sheets{'™'} add-on, which reads the workbook you already
          keep and writes the plan back into it:</p>
        <div className="howrow"><span className="hownum">1</span>
          <span>Open the workbook with your business numbers in Google Sheets{'™'}.</span></div>
        <div className="howrow"><span className="hownum">2</span>
          <span>Extensions, then Growth Terminal, then <b>Analyze Workbook</b>.</span></div>
        <div className="howrow"><span className="hownum">3</span>
          <span>The verdict lands here within minutes, with the constraint named and the 90 day plan attached.</span></div>
        <p className="sfine">Each run uses one credit. The add-on connects to this workspace with an
          API key from the API screen.</p>
        <div className="setupnav" style={{ marginTop: 4 }}>
          <span className="sp" />
          <button className="btn g" onClick={close}>Close</button>
          <a className="btn g" href="https://docs.google.com/spreadsheets" target="_blank" rel="noreferrer">
            Open Google Sheets{'™'}</a>
          <Link className="btn p" to="/analyses/new" onClick={close}>Upload a spreadsheet</Link>
        </div>
      </div>
    </div>
  )
}
