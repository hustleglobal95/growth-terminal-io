import React from 'react'

/** New analysis. Analyses are born in the spreadsheet, where the real
 *  numbers live: the Google Sheets add-on reads the workbook and feeds
 *  the engine. The portal is where verdicts land. This dialog points
 *  people to the source instead of pretending to be one. */
export function NewAnalysis({ close }: { close: () => void }) {
  return (
    <div className="palov on" onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className="namodal">
        <h2>Analyses start in your spreadsheet.</h2>
        <p className="ssub">The engine reads the workbook you already keep, so the numbers stay
          where they live and nothing gets copied around. Three steps:</p>
        <div className="howrow"><span className="hownum">1</span>
          <span>Open the workbook with your business numbers in Google Sheets{'™'}.</span></div>
        <div className="howrow"><span className="hownum">2</span>
          <span>Extensions, then Growth Terminal, then <b>Analyze Workbook</b>.</span></div>
        <div className="howrow"><span className="hownum">3</span>
          <span>The verdict lands here within minutes, with the constraint named and the 90 day plan attached.</span></div>
        <p className="sfine">Each run uses one credit. The add-on connects to this workspace with an
          API key from the API Keys screen.</p>
        <div className="setupnav" style={{ marginTop: 4 }}>
          <span className="sp" />
          <button className="btn g" onClick={close}>Close</button>
          <a className="btn p" href="https://docs.google.com/spreadsheets" target="_blank" rel="noreferrer">
            Open Google Sheets{'™'}</a>
        </div>
      </div>
    </div>
  )
}
