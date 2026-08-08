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
 *  This is the pk_test key of the development instance
 *  (fun-buffalo-92.clerk.accounts.dev). It must match whichever instance
 *  the API validates against; when a Clerk production instance goes live,
 *  swap in its pk_live key here. */
export const CLERK_PUBLISHABLE_KEY = 'pk_test_ZnVuLWJ1ZmZhbG8tOTIuY2xlcmsuYWNjb3VudHMuZGV2JA'

export const PORTAL_LEGACY = 'https://growthterminal.io/portal'
