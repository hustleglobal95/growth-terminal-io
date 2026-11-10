# Studio Operations: shared storage and lead intake contract

This document defines the follow-on backend work required before the browser-local Studio screen becomes a reliable multi-user workspace. The UI is already implemented on this branch. It is not a substitute for the backend.

## Current status

- The Studio screen is a browser-local prototype with create, edit, stage changes, follow-ups, CSV export and bounded CSV import.
- Storage keys are partitioned by the current Clerk user and workspace identifiers in the browser. This is a usability measure, not secure access control.
- The existing lead finder is gated by `LEADS_PATH`; that configuration is currently empty. Therefore the server lead-import button is not shown. The CSV import can be used without the lead API.
- No shared pipeline records have been stored on the server and no lead emails have been sent.
- Existing analysis, content and billing services must remain unchanged.

## Required backend API

Create new, separately authorized routes only after the server implementation repository and deployment target are verified:

- `GET /api/v1/studio/opportunities`: list records in the authenticated workspace, with cursor pagination and updated timestamps.
- `POST /api/v1/studio/opportunities`: validate and create one opportunity, returning an ID, version and timestamps.
- `PATCH /api/v1/studio/opportunities/:id`: compare-and-swap update using the previous version.
- `DELETE /api/v1/studio/opportunities/:id`: authenticated, auditable deletion, with confirmation and retention policy.
- `POST /api/v1/studio/imports/leads`: opt-in import of selected saved leads belonging to the same workspace. Must use existing lead IDs as idempotency keys. Never send emails as a side effect.

Every route must verify Clerk authentication server-side, then resolve membership and permissions for the workspace from trusted server data. Never trust an arbitrary `X-Workspace-Id` alone. An unauthenticated caller gets 401; a caller without access gets 403; a missing record in an authorized workspace gets 404. Workspace data must never be returned across tenant boundaries.

## Suggested schema

`studio_opportunities`: UUID id, UUID workspace_id, optional UUID source_lead_id, company, contact_name, contact_email, website, stage enum, proposed_value_cents integer, next_action, follow_up_on date, notes, created_by, updated_by, created_at, updated_at, version integer.

Required indexes: `(workspace_id, updated_at)`, `(workspace_id, follow_up_on)`, unique `(workspace_id, source_lead_id)` when source lead ID is present.

Stages: Prospect, Contacted, Discovery, Proposal, Won, Production, Delivered, Lost. Explicitly distinguish proposed value from invoiced or received revenue. Won does not imply payment.

## Security and operations acceptance tests

1. Unauthenticated requests cannot read or write records.
2. A user from workspace A cannot access a record from workspace B, including by guessing the ID.
3. Read-only members cannot mutate records.
4. Repeating an import does not create duplicates.
5. Invalid value, stage, email and oversized notes are rejected with clear errors.
6. Concurrent updates report a version conflict instead of silently overwriting changes.
7. Audit logs contain actor, workspace, record ID and action, but do not leak personal information or credentials.
8. Browser UI handles loading, saving, errors, pagination and offline states honestly.
9. Confirm explicit consent and the contact source before any outreach. No automatic mailing is part of this change.
10. Verify migration from local browser records via user-reviewed import/export, then remove reliance on local storage.

## Launch gate

Do not merge as a production multi-user CRM until the backend, tests, deployment environment, and security review are complete. The draft PR is appropriate for isolated prototype review. Preserve legacy analysis behavior and current brand assets.
