/**
 * Record an `agent.enroll` audit row for an enrollment transition, as 1.6 does
 * (Agent/Enrollment.php `_audit`). Every decision leaves a row.
 *
 * The subject is the bound host (its name is the label), or the row's hostname
 * when the row has no host. The row is renderable (the 1.6 activity feed).
 * `by` is the admin who decided: the row is theirs, through the credential of
 * the request. With no `by` the agent itself caused it on the public route:
 * the row is `(system)` with the authSource `anonymous`.
 *
 * Inputs: req (the request, or null), row (an AgentEnrollment record), text
 * (the 1.6 text, e.g. `waiting: reissue`), by (the admin's user name, '' for
 * the agent). It never throws, as audit/record never does.
 *
 * Usage: await sails.helpers.agent.audit.with({req, row, text: 'waiting: reissue', by: ''})
 */
module.exports = {
  friendlyName: 'Audit an agent enrollment transition',
  description: 'Write the agent.enroll audit row of an enrollment transition.',
  inputs: {
    req: {type: 'ref', defaultsTo: null},
    row: {type: 'ref', required: true},
    text: {type: 'string', required: true},
    by: {type: 'string', defaultsTo: ''}
  },
  exits: {
    success: {description: 'The row was written, or the write failed and was logged.'}
  },
  fn: async function ({req, row, text, by}) {
    let label = row.hostname || '';
    try {
      const host = row.host ? await sails.models.host.findOne({id: row.host}) : undefined;
      if (host) { label = host.name; }
    } catch (err) {
      sails.log.warn(`audit: could not read the host of an enrollment: ${err.message}`);
    }
    const entry = {
      type: 'agent.enroll',
      subjectType: 'host',
      subjectId: row.host || '',
      subjectLabel: label,
      renderable: true,
      // 1.6 records these with its default outcome, allowed.
      outcome: 'allowed',
      text
    };
    if (by) {
      entry.createdBy = by;
    } else {
      entry.createdBy = '(system)';
      entry.authSource = 'anonymous';
    }
    await sails.helpers.audit.record.with({req, row: entry});
  }
};
