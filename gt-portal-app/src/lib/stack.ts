/** WHAT CLOSES THE CONSTRAINT, AND WHETHER YOU ALREADY OWN IT.
 *
 *  The engine ends at a diagnosis and a first move. This is the step after
 *  that: the capabilities that actually close the constraint it found, and
 *  whether the customer already has something that provides each one.
 *
 *  THREE RULES THIS FILE HOLDS.
 *
 *  The capability is the unit, not the brand. "Sub-five-minute lead response
 *  routing" stays true when a vendor renames a product; "use Sequences" does
 *  not. Naming a capability first and a tool second is also the difference
 *  between a diagnosis and a directory, which is the whole reason this exists.
 *
 *  Tools are listed, never ranked, and never scored. There is no best, no
 *  recommended, no sponsored. The moment an ordering appears here somebody
 *  will ask what it was paid for, and the answer has to be nothing.
 *
 *  Coverage is stated, not inferred. A connected provider is a fact. A tool
 *  the customer ticked is a claim they made. Those are different and the
 *  screen says which is which rather than blending them into a score.
 */

import type { ProviderKey } from './integrations'

/** The engine's canonical constraint set, from lib/constraint-agent. The
 *  playbook catalog is typed against the same union. */
export type Constraint = 'demand' | 'conversion' | 'capacity' | 'financial' | 'retention'

/** Analyses do not carry those five words.
 *
 *  `primaryConstraintCategory` on a live analysis is an uppercase label from
 *  a different vocabulary: ACQUISITION and CONVERSION are what this workspace
 *  actually returns. The playbook catalog is typed against ConstraintCategory
 *  and never sees those, so nothing currently joins an analysis to its own
 *  playbook. This function is that join, and it is a mapping rather than a
 *  rename because the two vocabularies are not one to one.
 *
 *  Anything unrecognised returns null and the screen says so, rather than
 *  guessing a constraint and recommending against it. */
const ALIASES: Record<string, Constraint> = {
  acquisition: 'demand', demand: 'demand', traffic: 'demand', awareness: 'demand',
  leadvolume: 'demand', reach: 'demand',
  conversion: 'conversion', close: 'conversion', sales: 'conversion', funnel: 'conversion',
  capacity: 'capacity', delivery: 'capacity', fulfilment: 'capacity', fulfillment: 'capacity',
  operations: 'capacity', throughput: 'capacity',
  financial: 'financial', finance: 'financial', margin: 'financial', pricing: 'financial',
  economics: 'financial', cash: 'financial',
  retention: 'retention', churn: 'retention', activation: 'retention', lifetime: 'retention',
}

export function toConstraint(raw: string | null | undefined): Constraint | null {
  const key = (raw || '').toLowerCase().replace(/[^a-z]/g, '')
  if (!key) return null
  if (ALIASES[key]) return ALIASES[key]
  /* A compound label like "LEAD_VOLUME_CONSTRAINT" still resolves if one of
     its words is known. Longest alias first so "leadvolume" wins over "lead". */
  const found = Object.keys(ALIASES)
    .sort((a, b) => b.length - a.length)
    .find(a => key.includes(a))
  return found ? ALIASES[found] : null
}

/** One thing a business needs to be able to do. Written so it is true whether
 *  or not any particular vendor exists. */
export interface Capability {
  id: string
  /** The capability, in the customer's language, with no brand in it. */
  name: string
  /** Why this one closes this constraint. Drawn from the playbook's first
   *  move, not invented. */
  why: string
  /** Connected providers that already give the customer this. A fact. */
  providers: ProviderKey[]
  /** Tools that do this, alphabetical, unranked. Examples, not endorsements,
   *  and deliberately short: a long list is a directory. */
  tools: string[]
}

export interface Plan {
  id: Constraint
  label: string
  /** The playbook's own first move, kept close to its wording so the two
   *  cannot drift into saying different things. */
  firstMove: string
  /** Ordered. The first capability is the one the playbook says to do first,
   *  and the screen keeps that order rather than sorting by coverage: what to
   *  do first does not change because you happen to own the third thing. */
  capabilities: Capability[]
}

