/** Bridges Clerk's React context to the plain fetch client in api.ts.
 *  When Clerk is mounted, main.tsx registers a token getter here; live
 *  requests then carry the session as an Authorization header, which works
 *  from any origin and does not depend on cookie domains at all. */
type Getter = () => Promise<string | null>
let getter: Getter | null = null
export function setClerkTokenGetter(g: Getter) { getter = g }

/** Never let a stalled Clerk block data. The session cookie already rides
 *  on every request via credentials include, so the Bearer header is a
 *  bonus, not a requirement: if Clerk has not produced a token within
 *  three seconds, proceed without it. */
export async function getClerkToken(): Promise<string | null> {
  if (!getter) return null
  try {
    return await Promise.race([
      getter(),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 3000))
    ])
  } catch {
    return null
  }
}
