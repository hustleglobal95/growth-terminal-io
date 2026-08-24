import React from 'react'

/** Filters that only appear when they would do something.
 *
 *  A filter row that offers "All / Complete" on a workspace where every run
 *  completed is not a control, it is furniture. Every group here is built
 *  from the rows actually on screen, and a group whose options collapse to a
 *  single value is not rendered at all. That way the same component gives a
 *  one business workspace a clean toolbar and a ten business workspace the
 *  filters it needs, without anybody choosing a setting.
 *
 *  The chosen values are remembered per screen, because a filter a customer
 *  has to reapply on every visit is a filter they stop using.
 */

export interface FilterGroup {
  /** Stable key, also the storage key suffix. */
  key: string
  /** Shown before the chips. Omit on the first group to save a line. */
  label?: string
  /** In render order. The "all" option is added by this component. */
  options: string[]
  /** How to print an option. Defaults to the option itself. */
  format?: (v: string) => string
  /** What the "everything" chip says. Defaults to "All". */
  allLabel?: string
}

export type FilterState = Record<string, string>

/** Read a remembered selection. A failed read is private mode, not an error. */
export function loadFilters(screen: string): FilterState {
  try {
    const raw = localStorage.getItem('gt.filters.' + screen)
    const parsed = raw ? JSON.parse(raw) : null
    return parsed && typeof parsed === 'object' ? (parsed as FilterState) : {}
  } catch {
    return {}
  }
}

export function saveFilters(screen: string, state: FilterState): void {
  try { localStorage.setItem('gt.filters.' + screen, JSON.stringify(state)) } catch { /* private mode */ }
}

/** Build a group from the values present in the data, deduped and sorted.
 *  Returns a group with no options when there is nothing worth offering. */
export function groupFrom(
  key: string,
  rows: unknown[],
  read: (row: never) => string | undefined | null,
  opts?: { label?: string; format?: (v: string) => string; allLabel?: string },
): FilterGroup {
  const seen = new Set<string>()
  for (const r of rows) {
    const v = (read as (row: unknown) => string | undefined | null)(r)
    const t = (v ?? '').trim()
    if (t) seen.add(t)
  }
  return {
    key,
    label: opts?.label,
    options: seen.size > 1 ? Array.from(seen).sort((a, b) => a.localeCompare(b)) : [],
    format: opts?.format,
    allLabel: opts?.allLabel,
  }
}

/** True when a row passes every active group. */
export function matches(
  state: FilterState,
  tests: Record<string, string | undefined | null>,
): boolean {
  for (const key of Object.keys(tests)) {
    const want = state[key]
    if (!want || want === 'all') continue
    if ((tests[key] ?? '').trim() !== want) return false
  }
  return true
}

export function FilterBar({ groups, state, onChange }: {
  groups: FilterGroup[]
  state: FilterState
  onChange: (next: FilterState) => void
}) {
  const live = groups.filter(g => g.options.length > 1)
  if (live.length === 0) return null
  return (
    <>
      {live.map(g => g.options.length > 6 ? (
        /* Past half a dozen values the chips stop being a row and become a
           paragraph. A select holds the same choice in one control and keeps
           the toolbar one line tall on a workspace with thirty businesses. */
        <span className="gfgroup" key={g.key}>
          {g.label && <span className="gflbl">{g.label}</span>}
          <select
            className="gfsel"
            value={state[g.key] ?? 'all'}
            onChange={e => onChange({ ...state, [g.key]: e.target.value })}
          >
            <option value="all">{g.allLabel ?? 'All'}</option>
            {g.options.map(o => (
              <option key={o} value={o}>{g.format ? g.format(o) : o}</option>
            ))}
          </select>
        </span>
      ) : (
        <span className="gfgroup" key={g.key}>
          {g.label && <span className="gflbl">{g.label}</span>}
          <button
            className={'fchip' + (!state[g.key] || state[g.key] === 'all' ? ' on' : '')}
            onClick={() => onChange({ ...state, [g.key]: 'all' })}
            type="button"
          >{g.allLabel ?? 'All'}</button>
          {g.options.map(o => (
            <button
              key={o}
              className={'fchip' + (state[g.key] === o ? ' on' : '')}
              onClick={() => onChange({ ...state, [g.key]: o })}
              type="button"
            >{g.format ? g.format(o) : o}</button>
          ))}
        </span>
      ))}
    </>
  )
}

/** How many groups are narrowing the view right now, for a section qualifier. */
export function activeCount(state: FilterState, groups: FilterGroup[]): number {
  return groups.filter(g => g.options.length > 1 && state[g.key] && state[g.key] !== 'all').length
}