export const PLANS: Record<Constraint, Plan> = {
  demand: {
    id: 'demand',
    label: 'Demand',
    firstMove: 'Expand reach before optimising conversion. Widen the audience definition before narrowing it, and raise the floor on lead volume so the downstream funnel math has signal worth reading.',
    capabilities: [
      {
        id: 'paid-reach',
        name: 'Paid reach you can compare across networks',
        why: 'Channel mix is the first thing the playbook says to audit, and that is impossible while each network is read in its own tab.',
        providers: ['meta-ads', 'google-ads'],
        tools: ['Google Ads', 'LinkedIn Ads', 'Meta Ads'],
      },
      {
        id: 'organic-visibility',
        name: 'Search visibility for the terms buyers actually use',
        why: 'The cheapest reach is demand that already exists. Impressions and position tell you whether you are absent or just losing.',
        providers: [],
        tools: ['Ahrefs', 'Google Search Console', 'Semrush'],
      },
      {
        id: 'outbound',
        name: 'Outbound list building and sequencing',
        why: 'When inbound volume is below the floor, outbound is the only channel whose volume you set directly.',
        providers: [],
        tools: ['Apollo', 'Instantly', 'Smartlead'],
      },
      {
        id: 'distribution',
        name: 'Repeatable content distribution',
        why: 'Reach compounds only when publishing survives a busy week, which is a scheduling problem before it is a creative one.',
        providers: [],
        tools: ['Buffer', 'Hootsuite', 'Later'],
      },
    ],
  },

  conversion: {
    id: 'conversion',
    label: 'Conversion',
    firstMove: 'Tighten response time before touching anything else in the funnel. The relationship between speed to contact and close probability is non-linear, so halving response time usually beats rewriting the script.',
    capabilities: [
      {
        id: 'speed-to-contact',
        name: 'Alerting and routing that puts a new lead in front of a person in minutes',
        why: 'This is the playbook first move. Nothing else in the funnel is worth touching until it is done.',
        providers: ['hubspot', 'gohighlevel'],
        tools: ['GoHighLevel', 'HubSpot', 'Pipedrive'],
      },
      {
        id: 'booking',
        name: 'Direct booking that removes the scheduling round trip',
        why: 'Every exchange between interest and a held slot is a place the lead cools, and this deletes the whole exchange.',
        providers: ['gohighlevel'],
        tools: ['Cal.com', 'Calendly', 'SavvyCal'],
      },
      {
        id: 'qualification',
        name: 'Qualification that keeps the wrong leads out of the pipeline',
        why: 'A high volume, fast response, low close pattern is the signature of qualifying the wrong people in.',
        providers: ['hubspot', 'gohighlevel'],
        tools: ['GoHighLevel', 'HubSpot', 'Typeform'],
      },
      {
        id: 'stage-tracking',
        name: 'Stage by stage drop-off you can actually see',
        why: 'The playbook diagnoses this by comparing drop-off between stages, which needs the stages recorded in the first place.',
        providers: ['hubspot', 'gohighlevel', 'ga4'],
        tools: ['Google Analytics', 'HubSpot', 'Pipedrive'],
      },
    ],
  },

  capacity: {
    id: 'capacity',
    label: 'Capacity',
    firstMove: 'Throttle acquisition or raise price to what you can deliver at quality. Then build throughput: productise, automate, hire, in that order.',
    capabilities: [
      {
        id: 'queue-visibility',
        name: 'One view of committed work and what is waiting',
        why: 'You cannot throttle intake against a queue length nobody can state.',
        providers: [],
        tools: ['Asana', 'ClickUp', 'Linear', 'Monday'],
      },
      {
        id: 'productise',
        name: 'Templated delivery for the repeatable parts',
        why: 'The playbook puts productising ahead of hiring, and most of the gain is in the steps that are already the same every time.',
        providers: [],
        tools: ['Asana', 'Notion', 'Process Street'],
      },
      {
        id: 'automate-handoffs',
        name: 'Automation for the handoffs between steps',
        why: 'Work stops at handoffs more often than during the work itself, and handoffs are the cheapest thing to automate.',
        providers: [],
        tools: ['Make', 'n8n', 'Zapier'],
      },
      {
        id: 'capacity-plan',
        name: 'Booked work measured against available hours',
        why: 'Deciding whether to hire or to raise price needs both numbers, and most businesses only have one.',
        providers: [],
        tools: ['Float', 'Harvest', 'Toggl'],
      },
    ],
  },

  financial: {
    id: 'financial',
    label: 'Financial',
    firstMove: 'Fix pricing first. Most under-margined businesses are mispriced against the outcome they deliver. Delivery cost and working capital come after.',
    capabilities: [
      {
        id: 'margin-by-job',
        name: 'Margin by customer or by job, not just in total',
        why: 'A blended margin hides the work that loses money, which is usually where the whole problem sits.',
        providers: ['quickbooks', 'stripe'],
        tools: ['QuickBooks', 'Xero'],
      },
      {
        id: 'pricing-change',
        name: 'Billing that lets you change price and packaging without a rebuild',
        why: 'Raising price is the fastest move in the playbook, and it stalls when the billing system makes it a project.',
        providers: ['stripe', 'shopify'],
        tools: ['Chargebee', 'Paddle', 'Stripe'],
      },
      {
        id: 'cost-tracking',
        name: 'Delivery cost tracked against the revenue it produced',
        why: 'Cost per delivery is the other half of the margin question and it rarely lives in the same place as revenue.',
        providers: ['quickbooks'],
        tools: ['Harvest', 'QuickBooks', 'Xero'],
      },
      {
        id: 'payback',
        name: 'Acquisition cost and payback period',
        why: 'The playbook compares payback against runway, and neither number exists in any single tool you already run.',
        providers: ['stripe', 'meta-ads', 'google-ads'],
        tools: ['Google Ads', 'Meta Ads', 'Stripe'],
      },
    ],
  },

  retention: {
    id: 'retention',
    label: 'Retention',
    firstMove: 'Map the first 90 days. Most retention failures are activation failures, where the customer never reached the moment that proves the value. Fix activation before messaging or offer.',
    capabilities: [
      {
        id: 'activation-event',
        name: 'A named activation event, and how many customers reach it',
        why: 'The playbook measures activation completion against signup, which requires deciding what activation is before you can count it.',
        providers: ['ga4'],
        tools: ['Amplitude', 'Google Analytics', 'Mixpanel', 'PostHog'],
      },
      {
        id: 'onboarding',
        name: 'An onboarding sequence that runs the same way every time',
        why: 'First 90 day decay is usually the first two weeks, and those are the weeks most businesses run by hand.',
        providers: ['hubspot', 'gohighlevel'],
        tools: ['Customer.io', 'HubSpot', 'Intercom'],
      },
      {
        id: 'lifecycle-messaging',
        name: 'Messaging triggered by what the customer did, not by a date',
        why: 'A calendar sequence talks to people who already churned; a behavioural one reaches the ones about to.',
        providers: ['hubspot', 'gohighlevel'],
        tools: ['Braze', 'Customer.io', 'Klaviyo'],
      },
      {
        id: 'cohorts',
        name: 'Cohort retention at 30, 60 and 90 days',
        why: 'The playbook reads the shape of the decay curve, and an average retention number hides the shape entirely.',
        providers: ['stripe'],
        tools: ['Amplitude', 'Mixpanel', 'Stripe'],
      },
    ],
  },
}

