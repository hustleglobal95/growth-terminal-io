# Growth Terminal portal, standalone app

React + Vite + TypeScript. Builds to static files. Installs on phones as a PWA.

## Run it locally

    npm install
    npm run dev        opens on localhost:5173
    npm run build      production build into dist/

## Deploy, about ten minutes

1. Push this folder to a new GitHub repository.
2. On Cloudflare Pages or Netlify: create a project from that repo.
   Build command `npm run build`, output directory `dist`. The `_redirects`
   file is already included so client side routes resolve.
3. Add the custom domain `app.growthterminal.io` in the host's dashboard and
   create the CNAME it asks for at your DNS provider. HTTPS is automatic.
4. Open the site on a phone. The browser offers Add to Home Screen; installed,
   it launches full screen with the bottom tab bar as the app nav.

## Wiring live data, contract confirmed

CORS is enabled server side for app.growthterminal.io and localhost:5173 with
credentials. Auth is Clerk: there is no login route, the frontend mounts
Clerk's sign in with the portal's publishable key, Clerk sets the __session
cookie, and every request to /api/v1/portal/* rides it with credentials
include plus an X-Workspace-Id header. All of that is already wired.

To go live: paste the portal's Clerk publishable key into
CLERK_PUBLISHABLE_KEY in src/config.ts, set DEMO to false, confirm the exact
resource paths under /api/v1/portal (the client currently assumes /analyses
and /me), and redeploy.

One hard rule: live auth only works when the app is served from
app.growthterminal.io, because the Clerk cookie is same site with
growthterminal.io and no foreign host will ever receive it. The replit.app
deployment stays demo mode by design; the custom domain is what unlocks live
data.

## Later, if wanted

The same codebase wraps for the App Store with Capacitor and for desktop with
Tauri. Nothing needs restructuring first.

## House rules baked in

Design tokens and rules follow the gt-portal-design skill: one accent, Inter
everywhere, no monospace, hairlines not shadows, honest empty and error
states, no em dashes, Google Sheets keeps its trademark symbol.
