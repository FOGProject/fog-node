/**
 * The unique index on the Group name, without case.
 *
 * The models use `migrate: 'safe'`, so the ORM creates no index, and
 * `unique: true` on Group.name enforces nothing by itself. This index does:
 * two concurrent creates of "Lab-A" and "lab-a" cannot both succeed, so two
 * concurrent group/ensure calls cannot create the same Group twice.
 * config/bootstrap.js runs it at each lift. createIndex does nothing when the
 * index exists, so a new install and an upgraded install both get it.
 * migrations/2.js creates the same index.
 *
 * Usage: await sails.helpers.group.ensureIndex()
 */
module.exports = {
  friendlyName: 'Ensure the Group name index',
  description: 'Create the unique, case-insensitive index on group.name when it does not exist.',
  exits: {
    success: {description: 'The index exists.'}
  },
  fn: async function () {
    let Group = sails.models.group;
    let collection = sails.getDatastore(Group.datastore).manager.collection(Group.tableName);
    await collection.createIndex({name: 1}, {unique: true, collation: Group.nameCollation});
  }
};
