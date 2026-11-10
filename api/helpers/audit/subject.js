/**
 * Note the row that a request writes in req.audit, for the audit trail
 * (api/hooks/audit): the model identity, the row id, and the label (`name`,
 * else `username`, else '').
 *
 * Inputs: req, model (the identity), row (the written row, or null before it
 * is known), id (used when there is no row; '' for none).
 *
 * Usage: sails.helpers.audit.subject(req, model, created)
 */
module.exports = {
  friendlyName: 'Note the audit subject',
  description: 'Set the subject fields of req.audit from a written row.',
  sync: true,
  inputs: {
    req: {type: 'ref', required: true},
    model: {type: 'string', required: true},
    row: {type: 'ref', defaultsTo: null},
    id: {type: 'ref', defaultsTo: ''}
  },
  exits: {
    success: {description: 'req.audit is set.'}
  },
  fn: function ({req, model, row, id}) {
    req.audit = Object.assign({}, req.audit, {
      subjectType: model,
      subjectId: row ? row.id : id,
      subjectLabel: row ? (row.name || row.username || '') : ''
    });
  }
};
