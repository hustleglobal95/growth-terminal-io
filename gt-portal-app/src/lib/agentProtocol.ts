/** THE ASSISTANT'S WIRE CONTRACT.
 *
 *  One assistant, three things it can hand back: a formula, a chart, a page.
 *  It is not three agents sharing a sidebar. The customer asks in their own
 *  words and this decides what the answer is shaped like.
 *
 *  Generation happens on the engine and nowhere else. The bundle cannot hold a
 *  key: it is readable by anyone who opens devtools, and every other screen in
 *  this product renders a customer's revenue, their clients and their team.
 *  That is the same reason AGENT_CREATE_PATH is empty and the agent form raises
 *  a ticket rather than showing a dead button, and this file follows it. With
 *  no route configured `configured()` is false and the screen says so.
 *
 *  Nothing that comes back is shown to a customer before it is checked. A
 *  formula the model invented, pointing at a column that is not in the sheet,
 *  looks exactly as convincing as a correct one. See formulaCheck.ts.
 */
import type { AgentContext } from './agentContext'

export type Dialect = 'sheets' | 'excel'
export type Answer = 'formula' | 'chart' | 'page' | 'question' | 'refusal'

/** What the customer asked, plus everything the assistant already knows. The
 *  request never carries a restatement of the business, the dataset or the
 *  analysis, because the context does. */
export interface AgentRequest {
  ask: string
  context: AgentContext
  dialect: Dialect
  /** Set when the assistant asked something back and this is the reply, so the
   *  engine can continue rather than start again. */
  answering?: { questionId: string; reply: string }
}

/** A formula, with the six things the customer needs to use it safely. Every
 *  field is required: an explanation without a placement is a formula somebody
 *  pastes into the wrong cell, and compatibility notes are where the difference
 *  between the two apps actually lives. */
export interface FormulaAnswer {
  kind: 'formula'
  formula: string
  dialect: Dialect
  /** Which tab it belongs on, so the check can resolve its references. */
  sheet: string
  explanation: string
  placement: string
  compatibility: string[]
  errors: string
  alternative?: { formula: string; why: string; needs?: string }
}

export interface ChartAnswer {
  kind: 'chart'
  chart: 'line' | 'bar' | 'column' | 'scatter' | 'area'
  title: string
  sheet: string
  /** Header names, not letters. The client resolves them, so a header the sheet
   *  does not have is caught here rather than drawn as an empty axis. */
  labels: { x: string; y: string }
  series: { header: string; label: string }[]
  categoryHeader?: string
  interpretation: string
  /** Why this chart type and not another. Shown, because a customer who
   *  disagrees should be able to see the reasoning and override it. */
  because: string
}

export interface PageAnswer {
  kind: 'page'
  format: 'key-finding' | 'constraint' | 'forecast' | 'recommended-action' | 'progress' | 'expected-vs-actual'
  title: string
  blocks: PageBlock[]
}

/** Blocks rather than six fixed layouts, because a chart has to be able to land
 *  in a page. That is the only thing that makes these one product instead of
 *  three utilities. */
export type PageBlock =
  | { block: 'figure'; label: string; value: string; note?: string; modelled?: boolean }
  | { block: 'text'; label?: string; body: string }
  | { block: 'list'; label: string; items: string[] }
  | { block: 'pairs'; label: string; rows: { left: string; right: string }[] }
  | { block: 'chart'; chart: ChartAnswer }

/** The assistant asking back. Only when it genuinely cannot tell: which of two
 *  date columns, what the literal word for a win is. Never a wizard, and never
 *  a question the context already answers. */
export interface QuestionAnswer {
  kind: 'question'
  questionId: string
  question: string
  /** Offered when the answer is one of a known set, so the customer picks
   *  rather than types a column name that has to be matched back. */
  choices?: string[]
  /** What it will do better with the reply. Shown, so a question never reads
   *  as an interrogation. */
  unlocks: string
}

