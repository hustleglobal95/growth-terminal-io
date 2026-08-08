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
export const DEMO = true

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
