/**
 * Event import: read the file, then decide whether it is worth trusting.
 *
 * Everything here is pure. A file goes in, a normalised set of events and an
 * honest report come out, and the screen renders the report rather than
 * inventing its own opinion of the data.
 *
 * The order matters. Headers are checked before a single row is parsed, so a
 * file with the wrong columns fails in a sentence rather than in ten thousand
 * silent nulls. Timestamps are normalised next, because a date that did not
 * parse is not a zero, it is a row we cannot place in time. Only then does
 * anything reach the engine, and only if the volume floor is cleared.
 */

/* ------------------------------------------------------------------ */
/* Reading the file                                                    */
/* ------------------------------------------------------------------ */

export interface Table {
  headers: string[]
  rows: string[][]
  /** Row numbers as the customer sees them in their spreadsheet, 1-indexed
   *  and counting the header, so an error message points at the right line. */
  firstDataLine: number
}

/** A small delimited reader. Handles quoted fields, embedded delimiters,
 *  doubled quotes and both line endings. Comma or tab, chosen by whichever
 *  appears more often on the header line. */
export function parseDelimited(text: string): Table {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const nl = clean.indexOf('\n')
  const firstLine = clean.slice(0, nl === -1 ? clean.length : nl)
  const delim = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ','

  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let quoted = false
  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i]
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 1 } else quoted = false
      } else field += c
      continue
    }
    if (c === '"') { quoted = true; continue }
    if (c === delim) { row.push(field); field = ''; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue }
    field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }

  const headers = (rows.shift() ?? []).map(h => h.trim())
  return { headers, rows: rows.filter(r => r.some(c => c.trim() !== '')), firstDataLine: 2 }
}

/* ------------------------------------------------------------------ */
/* Columns                                                             */
/* ------------------------------------------------------------------ */

export type Field = 'account_id' | 'user_id' | 'event_name' | 'timestamp'
export const REQUIRED_FIELDS: Field[] = ['account_id', 'user_id', 'event_name', 'timestamp']

export const FIELD_LABEL: Record<Field, string> = {
  account_id: 'Account',
  user_id: 'Person',
  event_name: 'Event',
  timestamp: 'When it happened',
}

/** What a column is usually called when it is not called the right thing. */
const ALIASES: Record<Field, string[]> = {
  account_id: ['account_id', 'accountid', 'account', 'company_id', 'org_id', 'organization_id', 'workspace_id', 'customer_id', 'tenant_id', 'client_id'],
  user_id: ['user_id', 'userid', 'user', 'person_id', 'member_id', 'contact_id', 'profile_id', 'email'],
  event_name: ['event_name', 'eventname', 'event', 'action', 'activity', 'type', 'event_type', 'name'],
  timestamp: ['timestamp', 'time', 'occurred_at', 'created_at', 'createdat', 'date', 'datetime', 'event_time', 'event_date', 'ts', 'when'],
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export interface Suggestion {
  field: Field
  column: string | null
  /** 1 when the header is already the canonical name, lower when it was
   *  recognised as a synonym, 0 when nothing matched. */
  confidence: number
  reason: string
}

/** Propose a mapping. Never applies one silently below full confidence: a
 *  column called created_at might be the event time or the account's birthday,
 *  and only the customer knows which. */
export function suggestMapping(headers: string[]): Suggestion[] {
  const used = new Set<string>()
  return REQUIRED_FIELDS.map(field => {
    const list = ALIASES[field]
    let best: { column: string; score: number; why: string } | null = null
    for (const h of headers) {
      if (used.has(h)) continue
      const n = norm(h)
      const exact = n === norm(field)
      const idx = list.findIndex(a => norm(a) === n)
      const contains = !exact && idx < 0 && list.some(a => n.includes(norm(a)))
      const score = exact ? 1 : idx >= 0 ? 0.9 - idx * 0.02 : contains ? 0.5 : 0
      if (score > 0 && (!best || score > best.score)) {
        best = {
          column: h, score,
          why: exact ? 'named exactly' : idx >= 0 ? 'recognised as ' + field : 'partial name match',
        }
      }
    }
    if (best) used.add(best.column)
    return {
      field,
      column: best ? best.column : null,
      confidence: best ? best.score : 0,
      reason: best ? best.why : 'no column in this file looks like it',
    }
  })
}

export type Mapping = Record<Field, string | null>

export function mappingFrom(s: Suggestion[]): Mapping {
  const m = { account_id: null, user_id: null, event_name: null, timestamp: null } as Mapping
  for (const x of s) m[x.field] = x.column
  return m
}

export function missingColumns(m: Mapping): Field[] {
  return REQUIRED_FIELDS.filter(f => !m[f])
}

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

/** Accepts ISO 8601, a bare date, a space separated datetime, and epoch in
 *  seconds or milliseconds. Returns null rather than guessing: a value we
 *  cannot place in time must be reported, not rounded to today. */
export function normalizeTimestamp(raw: string): number | null {
  const s = (raw ?? '').trim()
  if (!s) return null

  if (/^-?\d{9,}$/.test(s)) {
    const n = Number(s)
    /* Ten digits is seconds until roughly the year 2286; thirteen is
       milliseconds. Anything shorter is not a plausible epoch at all. */
    const ms = s.replace('-', '').length <= 11 ? n * 1000 : n
    const y = new Date(ms).getUTCFullYear()
    return y >= 1990 && y <= 2100 ? ms : null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const t = Date.parse(s + 'T00:00:00Z')
    if (Number.isNaN(t)) return null
    const yr = new Date(t).getUTCFullYear()
    return yr >= 1990 && yr <= 2100 ? t : null
  }
  const iso = /^\d{4}-\d{2}-\d{2}[ T]/.test(s) ? s.replace(' ', 'T') : s
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(iso) ? iso + 'Z' : iso)
  if (Number.isNaN(t)) return null
  const y = new Date(t).getUTCFullYear()
  return y >= 1990 && y <= 2100 ? t : null
}

