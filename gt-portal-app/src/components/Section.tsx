import React from 'react'

/** The section grammar, as a component.
 *
 *  Every analytical surface in the product is built from these, and every one
 *  is the same four parts: a rule, a name, a scope qualifier, and verbs that
 *  do something. Screens declare sections instead of hand rolling a card, so
 *  a screen nobody has opened before still behaves like one they have.
 *
 *  The qualifier is not a subtitle. It is a claim about what you are looking
 *  at, and it is the first thing a sceptical reader checks: "12 months",
 *  "6 records", "set before the work started". Anything vaguer than that is
 *  better left out.
 *
 *  A verb with no handler is not rendered. That rule is the whole point: this
 *  product has shipped buttons that did nothing, and a control that lies about
 *  being a control costs more trust than a missing feature does. */

export type Verb = {
  label: string
  /** Omit and the verb disappears rather than rendering dead. */
  onClick?: () => void
  /** Present but not available right now, with a reason on hover. */
  disabled?: boolean
  title?: string
}

export function Section({ id, title, qualifier, verbs, flush, children }: {
  /** Anchor for the jump list and for the editorial markup layer. */
  id?: string
  title: string
  qualifier?: string
  verbs?: Verb[]
  /** Body fills the section edge to edge, for grids and tables that draw
   *  their own dividers. */
  flush?: boolean
  children?: React.ReactNode
}) {
  const live = (verbs || []).filter(v => v.onClick || v.disabled)
  return (
    <section className="gsec" id={id}>
      <div className="gsh">
        <span className="t">{title}</span>
        {qualifier && <span className="q">{qualifier}</span>}
        <span className="sp" />
        {live.map(v => (
          <button key={v.label} className="v" onClick={v.onClick} disabled={v.disabled}
            title={v.title || undefined} type="button">{v.label}</button>
        ))}
      </div>
      <div className={flush ? 'gsb flush' : 'gsb'}>{children}</div>
    </section>
  )
}

/** A row inside a section. Columns are passed as a grid template so each
 *  section can set its own shape without a new class per screen. */
export function Row({ cols, selected, onClick, children }: {
  cols: string
  selected?: boolean
  onClick?: () => void
  children: React.ReactNode
}) {
  const cls = 'grow' + (onClick ? ' act' : '') + (selected ? ' sel' : '')
  if (!onClick) return <div className={cls} style={{ gridTemplateColumns: cols }}>{children}</div>
  return (
    <div className={cls} style={{ gridTemplateColumns: cols }} role="button" tabIndex={0}
      onClick={onClick} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}>
      {children}
    </div>
  )
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="gkv"><span className="k">{k}</span><span className="v2">{v}</span></div>
}

/** Green means verified. Amber means live. Everything else is neutral, and a
 *  bar with no state is neutral too, because not yet measured is the absence
 *  of a result rather than a bad one. */
export function Gauge({ pct, tone, mark }: { pct: number; tone?: 'ok' | 'am'; mark?: number }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <div className="ggauge">
      <i className={tone || undefined} style={{ width: w + '%' }} />
      {typeof mark === 'number' && <span style={{ left: Math.max(0, Math.min(100, mark)) + '%' }} />}
    </div>
  )
}

export function Empty({ title, body, action }: {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="gempty">
      <b>{title}</b>
      <span>{body}</span>
      {action && <button className="btn g" type="button" onClick={action.onClick}>{action.label}</button>}
    </div>
  )
}

export function Fig({ value, note, accent }: { value: React.ReactNode; note?: string; accent?: boolean }) {
  return (
    <div className="gfig">
      <b className={accent ? 'am' : undefined}>{value}</b>
      {note && <span>{note}</span>}
    </div>
  )
}

export function Status({ label, tone }: { label: string; tone?: 'ok' | 'run' | 'none' }) {
  return <span className={'gst' + (tone ? ' ' + tone : '')}>{label}</span>
}
