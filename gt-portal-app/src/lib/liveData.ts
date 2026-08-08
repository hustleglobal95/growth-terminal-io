/** Shared live-data hooks. One fetch per session per resource, cached at
 *  module level so Shell, Overview and Analyses do not triple-hit the API.
 *  In demo mode everything resolves synchronously from the bundled data.
 *
 *  Live-mode behaviour on failure is deliberate: never substitute demo
 *  rows for a signed-in user. Show an honest empty state instead. */
import { useEffect, useState } from 'react'
import { DEMO } from '../config'
import { api, data, AnalysisRow } from './api'

export interface Me { name: string; workspace: string }

const DEMO_ME: Me = { name: 'Kevin Gonzalez', workspace: 'Growth Terminal' }

let meCache: Me | null = DEMO ? DEMO_ME : null
let mePromise: Promise<Me> | null = null

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(meCache)
  useEffect(() => {
    if (meCache) return
    let live = true
    mePromise = mePromise || api.me()
    mePromise
      .then(m => { meCache = m; if (live) setMe(m) })
      .catch(() => { mePromise = null })
    return () => { live = false }
  }, [])
  return me
}

export type AnalysesState =
  | { st: 'ready'; rows: AnalysisRow[] }
  | { st: 'loading' }
  | { st: 'error' }

let anCache: AnalysisRow[] | null = DEMO ? data.AN : null
let anPromise: Promise<AnalysisRow[]> | null = null

export function useAnalyses(): AnalysesState {
  const [state, setState] = useState<AnalysesState>(
    anCache ? { st: 'ready', rows: anCache } : { st: 'loading' }
  )
  useEffect(() => {
    if (anCache) return
    let live = true
    anPromise = anPromise || api.listAnalyses()
    anPromise
      .then(rows => { anCache = rows; if (live) setState({ st: 'ready', rows }) })
      .catch(() => { anPromise = null; if (live) setState({ st: 'error' }) })
    return () => { live = false }
  }, [])
  return state
}

/** First name for greetings: "Kevin Gonzalez" becomes "Kevin". */
export function firstName(me: Me | null): string | null {
  if (!me || !me.name) return null
  return me.name.split(' ')[0]
}

/** Initials for the avatar chip: "Kevin Gonzalez" becomes "KG". */
export function initials(me: Me | null): string {
  if (!me || !me.name) return '·'
  return me.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
