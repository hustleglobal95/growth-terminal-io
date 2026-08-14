/** What each box on an analysis is for.
 *
 *  The report is written for whoever commissioned it, and that is a different
 *  person every time: an owner with no analytics background, a finance team, an
 *  agency presenting to a client. So none of this copy addresses a reader or
 *  tells anybody what to do. Each entry answers one narrower question, which is
 *  the same question regardless of who is asking it: what is this box showing
 *  me, and how should I read the thing inside it.
 *
 *  Two rules held the copy honest.
 *
 *  Say what a number is not, wherever it could be over-read. The upside figure
 *  is the obvious case: it is a discounted projection and people will quote it
 *  as a promise unless the box says otherwise.
 *
 *  Never describe the finding itself. These lines ship the same for every
 *  analysis, so anything specific to one run would be wrong on the next.
 */
export interface Explanation { t: string; b: string }

export const EXPLAIN: Record<string, Explanation> = {
  category: {
    t: 'Constraint category',
    b: 'Which part of the business the limit sits in. Every category is scored on the same data, and the one named here is the one holding the others back.'
  },

  headline: {
    t: 'The constraint',
    b: 'The single factor limiting growth, in one line. Everything below either explains it, prices it, or plans around it.'
  },

  severity: {
    t: 'Severity and confidence',
    b: 'Severity is how hard this is holding the business back, on a fixed ten point scale. Confidence is how strong the evidence behind the call is. They move independently: a severe constraint can be identified on thin evidence, and a mild one can be certain.'
  },

  upside: {
    t: 'If you act',
    b: 'What removing this constraint is worth. The raw figure is discounted twice, once for how likely the work is to actually get done and once for how likely this cause is the real one. It is a projection with assumptions attached, not a promise.'
  },

  subDiagnosis: {
    t: 'Sub-diagnosis',
    b: 'A narrower reading inside the headline constraint. It takes a broad category and names the specific mechanism producing the problem.'
  },

  verdict: {
    t: 'What the engine found',
    b: 'The finding in plain terms, and what it rests on. If only one box gets read, this is the one.'
  },

  narrative: {
    t: 'The verdict, in full',
    b: 'The same conclusion written out at length with the reasoning left in. This is the version to use when the call has to be defended to somebody who was not part of the analysis.'
  },

  causes: {
    t: 'Root causes',
    b: 'The reasons the constraint exists, as opposed to the symptoms it produces. Acting on something here changes the outcome. Acting on a symptom moves the number back.'
  },

  supporting: {
    t: 'Evidence for this call',
    b: 'The specific figures and patterns in the submitted data that pushed the engine toward this conclusion.'
  },

  contradicting: {
    t: 'Evidence against it',
    b: 'Signals in the same data pointing the other way. They are listed rather than dropped, because how much a call is contradicted is part of knowing how settled it is.'
  },

  plan: {
    t: 'The plan',
    b: 'The work the engine sequenced to remove the constraint, in phases. The order carries meaning: later phases assume the earlier ones have already happened.'
  },

  planprog: {
    t: 'Plan progress',
    b: 'How many weeks of the plan have been committed to so far, and where today sits against the timeline.'
  },

  gates: {
    t: 'Decision gates',
    b: 'Scheduled checkpoints. Each names a condition to test, what follows if it is met, and what follows if it is not. They exist so the plan can be changed on evidence rather than on instinct.'
  },

  indicators: {
    t: 'Indicators',
    b: 'The measures to watch while the plan runs. They tend to move before revenue does, which is what makes them worth tracking weekly rather than at the end.'
  },

  limits: {
    t: 'What would prove this wrong',
    b: 'The conditions under which this analysis would be incorrect, stated before the outcome is known. A call that cannot be disproved cannot be trusted either.'
  },

  verify: {
    t: 'Did the plan work',
    b: 'The check once the plan has run its course: did the change the engine predicted actually happen. Answering it is what turns a forecast into a record.'
  },

  evidence: {
    t: 'Evidence',
    b: 'What the data supports and what it argues against, side by side, so the strength of the call can be judged rather than assumed.'
  }
}
