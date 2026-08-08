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

## Wiring live data

The app ships in demo mode and runs with no backend. Everything lives in
`src/config.ts`. Before flipping `DEMO` to false, ask the Replit agent these
two questions and act on the answers:

1. "No changes, just tell me what exists. How does a portal user authenticate
   against /api/v1: a session cookie set by a login route, or a bearer token?
   Give me the exact login route, request body, and what the client must send
   on later requests."
2. "Enable CORS on /api/v1 for the origin https://app.growthterminal.io,
   including credentials if auth is cookie based. Tell me exactly what you
   changed."

Then set `DEMO = false` in `src/config.ts`, fill in the auth mechanics in
`src/lib/api.ts` where marked, and redeploy. The endpoints already wired are
the confirmed ones: /api/v1/me, /api/v1/data/ingest, the snapshot confirm
route, and /api/v1/analyses.

## Later, if wanted

The same codebase wraps for the App Store with Capacitor and for desktop with
Tauri. Nothing needs restructuring first.

## House rules baked in

Design tokens and rules follow the gt-portal-design skill: one accent, Inter
everywhere, no monospace, hairlines not shadows, honest empty and error
states, no em dashes, Google Sheets keeps its trademark symbol.
