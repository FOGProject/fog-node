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
    // A database from before ADR 0001 can hold the old Group model's plain
    // unique index `name_1`, with no collation. It has the same name as the
    // index below, so createIndex fails and the lift stops. Drop an index on
    // {name: 1} with another collation first (migrations/2.js does the same).
    // A missing collection has no index (code 26, NamespaceNotFound).
    let indexes = await collection.indexes().catch((err) => {
      if (err && err.code === 26) { return []; }
      throw err;
    });
    for (let index of indexes) {
      let onName = index.key && Object.keys(index.key).length === 1 && index.key.name === 1;
      let c = index.collation || {};
      if (onName && (c.locale !== Group.nameCollation.locale || c.strength !== Group.nameCollation.strength)) {
        await collection.dropIndex(index.name);
      }
    }
    await collection.createIndex({name: 1}, {unique: true, collation: Group.nameCollation});
  }
};
