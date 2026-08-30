/** THE STEP AFTER THE DIAGNOSIS.
 *
 *  The engine finds the constraint and names a first move. This screen answers
 *  the question that has always been left hanging: what do I actually use to
 *  do that, and do I already own it.
 *
 *  WHAT THIS SCREEN IS NOT.
 *
 *  It is not a directory. Tools are listed alphabetically under a capability,
 *  never ranked, never scored, never marked recommended. Growth Terminal is
 *  paid by the customer and by nobody else, and an ordering here would be the
 *  first place that stopped being obvious.
 *
 *  It does not claim to know your stack. A connected provider is a fact this
 *  workspace can see. A ticked tool is something you told it. Everything else
 *  is unknown, and unknown is shown as unknown rather than as a gap, because
 *  telling somebody they are missing a thing they have had for two years is
 *  how a product loses the room.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Header } from './simple'
import { Section } from '../components/Section'
import { useAnalyses } from '../lib/liveData'
import { listIntegrations } from '../lib/integrations'
import type { ProviderKey } from '../lib/integrations'
import { providerLabel } from '../lib/integrations'
import {
  PLANS, toConstraint, coverage, allTools, readDeclared, writeDeclared,
} from '../lib/stack'
import type { Constraint, Capability, Cover } from '../lib/stack'

const COVER_WORD: Record<Cover, string> = {
  connected: 'Connected',
  declared: 'You said you use this',
  none: 'Nothing recorded',
}

export function Stack() {
  const nav = useNavigate()
  const an = useAnalyses()
  const [connected, setConnected] = useState<ProviderKey[]>([])
  const [declared, setDeclared] = useState<string[]>(() => readDeclared())
  const [picking, setPicking] = useState(false)
  const [chosen, setChosen] = useState<Constraint | null>(null)

  /* Connections are read once and are allowed to fail quietly. A workspace
     that cannot reach the engine still gets the capabilities and the tools,
     which is most of the value; it just cannot say what is already wired. */
  useEffect(() => {
    let alive = true
    /* listIntegrations throws synchronously when this browser has not resolved
       a workspace yet, so a bare .catch() never sees it and the whole screen
       dies on the way in. The try is not belt and braces, it is the only thing
       that catches that case. */
    try {
      listIntegrations()
        .then(s => {
          if (!alive) return
          setConnected(s.connections.filter(c => c.status !== 'revoked').map(c => c.provider))
        })
        .catch(() => { /* leave the list empty; coverage falls back to what was ticked */ })
    } catch {
      /* No workspace yet. The capabilities and tools still render. */
    }
    return () => { alive = false }
  }, [])

  /* The constraint comes from the most recent complete analysis. Analyses
     carry an uppercase category from a different vocabulary than the engine's
     five, so this goes through the mapping rather than a comparison. */
  const latest = useMemo(() => {
    if (an.st !== 'ready') return null
    const done = an.rows.filter(r => r.st === 'Complete' && r.cat)
    return done.length ? done[0] : null
  }, [an])

  const diagnosed = latest ? toConstraint(latest.cat) : null
  const active: Constraint | null = chosen || diagnosed
  const plan = active ? PLANS[active] : null

  const toggle = (tool: string) => {
    const next = declared.includes(tool)
      ? declared.filter(t => t !== tool)
      : [...declared, tool]
    setDeclared(next)
    writeDeclared(next)
  }

  return (
    <div className="scr on">
      <Header title="What closes it">
        <button className="btn g" onClick={() => setPicking(p => !p)}>
          {picking ? 'Done' : 'Tools you use'}
        </button>
      </Header>

      <div className="canvas" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="wrap">
          <p className="pgintro">The capabilities that close your constraint, and whether you
            already have something that provides each one. Tools are listed, never ranked.</p>

          {picking && (
            <ToolPicker declared={declared} onToggle={toggle} />
          )}

          {an.st === 'loading' && <p className="dsm">Reading your analyses.</p>}

          {an.st === 'ready' && !latest && (
            <div className="ldempty">
              <b>No completed analysis yet</b>
              <span>This screen reads the constraint from your most recent finished
                analysis. Run one and the capabilities that close it appear here.</span>
            </div>
          )}

          {latest && !diagnosed && (
            <div className="ldempty">
              <b>That constraint is not mapped yet</b>
              <span>Your latest analysis came back as "{latest.cat}", which does not match
                any of the five the engine plans against. Nothing is wrong with the analysis.
                Pick a constraint below to see what closes it.</span>
            </div>
          )}

          {latest && diagnosed && !chosen && (
            <p className="stkfrom">From <b>{latest.c}</b>, {latest.d}.</p>
          )}

          <div className="stkpick">
            {(Object.keys(PLANS) as Constraint[]).map(c => (
              <button key={c} type="button"
                className={'orchip' + (active === c ? ' on' : '')}
                onClick={() => setChosen(c === active ? null : c)}>
                {PLANS[c].label}
              </button>
            ))}
          </div>

          {plan && (
            <>
              <div className="setupcard stkmove">
                <span className="lbl">First move</span>
                <p>{plan.firstMove}</p>
              </div>

              <Section
                title="What closes it"
                qualifier={plan.capabilities.length + ' capabilities, in order'}
                flush
              >
                {plan.capabilities.map(cap => (
                  <Cap key={cap.id} cap={cap}
                    cover={coverage(cap, connected, declared)}
                    connected={connected} />
                ))}
              </Section>

              <p className="sfine stknote">Connected is read from this workspace. Anything you
                ticked is your own answer and is remembered in this browser only, so a teammate
                on another machine sees an empty list until the engine stores it.</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── One capability ──────────────────────────────────────────────────────────

function Cap({ cap, cover, connected }: {
  cap: Capability
  cover: Cover
  connected: ProviderKey[]
}) {
  /* Which connected provider is the one doing the covering. Named rather than
     implied, so "Connected" is checkable instead of trusted. */
  const via = cap.providers.filter(p => connected.includes(p))
  return (
    <div className={'stkcap ' + cover}>
      <div className="stkh">
        <b>{cap.name}</b>
        <span className="sp" />
        <span className={'stkstate ' + cover}>{COVER_WORD[cover]}</span>
      </div>
      <p className="stkwhy">{cap.why}</p>
      {via.length > 0 && (
        <p className="stkvia">Through {via.map(providerLabel).join(' and ')}.</p>
      )}
      <p className="stktools">
        <span className="lbl">Tools that do this</span>
        {cap.tools.join(' · ')}
      </p>
    </div>
  )
}

// ── Declaring the stack ─────────────────────────────────────────────────────

function ToolPicker({ declared, onToggle }: {
  declared: string[]
  onToggle: (t: string) => void
}) {
  const tools = allTools()
  return (
    <div className="setupcard stkpicker">
      <span className="lbl">Tick what you use</span>
      <p className="ssub">Only the tools named in the capability map are listed, because the
        only thing this changes is whether a capability shows as covered.</p>
      <div className="stkgrid">
        {tools.map(t => (
          <label key={t} className={'stktool' + (declared.includes(t) ? ' on' : '')}>
            <input type="checkbox" checked={declared.includes(t)} onChange={() => onToggle(t)} />
            <span>{t}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
