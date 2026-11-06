/**
 * The Group names for a host's `groups`, creating each Group that does not
 * exist. Host.beforeCreate and Host.beforeUpdate call it, so a host save, a
 * host API call and a bulk add all keep the free-text entry: a new name
 * creates its Group. The callers check the group permissions first
 * (api/helpers/group/authorize.js).
 *
 * - A name that matches a Group without case becomes that Group's stored
 *   name, so a host never holds a second spelling ("lab-a" -> "Lab-A").
 * - A missing name creates a Group with that name, an empty description and
 *   order 0. When the create fails on the unique index (MongoDB code 11000),
 *   another request created it first: it is found again and used.
 *
 * The input is normalized already (Host.normalizeGroups). The result keeps
 * the input order.
 *
 * Usage: await sails.helpers.group.ensure.with({names: ['lab-a', 'Lab-B']})
 *   -> ['Lab-A', 'Lab-B']
 */
module.exports = {
  friendlyName: 'Ensure Groups',
  description: 'Map each name to its Group\'s stored name, creating the Groups that do not exist.',
  inputs: {
    names: {type: 'ref', required: true, description: 'An array of group names.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'The stored Group names, in the input order.'}
  },
  fn: async function ({names}) {
    let out = [];
    for (let name of names) {
      let group = await sails.helpers.group.find.with({name});
      if (!group) {
        try {
          group = await sails.models.group.create({name, description: '', order: 0}).fetch();
        } catch (err) {
          // Waterline reports the MongoDB duplicate key (11000) as E_UNIQUE.
          if (!err || err.code !== 'E_UNIQUE') { throw err; }
          group = await sails.helpers.group.find.with({name});
          if (!group) { throw err; }
        }
      }
      // Two input names can resolve to one Group only when they differ in a
      // way the collation ignores but toLowerCase does not; keep one.
      if (out.indexOf(group.name) === -1) {
        out.push(group.name);
      }
    }
    return out;
  }
};
