/**
 * POST /api/v1/agent-activity/summary
 *
 * One entry per host that has agent rows, for the Agent Activity page
 * (GET /agent-activity): {hosts: [{hostId, hostName, count, latest}]}, the host
 * with the newest row first. `latest` is the host's newest row, as
 * {id, createdAt, type, text, outcome}. Needs agentactivity.view.
 *
 * The rows are the AuditLog rows with a type that starts with `agent.`, the
 * subject type `host` and a subject id. Today that is the `agent.enroll` rows
 * of an enrollment bound to a host and of a renewal. An `agent.token` row has
 * the subject type `agentenrolltoken`, so it does not match.
 *
 * It groups in the database with a native aggregation (the Mongo driver, as
 * api/helpers/image/aquire-read-lock.js does), because Waterline has no group.
 * At most MAX_HOSTS hosts (1.6 bound). `hostName` is the current Host name; a
 * host that is gone shows its stored label followed by " (deleted)".
 */
const MAX_HOSTS = 5000;

module.exports = {
  friendlyName: 'Agent activity summary',
  description: 'The agent rows of the audit trail, one entry per host.',
  fn: async function () {
    const req = this.req;
    const res = this.res;
    if (!sails.helpers.audit.can(req, 'agentactivity.view')) {
      return res.forbidden();
    }
    const db = sails.models.auditlog.getDatastore().manager;
    const groups = await db.collection(sails.models.auditlog.tableName).aggregate([
      {$match: {type: {$regex: '^agent\\.'}, subjectType: 'host', subjectId: {$ne: ''}}},
      // The tie-break of api/controllers/audit/datatable.js: createdAt, then id, newest first.
      {$sort: {createdAt: -1, _id: -1}},
      {$group: {
        _id: '$subjectId',
        count: {$sum: 1},
        latestId: {$first: '$_id'},
        latestAt: {$first: '$createdAt'},
        type: {$first: '$type'},
        text: {$first: '$text'},
        outcome: {$first: '$outcome'},
        label: {$first: '$subjectLabel'}
      }},
      {$sort: {latestAt: -1, latestId: -1}},
      {$limit: MAX_HOSTS}
    ]).toArray();

    const hosts = await sails.models.host.find({id: {in: groups.map((g) => g._id)}}).select(['name']);
    const names = new Map(hosts.map((h) => [String(h.id), h.name]));
    return res.json({
      hosts: groups.map((g) => ({
        hostId: g._id,
        hostName: names.has(g._id) ? names.get(g._id) : `${g.label} (deleted)`,
        count: g.count,
        latest: {id: String(g.latestId), createdAt: g.latestAt, type: g.type, text: g.text, outcome: g.outcome}
      }))
    });
  }
};
