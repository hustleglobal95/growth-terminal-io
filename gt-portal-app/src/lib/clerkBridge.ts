/** Bridges Clerk's React context to the plain fetch client in api.ts.
 *  When Clerk is mounted, main.tsx registers a token getter here; live
 *  requests then carry the session as an Authorization header, which works
 *  from any origin and does not depend on cookie domains at all. */
type Getter = () => Promise<string | null>
let getter: Getter | null = null
export function setClerkTokenGetter(g: Getter) { getter = g }
export async function getClerkToken(): Promise<string | null> {
  return getter ? getter() : null
}
