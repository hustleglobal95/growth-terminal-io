import React, { useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import './Studio.css'
import { getWorkspaceId, workspaceOwner } from '../lib/api'
import { leadsLive, listSearches, getSearch } from '../lib/leads'

type Stage = 'Prospect' | 'Contacted' | 'Discovery' | 'Proposal' | 'Won' | 'Production' | 'Delivered' | 'Lost'
type RecordItem = { id: string; company: string; contact: string; email: string; website: string; stage: Stage; value: number; nextAction: string; followUp: string; notes: string; updatedAt: string }
const stages: Stage[] = ['Prospect', 'Contacted', 'Discovery', 'Proposal', 'Won', 'Production', 'Delivered', 'Lost']
const key = () => {
  const owner = workspaceOwner()
  const workspace = getWorkspaceId()
  return owner && workspace ? 'gt.studio.pipeline.v2.' + encodeURIComponent(owner) + '.' + encodeURIComponent(workspace) : null
}
function read(): RecordItem[] {
  try {
    const storageKey = key()
    if (!storageKey) return []
    const json = localStorage.getItem(storageKey)
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
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMessage, setImportMessage] = useState('')
  const save = (next: RecordItem[]) => {
    const storageKey = key()
    if (!storageKey) { setImportMessage('No authenticated workspace available. Changes cannot be saved.'); return }
    try { localStorage.setItem(storageKey, JSON.stringify(next)); setRows(next) }
    catch { setImportMessage('Browser storage is unavailable or full. Export your records and free storage before continuing.') }
  }
  const importCsv = async (file?: File) => {
    if (!file || !key()) { setImportMessage('Sign in to a workspace before importing.'); return }
    if (file.size > 2 * 1024 * 1024) { setImportMessage('CSV exceeds the 2 MB import limit.'); return }
    setImporting(true); setImportMessage('')
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: 502, cellDates: false })
      const sheet = book.Sheets[book.SheetNames[0]]
      if (!sheet) throw new Error('No worksheet found.')
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
      const normalized = raw.map(r => Object.fromEntries(Object.entries(r).map(([k,v]) => [k.trim().toLowerCase().replace(/[^a-z0-9]/g, ''), String(v ?? '').trim()])))
      const seen = new Set(rows.map(r => (r.website || r.email || r.company).toLowerCase()))
      const added: RecordItem[] = []
      for (const entry of normalized.slice(0,500)) {
        const company = entry.company || entry.business || entry.name || ''
        const email = entry.email || entry.emails?.split(/[;, ]/)[0] || ''
        const website = entry.website || entry.url || entry.domain || ''
        if (!company || company.length > 200) continue
        const dedup = (website || email || company).toLowerCase()
        if (seen.has(dedup)) continue
        seen.add(dedup)
        added.push({id: crypto.randomUUID(), company, contact: entry.contact || '', email, website, stage: 'Prospect', value: 5000, nextAction: 'Research business and personalize introduction', followUp: '', notes: 'Imported from CSV', updatedAt: new Date().toISOString()})
      }
      if (added.length) save([...added, ...rows])
      setImportMessage(added.length + ' prospect' + (added.length === 1 ? '' : 's') + ' imported. No messages were sent.')
    } catch (e) { setImportMessage(e instanceof Error ? e.message : 'Unable to read CSV file.') }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = '' }
  }
  const importSavedLeads = async () => {
    if (importing || !key()) return
    setImporting(true); setImportMessage('')
    try {
      const list = await listSearches()
      if (!Array.isArray(list.searches)) throw new Error('The lead search response is not in the expected format.')
      // A bounded import avoids flooding the authenticated API with historical requests.
      const recent = list.searches.filter(s => s.status === 'complete' || s.status === 'partial').slice(0, 10)
      const details = await Promise.all(recent.map(s => getSearch(s.id)))
      const candidates = details.flatMap(d => Array.isArray(d.leads) ? d.leads.filter(l => l.status === 'saved') : [])
      const existingIds = new Set(rows.map(r => r.id))
      const existingSites = new Set(rows.map(r => r.website.toLowerCase().replace(/^https?:[/][/]/, '').replace(/[/]$/, '')).filter(Boolean))
      const incoming: RecordItem[] = []
      for (const lead of candidates) {
        const id = 'lead-' + lead.id
        const site = (lead.website || '').toLowerCase().replace(/^https?:[/][/]/, '').replace(/[/]$/, '')
        if (!lead.company || existingIds.has(id) || incoming.some(i => i.id === id) || (site && existingSites.has(site))) continue
        incoming.push({ id, company: lead.company, contact: '', email: lead.emails?.[0] || '', website: lead.website || '', stage: 'Prospect', value: 5000, nextAction: 'Review website and write tailored introduction', followUp: '', notes: 'Imported from a saved Growth Terminal lead. Source lead ID: ' + lead.id, updatedAt: new Date().toISOString() })
        if (site) existingSites.add(site)
      }
      if (incoming.length) save([...incoming, ...rows])
      setImportMessage(incoming.length + ' saved lead' + (incoming.length === 1 ? '' : 's') + ' added from the 10 most recent completed searches. Existing records were kept.')
    } catch (error) { setImportMessage(error instanceof Error ? error.message : 'Unable to import saved leads.') }
    finally { setImporting(false) }
  }
  const current = useMemo(() => rows.filter(r => r.stage !== 'Lost' && r.stage !== 'Delivered'), [rows])
  const pipeline = current.reduce((total, r) => total + r.value, 0)
  const won = rows.filter(r => r.stage === 'Won' || r.stage === 'Production' || r.stage === 'Delivered')
  const now = new Date()
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-')
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
      <div className="studio-hero-actions"><button type="button" className="studio-primary" onClick={() => { reset(); setShowForm(true) }}>Add prospect +</button><input ref={fileRef} type="file" accept=".csv,text/csv" style={{display:"none"}} aria-label="Select prospect CSV" onChange={e => void importCsv(e.target.files?.[0])}/><button type="button" className="studio-secondary" disabled={importing} onClick={() => fileRef.current?.click()}>Import CSV</button>{leadsLive() && <button type="button" className="studio-secondary" disabled={importing} onClick={importSavedLeads}>{importing ? "Importing..." : "Import saved leads"}</button>}<a className="studio-secondary" href="/businesses/leads/outreach">Open outreach</a><button type="button" className="studio-secondary" onClick={() => download(rows)} disabled={!rows.length}>Export CSV</button></div>
    </header>
    <div className="studio-disclosure" role="status">Private browser workspace. Records stay in this browser, partitioned by signed-in user and workspace, but are not encrypted or synced. CSV prospects can be imported on demand. Authenticated lead sync is disabled until its server route exists. Export CSV regularly. Do not use shared devices for confidential records.</div>
    {importMessage && <div className="studio-disclosure" role="status">{importMessage}</div>}
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
