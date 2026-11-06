/**
 * Group.js
 *
 * @description :: A named set of hosts, the FOG 1.6 Group (GroupManagement.php).
 *                 The membership is the host's `groups` array of Group names
 *                 (api/models/Host.js), not a field here. Names match without
 *                 case: api/helpers/group/ensure-index.js gives `name` a unique
 *                 index with a case-insensitive collation.
 * @docs        :: https://sailsjs.com/docs/concepts/models-and-orm/models
 */
module.exports = {
  attributes: {
    // The host field splits a string value on commas, carriage returns and
    // line feeds (Host.normalizeGroups), so a name with one of them could
    // never be a member value.
    name: {
      type: 'string',
      required: true,
      unique: true,
      regex: /^[^,\r\n]+$/
    },
    description: {
      type: 'string'
    },
    // The 1.6 Group Order (GroupManagement.php ~119-140). The description is
    // the 1.6 help text, which the create page and the edit page show under
    // the field.
    order: {
      type: 'number',
      isInteger: true,
      min: 0,
      defaultsTo: 0,
      description: 'Lowest first. When a host is in more than one group, this decides which group is applied ' +
        'first -- groups sharing a number fall back to name order. It only matters where two groups disagree, ' +
        'such as granting different default printers.'
    }
  },
  // The one collation of every name match: the unique index
  // (group/ensure-index), group/find, and the host updates of group/rename,
  // group/remove and group/count-members. Strength 2 ignores case only. A
  // lookup with another collation would disagree with the index.
  nameCollation: {locale: 'en', strength: 2},
  // The FOG 1.6 texts for a name that another Group has, without case: on a
  // create (GroupManagement.php ~205) and on a rename (~401).
  existsText: 'A group already exists with this name!',
  takenText: 'Please use another group name'
};
