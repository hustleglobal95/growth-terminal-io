import React, { useMemo, useState } from 'react'
import './Studio.css'

type Stage = 'Prospect' | 'Contacted' | 'Discovery' | 'Proposal' | 'Won' | 'Production' | 'Delivered' | 'Lost'
type RecordItem = { id: string; company: string; contact: string; email: string; website: string; stage: Stage; value: number; nextAction: string; followUp: string; notes: string; updatedAt: string }
const stages: Stage[] = ['Prospect', 'Contacted', 'Discovery', 'Proposal', 'Won', 'Production', 'Delivered', 'Lost']
const key = 'gt.studio.pipeline.v1'
function read(): RecordItem[] {
  try {
    const json = localStorage.getItem(key)
    const parsed: unknown = json ? JSON.parse(json) : []
    if (!Array.isArray(parsed)) return []
    return parsed.filter((v): v is RecordItem => Boolean(v && typeof v.id === 'string' && typeof v.company === 'string' && stages.includes(v.stage)))
  } catch { return [] }
}
function csvCell(value: string | number) { return '"' + String(value).replace(/"/g, '""') + '"' }
function download(rows: RecordItem[]) {
  const columns: (keyof RecordItem)[] = ['company','contact','email','website','stage','value','nextAction','followUp','notes','updatedAt']
  const data = [columns.join(','), ...rows.map(r => columns.map(k => csvCell(r[k])).join(','))].join('\r\n')
  const blob = new Blob([data], {type: 'text/csv;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = 'growth-terminal-studio-pipeline.csv'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const blank = { company: '', contact: '', email: '', website: '', value: 5000, nextAction: '', followUp: '', notes: '' }
const money = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)
export function Studio() {
  const [rows, setRows] = useState<RecordItem[]>(read)
  const [draft, setDraft] = useState(blank)
  const [filter, setFilter] = useState<Stage | 'All'>('All')
  const [editing, setEditing] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const save = (next: RecordItem[]) => { setRows(next); try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Browser storage may be unavailable. */ } }
  const current = useMemo(() => rows.filter(r => r.stage !== 'Lost' && r.stage !== 'Delivered'), [rows])
  const pipeline = current.reduce((total, r) => total + r.value, 0)
  const won = rows.filter(r => r.stage === 'Won' || r.stage === 'Production' || r.stage === 'Delivered')
  const today = new Date().toLocaleDateString('en-CA')
  const due = current.filter(r => r.followUp && r.followUp <= today).sort((a,b) => a.followUp.localeCompare(b.followUp))
  const shown = rows.filter(r => filter === 'All' || r.stage === filter).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))
  const startEdit = (r: RecordItem) => { setDraft({ company:r.company, contact:r.contact, email:r.email, website:r.website, value:r.value, nextAction:r.nextAction, followUp:r.followUp, notes:r.notes }); setEditing(r.id); setShowForm(true) }
  const reset = () => { setDraft(blank); setEditing(null); setShowForm(false) }
  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!draft.company.trim()) return
    const previous = rows.find(r => r.id === editing)
    const item: RecordItem = { ...draft, company: draft.company.trim(), contact: draft.contact.trim(), email: draft.email.trim(), website: draft.website.trim(), nextAction: draft.nextAction.trim(), notes: draft.notes.trim(), value: Math.max(0, Number(draft.value) || 0), id: previous?.id || crypto.randomUUID(), stage: previous?.stage || 'Prospect', updatedAt: new Date().toISOString() }
    save(previous ? rows.map(r => r.id === previous.id ? item : r) : [item, ...rows])
    reset()
  }
  const stageChange = (id: string, stage: Stage) => save(rows.map(r => r.id === id ? { ...r, stage, updatedAt: new Date().toISOString() } : r))
  return <div className="studio">
    <header className="studio-hero">
      <div><p className="studio-eyebrow">GROWTH TERMINAL / STUDIO OPERATIONS</p><h1>Build the pipeline.<br/><em>Ship the work.</em></h1>
        <p className="studio-lead">One workspace for selling and delivering immersive websites. Track the next action on every opportunity, from first contact to launch.</p></div>
      <div className="studio-hero-actions"><button type="button" className="studio-primary" onClick={() => { reset(); setShowForm(true) }}>Add prospect +</button><button type="button" className="studio-secondary" onClick={() => download(rows)} disabled={!rows.length}>Export CSV</button></div>
    </header>
    <div className="studio-disclosure" role="status">Private browser workspace. Records stay on this device, are not synced to other users, and are not connected to the existing lead-search engine. Export CSV regularly.</div>
    <section className="studio-metrics" aria-label="Studio metrics">
      <div><span>Active opportunities</span><strong>{current.length}</strong></div>
      <div><span>Open pipeline</span><strong>{money(pipeline)}</strong></div>
      <div><span>Won projects</span><strong>{won.length}</strong></div>
      <div><span>Follow-ups due</span><strong>{due.length}</strong></div>
    </section>
    <section className="studio-offer">
      <div><p className="studio-eyebrow">THE CORE OFFER</p><h2>Signature website experience</h2><p>For brands ready to move beyond templates. A custom creative direction, responsive build, purposeful interaction and a launch-ready handoff.</p>
      <p className="studio-small">Scope and final timeline are confirmed in a written proposal. Advanced 3D production, integrations, copywriting and ongoing hosting are separately scoped.</p></div>
      <div className="studio-price"><span>PROJECTS FROM</span><strong>$5,000</strong><span>Custom proposal after discovery</span><a href="https://growthterminal.io" target="_blank" rel="noreferrer">View public website</a></div>
    </section>
    <section className="studio-workflow"><p className="studio-eyebrow">SALES TO DELIVERY</p><div>{['Research','Outreach','Discovery','Proposal','Production','Launch'].map((v,i) => <span key={v}><b>{String(i+1).padStart(2,'0')}</b>{v}</span>)}</div></section>
    <section className="studio-panel">
      <div className="studio-panel-head"><div><p className="studio-eyebrow">OPPORTUNITIES</p><h2>Pipeline</h2></div><label>Filter <select value={filter} onChange={e => setFilter(e.target.value as Stage | 'All')}><option value="All">All stages</option>{stages.map(s => <option key={s}>{s}</option>)}</select></label></div>
      {shown.length === 0 ? <div className="studio-empty"><strong>{rows.length ? 'No opportunities at this stage.' : 'Your pipeline is ready.'}</strong><p>{rows.length ? 'Choose another stage to see the rest of your work.' : 'Add your first prospect, then record the next action and follow-up date.'}</p></div> :
      <div className="studio-table-scroll"><table className="studio-table"><thead><tr><th>Company</th><th>Stage</th><th>Value</th><th>Next action</th><th>Follow-up</th><th></th></tr></thead><tbody>{shown.map(r => <tr key={r.id}><td><strong>{r.company}</strong><small>{r.contact || r.email || r.website || 'No contact added'}</small></td><td><select aria-label={'Stage for ' + r.company} value={r.stage} onChange={e => stageChange(r.id,e.target.value as Stage)}>{stages.map(s => <option key={s}>{s}</option>)}</select></td><td>{money(r.value)}</td><td>{r.nextAction || 'Set next action'}</td><td>{r.followUp || 'Not scheduled'}</td><td><button type="button" className="studio-link" onClick={() => startEdit(r)}>Edit</button></td></tr>)}</tbody></table></div>}
    </section>
    <section className="studio-panel"><div className="studio-panel-head"><div><p className="studio-eyebrow">DO NEXT</p><h2>Follow-up queue</h2></div></div>{due.length ? <div className="studio-due">{due.map(r => <button type="button" key={r.id} onClick={() => startEdit(r)}><strong>{r.company}</strong><span>{r.nextAction || 'Follow up'}</span><small>{r.followUp < today ? 'Overdue' : 'Due today'} / {r.followUp}</small></button>)}</div> : <div className="studio-empty"><p>No overdue or due-today follow-ups. Add follow-up dates to keep opportunities moving.</p></div>}</section>
    {showForm && <div className="studio-overlay" onMouseDown={e => { if(e.target === e.currentTarget) reset() }}><form className="studio-form" onSubmit={submit}><div className="studio-panel-head"><h2>{editing ? 'Edit opportunity' : 'New prospect'}</h2><button type="button" className="studio-link" onClick={reset}>Close</button></div><label>Company *<input autoFocus required value={draft.company} onChange={e=>setDraft(d=>({...d,company:e.target.value}))}/></label><div className="studio-form-grid"><label>Contact<input value={draft.contact} onChange={e=>setDraft(d=>({...d,contact:e.target.value}))}/></label><label>Email<input type="email" value={draft.email} onChange={e=>setDraft(d=>({...d,email:e.target.value}))}/></label></div><label>Website<input type="text" placeholder="example.com" value={draft.website} onChange={e=>setDraft(d=>({...d,website:e.target.value}))}/></label><div className="studio-form-grid"><label>Estimated project value ($)<input type="number" min="0" step="100" value={draft.value} onChange={e=>setDraft(d=>({...d,value:Number(e.target.value)}))}/></label><label>Follow-up date<input type="date" value={draft.followUp} onChange={e=>setDraft(d=>({...d,followUp:e.target.value}))}/></label></div><label>Next action<input placeholder="Send tailored introduction" value={draft.nextAction} onChange={e=>setDraft(d=>({...d,nextAction:e.target.value}))}/></label><label>Notes<textarea rows={3} value={draft.notes} onChange={e=>setDraft(d=>({...d,notes:e.target.value}))}/></label><div className="studio-form-actions">{editing && <button type="button" className="studio-danger" onClick={() => setConfirmClear(true)}>Delete</button>}<button type="submit" className="studio-primary">Save opportunity</button></div>{confirmClear && editing && <div className="studio-confirm"><p>Delete this record permanently from this browser?</p><button type="button" onClick={() => { save(rows.filter(r=>r.id !== editing)); setConfirmClear(false); reset() }}>Confirm deletion</button><button type="button" onClick={() => setConfirmClear(false)}>Cancel</button></div>}</form></div>}
  </div>
}
