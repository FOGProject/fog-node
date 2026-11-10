# 3. The audit trail: one append-only header per audited action

- Status: **Accepted**
- Date: 2026-11-10

## Context

- fog-node recorded nothing about a sign-in, a failed sign-in, a denied request,
  an administrator's write or an agent approval.
- FOG 1.6 has an audit trail (fogproject ADR 0021). This ADR ports the parts of it
  that the agent mTLS work needs first.
- ADR 0021 numbers its decisions. This ADR names them as "1.6 decision N".

## Decision

Ported from 1.6, with the same meaning (1.6 decisions 1, 3, 4, 5 and the agent
part of 7):

- `AuditLog` holds one row per audited action (1.6 decision 1). It is a
  projection for the activity feed through `renderable` and `type`. A later brief
  adds the change table `AuditChange`.
- A machine-originated write gets a row with a synthetic actor, `(system)`, and
  an empty `permission`, which means that no authorization ran (1.6 decision 4).
  Only the fog-agent enrollment route does this so far. The imaging boot and task
  paths come later.
- `outcome` defaults to `unknown`, so an incomplete row never claims `allowed`.
  The other values are `allowed`, `denied`, `failed` and `partial` (1.6
  decision 11).
- An allowed read writes no row. A denied read writes one (1.6 decision 12).
- Nothing writes, changes or deletes a row except `api/helpers/audit/record.js`.
  The model has no `stock.auditlog` entry in `config/permissions.js`, so the
  generic `/api/v1/:model` routes refuse it (1.6 decision 8, the route part). The
  least-privilege database grant is a deployment choice, as in 1.6.
- An audit write never breaks the request. The helper catches every error, logs
  one warning that names the `type`, and returns `null`.
- Nothing is backfilled.
- The model keeps the 1.6 columns and leaves out the impersonation columns
  `actedAs` and `spanID`. The indexes are `createdAt`, `createdBy`,
  `correlationId`, `outcome` and `{subjectType, subjectId}`. None is unique: a
  unique key would merge two identical events.

The events:

| Event | Where |
|---|---|
| `auth.login`, `auth.login.failed`, `auth.logout`, `auth.token.rejected` | `auth/login`, `auth/logout`, `policies/isLoggedIn` |
| `access.api`, `access.page` | the request seam, `api/hooks/audit` |
| `agent.enroll`, `agent.token` | the enrollment route, the admin decision and the token routes, with the 1.6 texts |

A failed sign-in stores the attempted name and no reason, to avoid user
enumeration (1.6 stores none either).

## Differences from 1.6

- The correlation id is set per request. A middleware in `config/http.js` puts
  `req.correlationId` on the request object. 1.6 keeps it in static state, which
  is per request in PHP. Node serves requests concurrently, so module state would
  mix them.
- The seam is the response `finish` event, not the authorization gate. fog-node
  has no one gate: eight policies and about twenty inline checks answer 403.
  `api/hooks/audit` sees the status of every response it covers. The policies and
  the controllers describe the action through `req.audit` (`permission`,
  `subjectType`, `subjectId`, `subjectLabel`, `affectedCount`) before they answer.
  The hook writes the row after the response, so a test that expects a row polls
  for it.
- A row covers a request that gets 401 or 403, and a `POST`, `PUT`, `PATCH` or
  `DELETE` by an authenticated user. The hook skips the allowed reads that use
  `POST` (listed in `READ_ACTIONS` in the hook), the `/agent/v1/` paths, the
  sign-in and sign-out routes (they record their own events), assets and
  `/csrfToken`. A request that already wrote its own row (`req.auditRecorded`)
  gets no second row.
- Ids are strings (`subjectId`), because Mongo ids are strings. 1.6 uses integers.
- `authSource` names how the request authenticated: `session`, `apitoken`, `jwt`,
  `local` (the sign-in itself), `anonymous` or `agent`. `isLoggedIn` sets
  `req.authVia` to `jwt` for the JWT strategy. A plain browser session sets
  nothing, and the helper reads that as `session`.
- No row holds a before and after value yet.
- `req.ip` is the socket address unless Express trusts the proxy. The default is
  `trustProxy: false` in `config/http.js`. Behind a reverse proxy, set
  `http: {trustProxy: true}` in `config/local.js` (see `docs/install.md`).

## Later

- Change rows with redaction (1.6 decisions 5 to 7): `AuditChange`, the
  before and after values, and the redaction of a credential field.
- The `audit.view` and `audit.manage` permissions, and the Audit Log page.
- Retention, and the rule that shrinking the trail writes a row first (1.6
  decision 10).
- The machine paths other than the agent enrollment route.

## Consequences

- A new write path needs no audit code if it goes through a route that the hook
  covers. A controller that knows more (the subject, the count) sets `req.audit`.
  A controller that records its own event calls
  `sails.helpers.audit.record.with({req, row})`.
- The seam sees every response, a Sails CSRF refusal of a page form included,
  because the `correlationId` middleware in `config/http.js` attaches it. That
  middleware runs ahead of the router.
- A full-page save that fails answers 302. `general/save` sets
  `req.audit.outcome` (`denied` for a refused group change, `failed` for any other
  error), and the seam uses it in place of the status.
- At the end of a run, the test suite (`test/lifecycle.test.js`) deletes the
  `AuditLog` rows that meet both conditions:
  - `createdAt` is at or after the start of the run.
  - `createdBy` is `mochatestadmin` or starts with one of `PREFIXES`, or
    `subjectLabel` starts with one of `PREFIXES`.
  The one test that checks the `agent-<fingerprint>` fallback host name also deletes
  the rows of the hosts it made, by `subjectId`. A dev server that shares the
  database keeps all its other rows. The rows of anonymous denied requests and the
  `auth.token.rejected` rows of the suite have no name, so they stay.
