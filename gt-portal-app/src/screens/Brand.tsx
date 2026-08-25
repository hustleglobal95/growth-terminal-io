/** THE BRAND AGENT. The first agent a customer sets up, and the one the rest
 *  are built on.
 *
 *  Three things about this screen are deliberate and worth defending.
 *
 *  It shows the empties. A review screen that hides the fields the model
 *  could not fill looks finished and is not, and the customer discovers the
 *  gap later, in an agent's answer, in front of their own client. Empty
 *  fields are listed with the others and counted in the header.
 *
 *  Every drafted field carries the sentence it was read from, and the page it
 *  was read on. Without that the review is a rubber stamp: nobody can check a
 *  claim they cannot trace. With it, a wrong field is obvious in a second,
 *  because the quote will not say what the value says.
 *
 *  Nothing is confirmed in bulk. There is no "accept all" button, and that is
 *  not an oversight. The whole value of this record is that a human looked at
 *  each line, and a button that skips the looking would remove the only thing
 *  separating this from asking a model to imagine a brand.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from './simple'
import { toast } from '../lib/bus'
import { businessLabel, useAccounts, useBusinesses, useMe } from '../lib/liveData'
import { BrandField, BrandList, BrandRecord, emptyRecord, isConfirmed, readiness, walk } from '../lib/brand'
import { brandConfigured, getBrand, ingestBrand, saveBrand } from '../lib/brandApi'

/** The slug a record is filed under before the workspace has any analysed
 *  business. Reserved rather than generated, so it cannot collide with a real
 *  business slug later. */
export const WORKSPACE_SLUG = 'workspace'

type Step = 'point' | 'reading' | 'review' | 'saved'

const STEPS: [Step, string][] = [
  ['point', 'Point it at your site'],
  ['reading', 'It reads'],
  ['review', 'You correct it'],
  ['saved', 'It briefs the rest']
]