/** Saying no. A refusal is a real answer and it is rendered like one. The
 *  alternative is an assistant that produces something plausible for a question
 *  it cannot answer, which is the failure this product is sold against. */
export interface RefusalAnswer {
  kind: 'refusal'
  because: string
  /** What would let it answer. Empty when nothing would. */
  wouldNeed: string[]
}

export type AgentAnswer = FormulaAnswer | ChartAnswer | PageAnswer | QuestionAnswer | RefusalAnswer

export interface AgentResponse {
  answer: AgentAnswer
  /** Echoed back so the client can prove the engine saw the grant it thinks it
   *  sent. A mismatch means the request was rewritten in flight and the answer
   *  is not trusted. */
  sawValues: boolean
}

/* ------------------------------------------------------------------ client -- */

export class NotConfigured extends Error {
  constructor() { super('The assistant is not switched on for this workspace.') }
}

export interface Transport {
  post(path: string, body: unknown): Promise<unknown>
}

export interface ClientOptions {
  /** Empty until the engine route exists. */
  path: string
  transport: Transport
}

export function configured(o: ClientOptions): boolean {
  return o.path.length > 0
}

/** Anything the engine sends that is not one of the five shapes is a refusal,
 *  not a render. A response this file does not recognise is a version skew and
 *  guessing at it puts an unchecked string in front of a customer. */
export async function askAgent(o: ClientOptions, req: AgentRequest): Promise<AgentResponse> {
  if (!configured(o)) throw new NotConfigured()
  const raw = await o.transport.post(o.path, req)
  return readResponse(raw, req)
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter(x => typeof x === 'string') as string[] : [])

export function readResponse(raw: unknown, req: AgentRequest): AgentResponse {
  const r = (raw && typeof raw === 'object' ? raw as Record<string, unknown> : {})
  const body = (r.data && typeof r.data === 'object' ? r.data as Record<string, unknown> : r)
  const a = (body.answer && typeof body.answer === 'object' ? body.answer as Record<string, unknown> : {})
  const sawValues = body.sawValues === true
  const unknown = (why: string): AgentResponse => ({
    answer: { kind: 'refusal', because: why, wouldNeed: [] }, sawValues,
  })

  switch (a.kind) {
    case 'formula': {
      if (!str(a.formula)) return unknown('The engine sent a formula answer with no formula in it.')
      return { sawValues, answer: {
        kind: 'formula',
        formula: str(a.formula),
        dialect: a.dialect === 'excel' ? 'excel' : req.dialect,
        sheet: str(a.sheet),
        explanation: str(a.explanation),
        placement: str(a.placement),
        compatibility: strs(a.compatibility),
        errors: str(a.errors),
        alternative: a.alternative && typeof a.alternative === 'object'
          ? { formula: str((a.alternative as Record<string, unknown>).formula),
              why: str((a.alternative as Record<string, unknown>).why),
              needs: str((a.alternative as Record<string, unknown>).needs) || undefined }
          : undefined,
      } }
    }
    case 'question':
      if (!str(a.question)) return unknown('The engine asked a question with no question in it.')
      return { sawValues, answer: {
        kind: 'question', questionId: str(a.questionId) || 'q',
        question: str(a.question),
        choices: Array.isArray(a.choices) ? strs(a.choices) : undefined,
        unlocks: str(a.unlocks),
      } }
    case 'refusal':
      return { sawValues, answer: { kind: 'refusal', because: str(a.because) || 'No reason given.', wouldNeed: strs(a.wouldNeed) } }
    case 'chart':
    case 'page':
      /* Passed through as sent. Both are checked by their own renderer before
         anything is drawn, the same way a formula is checked before it is
         shown, and neither renderer exists yet. */
      return { sawValues, answer: a as unknown as ChartAnswer | PageAnswer }
    default:
      return unknown('The engine sent an answer this version of the portal does not know how to read.')
  }
}
