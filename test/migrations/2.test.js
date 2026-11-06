const assert = require('assert');
const {MongoClient} = require('mongodb');
const migration = require('../../tools/migrate/lib/migration');
const revision2 = require('../../migrations/2');

// Schema revision 2 (issue #169): host.tags becomes host.groups, with one
// Group per name without case. It runs on a scratch database next to the dev
// one, never on the dev database itself, which holds seeded hosts.
describe('Schema revision 2::', () => {
  let client;
  let db;

  // The dev database name, from the fogdb datastore: a url (npm run
  // setup:dev) or the installer's host, port and database.
  function scratch() {
    const ds = sails.config.datastores.fogdb;
    if (ds.url) {
      const url = new URL(ds.url);
      return {url: ds.url, name: `${decodeURIComponent(url.pathname.slice(1)) || 'fog'}_migration_test`};
    }
    const auth = ds.user ? `${ds.user}:${ds.password || ''}@` : '';
    return {url: `mongodb://${auth}${ds.host}:${ds.port}/${ds.database}`, name: `${decodeURIComponent(ds.database)}_migration_test`};
  }

  const run = (from, to) => new Promise((resolve, reject) => {
    migration.run(db, from, to, () => {}, (err) => (err ? reject(err) : resolve()));
  });
  const up = () => new Promise((resolve, reject) => {
    revision2.up(db, console, (err) => (err ? reject(err) : resolve()));
  });
  const down = () => new Promise((resolve, reject) => {
    revision2.down(db, console, (err) => (err ? reject(err) : resolve()));
  });
  const host = (name) => db.collection('host').findOne({name});
  // Binary order: upper case sorts before lower case.
  const groupNames = async () => (await db.collection('group').find().sort({name: 1}).toArray()).map((g) => g.name);
  const snapshot = async () => ({
    hosts: await db.collection('host').find().sort({name: 1}).toArray(),
    groups: await db.collection('group').find().sort({name: 1}).toArray()
  });

  // A fresh scratch database at revision 1, with the hosts of the issue.
  async function seed() {
    await db.dropDatabase();
    await db.collection('host').insertMany([
      {name: 'm1', tags: ['Lab-A', 'win11']},
      {name: 'm2', tags: ['lab-a', ' ']},
      {name: 'm3'}
    ]);
    await db.collection('setting').insertOne({name: 'schema', value: {revision: 1}});
  }

  async function assertMigrated() {
    assert.deepStrictEqual((await host('m1')).groups, ['Lab-A', 'win11']);
    assert.deepStrictEqual((await host('m2')).groups, ['Lab-A']);
    const m3 = await host('m3');
    assert.ok(!Object.prototype.hasOwnProperty.call(m3, 'groups'), 'm3 got a groups field');
    assert.strictEqual(await db.collection('host').countDocuments({tags: {$exists: true}}), 0);
    assert.deepStrictEqual(await groupNames(), ['Lab-A', 'win11']);
    const groups = await db.collection('group').find().toArray();
    groups.forEach((g) => {
      assert.strictEqual(g.order, 0);
      assert.strictEqual(g.description, '');
    });
  }

  before(async () => {
    const target = scratch();
    client = await MongoClient.connect(target.url, {useUnifiedTopology: true, useNewUrlParser: true});
    db = client.db(target.name);
  });
  after(async () => {
    if (db) { await db.dropDatabase(); }
    if (client) { await client.close(); }
  });

  describe('up', () => {
    before(seed);

    it('applies revision 2 and sets the schema Setting to 2', async () => {
      await run(1, 2);
      await assertMigrated();
      const setting = await db.collection('setting').findOne({name: 'schema'});
      assert.deepStrictEqual(setting.value, {revision: 2});
    });

    it('creates the unique group name index without case', async () => {
      const index = (await db.collection('group').indexes()).find((i) => i.key && i.key.name === 1);
      assert.ok(index, 'no index on group.name');
      assert.strictEqual(index.unique, true);
      assert.strictEqual(index.collation.locale, 'en');
      assert.strictEqual(index.collation.strength, 2);
    });

    it('changes nothing on a second run', async () => {
      const before = await snapshot();
      await up();
      assert.deepStrictEqual(await snapshot(), before);
    });

    it('runs no revision once the database is at revision 2', async () => {
      let steps = 0;
      await new Promise((resolve, reject) => {
        migration.run(db, 2, 2, () => { steps++; }, (err) => (err ? reject(err) : resolve()));
      });
      assert.strictEqual(steps, 0);
    });
  });

  describe('a rerun after the Groups were inserted', () => {
    before(async () => {
      await seed();
      // As if up stopped after its insert step: the index and the Groups
      // exist, and no host is rewritten yet.
      await db.collection('group').createIndex({name: 1}, {unique: true, collation: {locale: 'en', strength: 2}});
      const now = Date.now();
      await db.collection('group').insertMany(['Lab-A', 'win11'].map((name) => ({
        name, description: '', order: 0, createdAt: now, updatedAt: now
      })));
    });

    it('finishes the job and creates no second Group', async () => {
      await up();
      await assertMigrated();
    });
  });

  describe('a tag that holds a comma', () => {
    before(async () => {
      await seed();
      await db.collection('host').insertOne({name: 'm4', tags: ['a,b']});
    });

    it('becomes two groups', async () => {
      await up();
      assert.deepStrictEqual((await host('m4')).groups, ['a', 'b']);
      assert.deepStrictEqual(await groupNames(), ['Lab-A', 'a', 'b', 'win11']);
    });
  });

  describe('an existing Group spelling', () => {
    before(async () => {
      await seed();
      await db.collection('group').insertOne({name: 'LAB-A', description: 'kept', order: 3});
    });

    it('wins over the first spelling met', async () => {
      await up();
      assert.deepStrictEqual((await host('m1')).groups, ['LAB-A', 'win11']);
      assert.deepStrictEqual((await host('m2')).groups, ['LAB-A']);
      const lab = await db.collection('group').findOne({name: 'LAB-A'});
      assert.strictEqual(lab.description, 'kept');
      assert.deepStrictEqual(await groupNames(), ['LAB-A', 'win11']);
    });
  });

  describe('down', () => {
    before(async () => {
      await seed();
      await run(1, 2);
    });

    it('restores tags and removes every Group', async () => {
      await down();
      const m1 = await host('m1');
      assert.deepStrictEqual(m1.tags, ['Lab-A', 'win11']);
      assert.ok(!Object.prototype.hasOwnProperty.call(m1, 'groups'), 'm1 still has groups');
      assert.strictEqual(await db.collection('group').countDocuments(), 0);
      const names = (await db.listCollections({name: 'group'}).toArray()).map((c) => c.name);
      assert.deepStrictEqual(names, [], 'the group collection and its index remain');
    });

    it('goes back down through migration.run, and sets the Setting to 1', async () => {
      await seed();
      await run(1, 2);
      await run(2, 1);
      assert.deepStrictEqual((await host('m2')).tags, ['Lab-A']);
      const setting = await db.collection('setting').findOne({name: 'schema'});
      assert.deepStrictEqual(setting.value, {revision: 1});
    });
  });

  // A database from before ADR 0001 holds the old Group model's empty group
  // collection with a plain unique index name_1. createIndex failed on it
  // with "An existing index has the same name" (a development database).
  describe('a legacy group name index', () => {
    before(async () => {
      await seed();
      await db.collection('group').createIndex({name: 1}, {unique: true});
    });

    it('is replaced by the index without case, and up finishes', async () => {
      await run(1, 2);
      await assertMigrated();
      const onName = (await db.collection('group').indexes()).filter((i) => i.key && i.key.name === 1);
      assert.strictEqual(onName.length, 1);
      assert.strictEqual(onName[0].collation.strength, 2);
    });
  });

  // tools/lib/setting.js `get` threw a TypeError on a database with no
  // schema Setting, so the migrator crashed instead of saying why.
  describe('a database with no schema Setting', () => {
    before(async () => {
      await db.dropDatabase();
    });

    it('reports the missing revision instead of a TypeError', async () => {
      const err = await new Promise((resolve) => migration.getCurrentRevision(db, resolve));
      assert.strictEqual(err, 'Schema revision not set in database');
    });
  });
});
