import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Shell } from './components/Shell'
import { Overview, Analyses, Businesses, Clients, ApiKeys, Teams, Stub } from './screens/simple'
import { Detail } from './screens/Detail'
import { Login } from './screens/Login'
import './styles/portal.css'

const router = createBrowserRouter([
  { path: '/login', element: <Login /> },
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Overview /> },
      { path: '/analyses', element: <Analyses /> },
      { path: '/analyses/:id', element: <Detail /> },
      { path: '/businesses', element: <Businesses /> },
      { path: '/api-keys', element: <ApiKeys /> },
      { path: '/teams', element: <Teams /> },
      { path: '/clients', element: <Clients /> },
      { path: '/:id', element: <Stub /> }
    ]
  }
])

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
)

if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js') })
}
