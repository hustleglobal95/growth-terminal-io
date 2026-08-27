/** The only file to touch when wiring the live API.
 *
 * DEMO true renders the bundled sample workspace with no network calls.
 * DEMO false uses the live backend, confirmed contract:
 *
 *   CORS        app.growthterminal.io and localhost:5173 are whitelisted with
 *               credentials, specific origin echo, preflight handled.
 *   Auth        Clerk. There is no login route on the API. The frontend mounts
 *               Clerk's sign in with the same publishable key as the main
 *               portal, Clerk sets the __session cookie, and every request
 *               carries it via credentials include.
 *   Scoping     every portal request also carries X-Workspace-Id.
 *
 * IMPORTANT: live auth only works when this app is served from
 * app.growthterminal.io. The Clerk cookie is same site with
 * growthterminal.io, so subdomains receive it and foreign hosts such as
 * the replit.app preview URL never will. The replit.app deployment is
 * therefore permanently demo mode by design.
 */
export const DEMO = false

export const API_BASE = 'https://growthterminal.io'
export const PORTAL_API = '/api/v1/portal'

/** The portal's Clerk publishable key. Public by design, not a secret.
 *  This is the pk_live key of the PRODUCTION Clerk instance whose frontend
 *  API is clerk.growthterminal.io, the same instance the live portal at
 *  growthterminal.io runs on (Replit managed Clerk provisioned it at deploy
 *  time). Because app.growthterminal.io is a subdomain of the primary
 *  domain, the production session cookie is shared: a user signed in at
 *  growthterminal.io is already signed in here, no token bridge needed.
 *
 *  The previous value, kept for local development against the dev
 *  instance: pk_test_ZnVuLWJ1ZmZhbG8tOTIuY2xlcmsuYWNjb3VudHMuZGV2JA
 *  (fun-buffalo-92.clerk.accounts.dev). */
export const CLERK_PUBLISHABLE_KEY = 'pk_live_Y2xlcmsuZ3Jvd3RodGVybWluYWwuaW8k'

export const PORTAL_LEGACY = 'https://growthterminal.io/portal'

/** Clerk rides through the backend's proxy, exactly as the live portal
 *  does: every Clerk request (the clerk-js script itself and all session
 *  calls) goes to growthterminal.io/api/__clerk. The clerk.growthterminal.io
 *  frontend API domain exists in DNS but times out for script loads, so it
 *  must not be used directly; the proxy is the working path. */
export const CLERK_PROXY_URL = 'https://growthterminal.io/api/__clerk'

/** Default workspace for requests when the user has not picked one yet.
 *  Every portal API call must carry X-Workspace-Id; this is the owner's
 *  primary workspace UUID, taken from the live portal's own URL
 *  (portal/w/<id>/...). A workspace switcher can override it later via
 *  setWorkspaceId, which stores the choice in localStorage. */
export const DEFAULT_WORKSPACE_ID = '9d7211d5-4be0-428f-a8bf-4b273b13955c'

/** Checkout.
 *
 *  The engine owns payment. The portal asks it for a session and sends the
 *  browser wherever it answers with, so these are the only lines that change
 *  if a route moves.
 *
 *  Paths are relative to API_BASE + '/api', which is what liveRoot prefixes,
 *  so '/checkout/credits' is POSTed to growthterminal.io/api/checkout/credits.
 *
 *  There are no Stripe price IDs anywhere in this file on purpose: the server
 *  builds every line item from inline price_data, so the portal names what is
 *  being bought and never how much it costs Stripe. The prices below are for
 *  display only, and if one of them ever disagrees with the server the server
 *  is right.
 */
export const CHECKOUT_CREDITS_PATH = '/checkout/credits'
export const CHECKOUT_PRODUCT_PATH = '/checkout/sheet-product'
/** Subscriptions exist on the server but the portal does not sell them yet. */
export const CHECKOUT_PLAN_PATH = ''

