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
