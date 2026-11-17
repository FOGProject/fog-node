/**
 * The plain-words summary of an AuditLog row, for the Activity page
 * (GET /activity, issue #206; 1.6 ActivityManagement.php).
 *
 * It is built at read time from the stored fields, so a row written before
 * this helper existed gets a summary too.
 *
 * - A renderable row: the event name, `, ` and the subject, then `: ` and the
 *   stored text. agent.enroll is "Agent enrollment", agent.token is "Agent
 *   token", any other type is shown as it is.
 * - An access.* row: a verb from the HTTP method that starts `text`, then the
 *   subject, then ` (N records)` when more than one record changed.
 * - Any other row: the stored text.
 *
 * The subject is the type, then the label in double quotes, else #id.
 *
 * Inputs: row (an AuditLog row, or any object with the same fields).
 *
 * Usage: sails.helpers.audit.summary.with({row})
 */
const EVENTS = {
  'agent.enroll': 'Agent enrollment',
  'agent.token': 'Agent token'
};
const VERBS = {DELETE: 'Deleted', PUT: 'Updated', PATCH: 'Updated', POST: 'Saved'};

module.exports = {
  friendlyName: 'Summarize an audit row',
  description: 'One plain sentence for an AuditLog row.',
  sync: true,
  inputs: {
    row: {type: 'ref', required: true}
  },
  exits: {
    success: {description: 'The summary string.'}
  },
  fn: function ({row}) {
    let subject = '';
    if (row.subjectType) {
      subject = row.subjectType;
      if (row.subjectLabel) {
        subject += ` "${row.subjectLabel}"`;
      } else if (row.subjectId) {
        subject += ` #${row.subjectId}`;
      }
    }
    const text = row.text || '';
    if (row.renderable === true) {
      const event = EVENTS[row.type] || row.type;
      return `${event}${subject ? `, ${subject}` : ''}: ${text}`;
    }
    if (typeof row.type === 'string' && row.type.startsWith('access.')) {
      const verb = VERBS[text.split(' ')[0]];
      if (verb) {
        const count = row.affectedCount > 1 ? ` (${row.affectedCount} records)` : '';
        return `${verb}${subject ? ` ${subject}` : ''}${count}`;
      }
    }
    return text;
  }
};
