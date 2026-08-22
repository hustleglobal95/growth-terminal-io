import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Shell } from './components/Shell'
import { WorkspaceGate } from './components/WorkspaceGate'
import { Overview, Analyses, Businesses, ApiKeys, Stub } from './screens/simple'
import { CheckoutSuccess, CheckoutCancel, SubscriptionReturn, CreditsReturn } from './screens/Billing'
import { SocialReturn } from './screens/SocialReturn'
import { Agents } from './screens/Agents'
import { Brand } from './screens/Brand'
import { Connections } from './screens/Connections'
import { Feed } from './screens/Feed'
import { Intake } from './screens/Intake'
import { Teams } from './screens/Teams'
import { Content } from './screens/Content'
import { ContentSetup } from './screens/ContentSetup'
import { AnalysisRoute } from './screens/LiveDetail'
import { More } from './screens/More'
import { Login, Signup } from './screens/Login'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { setClerkTokenGetter } from './lib/clerkBridge'

function ClerkTokenBridge() {
  const { getToken } = useAuth()
  React.useEffect(() => { setClerkTokenGetter(() => getToken()) }, [getToken])
  return null
}
import { DEMO, CLERK_PUBLISHABLE_KEY, CLERK_PROXY_URL } from './config'
import './styles/portal.css'
import { initLava } from './lib/lava'

/* Started once, outside React, because it owns a single element and a single
   animation frame loop and has nothing to do with any screen. */
initLava()

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  /* Outside the gate, like sign in: there is no workspace to resolve for
     somebody who does not have an account yet. */
  { path: '/signup', element: <Signup /> },
  {
    /* The gate wraps the shell rather than sitting inside it, so no screen
       and no sidebar hook fires a request before we know who is asking. */
    element: <WorkspaceGate><Shell /></WorkspaceGate>,
    /* A render error used to fall through to React Router's own developer
       page. Anything reached through a payment redirect has to fail into the
       product, not into a stack trace. */
    errorElement: <WorkspaceGate><Shell /></WorkspaceGate>,
    children: [
      { path: '/', element: <Overview /> },
      { path: '/analyses', element: <Analyses /> },
      /* Where a workbook becomes an analysis without the Sheets add-on. The
         add-on remains the fast path for people already living in a
         spreadsheet; this is the one that depends on nobody's approval. */
      { path: '/analyses/new', element: <Intake /> },
      { path: '/analyses/:id', element: <AnalysisRoute /> },
      { path: '/content', element: <Content /> },
      { path: '/content/setup', element: <ContentSetup /> },
      { path: '/businesses', element: <Businesses /> },
      { path: '/api-keys', element: <ApiKeys /> },
      { path: '/teams', element: <Teams /> },
      { path: '/agents', element: <Agents /> },
      /* The brand agent sits under agents because that is what it is: the
         first one a customer sets up, and the one every later assistant is
         briefed from. */
      { path: '/agents/brand', element: <Brand /> },
      /* Where the engine is granted permission to post. Its own route rather
         than a tab inside Content, because a customer revoking access should
         not have to walk through a content screen to find it. */
      { path: '/connections', element: <Connections /> },
      /* Where suggestions go in. Beside Content rather than inside it,
         because feeding the machine is a daily habit and burying it two
         clicks deep is how the queue runs dry. */
      { path: '/feed', element: <Feed /> },
      { path: '/more', element: <More /> },
      /* Stripe sends the browser back to these two. They are ordinary routes
         and not special cases: the success screen confirms against the engine
         rather than trusting the redirect that brought it here. */
      { path: '/billing/success', element: <CheckoutSuccess /> },
      { path: '/billing/cancel', element: <CheckoutCancel /> },
      /* The addresses the engine hardcodes today. A buyer lands on one of
         these, not on /billing/success, until the server is changed to honour
         the return URLs the portal sends it. Both were rendering the 404. */
      { path: '/checkout', element: <SubscriptionReturn /> },
      { path: '/settings/credits', element: <CreditsReturn /> },
      /* Facebook returns to the engine, which redirects to /settings with a
         marker. The portal has no settings screen and never has, so this used
         to be the 404 at the end of an otherwise successful connection. It
         forwards to the screen the customer started on, carrying the marker so
         that screen can say what happened. */
      { path: '/settings', element: <SocialReturn /> },
      { path: '/:id', element: <Stub /> },
      /* Everything else, at any depth. Without this, a two segment address
         matched no route at all and React Router printed "Unexpected
         Application Error! 404 Not Found" over the whole window. */
      { path: '*', element: <Stub /> }
    ]
  }
])

const app = <RouterProvider router={router} />

// Clerk wraps the tree only in live mode with a key present, so demo mode
// carries zero auth weight and the replit.app deployment stays self contained.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {!DEMO && CLERK_PUBLISHABLE_KEY
      ? <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} proxyUrl={CLERK_PROXY_URL}><ClerkTokenBridge />{app}</ClerkProvider>
      : app}
  </React.StrictMode>
)

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js') })
}
