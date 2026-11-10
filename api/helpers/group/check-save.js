/**
 * The group checks of a record write, for the three generic write paths:
 * general/create, general/update and general/save. One copy, so the
 * permission check cannot drift between them.
 *
 * - A Group: the name is trimmed, and it must not match another Group's name
 *   without case ("lab-a" is taken when "Lab-A" exists). The FOG 1.6 texts:
 *   Group.existsText on a create, Group.takenText on a rename.
 * - A host with `groups`: a membership change is a group edit
 *   (group/authorize). When the names are the stored names in any order and
 *   case, it needs no permission. If the caller could not make that change
 *   itself, an update drops `groups` from the write, so Host.beforeSave
 *   cannot create a Group for a name that lost its own (a failed
 *   group/remove, or a delete racing the save). A caller with group.update
 *   and group.create keeps the spec behavior: the save re-creates the Group.
 *
 * It changes `values` in place (the trimmed name, the dropped `groups`).
 *
 * Inputs:
 *   model        the model identity
 *   id           the record id of an update; omit it for a create
 *   values       the values to write
 *   permissions  req.user.permissions
 *
 * It returns {error: {status, message}} when the write must stop (400 for a
 * name that is not text, 409 for a taken name, 403 for a denied membership
 * change, which also carries the refusing `permission`), else {oldGroup}: the Group as read before a rename, for
 * group/rename after the write.
 *
 * Usage: let check = await sails.helpers.group.checkSave.with({model, id, values, permissions: req.user.permissions})
 */
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

const sameSet = (a, b) => {
  let lower = (list) => _.uniq(list.map((n) => String(n).toLowerCase())).sort();
  return _.isEqual(lower(a), lower(b));
};

module.exports = {
  friendlyName: 'Check a Group or host groups write',
  description: 'The group name and group membership checks of a create or an update.',
  inputs: {
    model: {type: 'string', required: true, description: 'The model identity.'},
    id: {type: 'ref', description: 'The record id of an update.'},
    values: {type: 'ref', required: true, description: 'The values to write; changed in place.'},
    permissions: {type: 'ref', required: true, description: 'req.user.permissions'}
  },
  exits: {
    success: {outputType: 'ref', description: '{error: {status, message}} or {oldGroup}.'}
  },
  fn: async function ({model, id, values, permissions}) {
    let Group = sails.models.group;
    // A JSON caller can send a number, which Waterline would store as text
    // with no rename of the members. A name is text, or the write stops.
    if (model === 'group' && has(values, 'name') && typeof values.name !== 'string') {
      return {error: {status: 400, message: 'The group name must be text.'}};
    }
    if (model === 'group' && has(values, 'name')) {
      values.name = values.name.trim();
      // An empty name is left to the model validation.
      if (!values.name) {
        return {};
      }
      if (id === undefined) {
        if (await sails.helpers.group.find.with({name: values.name})) {
          return {error: {status: 409, message: Group.existsText}};
        }
        return {};
      }
      let oldGroup = await Group.findOne({id});
      if (oldGroup && values.name !== oldGroup.name) {
        let other = await sails.helpers.group.find.with({name: values.name});
        if (other && other.id !== oldGroup.id) {
          return {error: {status: 409, message: Group.takenText}};
        }
      }
      return {oldGroup};
    }
    if (model === 'host' && has(values, 'groups')) {
      let names = sails.models.host.normalizeGroups(values.groups);
      let host = id === undefined ? null : await sails.models.host.findOne({id});
      let stored = (host && Array.isArray(host.groups)) ? host.groups : [];
      // The same names, or none on a create: no membership change, and no
      // permission needed. When the caller could not make the change, an
      // update writes no `groups` at all, so Host.beforeSave cannot create a
      // Group for a name that lost its own.
      if (sameSet(names, stored)) {
        if (host && await sails.helpers.group.authorize.with({permissions, names})) {
          delete values.groups;
        }
        return {};
      }
      let denied = await sails.helpers.group.authorize.with({permissions, names});
      if (denied) {
        // The permission that refused goes with the message, for the audit trail.
        return {error: {status: 403, message: denied.message, permission: denied.permission}};
      }
    }
    return {};
  }
};
