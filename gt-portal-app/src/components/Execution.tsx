import { useNavigate } from 'react-router-dom'
import { Section } from './Section'
import { allScored, type ScoredPlan } from '../lib/planCommits'

/** What the workspace owes this week.
 *
 *  The engine writes a twelve week plan and the analysis screen puts a commit
 *  control on every week of it. Nothing else in the product ever mentions the
 *  plan again. So the sequence is: run an analysis, read something sharp,
 *  agree with it, close the tab, and never open week two.
 *
 *  That is the failure the whole product is exposed to. A diagnosis nobody
 *  executes produces no outcome, an outcome that never happens cannot be
 *  graded, and an ungraded prediction is why the calibration line reads eight
 *  of sixty seven. Execution is upstream of everything this product claims.
 *
 *  So the first thing on the workspace front page, above what happened, is
 *  what has not happened yet. It reads the same ledger the analysis screen
 *  writes, which already knows which weeks were committed, which were
 *  committed late, and how many have elapsed. Nothing here is computed twice.
 *
 *  It does not offer a commit control. Committing a week means naming what was
 *  done, and that belongs next to the phase that says what to do, not in a
 *  summary. This tells you; the plan is where you act. */

/** A plan is worth listing while it is running: started, and not yet at the
 *  end of its horizon with everything committed. */
function isRunning(p: ScoredPlan): boolean {
  if (!p.startedAt || p.weeksTotal === 0) return false
  return p.weeksCommitted < p.weeksTotal
}

/** The weeks that opened and closed without anybody committing them. This is
 *  the number that matters: not how much is left, but how much was skipped. */
function slipped(p: ScoredPlan): number[] {
  const now = Math.min(p.elapsedWeeks, p.weeksTotal)
  return p.weeks.filter(w => w.week < now && !w.committed).map(w => w.week)
}

/** Plain English for a list of week numbers, because "weeks 2, 3 and 5" is
 *  read at a glance and "3 weeks behind" is not the same claim. */
function weekList(ws: number[]): string {
  if (ws.length === 1) return 'week ' + ws[0]
  if (ws.length === 2) return 'weeks ' + ws[0] + ' and ' + ws[1]
  return 'weeks ' + ws.slice(0, -1).join(', ') + ' and ' + ws[ws.length - 1]
}

/** One line saying where this plan actually stands, in the order a person
 *  needs it: what is open now, then what was missed, then that it is fine. */
function state(p: ScoredPlan): { text: string; tone: 'due' | 'behind' | 'ok' } {
  const now = Math.min(p.elapsedWeeks, p.weeksTotal)
  const missed = slipped(p)
  const currentOpen = now >= 1 && !p.weeks.some(w => w.week === now && w.committed)

  if (now > p.weeksTotal && p.weeksCommitted < p.weeksTotal) {
    return { text: 'the horizon has passed with ' + weekList(missed) + ' never committed', tone: 'behind' }
  }
  if (currentOpen && missed.length > 0) {
    return { text: 'week ' + now + ' is open, and ' + weekList(missed) + ' went by uncommitted', tone: 'behind' }
  }
  if (currentOpen) return { text: 'week ' + now + ' is open', tone: 'due' }
  if (missed.length > 0) return { text: weekList(missed) + ' went by uncommitted', tone: 'behind' }
  return { text: 'every week so far is committed', tone: 'ok' }
}

export function Execution() {
  const nav = useNavigate()
  const running = allScored().filter(isRunning)
  if (running.length === 0) return null

  return (
    <Section
      title="Execution"
      qualifier={running.length === 1 ? '1 plan running' : running.length + ' plans running'}
      flush
    >
      <div className="xlist">
        {running.map(p => {
          const s = state(p)
          const now = Math.min(p.elapsedWeeks, p.weeksTotal)
          return (
            <button key={p.analysisId} className="xrow" type="button"
              onClick={() => nav('/analyses/' + p.analysisId)}>
              <span className="xwk">
                {now > p.weeksTotal ? 'ended' : 'week ' + Math.max(1, now)}
                <em> of {p.weeksTotal}</em>
              </span>
              <span className="xbiz">{p.businessName || 'This workspace'}</span>
              <span className={'xstate ' + s.tone}>{s.text}</span>
              <span className="xcount">{p.weeksCommitted} of {p.weeksTotal} committed</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}
