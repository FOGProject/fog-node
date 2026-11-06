/**
 * The member count of each named Group: the hosts whose `groups` hold the
 * name, without case. One native aggregate on the host collection, for the
 * Members column of the group list (api/helpers/datatables/get-data.js) and
 * the Members fact of the group info card (api/helpers/info-card.js).
 *
 * The aggregate groups by the stored value; the fold to each input name uses
 * the same case-insensitive comparison as the collation, so a value stored
 * in another case still counts.
 *
 * Usage: await sails.helpers.group.countMembers.with({names: ['Lab-A', 'win11']})
 *   -> [2, 1]
 */
// Strength 2 (Group.nameCollation) compares letters and accents, and ignores
// case.
const sameName = new Intl.Collator('en', {sensitivity: 'accent'});

module.exports = {
  friendlyName: 'Count Group members',
  description: 'The number of hosts in each named Group.',
  inputs: {
    names: {type: 'ref', required: true, description: 'An array of group names.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'The counts, in the input order.'}
  },
  fn: async function ({names}) {
    if (!names.length) {
      return [];
    }
    let Host = sails.models.host;
    let collection = sails.getDatastore(Host.datastore).manager.collection(Host.tableName);
    let rows = await collection.aggregate([
      {$match: {groups: {$in: names}}},
      {$unwind: '$groups'},
      {$match: {groups: {$in: names}}},
      {$group: {_id: '$groups', n: {$sum: 1}}}
    ], {collation: sails.models.group.nameCollation}).toArray();
    return names.map((name) => rows
      .filter((row) => typeof row._id === 'string' && sameName.compare(row._id, name) === 0)
      .reduce((sum, row) => sum + row.n, 0));
  }
};
