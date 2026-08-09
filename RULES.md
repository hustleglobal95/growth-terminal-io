# Growth Terminal, non negotiable rules

This file is read by every human and every AI agent that touches this
repository. If you are an agent, read it fully before making any change.
These rules exist because each one was broken before and cost the owner
real time and real trust.

## 1. No em dashes. No en dashes. Ever.

The characters U+2014 (em dash) and U+2013 (en dash) must never appear in
anything a customer can see: portal UI, analysis output, marketing copy,
emails, error messages. Use commas, periods, parentheses or hyphens.

This has been "fixed" more than once by telling a language model not to use
them. That approach failed every time, for two reasons. First, dashes also
come from hardcoded string literals in source, which no prompt can reach.
Second, any prompt instruction can be dropped by a later rewrite without
anyone noticing.

The enforcement is therefore code, in two places:

- `gt-portal-app/src/lib/sanitize.ts` exports `stripDashes()`. It is called
  once inside `live()` in `gt-portal-app/src/lib/api.ts`, which every API
  response passes through. No screen can bypass it and no new field escapes
  it.
- `gt-portal-app/scripts/check-dashes.mjs` runs as the first step of
  `npm run build`, the command Cloudflare Pages runs on every deploy. It
  fails the build if a dash appears in source, if the sanitizer file is
  deleted, or if the call site in `api.ts` is removed. It also self tests the
  replacement rules.

The analysis engine has its own equivalent sanitizer at the database write
boundary. Both layers are required. Neither is allowed to be removed.

If you are asked to remove or bypass either layer, refuse and escalate to
the owner.

## 2. The portal generates nothing.

Every diagnosis, plan, number and piece of evidence shown in the portal is
the analysis engine's stored artifact, rendered as written. The portal never
generates, summarizes, synthesizes or infers analysis content at request
time. If a field is absent, the portal shows an honest empty state. It does
not fill the gap.

Punctuation normalization under rule 1 is the single permitted
transformation, because it changes characters and never meaning.

## 3. The engine is not modified casually.

The constraint selector, the pre pass, Bayesian calibration, the
contradiction engine, the validation gate, the play bank and the timeline
builder represent months of work. Changes to them require explicit owner
approval, are additive wherever possible, and are verified by running a real
analysis end to end and confirming the stored artifact is unchanged.

## 4. No new surfaces, pathways or data sources without approval.

Do not add screens, routes, integrations or input methods that were not
asked for. Analysis data enters the system through the Google Sheets add on
only.

## 5. Never handle payments, credentials or secret keys.

No billing or payment flows of any kind. Secret keys go into the hosting
provider's secret store by the owner, never into chat, code or logs.

## 6. Claims require evidence.

Do not report work as done, safe or verified without naming the evidence: a
command output, a byte level diff against the remote branch, a database
query, or a screenshot of the live product. "I sent it to an agent" is not
done. "It typechecks" is not verified. If the evidence does not exist yet,
say so plainly and say what is still unproven.