/* ------------------------------------------------------------------ */
/* Ingest                                                              */
/* ------------------------------------------------------------------ */

export interface ImportedEvent {
  accountId: string
  userId: string | null
  eventName: string
  occurredAt: string
}

export interface ImportReport {
  totalRows: number
  accepted: number
  /** Rows whose time could not be read, with the customer's own line numbers. */
  timestampFailures: number
  timestampFailureRate: number
  failureLines: number[]
  failureSamples: { line: number; value: string }[]
  missingAccount: number
  missingEvent: number
  duplicatesRemoved: number
  uniqueAccounts: number
  uniqueUsers: number
  eventNames: { name: string; count: number }[]
  firstEvent: string | null
  lastEvent: string | null
  spanDays: number
  /** The longest run of days with no events at all, inside the span. */
  largestGapDays: number
  warnings: string[]
}

export interface IngestResult {
  events: ImportedEvent[]
  report: ImportReport
}

/** Two events are the same fire when they share the account, the person, the
 *  event name and land inside the same second. Webhook retries and double
 *  submits arrive exactly like that, and left alone they inflate the
 *  numerator of every retention cell.
 *
 *  The account is part of the key on purpose: an account level event carries
 *  no person, and keying on the person alone would silently collapse every
 *  such event across the whole file into one. */
const dedupeKey = (e: ImportedEvent, ms: number): string =>
  e.accountId + ' ' + (e.userId ?? '') + ' ' + e.eventName + ' ' + Math.floor(ms / 1000)

