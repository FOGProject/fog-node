/**
 * Write one audit row. The only code that creates an AuditLog row
 * (docs/adr/0003-audit-trail.md; 1.6 Audit::record).
 *
 * Inputs:
 *   req  the request, or null for a machine write with no request
 *   row  the caller keys: type, subjectType, subjectId, subjectLabel,
 *        permission, outcome, affectedCount, renderable, text, and the
 *        optional overrides createdBy and authSource
 *
 * It fills in what the caller did not set:
 *   createdBy      req.user.username, else (system)
 *   ip             req.ip, '' without a request
 *   authSource     req.authVia (apitoken, jwt) when set, else session when
 *                  req.user is set, else anonymous
 *   correlationId  req.correlationId (config/http.js), '' without a request
 *   subjectId      as a string; text is cut to 4096 characters
 *
 * It never throws: an audit write must not turn a working sign-in into a 500.
 * On any error it logs one warning that names the type and returns null. On
 * success it returns the row, and sets req.auditRecorded so the request seam
 * (api/hooks/audit) adds no second row for the request.
 *
 * Usage: await sails.helpers.audit.record.with({req, row: {type: 'auth.login', ...}})
 */
const MAX_TEXT = 4096;
const MACHINE_ACTOR = '(system)';

module.exports = {
  friendlyName: 'Record an audit row',
  description: 'Append one AuditLog row. Never throws; returns the row, or null.',
  inputs: {
    req: {type: 'ref', defaultsTo: null, description: 'The request, or null.'},
    row: {type: 'ref', required: true, description: 'The caller keys of the row.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'The stored row, or null when the write failed.'}
  },
  fn: async function ({req, row}) {
    const type = row && row.type;
    try {
      const has = (key) => row[key] !== undefined && row[key] !== null;
      const text = String(has('text') ? row.text : '').slice(0, MAX_TEXT);
      let authSource = 'anonymous';
      if (req && req.authVia) {
        authSource = req.authVia;
      } else if (req && req.user) {
        authSource = 'session';
      }
      const values = {
        createdBy: has('createdBy') ? String(row.createdBy) : ((req && req.user && req.user.username) || MACHINE_ACTOR),
        ip: (req && req.ip) || '',
        authSource: has('authSource') ? String(row.authSource) : authSource,
        type: String(type),
        subjectType: has('subjectType') ? String(row.subjectType) : '',
        subjectId: has('subjectId') ? String(row.subjectId) : '',
        subjectLabel: has('subjectLabel') ? String(row.subjectLabel) : '',
        permission: has('permission') ? String(row.permission) : '',
        correlationId: (req && req.correlationId) || '',
        affectedCount: has('affectedCount') ? Number(row.affectedCount) : 0,
        renderable: row.renderable === true,
        text
      };
      // Left out when unset, so the model default (unknown) applies.
      if (has('outcome')) { values.outcome = row.outcome; }
      const stored = await sails.models.auditlog.create(values).fetch();
      if (req) { req.auditRecorded = true; }
      return stored;
    } catch (err) {
      sails.log.warn(`audit: could not record ${type}: ${err && err.message ? err.message : err}`);
      return null;
    }
  }
};
