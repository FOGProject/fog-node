/**
 * The group permission check of a membership change, as the pinned FOG 1.6
 * splits it (HostManagement.php ~6855-6880): a membership change is a group
 * edit, so it needs `group.update`; a name that has no Group creates one, so
 * it needs `group.create` as well. A name that matches an existing Group
 * without case creates nothing, so it needs no `group.create`.
 *
 * Callers: host/bulk (addGroups first, then every name it writes) and
 * group/check-save (a host `groups` value on general/save, general/create
 * and general/update). The caller decides that a change happens:
 * group/check-save answers no 403 for an unchanged set, but drops `groups`
 * from the write when this check would deny the caller.
 *
 * Inputs:
 *   permissions  the caller's resolved permissions (req.user.permissions)
 *   names        the names that will be written: the added names, or a
 *                host's new `groups` value, already normalized
 *                (Host.normalizeGroups); [] for a removal check
 *
 * It returns undefined when the change is allowed, or {message, permission}:
 * the 403 message and the permission that refused (group.update, or
 * group.create). The caller records the permission for the audit trail.
 *
 * Usage: let denied = await sails.helpers.group.authorize.with({permissions: req.user.permissions, names})
 */
const CREATE_DENIED = 'You do not have permission to create groups.';
const UPDATE_DENIED = 'You do not have permission to edit groups.';

module.exports = {
  friendlyName: 'Authorize a group membership change',
  description: 'Check group.update for a membership change, and group.create for a name with no Group.',
  inputs: {
    permissions: {type: 'ref', required: true, description: 'req.user.permissions'},
    names: {type: 'ref', required: true, description: 'The names to add or to set.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'undefined when allowed, else {message, permission}.'}
  },
  fn: async function ({permissions, names}) {
    if (!_.get(permissions, 'stock.group.update')) {
      return {message: UPDATE_DENIED, permission: 'group.update'};
    }
    if (_.get(permissions, 'stock.group.create')) {
      return undefined;
    }
    for (let name of names) {
      if (!(await sails.helpers.group.find.with({name}))) {
        return {message: CREATE_DENIED, permission: 'group.create'};
      }
    }
    return undefined;
  }
};
