import React, { useEffect, useState } from 'react'
import { DEMO } from '../config'
import {
  clearWorkspace, resolveWorkspace, workspaceBelongsTo,
  workspaceResolveTrace, workspaceResolveWasUnauthenticated
} from '../lib/api'

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
 *  A stored workspace is now only honoured for the user it was stored for.
 *  Removing the constant fixed the clean browser; it did nothing for a used
 *  one, where the previous account's workspace sat in storage waiting to be
 *  handed to whoever signed in next. Both are the same mistake, which is
 *  trusting an id nobody checked.
 *
 *  When the answer cannot be found, this says so and stops. A workspace is
 *  not something to guess at twice.
 */

const TRIES = 6
const GAP = 450
const CLERK_WAIT = 6000

type State = 'resolving' | 'ready' | 'unknown'

type ClerkGlobal = {
  loaded?: boolean
  user?: { id?: string } | null
  signOut?: (o?: object) => Promise<void>
}

function clerkNow(): ClerkGlobal | undefined {
  return (window as unknown as { Clerk?: ClerkGlobal }).Clerk
}

/** Who is signed in, once Clerk is in a position to say. Before it loads, its
 *  answer is not "nobody", it is "not yet", and treating those as the same
 *  thing is how a browser ends up trusting the last user's workspace. */
async function clerkUserId(): Promise<string | null> {
  const t0 = Date.now()
  for (;;) {
    const c = clerkNow()
    if (c && c.loaded) return (c.user && c.user.id) || null
    if (Date.now() - t0 > CLERK_WAIT) return null
    await new Promise(r => setTimeout(r, 100))
  }
}

function uidNow(): string | null {
  const c = clerkNow()
  if (!c || !c.loaded) return null
  return (c.user && c.user.id) || null
}

export function WorkspaceGate({ children }: { children: React.ReactNode }) {
  /* Demo mode never talks to the engine. Otherwise the only free pass is a
     stored workspace that this exact user resolved, which is knowable without
     waiting when Clerk has already loaded, as it has on any navigation after
     the first. */
  const [state, setState] = useState<State>(
    DEMO || workspaceBelongsTo(uidNow()) ? 'ready' : 'resolving'
  )

  useEffect(() => {
    if (state !== 'resolving') return
    let alive = true

    const attempt = async (left: number, uid: string | null): Promise<void> => {
      const id = await resolveWorkspace(uid).catch(() => null)
      if (!alive) return
      if (id) { setState('ready'); return }
      /* Clerk registers its token getter in an effect, so the first attempt
         can land a moment before there is a session to ask with. Retrying a
         couple of times costs a second and removes a whole class of false
         negative. */
      if (left > 1) {
        setTimeout(() => { if (alive) void attempt(left - 1, uid) }, GAP)
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

    const settle = async () => {
      const uid = await clerkUserId()
      if (!alive) return
      /* Anything in storage this user did not resolve goes, including an id
         from before ownership was recorded. Discarding a workspace costs one
         request. Keeping the wrong one costs somebody else's data. */
      if (!workspaceBelongsTo(uid)) clearWorkspace()
      void attempt(TRIES, uid)
    }

    void settle()
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
              clearWorkspace()
              const clerk = clerkNow()
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
