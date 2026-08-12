import React, { useEffect, useState } from 'react'
import { DEMO } from '../config'
import { getWorkspaceId, resolveWorkspace, workspaceResolveTrace, workspaceResolveWasUnauthenticated } from '../lib/api'

/** Nothing authenticated renders until we know which workspace this account
 *  belongs to.
 *
 *  The portal used to answer that question with a constant, so a browser that
 *  had never stored a workspace sent the same one every time: the owner's. A
 *  new account signing in on a clean browser inherited it. That is the bug
 *  this gate closes, and the reason it is a gate rather than a lazy lookup is
 *  that every screen starts fetching the moment it mounts. Resolve first, or
 *  the first thing a new user sees is a page of failed requests.
 *
 *  When the answer cannot be found, this says so and stops. A workspace is
 *  not something to guess at twice.
 */

const TRIES = 6
const GAP = 450

type State = 'resolving' | 'ready' | 'unknown'

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  /* Demo mode never talks to the engine, and a browser that already knows its
     workspace has nothing to wait for. */
  const [state, setState] = useState<State>(
    DEMO || getWorkspaceId() ? 'ready' : 'resolving'
  )

  useEffect(() => {
    if (state !== 'resolving') return
    let alive = true

    const attempt = async (left: number): Promise<void> => {
      const id = await resolveWorkspace().catch(() => null)
      if (!alive) return
      if (id) { setState('ready'); return }
      /* Clerk registers its token getter in an effect, so the first attempt
         can land a moment before there is a session to ask with. Retrying a
         couple of times costs a second and removes a whole class of false
         negative. */
      if (left > 1) {
        setTimeout(() => { if (alive) void attempt(left - 1) }, GAP)
        return
      }
      /* Out of attempts. If every one of them was refused for want of a
         session then this really is a signed out browser and the sign in
         screen is the honest destination. Anything else means we are signed
         in and simply have no workspace, which is a message, not a redirect.
         Getting this the wrong way round is a sign in loop. */
      if (workspaceResolveWasUnauthenticated()) { window.location.assign('/login'); return }
      setState('unknown')
    }

    void attempt(TRIES)
    return () => { alive = false }
  }, [state])

  if (state === 'resolving') {
    return (
      <div className="scr on">
        <div className="wsgate" aria-busy="true">
          <span className="skel" style={{ width: 190 }} />
          <span className="skel" style={{ width: 260 }} />
          <span className="wsgatemut">Opening your workspace.</span>
        </div>
      </div>
    )
  }

  if (state === 'unknown') {
    return (
      <div className="scr on">
        <div className="wsgate">
          <b>This account is not in a workspace yet.</b>
          <span className="wsgatemut">You are signed in, but the engine does not have a
            workspace for this account, so there is nothing here to show you. If you have
            just been invited, the invitation may not have been accepted yet.</span>
          {workspaceResolveTrace().length > 0 && (
            <ul className="wsgatewhy">
              {workspaceResolveTrace().map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          )}
          <div className="wsgaterow">
            <button className="btn p" onClick={() => window.location.reload()}>Try again</button>
            <button className="ract" onClick={() => {
              const clerk = (window as unknown as { Clerk?: { signOut?: (o?: object) => Promise<void> } }).Clerk
              if (clerk && clerk.signOut) void clerk.signOut({ redirectUrl: '/login' })
              else window.location.assign('/login')
            }}>Sign out</button>
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
