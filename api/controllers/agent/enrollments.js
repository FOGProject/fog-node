/**
 * GET /api/v1/agent/enrollments
 *
 * The pending fog-agent enrollment requests, oldest first, for the admin
 * (contract 6.1 and 6.2). Needs host.read. Never returns the CSR or the cert.
 * These admin routes follow fog-node's conventions (camelCase, ms timestamps),
 * not the agent wire format.
 */
module.exports = {
  friendlyName: 'Agent enrollments',
  description: 'List the pending agent enrollment requests.',
  fn: async function () {
    const res = this.res;
    if (!sails.helpers.audit.can(this.req, 'host.read')) {
      return res.forbidden();
    }
    const rows = await sails.models.agentenrollment.find({state: 'pending'}).sort('createdAt ASC');
    return res.json({
      data: rows.map((row) => ({
        id: row.id,
        hostID: row.host,
        hostname: row.hostname,
        os: row.os,
        arch: row.arch,
        agentVersion: row.agentVersion,
        remoteIp: row.remoteIp,
        reason: row.reason,
        fingerprint: row.fingerprint,
        identity: row.identity,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt
      }))
    });
  }
};