// ── What the customer already has ───────────────────────────────────────────

/** How a capability is covered. Three states, deliberately not a score.
 *
 *  connected  a provider giving this is connected to this workspace
 *  declared   the customer said they use a tool that gives this
 *  none       nothing known either way, which is not the same as nothing
 */
export type Cover = 'connected' | 'declared' | 'none'

export function coverage(
  cap: Capability,
  connected: ProviderKey[],
  declared: string[],
): Cover {
  if (cap.providers.some(p => connected.includes(p))) return 'connected'
  const has = new Set(declared.map(d => d.toLowerCase()))
  if (cap.tools.some(t => has.has(t.toLowerCase()))) return 'declared'
  return 'none'
}

/** Every tool named anywhere in the map, deduplicated, for the declaration
 *  list. Built from PLANS so a tool added to a capability appears to be
 *  ticked without being listed twice. */
export function allTools(): string[] {
  const seen = new Set<string>()
  for (const plan of Object.values(PLANS)) {
    for (const cap of plan.capabilities) for (const t of cap.tools) seen.add(t)
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b))
}

/* The declared stack is what the customer says they use. It is a claim, not a
   measurement, and the screen labels it that way.
 *
 *  It lives in this browser. The engine has no route for it, and inventing one
 *  here would mean writing to something that does not answer. The consequence
 *  is real and is stated on screen: a teammate on another machine sees an
 *  empty list. The day the engine stores it, this is the only function that
 *  changes. */
const KEY = 'gt.stack.declared'

export function readDeclared(): string[] {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function writeDeclared(tools: string[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tools))
  } catch {
    /* Private browsing, or storage that is full. The screen keeps working for
       this session and the ticks are simply not remembered. */
  }
}
