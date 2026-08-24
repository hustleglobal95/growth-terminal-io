/** Shared live-data hooks. One fetch per session per resource, cached at
 *  module level so Shell, Overview and Analyses do not triple-hit the API.
 *  In demo mode everything resolves synchronously from the bundled data.
 *
 *  Live-mode behaviour on failure is deliberate: never substitute demo
 *  rows for a signed-in user. Show an honest empty state instead. */
import { useEffect, useState } from 'react'
import { DEMO } from '../config'
import { api, data, AccountRow, AnalysisRow, BillingStatus, BusinessRow, CalibrationSummary, Credits, OverviewData } from './api'

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

/* Every mounted copy, so a Refresh verb on one screen updates the list on
   whichever screen the person is standing on. A control labelled Refresh that
   only repaints the component that owns it is not refreshing anything. */
const anListeners = new Set<(s: AnalysesState) => void>()

export function useAnalyses(): AnalysesState {
  const [state, setState] = useState<AnalysesState>(
    anCache ? { st: 'ready', rows: anCache } : { st: 'loading' }
  )
  useEffect(() => {
    anListeners.add(setState)
    return () => { anListeners.delete(setState) }
  }, [])
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

/** Drop the cached list and fetch again. Returns when the new rows have landed
 *  so a caller can keep a control in its pending state until then. */
useAnalyses.refresh = async (): Promise<void> => {
  if (DEMO) return
  anCache = null
  anPromise = null
  anListeners.forEach(fn => fn({ st: 'loading' }))
  try {
    const rows = await api.listAnalyses()
    anCache = rows
    anListeners.forEach(fn => fn({ st: 'ready', rows }))
  } catch {
    anPromise = null
    anListeners.forEach(fn => fn({ st: 'error' }))
  }
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


let ovCache: OverviewData | null = null
let ovPromise: Promise<OverviewData> | null = null

const ovListeners = new Set<(o: OverviewData | null) => void>()

export function useOverview(): OverviewData | null {
  const [ov, setOv] = useState<OverviewData | null>(ovCache)
  useEffect(() => {
    ovListeners.add(setOv)
    return () => { ovListeners.delete(setOv) }
  }, [])
  useEffect(() => {
    if (ovCache) return
    let live = true
    ovPromise = ovPromise || api.overview()
    ovPromise
      .then(o => { ovCache = o; if (live) setOv(o) })
      .catch(() => { ovPromise = null })
    return () => { live = false }
  }, [])
  return ov
}

useOverview.refresh = async (): Promise<void> => {
  if (DEMO) return
  ovCache = null
  ovPromise = null
  try {
    const o = await api.overview()
    ovCache = o
    ovListeners.forEach(fn => fn(o))
  } catch {
    ovPromise = null
  }
}


/* ---------------------------------------------------------------------- */
/* Businesses, calibration and billing. Same one-fetch-per-session caching  */
/* as above: the sidebar renders on every screen and must not refetch.      */
/* ---------------------------------------------------------------------- */

function onceHook<T>(load: () => Promise<T>) {
  let cache: T | null = null
  let promise: Promise<T> | null = null
  /* Every mounted copy of the hook, so an explicit refresh updates the sidebar
     on whatever screen the person is standing on rather than only the one that
     asked. Coming back from checkout with a stale credit count in the chrome
     is exactly the moment this matters. */
  const listeners = new Set<(v: T | null) => void>()
  const hook = function useOnce(): T | null {
    const [v, setV] = useState<T | null>(cache)
    useEffect(() => {
      listeners.add(setV)
      return () => { listeners.delete(setV) }
    }, [])
    useEffect(() => {
      if (cache || DEMO) return
      let alive = true
      promise = promise || load()
      promise
        .then(x => { cache = x; if (alive) setV(x) })
        .catch(() => { promise = null })
      return () => { alive = false }
    }, [])
    return v
  }
  /** Drop the cached value and fetch again, telling every mounted copy. */
  hook.refresh = async (): Promise<T | null> => {
    if (DEMO) return cache
    cache = null
    promise = null
    try {
      const x = await load()
      cache = x
      listeners.forEach(fn => fn(x))
      return x
    } catch {
      promise = null
      return null
    }
  }
  return hook
}

export const useBusinesses = onceHook<BusinessRow[]>(() => api.listBusinesses())
export const useCalibration = onceHook<CalibrationSummary>(() => api.calibration())
export const useBilling = onceHook<BillingStatus>(() => api.billing())
export const useAccounts = onceHook<AccountRow[]>(() => api.accounts())
export const useCredits = onceHook<Credits>(() => api.credits())

/** The workspace's human name, or a neutral fallback while it loads. */
export function accountName(accs: AccountRow[] | null): string {
  return accs && accs.length && accs[0].name ? accs[0].name : ''
}

/** Whether a string is an internal identifier rather than something a person
 *  named. Businesses auto-created from an account are stored under the
 *  account id in both name and slug, so this is how the interface avoids
 *  printing a UUID where a name belongs. */
export function isIdentifier(v: string): boolean {
  const t = (v || '').trim()
  return /^acct[-_]/i.test(t) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)
}

/** What to print for a business. Its own name when someone chose one, the
 *  account name when the row was auto-created, and an honest placeholder
 *  when there is neither. */
export function businessLabel(name: string, accs: AccountRow[] | null): string {
  if (name && !isIdentifier(name)) return name
  return accountName(accs) || 'Unnamed business'
}

/** The sidebar's calibration line, from the real grading engine.
 *  Reports how much has actually been graded, because with a handful of
 *  resolved predictions a coverage percentage is noise, not a signal. */
export function calibrationLabel(c: CalibrationSummary | null): string {
  if (!c || !c.totals) return 'Calibration: loading'
  const { predictions, graded } = c.totals
  if (!predictions) return 'Calibration: no predictions yet'
  if (!graded) return 'Calibration: 0 of ' + predictions + ' graded'
  const iv = c.intervalCalibration
  if (iv && iv.sampleSize >= 20) {
    return 'Calibration: ' + Math.round(iv.coverage * 100) + '% in range'
  }
  return 'Calibration: ' + graded + ' of ' + predictions + ' graded'
}

/** The sidebar's credit line. A balance on its own says nothing about whether
 *  it is enough, which is why the API screen prints what each action costs
 *  next to it. Zero is a real answer and is shown as one. */
export function creditsLabel(c: Credits | null): string {
  if (!c || typeof c.balance !== 'number') return 'Credits: loading'
  return 'Credits: ' + c.balance + ' left'
}

/** The sidebar's plan line. Billing carries no credit balance, so this
 *  reports the subscription state rather than inventing a number.
 *
 *  A trial is the one billing fact with a deadline attached, so when there is
 *  one the days left are what the line says. Somebody on day two of a trial and
 *  somebody on the last day of it are in very different situations, and a chip
 *  reading "Plan: Professional" tells neither of them anything. */
export function planLabel(b: BillingStatus | null): string {
  if (!b) return 'Plan: loading'
  if (b.bypassed) return 'Plan: internal'
  const name = b.planName || b.state || 'unknown'
  const days = trialDaysLeft(b)
  if (days !== null) {
    if (days <= 0) return name + ': trial ends today'
    return name + ': ' + days + (days === 1 ? ' day left in trial' : ' days left in trial')
  }
  return 'Plan: ' + name
}

/** Whole days until a trial ends, or null when there is no trial running.
 *  Counted from the start of today so it does not tick over mid afternoon. */
export function trialDaysLeft(b: BillingStatus | null): number | null {
  if (!b || !b.trialEndsAt) return null
  const end = new Date(b.trialEndsAt)
  if (isNaN(end.getTime())) return null
  const today = new Date()
  const a = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const z = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
  const days = Math.round((z - a) / 86400000)
  return days < 0 ? null : days
}

/** Whether the engine reports a subscription that entitles this workspace to
 *  the product. Used to tell "you have not paid" apart from "something else
 *  went wrong", which the gate could not previously distinguish. */
export function subscriptionLive(b: BillingStatus | null): boolean {
  if (!b) return false
  if (b.bypassed) return true
  if (b.planName) return true
  return ['active', 'trialing', 'trial', 'past_due'].includes(String(b.state || '').toLowerCase())
}

/** The workspace line under the signed in name.
 *
 *  The /me endpoint returns the workspace as an internal identifier, for
 *  example "acct-9d7211d5-4be0-428f-a8bf-4b273b13955c". That is not a name and
 *  it wraps over three lines in the sidebar. When the value looks like an
 *  identifier rather than something a person chose, the product name is shown
 *  instead of leaking a UUID into the interface. */
export function workspaceLabel(me: Me | null): string {
  const w = me && me.workspace ? me.workspace.trim() : ''
  if (!w) return 'Growth Terminal'
  const looksLikeId = /^acct[-_]/i.test(w) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(w)
  return looksLikeId ? 'Growth Terminal' : w
}
