const assert = require('assert');

// group/ensure-index runs at each lift (config/bootstrap.js). A database from
// before ADR 0001 holds the old Group model's plain unique index name_1. The
// helper must replace it, or createIndex fails and the lift stops.
describe('group/ensure-index::', () => {
  const coll = () => {
    const Group = sails.models.group;
    return sails.getDatastore(Group.datastore).manager.collection(Group.tableName);
  };
  const onName = async () => (await coll().indexes()).filter((i) => i.key && i.key.name === 1);

  it('replaces a legacy name index that has no collation', async () => {
    for (const index of await onName()) { await coll().dropIndex(index.name); }
    await coll().createIndex({name: 1}, {unique: true});
    await sails.helpers.group.ensureIndex();
    const indexes = await onName();
    assert.strictEqual(indexes.length, 1);
    assert.strictEqual(indexes[0].unique, true);
    const want = sails.models.group.nameCollation;
    assert.strictEqual(indexes[0].collation.locale, want.locale);
    assert.strictEqual(indexes[0].collation.strength, want.strength);
  });

  it('leaves the index without case in place', async () => {
    const before = await onName();
    await sails.helpers.group.ensureIndex();
    assert.deepStrictEqual(await onName(), before);
  });
});
