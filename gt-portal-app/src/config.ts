/** The only file to touch when wiring the live API.
 *
 * DEMO true renders the bundled sample workspace with no network calls.
 * DEMO false points every request at API_BASE with the confirmed routes:
 *   GET  /api/v1/me
 *   POST /api/v1/data/ingest            body { raw, sourceType, sourceRef, idempotencyKey }
 *   PUT  /api/v1/data/snapshots/:id/confirm
 *   POST /api/v1/analyses               body { snapshotId }
 *   GET  /api/v1/analyses/:id
 *
 * Two answers are still needed from the backend before DEMO can be false:
 *   1. How portal users authenticate (session cookie vs bearer token).
 *   2. CORS allowing this app's origin on /api/v1.
 */
export const DEMO = true
export const API_BASE = 'https://growthterminal.io'
export const PORTAL_LEGACY = 'https://growthterminal.io/portal'
