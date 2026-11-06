/**
 * The permissions that a set of roles grants.
 *
 * `roles` is an array of {isAdmin, permissions}: Role records, or the values
 * of a Role that is being saved. The result is a new tree with the shape of
 * sails.config.permissions (config/permissions.js plus the plugin entries
 * from api/hooks/plugins). Every leaf is true when any role is an admin role.
 * Otherwise a leaf is true when any role holds exactly `true` at that path.
 * Every other leaf is false.
 * So several roles combine as a union, and a key that is not in the defaults
 * never appears.
 *
 * It never writes to sails.config.permissions or to `roles`. It replaces the
 * filterPermissions that Role.js and User.js each held (issue #168). That
 * code merged a role into sails.config.permissions with _.extend. So the
 * first limited role to save, show or sign in replaced the shared defaults.
 *
 * Usage: sails.helpers.permissions.resolve.with({roles})
 * It returns the tree itself, with no .now(): see api/helpers/page-title.js.
 */
function grant(defaults, roles, isAdmin, path) {
  const out = {};
  Object.keys(defaults).forEach((key) => {
    // An array path, so a plugin key that holds a dot stays one key.
    const at = path.concat(key);
    const node = defaults[key];
    out[key] = node !== null && typeof node === 'object' ?
      grant(node, roles, isAdmin, at) :
      isAdmin || roles.some((role) => _.get(role.permissions, at) === true);
  });
  return out;
}

module.exports = {
  friendlyName: 'Resolve permissions',
  description: 'The permissions tree that a set of roles grants, in the shape of the defaults.',
  sync: true,
  inputs: {
    roles: {type: 'ref', required: true, description: 'An array of {isAdmin, permissions}.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'A new tree with the shape of sails.config.permissions.'}
  },
  // A sync machine must answer through exits.success. A plain return value
  // makes the call throw "not actually synchronous".
  fn: function ({roles}, exits) {
    // Exactly true, as for a leaf: the widest grant gets the strictest check.
    const isAdmin = roles.some((role) => role.isAdmin === true);
    return exits.success(grant(sails.config.permissions, roles, isAdmin, []));
  }
};
