import React, { useEffect, useRef, useState } from 'react'
import { toast, noCredits } from '../lib/bus'
import { useAnalyses } from '../lib/liveData'

interface Item { t: string; h: string; go?: string; act?: () => void }

export function Palette({ close, go }: { close: () => void; go: (path: string) => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inp = useRef<HTMLInputElement>(null)
  const an = useAnalyses()
  useEffect(() => { inp.current?.focus() }, [])

  /** Real analyses become commands: search them by business or constraint. */
  const LIVE: Item[] = an.st === 'ready'
    ? an.rows.slice(0, 40).map(a => ({
        t: 'Open ' + (a.b || 'analysis') + (a.c ? ', ' + a.c : ''),
        h: a.st,
        go: '/analyses' + (a.open ? '/northlane' : '')
      }))
    : []

  const ITEMS: Item[] = [
    { t: 'Go to Overview', h: 'Navigate', go: '/' },
    { t: 'Go to Analyses', h: 'Navigate', go: '/analyses' },
    { t: 'Go to Content', h: 'Navigate', go: '/content' },
    { t: 'Set up a content machine', h: 'Action', go: '/content/setup' },
    ...LIVE,
    { t: 'Go to Businesses', h: 'Navigate', go: '/businesses' },
    { t: 'Go to API Keys', h: 'Navigate', go: '/api-keys' },
    { t: 'Go to Teams', h: 'Navigate', go: '/teams' },
    { t: 'Go to Clients', h: 'Navigate', go: '/clients' },
    { t: 'New analysis', h: 'Action', act: noCredits },
    { t: 'Create API key', h: 'Action', act: () => toast('Key created. It is shown once, copy it now.') },
    { t: 'Export analysis as PDF', h: 'Action', act: () => toast('Preparing the PDF.') }
  ]
  const xs = ITEMS.filter(x => !q || x.t.toLowerCase().includes(q.toLowerCase()))
  const cur = Math.min(sel, Math.max(0, xs.length - 1))
  const run = (x: Item) => { close(); x.go ? go(x.go) : x.act && x.act() }

  return (
    <div className="palov on" onClick={e => { if (e.target === e.currentTarget) close() }}>
      <div className="pal">
        <input ref={inp} value={q} placeholder="Search or jump to" autoComplete="off"
          onChange={e => { setQ(e.target.value); setSel(0) }}
          onKeyDown={e => {
            if (e.key === 'ArrowDown') { setSel(s => Math.min(s + 1, xs.length - 1)); e.preventDefault() }
            else if (e.key === 'ArrowUp') { setSel(s => Math.max(s - 1, 0)); e.preventDefault() }
            else if (e.key === 'Enter' && xs[cur]) run(xs[cur])
          }} />
        <div className="ls">
          {xs.length ? xs.map((x, i) => (
            <div key={x.t} className={'it' + (i === cur ? ' sel' : '')}
              onMouseMove={() => setSel(i)} onClick={() => run(x)}>
              <b>{x.t}</b><span className="h">{x.h}</span>
            </div>
          )) : <div className="it"><b style={{ color: 'var(--faint)', fontWeight: 400 }}>Nothing matches.</b></div>}
        </div>
        <div className="ft"><span>Up and down to navigate</span><span>Enter to open</span><span>Esc to close</span></div>
      </div>
    </div>
  )
}
