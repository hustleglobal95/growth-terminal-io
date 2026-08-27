/** WHAT IS OWED A MEASUREMENT.
 *
 *  A committed plan that has never been measured is the loop left open. The
 *  analysis screen says so where the plan lives, but somebody who committed a
 *  plan in March is not going to go looking for it in June, so it has to be
 *  said on the screen they actually land on.
 *
 *  THE COST IS BOUNDED ON PURPOSE. There is no route that lists commitments
 *  across a workspace, only one per analysis, so answering this at all means
 *  asking once per analysis. That is a real cost on the busiest screen in the
 *  product, so it is capped, run after the screen has painted rather than
 *  before, cached for the session, and silent when it fails. What the cap
 *  leaves out is reported rather than hidden: a count that quietly stops at
 *  eight reads as "nothing else is owed", which is the opposite of true.
 *
 *  The test is deliberately the blunt one. "Committed and never measured" is
 *  unambiguous, needs no gate arithmetic, and is the case worth interrupting
 *  somebody for. Finer questions, like whether the last measurement reaches
 *  the month a gate fell due, are answered on the analysis itself where the
 *  frozen claim is already loaded.
 */
import type { AnalysisRow } from './api'
import { listCommitments, listRuns } from './verified'

/** Past this, the cost stops being worth paying on a landing screen. */
const MAX_CHECKED = 8

export interface DueSummary {
  /** Committed plans carrying no measurement at all. */
  unmeasured: { analysisId: string; business: string; committedPeriod: string }[]
  /** How many analyses were not looked at because of the cap. */
  notChecked: number
}

const EMPTY: DueSummary = { unmeasured: [], notChecked: 0 }

function complete(a: AnalysisRow): boolean {
  return String(a.st || '').toLowerCase() === 'complete' && Boolean(a.id)
}

/** One pass. Returns the empty summary rather than throwing: this is a nudge,
 *  and a nudge that breaks a screen is worse than no nudge. */
export async function findDue(analyses: AnalysisRow[]): Promise<DueSummary> {
  const done = (analyses || []).filter(complete)
  const checked = done.slice(0, MAX_CHECKED)
  const notChecked = done.length - checked.length

  const found = await Promise.all(checked.map(async a => {
    try {
      const rows = await listCommitments(a.id as string)
      const list = Array.isArray(rows) ? rows : []
      if (!list.length) return null
      const latest = list[list.length - 1]
      const runs = await listRuns(latest.id)
      if (Array.isArray(runs) && runs.length) return null
      return { analysisId: a.id as string, business: a.b, committedPeriod: latest.committedPeriod }
    } catch {
      /* The verification routes may not be reachable in this environment. One
         analysis failing is not a reason to drop the others. */
      return null
    }
  }))

  return { unmeasured: found.filter(Boolean) as DueSummary['unmeasured'], notChecked }
}

export { EMPTY as NOTHING_DUE, MAX_CHECKED }
