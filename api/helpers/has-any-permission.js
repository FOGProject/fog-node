/**
 * Whether a user's permissions grant anything at all.
 *
 * `permissions` is req.user.permissions, which the User model's customToJSON
 * builds from the user's roles (concatRoles). It is {} for a user with no
 * role. A role whose flags are all false grants nothing either, because
 * access is deny-by-default (api/policies/read.js). So the answer is true
 * only when some leaf of the tree is exactly true.
 *
 * views/layouts/layout.ejs shows the FOG 1.6 no-role banner when this is
 * false (1.6 management/other/index.php: !count(Authorization::getPermissions())).
 *
 * Usage: sails.helpers.hasAnyPermission.with({permissions})
 * It returns the boolean itself, with no .now(): see api/helpers/page-title.js.
 */
function anyTrue(node) {
  if (node === true) return true;
  if (!node || typeof node !== 'object') return false;
  return Object.keys(node).some((key) => anyTrue(node[key]));
}

module.exports = {
  friendlyName: 'Has any permission',
  description: 'True when some leaf of a permissions tree is true.',
  sync: true,
  inputs: {
    permissions: {type: 'ref', description: 'req.user.permissions: nested objects of boolean flags.'}
  },
  exits: {
    success: {outputType: 'boolean'}
  },
  // A sync machine must answer through exits.success. A plain return value
  // makes the call throw "not actually synchronous".
  fn: function ({permissions}, exits) {
    return exits.success(anyTrue(permissions));
  }
};
