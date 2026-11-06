/**
 * Rename a Group on its members: every host `groups` value that equals `from`
 * without case becomes `to`. general/save.js and general/update.js call it
 * after a Group update that changed the name, so the members keep their
 * membership, as in 1.6.
 *
 * One native update on the host collection. The collation makes both the
 * match and the array filter case-insensitive.
 *
 * Usage: await sails.helpers.group.rename.with({from: 'Lab-A', to: 'Lab-1'})
 */
module.exports = {
  friendlyName: 'Rename a Group on its members',
  description: 'Replace a group name with a new one in every host\'s groups.',
  inputs: {
    from: {type: 'string', required: true, description: 'The old group name.'},
    to: {type: 'string', required: true, description: 'The new group name.'}
  },
  exits: {
    success: {description: 'The members hold the new name.'}
  },
  fn: async function ({from, to}) {
    let Host = sails.models.host;
    let collection = sails.getDatastore(Host.datastore).manager.collection(Host.tableName);
    await collection.updateMany(
      {groups: from},
      {$set: {'groups.$[member]': to}},
      {arrayFilters: [{member: from}], collation: sails.models.group.nameCollation}
    );
  }
};
