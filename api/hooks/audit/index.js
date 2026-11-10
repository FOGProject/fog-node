/**
 * audit hook: the request seam of the audit trail
 * (docs/adr/0003-audit-trail.md).
 *
 * It records the generic header of a request on the response's `finish`
 * event, through sails.helpers.audit.record, unless the request already wrote
 * its own row (req.auditRecorded: sign-in, sign-out, the agent token and
 * enrollment decisions).
 *
 * Covered:
 *   - any request whose response status is 401 or 403 (a denial), and
 *   - any POST, PUT, PATCH or DELETE by an authenticated user (req.user).
 *
 * Not covered (no row):
 *   - an allowed GET, HEAD or OPTIONS (1.6 ADR 0021 Decision 12: an allowed
 *     read writes no row, a denied read does),
 *   - an allowed request to an action in READ_ACTIONS (reads that use POST),
 *   - a path under /agent/v1/ (the agent protocol records its own events),
 *   - the sign-in and sign-out actions (they record their own events),
 *   - an asset path, and /csrfToken.
 *
 * The controllers and policies describe the action by setting req.audit
 * (permission, subjectType, subjectId, subjectLabel, affectedCount, and an
 * outcome when the status says otherwise) before they answer. The seam reads
 * it when the response finishes. A set req.audit.outcome wins over the status:
 * a full-page save that fails answers 302, and that is not "allowed".
 *
 * Where it attaches: the correlationId middleware in config/http.js calls
 * sails.hooks.audit.watch(req, res) for every request. That runs ahead of the
 * router, so it also sees the answers that Sails gives before any hook route
 * runs, such as a Sails CSRF refusal.
 */

// The actions that only read but use POST (matched on req.options.action). An
// allowed request to one of them writes no row. A denied one still does.
const READ_ACTIONS = [
  'general/datatable',
  'general/columns',
  'task-history',
  // The pending hosts DataTable (a POST read, like general/datatable).
  'host/pending-datatable',
  // Signs a JWT for the user and changes no record.
  'auth/token'
];

// These record their own events (api/controllers/auth/login.js, logout.js).
const OWN_EVENT_ACTIONS = ['auth/login', 'auth/logout'];

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
// The agent protocol path (api/controllers/agent/enroll.js records its own events).
const AGENT_PREFIX = '/agent/v1/';

module.exports = function defineAuditHook(sails) {
  // The row of a finished request, or undefined when it writes none.
  const rowOf = (req, res) => {
    const method = String(req.method || 'GET').toUpperCase();
    const path = req.path || '';
    const action = req.options && req.options.action;
    if (path.startsWith(AGENT_PREFIX) || path === '/csrfToken') { return undefined; }
    if (req.url && sails.LOOKS_LIKE_ASSET_RX.test(req.url)) { return undefined; }
    if (OWN_EVENT_ACTIONS.includes(action)) { return undefined; }

    const status = res.statusCode;
    const denied = status === 401 || status === 403;
    if (!denied) {
      if (!WRITE_METHODS.includes(method) || !req.user) { return undefined; }
      if (READ_ACTIONS.includes(action)) { return undefined; }
    }

    const audit = req.audit || {};
    const summary = `${method} ${path}`;
    let outcome = 'failed';
    if (denied) {
      outcome = 'denied';
    } else if (status >= 200 && status < 400) {
      outcome = 'allowed';
    }
    // A controller that knows better (a failed page save answers 302) says so.
    if (audit.outcome) { outcome = audit.outcome; }
    const text = outcome === 'failed' ? `HTTP ${status} ${summary}` : summary;
    return {
      type: path.startsWith('/api/') ? 'access.api' : 'access.page',
      outcome,
      text,
      permission: audit.permission || '',
      subjectType: audit.subjectType || '',
      subjectId: audit.subjectId === undefined ? '' : audit.subjectId,
      subjectLabel: audit.subjectLabel || '',
      affectedCount: audit.affectedCount || 0
    };
  };

  return {
    // Record the request when its response finishes. Called once per request
    // by the correlationId middleware (config/http.js).
    watch: function (req, res) {
      res.once('finish', async () => {
        // The helper never throws. rowOf could, on a request shape that this
        // code did not expect, and that must not stop the server.
        try {
          if (req.auditRecorded) { return; }
          const row = rowOf(req, res);
          if (row) { await sails.helpers.audit.record.with({req, row}); }
        } catch (err) {
          sails.log.warn(`audit: could not read the request: ${err && err.message ? err.message : err}`);
        }
      });
    }
  };
};