/** Where Stripe sends the browser back to. The server currently hardcodes its
 *  own return paths; these are sent on every request so that it can honour
 *  them instead, which is the one change that lets the marketing site and the
 *  portal both send people back to the right place. */
export const CHECKOUT_SUCCESS_PATH = '/billing/success'
export const CHECKOUT_CANCEL_PATH = '/billing/cancel'

export interface CreditBundle { bundle: number; price: string; each: string }

/** Volume pricing as the engine charges it. */
export const CREDIT_BUNDLES: CreditBundle[] = [
  { bundle: 100, price: '$100', each: '$1.00 each' },
  { bundle: 250, price: '$225', each: '$0.90 each' },
  { bundle: 500, price: '$400', each: '$0.80 each' },
  { bundle: 1000, price: '$700', each: '$0.70 each' }
]

export interface SheetProduct { productId: string; name: string; price: string; blurb: string }

/** Sheet products sold through Stripe.
 *
 *  Note what is missing. The engine also exposes productId 'ai-guide' at $55,
 *  and it is deliberately not listed here: Attract, Don't Sell is priced at
 *  $50 and sells through Gumroad, which is what the landing page at
 *  /attract/ and the Gumroad listing both say. Adding a $55 Stripe button for
 *  it would put the same guide on sale at two prices through two checkouts,
 *  with refunds handled in one of them and not the other. Add the entry back
 *  when the price and the channel agree. */
export const SHEET_PRODUCTS: SheetProduct[] = [
  {
    productId: 'funnel-tracker',
    name: 'Funnel Tracker',
    price: '$79',
    blurb: 'The workbook the engine reads. Drop your numbers in and run an analysis against it.'
  }
]

/** The voice agent.
 *
 *  This is the public agent id from the ElevenLabs embed snippet, not an API
 *  key. ElevenLabs widgets are embedded on public marketing pages by design:
 *  the credential stays with them, and nothing secret enters this bundle.
 *
 *  Never put an API key here. This file ships to the browser and anyone can
 *  read it.
 *
 *  Empty means the Agents screen says it is not switched on yet, rather than
 *  rendering a call button that does nothing.
 */
export const VOICE_AGENT_ID = 'agent_4701m0394vswfk0tk8dsx0gzg7fq'

/** Where a customer's own agent gets created, once the engine can create one.
 *
 *  Empty today, and that is not a placeholder waiting to be filled in with a
 *  guess. There is no agent route on the engine: every prefix answers
 *  "Cannot GET". The one that looked promising, /api/portal/agents, returns
 *  401 to an anonymous caller and 404 to an authenticated one, which means
 *  the auth middleware runs before the router and the 401 says nothing about
 *  the route existing.
 *
 *  The portal cannot fill the gap itself. This bundle is static and public;
 *  creating an ElevenLabs agent needs a convai_write key, and a key that
 *  ships to the browser is a key anyone can read and spend. So the create
 *  flow raises a ticket instead, and the ticket is real.
 *
 *  Set this to the path the day the endpoint lands and the same form starts
 *  posting to it. Nothing else on the screen changes. See AGENT_ENDPOINT.md.
 */
export const AGENT_CREATE_PATH = ''

/** Where the brand record lives on the engine.
 *
 *  The brand record is the first thing a customer builds and the thing every
 *  later assistant reads: what the business is, who it is for, how it sounds,
 *  and what it must never say. One record per business.
 *
 *  Empty until the engine has the routes. The brand screen then explains what
 *  the flow will do and does not render a paste box that throws. Set this to
 *  '/v1/portal/brand' the day brandIngest.js is mounted, and nothing else in
 *  the portal changes.
 *
 *  Note the value is the path after /api, because liveRoot prepends that.
 */
export const BRAND_PATH = '/v1/portal/brand'

