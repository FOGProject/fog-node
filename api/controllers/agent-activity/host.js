/**
 * POST /api/v1/agent-activity/host
 *
 * The agent rows of one host, for the expand toggle of the Agent Activity page
 * (GET /agent-activity). The body is {hostId}. It returns {rows, total, limit}: the
 * host's rows, newest first, at most ROWS_PER_HOST (1.6 bound), each as
 * {id, createdAt, type, text, outcome}. `total` counts all of the host's rows,
 * and `limit` is ROWS_PER_HOST. A missing, non-string or empty hostId answers
 * 400. Needs agentactivity.view.
 *
 * The rows are the `agent.*` rows of that host id, as in
 * agent-activity/summary.js. The id must not be empty: the hostless agent rows
 * have the subject id '' and are not shown on this page.
 */
const ROWS_PER_HOST = 500;

module.exports = {
  friendlyName: 'Agent activity of a host',
  description: 'The agent rows of one host, newest first.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!sails.helpers.audit.can(req, 'agentactivity.view')) {
      return res.forbidden();
    }
    const hostId = req.body && req.body.hostId;
    // A string only: an object would be read as a Waterline criteria modifier.
    if (typeof hostId !== 'string' || hostId === '') {
      return res.status(400).json({message: 'hostId must be a non-empty string'});
    }
    // Waterline normalizes criteria in place, so each query gets its own copy.
    const where = () => ({type: {startsWith: 'agent.'}, subjectType: 'host', subjectId: hostId});
    const total = await sails.models.auditlog.count(where());
    const rows = await sails.models.auditlog.find(where()).sort([{createdAt: 'DESC'}, {id: 'DESC'}]).limit(ROWS_PER_HOST);
    return res.json({
      total,
      limit: ROWS_PER_HOST,
      rows: rows.map((r) => ({id: String(r.id), createdAt: r.createdAt, type: r.type, text: r.text, outcome: r.outcome}))
    });
  }
};
