import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Shell } from './components/Shell'
import { Overview, Analyses, Businesses, Clients, ApiKeys, Stub } from './screens/simple'
import { Teams } from './screens/Teams'
import { Content } from './screens/Content'
import { ContentSetup } from './screens/ContentSetup'
import { AnalysisRoute } from './screens/LiveDetail'
import { Login } from './screens/Login'
import { ClerkProvider, useAuth } from '@clerk/clerk-react'
import { setClerkTokenGetter } from './lib/clerkBridge'

function ClerkTokenBridge() {
  const { getToken } = useAuth()
  React.useEffect(() => { setClerkTokenGetter(() => getToken()) }, [getToken])
  return null
}
import { DEMO, CLERK_PUBLISHABLE_KEY, CLERK_PROXY_URL } from './config'
import './styles/portal.css'

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Overview /> },
      { path: '/analyses', element: <Analyses /> },
      { path: '/analyses/:id', element: <AnalysisRoute /> },
      { path: '/content', element: <Content /> },
      { path: '/content/setup', element: <ContentSetup /> },
      { path: '/businesses', element: <Businesses /> },
      { path: '/api-keys', element: <ApiKeys /> },
      { path: '/teams', element: <Teams /> },
      { path: '/clients', element: <Clients /> },
      { path: '/:id', element: <Stub /> }
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
