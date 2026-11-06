/**
 * The Group whose name equals `name` without case: "lab-a" finds "Lab-A".
 *
 * Waterline has no case-insensitive equality, so this reads the native
 * collection with the collation of the unique name index
 * (api/helpers/group/ensure-index.js).
 *
 * Usage: await sails.helpers.group.find.with({name: 'lab-a'})
 *   -> {id, name, description, order, createdAt, updatedAt}, or undefined
 */
module.exports = {
  friendlyName: 'Find a Group by name',
  description: 'The Group whose name equals the given name without case, or undefined.',
  inputs: {
    name: {type: 'string', required: true, description: 'The group name, in any case.'}
  },
  exits: {
    success: {outputType: 'ref', description: 'The Group record, or undefined.'}
  },
  fn: async function ({name}) {
    let Group = sails.models.group;
    let collection = sails.getDatastore(Group.datastore).manager.collection(Group.tableName);
    let doc = await collection.findOne({name}, {collation: Group.nameCollation});
    if (!doc) {
      return undefined;
    }
    // The record shape the ORM returns: `id`, not the native `_id`.
    let record = _.omit(doc, '_id');
    record.id = String(doc._id);
    return record;
  }
};
