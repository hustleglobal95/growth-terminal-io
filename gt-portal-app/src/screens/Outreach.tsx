/** WRITING THE FIRST MESSAGE.
 *
 *  Pick companies from a search, pick why you are writing, and leave with
 *  something you can paste. The list is the input, the draft is the output,
 *  and both are on the same screen because the sender needs to see which
 *  company each message belongs to.
 *
 *  WHAT THIS SCREEN WILL NOT DO.
 *
 *  It does not send. A tool that sends on somebody's behalf owns their
 *  domain reputation and their consent obligations, and neither of those
 *  should be acquired by accident from a button on a lead screen.
 *
 *  It does not invent. The message is assembled from the brand record and
 *  from what the finder actually recorded, and the panel underneath every
 *  draft lists exactly which facts it leaned on. A line whose fact is missing
 *  is dropped rather than filled with a placeholder, and the reason is shown.
 *
 *  It does not pretend the brand record is ready when it is not. An assistant
 *  briefed on unconfirmed fields is the failure mode the brand module was
 *  built to prevent, so this screen refuses to draft until the two required
 *  fields are confirmed, and says which.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from './simple'
import { Section } from '../components/Section'
import { toast } from '../lib/bus'
import { contactable, leadsLive } from '../lib/leads'
import type { Lead, LeadSearch } from '../lib/leads'
import { listSearches, getSearch } from '../lib/leads'
import { demoState, sample, SAMPLE_SENDER } from '../lib/leadsSample'
import { getBrand, brandConfigured } from '../lib/brandApi'
import { useBusinesses, useBilling } from '../lib/liveData'
import {
  senderFrom, availableAngles, buildDraft, asText, asMergeCsv,
  ANGLES, FORMATS,
} from '../lib/outreach'
import type { Angle, Format, Sender, Draft } from '../lib/outreach'

type Load = 'loading' | 'ready' | 'failed'

export function Outreach() {
  const nav = useNavigate()
  const businesses = useBusinesses()
  const billing = useBilling()
  const demo = demoState(
    typeof window === 'undefined' ? '' : window.location.search,
    billing?.bypassed === true,
  )
  const settled = billing !== null || !!demo

  const [load, setLoad] = useState<Load>('loading')
  const [why, setWhy] = useState<string | null>(null)
  const [searches, setSearches] = useState<LeadSearch[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [picked, setPicked] = useState<Set<string>>(new Set())

  const [sender, setSender] = useState<Sender | null>(null)
  const [angle, setAngle] = useState<Angle>('introduction')
  const [format, setFormat] = useState<Format>('email')
  const [copied, setCopied] = useState<string | null>(null)

  /* Load the searches and the brand record together. The brand half is
     allowed to fail without taking the screen down: a sender with no record
     still sees the list and is told exactly what to go and confirm. */
  const read = useCallback(async () => {
    try {
      if (demo) {
        const s = sample(demo)
        setSearches(s.searches)
        const first = s.searches[0]
        setOpenId(first ? first.id : null)
        setLeads(first ? (s.leads[first.id] || []) : [])
      } else {
        const r = await listSearches()
        setSearches(r.searches)
        const first = r.searches[0]
        if (first) {
          setOpenId(first.id)
          const d = await getSearch(first.id)
          setLeads(d.leads)
        }
      }
      setLoad('ready')
    } catch (e) {
      setWhy(e instanceof Error ? e.message : 'Could not read your searches.')
      setLoad('failed')
    }
  }, [demo])

  useEffect(() => { read() }, [read])

  /* The brand record is per business, and the finder is not tied to one, so
     the first business in the workspace is the sender until there is a reason
     for it to be otherwise. */
  useEffect(() => {
    if (demo) { setSender(SAMPLE_SENDER); return }
    if (!brandConfigured() || !businesses || businesses.length === 0) {
      setSender(senderFrom(null))
      return
    }
    getBrand(businesses[0].slug)
      .then(r => setSender(senderFrom(r)))
      .catch(() => setSender(senderFrom(null)))
  }, [businesses, demo])

  const openSearch = async (id: string) => {
    setOpenId(id)
    setPicked(new Set())
    if (demo) { setLeads(sample(demo).leads[id] || []); return }
    try {
      const d = await getSearch(id)
      setLeads(d.leads)
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not read that search.')
    }
  }

  /* Only companies you can actually reach are offered. A row with no email
     and no phone cannot be written to, and putting it in the picker would
     produce a draft with nowhere to go. */
  const reachable = useMemo(
    () => leads.filter(l => l.status !== 'dismissed' && contactable(l)),
    [leads],
  )
  const unreachable = leads.filter(l => l.status !== 'dismissed' && !contactable(l)).length

  const chosen = reachable.filter(l => picked.has(l.id))
  const blocked = sender ? availableAngles(sender, chosen.length ? chosen : reachable)[angle] : null

  const drafts: Draft[] = useMemo(() => {
    if (!sender || blocked) return []
    return chosen.map(l => buildDraft(l, sender, angle, format))
  }, [chosen, sender, angle, format, blocked])

  const toggle = (id: string) => setPicked(p => {
    const n = new Set(p)
    if (n.has(id)) n.delete(id); else n.add(id)
    return n
  })

  const allSaved = () => setPicked(new Set(reachable.filter(l => l.status === 'saved').map(l => l.id)))
  const allOf = () => setPicked(new Set(reachable.map(l => l.id)))
  const none = () => setPicked(new Set())

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(c => (c === key ? null : c)), 1600)
    } catch {
      toast('Your browser would not let the app copy. Select the text and copy it by hand.')
    }
  }

  const download = () => {
    if (!drafts.length) return
    const blob = new Blob([asMergeCsv(drafts)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'outreach-drafts.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="scr on">
      <Header title="Outreach">
        <button className="btn g" onClick={() => nav('/businesses/leads' + (demo ? '?sample=1' : ''))}>
          Back to leads
        </button>
      </Header>

      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          <p className="pgintro">Pick the companies, pick why you are writing, and copy the result into
            whatever you send with. Every line comes from your brand record or from what the search
            actually found. Nothing here sends anything.</p>

          {/* Same rule as the Leads screen: made-up rows say so, permanently and
              on screen. A draft addressed to an invented dental practice is
              exactly the thing that must never be mistaken for a real one. */}
          {demo && (
            <div className="ldsample">
              <p><b>These companies are made up.</b> The engine does not serve lead searches
                yet, so the drafts below are assembled from a sample brand record and sample
                rows to show what the screen produces. Nothing here is a real business,
                nothing here can be sent, and real rows replace these the day the engine
                answers.</p>
            </div>
          )}

          {!leadsLive() && !demo && settled && (
            <div className="ldempty">
              <b>Not switched on yet</b>
              <span>The lead finder is not serving yet, so there is nothing to write to.</span>
            </div>
          )}

          {load === 'failed' && <p className="dsfail">{why}</p>}

          {(leadsLive() || demo) && load === 'ready' && (
            <>
              <Setup
                sender={sender} angle={angle} setAngle={setAngle}
                format={format} setFormat={setFormat} blocked={blocked}
                searches={searches} openId={openId} onOpen={openSearch}
              />

              <Section
                title="Who you are writing to"
                qualifier={chosen.length ? chosen.length + ' of ' + reachable.length + ' selected' : reachable.length + ' reachable'}
                verbs={[
                  { label: 'Saved only', onClick: allSaved },
                  { label: 'All', onClick: allOf },
                  { label: 'None', onClick: picked.size ? none : undefined },
                ]}
                flush
              >
                {reachable.length === 0 && (
                  <div className="ldempty">
                    <b>Nothing here can be written to</b>
                    <span>None of the companies in this search came back with an email or a phone
                      number, so there is no first message to draft. A search with the site crawl
                      switched on is the thing that produces contacts.</span>
                  </div>
                )}
                {reachable.map(l => (
                  <label key={l.id} className={'orpick' + (picked.has(l.id) ? ' on' : '')}>
                    <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)} />
                    <span className="orco">
                      <b>{l.company}</b>
                      {l.category && <i>{l.category}</i>}
                    </span>
                    <span className="orto">{l.emails[0] || l.phone}</span>
                    {l.status === 'saved' && <span className="orsaved">Saved</span>}
                  </label>
                ))}
                {unreachable > 0 && (
                  <p className="sfine orhidden">{unreachable} more found, with no email or phone
                    published. They are left out because there is nowhere to send to.</p>
                )}
              </Section>

              {drafts.length > 0 && (
                <Section
                  title="The drafts"
                  qualifier={drafts.length + (drafts.length === 1 ? ' message' : ' messages')}
                  verbs={[
                    { label: 'Copy all', onClick: () => copy('all', drafts.map(asText).join('\n\n---\n\n')) },
                    { label: 'Download for mail merge', onClick: download },
                  ]}
                >
                  {drafts.map(d => (
                    <DraftCard key={d.leadId} d={d} copied={copied} onCopy={copy} />
                  ))}
                </Section>
              )}

              {/* The brand-record case already has its own panel at the top of
                  the setup card, so repeating it here would be the same
                  sentence twice in one view. */}
              {chosen.length > 0 && blocked && sender && sender.missing.length === 0 && (
                <p className="dsfail">{blocked}</p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── The controls ────────────────────────────────────────────────────────────

function Setup(p: {
  sender: Sender | null
  angle: Angle; setAngle: (a: Angle) => void
  format: Format; setFormat: (f: Format) => void
  blocked: string | null
  searches: LeadSearch[]; openId: string | null; onOpen: (id: string) => void
}) {
  const notReady = p.sender && p.sender.missing.length > 0
  return (
    <div className="setupcard orcard">
      {notReady && (
        <p className="orwarn"><b>Your brand record is not ready.</b> A message to a stranger is
          written in your name, so this screen will only use fields you have confirmed yourself.
          Confirm {p.sender!.missing.join(' and ')} on the brand agent and come back.</p>
      )}

      {p.searches.length > 1 && (
        <div className="orf">
          <label className="lbl" htmlFor="orsearch">Which search</label>
          <select id="orsearch" className="tmsel" value={p.openId || ''}
            onChange={e => p.onOpen(e.target.value)}>
            {p.searches.map(s => (
              <option key={s.id} value={s.id}>{s.industry} in {s.location}</option>
            ))}
          </select>
        </div>
      )}

      <div className="orf">
        <span className="lbl">Why you are writing</span>
        <div className="orchips">
          {ANGLES.map(a => (
            <button key={a.key} type="button" className={'orchip' + (a.key === p.angle ? ' on' : '')}
              onClick={() => p.setAngle(a.key)} title={a.blurb}>{a.label}</button>
          ))}
        </div>
        <p className="sfine">{ANGLES.find(a => a.key === p.angle)?.blurb}</p>
      </div>

      <div className="orf">
        <span className="lbl">What you are pasting it into</span>
        <div className="orchips">
          {FORMATS.map(f => (
            <button key={f.key} type="button" className={'orchip' + (f.key === p.format ? ' on' : '')}
              onClick={() => p.setFormat(f.key)} title={f.blurb}>{f.label}</button>
          ))}
        </div>
        <p className="sfine">{FORMATS.find(f => f.key === p.format)?.blurb}</p>
      </div>
    </div>
  )
}

// ── One draft ───────────────────────────────────────────────────────────────

function DraftCard({ d, copied, onCopy }: {
  d: Draft
  copied: string | null
  onCopy: (k: string, t: string) => void
}) {
  return (
    <div className="ordraft">
      <div className="orh">
        <b>{d.company}</b>
        {d.to && <i className="orto">{d.to}</i>}
        <span className="sp" />
        <button className="dsbtn" type="button" onClick={() => onCopy(d.leadId, asText(d))}>
          {copied === d.leadId ? 'Copied' : 'Copy'}
        </button>
      </div>

      {d.subject && (
        <p className="orsubj"><span className="lbl">Subject</span>{d.subject}</p>
      )}

      <pre className="orbody">{d.body}</pre>

      {d.used.length > 0 && (
        <p className="orused"><span className="lbl">Built from</span>{d.used.join(', ')}.</p>
      )}
      {d.refusals.map((r, i) => <p key={i} className="orrefuse">{r}</p>)}
    </div>
  )
}
