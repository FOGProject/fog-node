/**
 * Remove a Group from its members: pull every host `groups` value that equals
 * `name` without case. general/destroy.js calls it for each destroyed Group.
 * It deletes no host.
 *
 * One native update on the host collection. The collation makes both the
 * match and the $pull case-insensitive.
 *
 * Usage: await sails.helpers.group.remove.with({name: 'Lab-A'})
 */
module.exports = {
  friendlyName: 'Remove a Group from its members',
  description: 'Pull a group name from every host\'s groups.',
  inputs: {
    name: {type: 'string', required: true, description: 'The group name.'}
  },
  exits: {
    success: {description: 'No host holds the name.'}
  },
  fn: async function ({name}) {
    let Host = sails.models.host;
    let collection = sails.getDatastore(Host.datastore).manager.collection(Host.tableName);
    await collection.updateMany({groups: name}, {$pull: {groups: name}}, {collation: sails.models.group.nameCollation});
  }
};
