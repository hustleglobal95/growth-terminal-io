/** Where Facebook's round trip actually lands.
 *
 *  The engine builds its own return address and sends the browser to
 *  /settings?social=connected on this domain. The portal has no settings
 *  screen, so that was a 404 at the end of a connection that had in fact
 *  worked: the account was saved, and the customer was told the page did not
 *  exist. Rather than change the address on the engine and redeploy it to fix
 *  a portal route, the portal answers at the address the engine already uses,
 *  the same way it already does for the two Stripe returns beside it.
 *
 *  It forwards rather than rendering the screen itself, so the customer ends
 *  up on /connections in their history, which is where they will look for
 *  this again.
 */
import { Navigate, useLocation } from 'react-router-dom'

export function SocialReturn() {
  const loc = useLocation()
  const marker = new URLSearchParams(loc.search).get('social')
  const keep = marker ? '?social=' + encodeURIComponent(marker) : ''
  return <Navigate to={'/connections' + keep} replace />
}
