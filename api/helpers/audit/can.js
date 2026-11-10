/**
 * Check a permission of the request's user, and record the permission it
 * consulted in req.audit.permission, for the audit trail (api/hooks/audit).
 * The permission goes in before the answer, so a denial carries it.
 *
 * Inputs: req, permission (`<model>.<action>`, e.g. host.update).
 * Output: true when req.user holds it (req.user.permissions.stock.<model>.<action>).
 *
 * Usage: if (!sails.helpers.audit.can(req, 'host.update')) { return res.forbidden(); }
 */
module.exports = {
  friendlyName: 'Check and note a permission',
  description: 'Set req.audit.permission and tell whether the user holds the permission.',
  sync: true,
  inputs: {
    req: {type: 'ref', required: true},
    permission: {type: 'string', required: true}
  },
  exits: {
    success: {outputType: 'boolean', description: 'Whether the user holds the permission.'}
  },
  fn: function ({req, permission}) {
    _.set(req, 'audit.permission', permission);
    return Boolean(_.get(req, 'user.permissions.stock.' + permission));
  }
};