/** Where connected social accounts live on the engine.
 *
 *  The whole OAuth exchange happens server side. This bundle is static and
 *  public: an app secret in it is an app secret anyone can read, and a page
 *  token in it posts to a customer's audience under their name. So the portal
 *  asks the engine where to send the browser, and reads back only which
 *  accounts are connected and whether they still work.
 *
 *  Empty until the engine has the routes, and the connections screen says so
 *  rather than rendering a Connect button that throws.
 */
/* The engine serves this at /v1/portal/social. It was an empty string while
   the routes were unbuilt; they exist now, so the screen is live. Publishing
   still does not happen: the engine reports publishingLive off its own
   PORTAL_SOCIAL_PUBLISHING_LIVE flag and the screen keys its warning to that,
   so connecting early is safe and honest. */
export const SOCIAL_PATH = '/v1/portal/social'

/** Where the Threads connection lives on the engine.
 *
 *  Separate from SOCIAL_PATH on purpose. Threads authorizes at threads.com
 *  and exchanges tokens at graph.threads.com, neither of which is the
 *  Facebook graph, and its scope list is its own. Pointing both at one path
 *  would be tidy right up until one of the two providers changed something.
 *
 *  The engine serves POST {THREADS_PATH}/begin, which answers with the
 *  authorization window URL, and GET {THREADS_PATH}/callback, which the
 *  browser lands on and which redirects back here carrying ?threads=. There
 *  is no read route yet, so the screen reports the connection from the
 *  redirect marker and does not invent an account list it cannot see.
 *
 *  Empty takes Threads connecting offline and the screen says so plainly
 *  rather than rendering a button that throws.
 */
export const THREADS_PATH = '/v1/portal/threads'

/** Where suggestions and the queue live on the engine.
 *
 *  A suggestion is one thought the customer wants said. The engine turns
 *  suggestions into posts, renders them against the brand kit, and holds them
 *  in a queue until their slot. It does not invent the thoughts.
 *
 *  Empty until the engine has the routes.
 */
/** SPREADSHEET INTAKE.
 *
 *  The three data endpoints the Sheets add-on already uses, so the portal
 *  reaches the same intake rather than a parallel one: ingest at
 *  POST {INTAKE_PATH}/ingest, confirm at PUT {INTAKE_PATH}/snapshots/{id}/confirm,
 *  then POST /v1/analyses.
 *
 *  On, with the request and response shapes of all three confirmed against
 *  the running backend rather than inferred. Set this back to empty to take
 *  the upload screen offline: empty makes it say so plainly rather than throw
 *  on a URL built from an empty string, which is the failure mode Feed and
 *  Connections still have.
 */
export const INTAKE_PATH = '/v1/data'

export const FEED_PATH = ''

/** THE FORMULA BUILDER.
 *
 *  Generation happens on the engine and nowhere else. This bundle is static
 *  and public: a model key in it is a key anyone can read and spend, and every
 *  other screen in this app renders a customer's revenue, their clients and
 *  their team. So the portal gathers the context, checks what comes back, and
 *  never generates anything itself.
 *
 *  The path is relative to /api/v1/portal, which is what live() prefixes, so
 *  '/assistant' is POSTed to growthterminal.io/api/v1/portal/assistant.
 *
 *  Empty takes the screen offline and it says so plainly, the same way the
 *  agent create form does, rather than rendering a box that throws when a
 *  customer uses it. Set it the day the route answers and nothing else in the
 *  portal changes.
 *
 *  Credits are charged by the engine under the key assistant:ask, and a
 *  question back or a refusal is never charged. That is deliberate: charging
 *  for a refusal makes refusing expensive, and an agent that cannot afford to
 *  refuse produces a plausible answer instead of an honest one.
 */
/* Live. Verified against production on 27 August: an unauthenticated POST to
   growthterminal.io/api/v1/portal/assistant answers 401 with
   {"error":{"code":"unauthenticated","message":"Clerk session required"}},
   which is the session-only 401 the contract requires and not a feature flag
   refusing the call. */
export const ASSISTANT_PATH = '/assistant'