export function ingest(table: Table, mapping: Mapping): IngestResult {
  const idx = (f: Field): number => {
    const col = mapping[f]
    return col ? table.headers.indexOf(col) : -1
  }
  const iAcc = idx('account_id'), iUser = idx('user_id'), iName = idx('event_name'), iTime = idx('timestamp')

  const events: ImportedEvent[] = []
  const seen = new Set<string>()
  const failureLines: number[] = []
  const failureSamples: { line: number; value: string }[] = []
  const names = new Map<string, number>()
  const accounts = new Set<string>()
  const users = new Set<string>()
  const dayHits = new Set<number>()
  let missingAccount = 0, missingEvent = 0, duplicates = 0
  let first = Infinity, last = -Infinity

  table.rows.forEach((r, i) => {
    const line = table.firstDataLine + i
    const acc = (r[iAcc] ?? '').trim()
    const name = (r[iName] ?? '').trim()
    const rawTime = (r[iTime] ?? '').trim()
    const user = iUser >= 0 ? (r[iUser] ?? '').trim() : ''

    if (!acc) { missingAccount += 1; return }
    if (!name) { missingEvent += 1; return }

    const ms = normalizeTimestamp(rawTime)
    if (ms === null) {
      failureLines.push(line)
      if (failureSamples.length < 8) failureSamples.push({ line, value: rawTime || '(empty)' })
      return
    }

    const ev: ImportedEvent = {
      accountId: acc,
      userId: user || null,
      eventName: name,
      occurredAt: new Date(ms).toISOString(),
    }
    const key = dedupeKey(ev, ms)
    if (seen.has(key)) { duplicates += 1; return }
    seen.add(key)

    events.push(ev)
    accounts.add(acc)
    if (user) users.add(user)
    names.set(name, (names.get(name) ?? 0) + 1)
    dayHits.add(Math.floor(ms / 86400000))
    if (ms < first) first = ms
    if (ms > last) last = ms
  })

  const spanDays = Number.isFinite(first) && Number.isFinite(last)
    ? Math.floor((last - first) / 86400000) + 1 : 0

  let largestGap = 0
  if (dayHits.size > 1) {
    const days = [...dayHits].sort((a, b) => a - b)
    for (let i = 1; i < days.length; i += 1) {
      const gap = days[i] - days[i - 1] - 1
      if (gap > largestGap) largestGap = gap
    }
  }

  const attempted = table.rows.length
  const rate = attempted ? failureLines.length / attempted : 0
  const warnings: string[] = []

  /* Five percent is the line between a few odd rows and a format the reader
     has misunderstood. Below it the file is usable and the failures are
     listed; above it the file is probably fine and the mapping is wrong. */
  if (rate > 0.05) {
    warnings.push(failureLines.length + ' of ' + attempted + ' rows (' + (rate * 100).toFixed(1) + '%) have a time that could not be read. Above five percent this usually means the wrong column is mapped to when it happened, rather than bad data.')
  } else if (failureLines.length > 0) {
    warnings.push(failureLines.length + ' row' + (failureLines.length === 1 ? '' : 's') + ' had a time that could not be read and ' + (failureLines.length === 1 ? 'was' : 'were') + ' left out.')
  }
  if (missingAccount) warnings.push(missingAccount + ' row' + (missingAccount === 1 ? '' : 's') + ' had no account and could not belong to a cohort.')
  if (missingEvent) warnings.push(missingEvent + ' row' + (missingEvent === 1 ? '' : 's') + ' had no event name.')
  if (duplicates) warnings.push(duplicates + ' duplicate' + (duplicates === 1 ? '' : 's') + ' removed: same account, same person, same event, inside the same second.')
  if (largestGap >= 3) warnings.push('The longest stretch with no events at all is ' + largestGap + ' days. A gap that size moves cohort boundaries, so check the export covers the whole period.')
  if (iUser < 0) warnings.push('No person column was mapped. Account level retention still works; per person retention does not.')

  return {
    events,
    report: {
      totalRows: attempted,
      accepted: events.length,
      timestampFailures: failureLines.length,
      timestampFailureRate: rate,
      failureLines: failureLines.slice(0, 200),
      failureSamples,
      missingAccount, missingEvent,
      duplicatesRemoved: duplicates,
      uniqueAccounts: accounts.size,
      uniqueUsers: users.size,
      eventNames: [...names.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
      firstEvent: Number.isFinite(first) ? new Date(first).toISOString() : null,
      lastEvent: Number.isFinite(last) ? new Date(last).toISOString() : null,
      spanDays, largestGapDays: largestGap,
      warnings,
    },
  }
}

/* ------------------------------------------------------------------ */
/* The floor                                                           */
/* ------------------------------------------------------------------ */

export const MIN_ACCOUNTS = 20
export const MIN_SPAN_DAYS = 30

export interface Readiness {
  ready: boolean
  /** Each unmet condition, in the reader's words. */
  blocking: string[]
  /** True where the file is usable but the result will be thin. */
  cautions: string[]
}

/**
 * Whether this file may drive a constraint. A severity score computed from
 * eleven accounts over nine days is not a weak finding, it is noise wearing a
 * number, and the engine has been burned by exactly that before. The gate is
 * a refusal to model, not a refusal to show: the file still uploads and the
 * counts are still displayed.
 */
export function readiness(r: ImportReport): Readiness {
  const blocking: string[] = []
  const cautions: string[] = []

  if (r.uniqueAccounts < MIN_ACCOUNTS) {
    blocking.push('Retention health needs at least ' + MIN_ACCOUNTS + ' accounts. This file has ' + r.uniqueAccounts + '.')
  }
  if (r.spanDays < MIN_SPAN_DAYS) {
    blocking.push('Retention health needs at least ' + MIN_SPAN_DAYS + ' days of history. This file covers ' + r.spanDays + ' day' + (r.spanDays === 1 ? '' : 's') + '.')
  }
  if (r.timestampFailureRate > 0.05) {
    blocking.push('More than five percent of rows have an unreadable time, so the cohorts cannot be trusted.')
  }
  if (!r.eventNames.length) blocking.push('No usable events were read from this file.')

  if (!blocking.length) {
    if (r.uniqueAccounts < 60) cautions.push(r.uniqueAccounts + ' accounts is enough to model, but a single cohort will be small and the confidence will say so.')
    if (r.spanDays < 90) cautions.push(r.spanDays + ' days of history means day 90 will read as unobserved rather than as a number.')
    if (r.largestGapDays >= 3) cautions.push('A ' + r.largestGapDays + ' day gap in the events will show as a hole in the matrix.')
  }
  return { ready: blocking.length === 0, blocking, cautions }
}