export function Brand() {
  const nav = useNavigate()
  const accs = useAccounts()
  const businesses = useBusinesses()
  const me = useMe()

  /* A workspace with no analysis yet still has a brand, and this is meant to
     be the first thing a customer does. Gating it behind "run an analysis
     first" would put the setup step that teaches the product about them
     behind the step that needs teaching. So with no businesses on the account
     the record is written against the workspace itself, and it can be pointed
     at a business later without being rebuilt. */
  const biz = useMemo(() => {
    const rows = (businesses || [])
      .filter(b => b && b.slug)
      .map(b => ({ slug: b.slug, name: businessLabel(b.name, accs) }))
    return rows.length ? rows : [{ slug: WORKSPACE_SLUG, name: 'This workspace' }]
  }, [businesses, accs])

  const [slug, setSlug] = useState('')
  const [url, setUrl] = useState('')
  const [step, setStep] = useState<Step>('point')
  const [record, setRecord] = useState<BrandRecord | null>(null)
  const [pagesRead, setPagesRead] = useState<string[]>([])
  const [dropped, setDropped] = useState<string[]>([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!slug && biz.length) setSlug(biz[0].slug) }, [biz, slug])

  /* An existing record opens on review rather than sending the customer back
     through an ingest they already did. */
  useEffect(() => {
    let live = true
    if (!slug || !brandConfigured()) return
    getBrand(slug).then(r => {
      if (!live || !r) return
      setRecord(r)
      setStep(r.provenance.confirmedAt ? 'saved' : 'review')
      setPagesRead(r.provenance.sources || [])
    }).catch(() => { /* no record is the normal case, not an error */ })
    return () => { live = false }
  }, [slug])

  const run = async () => {
    setErr('')
    setBusy(true)
    setStep('reading')
    try {
      const r = await ingestBrand(slug, url)
      setRecord(r.record)
      setPagesRead(r.pagesRead)
      setDropped(r.warnings)
      setStep('review')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The ingest did not finish.')
      setStep('point')
    } finally {
      setBusy(false)
    }
  }

  const update = useCallback((path: string, next: BrandField | BrandList) => {
    setRecord(prev => {
      if (!prev) return prev
      const [g, k] = path.split('.')
      const group = { ...(prev as unknown as Record<string, Record<string, unknown>>)[g], [k]: next }
      return { ...prev, [g]: group } as BrandRecord
    })
  }, [])

  const save = async () => {
    if (!record) return
    setBusy(true)
    try {
      const stamped: BrandRecord = {
        ...record,
        provenance: {
          ...record.provenance,
          confirmedBy: (me && me.name) || 'Workspace owner',
          confirmedAt: new Date().toISOString()
        }
      }
      const saved = await saveBrand(stamped)
      setRecord(saved || stamped)
      setStep('saved')
      toast('Brand record saved. Every agent you build reads this now.')
    } catch (e) {
      toast(e instanceof Error ? e.message : 'That did not save.')
    } finally {
      setBusy(false)
    }
  }

  const stat = record ? readiness(record) : null

  return (
    <div className="scr on">
      <Header title="Brand agent" />
      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap setupwrap">

          <div className="setuprail" role="list" aria-label="Steps">
            {STEPS.map(([s, label], i) => {
              const at = STEPS.findIndex(x => x[0] === step)
              return (
                <span key={s} role="listitem"
                  className={'setupstep' + (i === at ? ' on' : '') + (i < at ? ' done' : '')}>
                  <span className="stepnum">{i < at ? '✓' : i + 1}</span>{label}
                </span>
              )
            })}
          </div>

          <div className="setupbody">
            {!brandConfigured() && <NotSwitchedOn />}

            {brandConfigured() && step === 'point' && (
              <Point
                biz={biz} slug={slug} setSlug={setSlug} url={url} setUrl={setUrl}
                err={err} busy={busy} onRun={run}
              />
            )}

            {brandConfigured() && step === 'reading' && <Reading url={url} />}

            {brandConfigured() && (step === 'review' || step === 'saved') && record && stat && (
              <Review
                record={record} stat={stat} pagesRead={pagesRead} dropped={dropped}
                saved={step === 'saved'} busy={busy}
                onUpdate={update} onSave={save}
                onAgents={() => nav('/agents')}
                onRedo={() => { setStep('point'); setDropped([]) }}
              />
            )}
          </div>

        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- states */

function NotSwitchedOn() {
  return (
    <div className="emptypage wide">
      <span className="lbl">Not switched on yet</span>
      <h2>The brand agent is not connected to this workspace.</h2>
      <p>Nothing is wrong with your account. Reading a website and drafting a record from it
        happens on the engine, and the engine does not have that route yet. When it does, this
        screen becomes a box you paste your address into.</p>
      <p>What it will do: read your public pages, draft what your business is, who it is for,
        how it sounds and what it must never say, then show you every line next to the sentence
        it was read from so you can correct it. Nothing it drafts is used until you confirm it.</p>
    </div>
  )
}

function Point({ biz, slug, setSlug, url, setUrl, err, busy, onRun }: {
  biz: { slug: string; name: string }[]
  slug: string; setSlug: (s: string) => void
  url: string; setUrl: (s: string) => void
  err: string; busy: boolean; onRun: () => void
}) {
  const ready = Boolean(slug) && url.trim().length > 3
  return (
    <div className="setupcard">
      <h2>Point it at your site.</h2>
      <p className="ssub">It reads your public pages and drafts a record of what your business
        is. You correct it on the next screen. This is the record every agent you build
        after this one reads, so it is worth the ten minutes.</p>

      <label className="lbl" htmlFor="bbiz">Business this record is for</label>
      <select id="bbiz" className="tmsel" value={slug} onChange={e => setSlug(e.target.value)} disabled={busy}>
        {biz.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
        {biz.length === 0 && <option value="">No businesses in this workspace yet</option>}
      </select>

      <label className="lbl" htmlFor="burl">Your website</label>
      <input id="burl" value={url} onChange={e => setUrl(e.target.value)} disabled={busy}
        placeholder="yourbusiness.com" autoComplete="off" inputMode="url" />

      {err && <p className="brerr">{err}</p>}

      <p className="sfine">It reads pages anyone can open. It does not sign in, it does not
        submit forms, and it does not touch anything behind your login. If your text only
        appears after scripts run, it will tell you it found nothing rather than guessing.</p>

      <div className="act">
        <button className="btn p" disabled={!ready || busy} onClick={onRun}>Read my site</button>
      </div>
    </div>
  )
}

function Reading({ url }: { url: string }) {
  return (
    <div className="setupcard">
      <h2>Reading {url.replace(/^https?:\/\//, '')}</h2>
      <p className="ssub">It opens your home page and the handful of standard pages that
        usually carry the offer and the audience. A page that is not there is normal and is
        not an error.</p>
      <div className="brload"><i /><i /><i /></div>
      <p className="sfine">This takes a few seconds. Anything it cannot back up with a sentence
        from your own pages gets thrown away before you see it, so the review is shorter than
        you might expect and everything on it is traceable.</p>
    </div>
  )
}

/* ---------------------------------------------------------------- review */

function Review({ record, stat, pagesRead, dropped, saved, busy, onUpdate, onSave, onAgents, onRedo }: {
  record: BrandRecord
  stat: { total: number; confirmed: number; missing: string[]; ready: boolean }
  pagesRead: string[]
  dropped: string[]
  saved: boolean
  busy: boolean
  onUpdate: (path: string, f: BrandField | BrandList) => void
  onSave: () => void
  onAgents: () => void
  onRedo: () => void
}) {
  const rows = walk(record)
  const groups = rows.reduce<Record<string, typeof rows>>((acc, r) => {
    (acc[r.group] = acc[r.group] || []).push(r)
    return acc
  }, {})

  return (
    <>
      {saved && (
        <div className="setupcard">
          {/* Agent, not assistant. Section 08 lists assistant under Avoid,
              and this screen was the last place in the product still using it:
              six times, including the button below, on the screen every
              customer walks during setup. */}
          <h2>This is what your agents read.</h2>
          <p className="ssub">Confirmed by {record.provenance.confirmedBy || 'someone on this account'}.
            Every agent you build for this business is briefed on the confirmed lines below and
            on nothing else. Change a line here and the next agent you build picks it up.</p>
          <div className="act">
            <button className="btn p" onClick={onAgents}>Build an agent on it</button>
            <button className="btn g" onClick={onRedo}>Read the site again</button>
          </div>
        </div>
      )}

      {!saved && (
        <div className="setupcard">
          <h2>Correct what it got wrong.</h2>
          <p className="ssub">Each line shows the sentence it was read from. If the sentence does
            not say what the line says, the line is wrong. Nothing here is used until you confirm
            it, and a line left empty is better than a line that is nearly right.</p>

          <div className="brstat">
            <span className="brdot on" /><b>{stat.confirmed}</b> of {stat.total} confirmed
            {stat.missing.length > 0 && (
              <span className="brmiss">{stat.missing.length} required {stat.missing.length === 1 ? 'line' : 'lines'} still to do</span>
            )}
          </div>

          {pagesRead.length > 0 && (
            <p className="sfine">Read {pagesRead.length} {pagesRead.length === 1 ? 'page' : 'pages'}: {' '}
              {pagesRead.map(p => p.replace(/^https?:\/\//, '')).join(', ')}</p>
          )}

          {dropped.length > 0 && (
            <p className="sfine">It also drafted {dropped.length} {dropped.length === 1 ? 'line' : 'lines'} it
              could not point at a sentence for, so those were thrown away rather than shown to you.
              They are the empty ones below. This is the guard working, not a fault.</p>
          )}
        </div>
      )}

      {Object.keys(groups).map(g => (
        <div key={g} className="brgroup">
          <div className="shead"><h2>{g}</h2></div>
          {groups[g].map(r => (
            <Row key={r.path} path={r.path} label={r.label} f={r.f}
              required={stat.missing.includes(r.path)} onUpdate={onUpdate} />
          ))}
        </div>
      ))}

      {!saved && (
        <div className="setupnav">
          <span className="sp" />
          {!stat.ready && (
            <span className="stephint">
              Confirm the name, the one line, what you sell, who it is for and what it must never
              say. Those five are what an agent cannot work without.
            </span>
          )}
          <button className="btn p" disabled={!stat.ready || busy} onClick={onSave}>
            {busy ? 'Saving' : 'Confirm this record'}
          </button>
        </div>
      )}
    </>
  )
}

/** One line of the record.
 *
 *  A field is editable in place and confirming is a separate act from
 *  editing, because they mean different things: editing says this is wrong,
 *  confirming says I read this and it is right. Typing over a drafted value
 *  marks it written, which counts as confirmed, since a person cannot type a
 *  sentence without having read it. */
function Row({ path, label, f, required, onUpdate }: {
  path: string
  label: string
  f: BrandField | BrandList
  required: boolean
  onUpdate: (path: string, f: BrandField | BrandList) => void
}) {
  const isList = 'values' in f
  const text = isList ? (f as BrandList).values.join(', ') : (f as BrandField).value
  const done = isConfirmed(f)
  const empty = !text.trim()

  const write = (v: string) => {
    if (isList) {
      onUpdate(path, { ...(f as BrandList), values: v.split(',').map(s => s.trim()).filter(Boolean), source: 'written', notFound: false })
    } else {
      onUpdate(path, { ...(f as BrandField), value: v, source: 'written', notFound: false })
    }
  }
  const confirm = () => onUpdate(path, { ...f, source: 'confirmed', notFound: false } as BrandField | BrandList)

  return (
    <div className={'brrow' + (done ? ' done' : '') + (empty ? ' empty' : '')}>
      <div className="brhead">
        <span className="lbl">{label}</span>
        <span className="sp" />
        {done
          ? <span className="brtag on"><i />Confirmed</span>
          : empty
            ? <span className="brtag"><i />Not found</span>
            : <span className="brtag"><i />Drafted</span>}
      </div>

      {isList
        ? <input className="brin" value={text} onChange={e => write(e.target.value)}
            placeholder={required ? 'Required. Separate with commas.' : 'Separate with commas'} />
        : <textarea className="brin brarea" value={text} onChange={e => write(e.target.value)}
            placeholder={required ? 'Required. Write it in your own words.' : 'Leave empty if it does not apply'} />}

      {(f as BrandField).evidence && (
        <p className="brev">
          <span className="lbl">Read from</span>
          {(f as BrandField).evidence}
          {(f as BrandField).sourceUrl && (
            <a className="brsrc" href={(f as BrandField).sourceUrl} target="_blank" rel="noreferrer noopener">
              {String((f as BrandField).sourceUrl).replace(/^https?:\/\//, '')}
            </a>
          )}
        </p>
      )}

      {!done && !empty && (
        <button className="btn g brok" onClick={confirm}>That is right</button>
      )}
    </div>
  )
}

export { emptyRecord }
