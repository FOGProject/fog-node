/*
 * AuditLog.js
 *
 * @description :: The audit trail: one append-only row per audited action
 *                 (docs/adr/0003-audit-trail.md). A port of the FOG 1.6
 *                 `auditLog` table (ADR 0021), without the impersonation
 *                 columns. `createdAt` is the global auto timestamp.
 *
 * Only api/helpers/audit/record.js writes a row. The model has no
 * `stock.auditlog` entry in config/permissions.js, so the generic
 * /api/v1/:model routes refuse it, and nothing in the app updates or
 * destroys a row. The indexes are made at bootstrap by
 * api/helpers/audit/ensure-indexes.js.
 *
 * The defaults matter: with `schema: true` an unset attribute is stored as
 * its default, and `outcome` defaults to `unknown` so an incomplete row never
 * claims `allowed` (1.6 does the same).
 */
module.exports = {
  attributes: {
    // The actor's user name; (system) for a write no person made; the
    // attempted user name on a failed sign-in.
    createdBy: {type: 'string', defaultsTo: ''},
    ip: {type: 'string', defaultsTo: ''},
    // How the REQUEST authenticated: session, apitoken, jwt, local, anonymous, agent.
    authSource: {type: 'string', defaultsTo: ''},
    // The dot-namespaced event type, e.g. auth.login or access.api.
    type: {type: 'string', defaultsTo: ''},
    subjectType: {type: 'string', defaultsTo: ''},
    subjectId: {type: 'string', defaultsTo: ''},
    // The subject's name at the time, so it survives a delete.
    subjectLabel: {type: 'string', defaultsTo: ''},
    // The permission consulted. '' means no authorization ran.
    permission: {type: 'string', defaultsTo: ''},
    outcome: {
      type: 'string',
      isIn: ['unknown', 'allowed', 'denied', 'failed', 'partial'],
      defaultsTo: 'unknown'
    },
    correlationId: {type: 'string', defaultsTo: ''},
    affectedCount: {type: 'number', defaultsTo: 0},
    // 1.6's activity-feed flag.
    renderable: {type: 'boolean', defaultsTo: false},
    // Untranslated machine detail, cut to 4096 characters by the helper.
    // Never a password, token or key.
    text: {type: 'string', defaultsTo: ''}
  }
};
