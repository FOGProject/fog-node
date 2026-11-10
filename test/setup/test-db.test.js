const assert = require('assert');
const {resolve} = require('../../tools/lib/test-db');
const {datastoreUrl} = require('../../tools/lib/database');

// The test database name (tools/lib/test-db.js). The URLs here are fake.
describe('Test database name::', () => {
  it('appends _test to the url database and keeps host, port and query', () => {
    const t = resolve({url: 'mongodb://127.0.0.1:27017/fog?replicaSet=rs0'});
    assert.strictEqual(t.original, 'fog');
    assert.strictEqual(t.database, 'fog_test');
    assert.strictEqual(t.url, 'mongodb://127.0.0.1:27017/fog_test?replicaSet=rs0');
    assert.deepStrictEqual(t.overrides, {url: t.url, database: 'fog_test'});
  });

  // sails-mongo lets a top-level `database` win over the url, so a url-only
  // override would leave the run on the configured database.
  it('overrides the top-level database of a url datastore, and names the configured one by it', () => {
    const same = resolve({url: 'mongodb://h:1/fog', database: 'fog'});
    assert.deepStrictEqual(same.overrides, {url: 'mongodb://h:1/fog_test', database: 'fog_test'});
    const other = resolve({url: 'mongodb://h:1/fog', database: 'fog_test'});
    assert.strictEqual(other.original, 'fog_test');
    assert.strictEqual(other.database, 'fog_test_test');
    assert.deepStrictEqual(other.overrides, {url: 'mongodb://h:1/fog_test_test', database: 'fog_test_test'});
  });

  it('appends the suffix again to a name that already ends in _test', () => {
    const t = resolve({url: 'mongodb://127.0.0.1:27017/fog_test'});
    assert.strictEqual(t.database, 'fog_test_test');
    assert.notStrictEqual(t.database, t.original);
  });

  it('never returns the configured name', () => {
    for (const name of ['fog', 'fog_test', 'fog_mtls', '_test', 'a_test_test']) {
      const url = resolve({url: `mongodb://h:1/${name}`});
      const parts = resolve({host: 'h', port: 1, database: name});
      for (const t of [url, parts]) {
        assert.notStrictEqual(t.database, t.original);
        assert.strictEqual(t.original, name);
        assert.ok(t.database.endsWith('_test'));
      }
    }
  });

  it('adds authSource=<configured database> when the url has credentials and no authSource', () => {
    assert.strictEqual(resolve({url: 'mongodb://fakeuser:fakepass@h:1/fog'}).url,
      'mongodb://fakeuser:fakepass@h:1/fog_test?authSource=fog');
    assert.strictEqual(resolve({url: 'mongodb://fakeuser:fakepass@h:1/fog?tls=true'}).url,
      'mongodb://fakeuser:fakepass@h:1/fog_test?tls=true&authSource=fog');
  });

  it('keeps an authSource that the url has, and adds none without credentials', () => {
    assert.strictEqual(resolve({url: 'mongodb://fakeuser:fakepass@h:1/fog?authSource=admin'}).url,
      'mongodb://fakeuser:fakepass@h:1/fog_test?authSource=admin');
    assert.ok(!resolve({url: 'mongodb://h:1/fog'}).url.includes('authSource'));
  });

  it('builds the target from host, port and database (the installer shape)', () => {
    const t = resolve({host: '10.0.0.5', port: 27017, database: 'fog'});
    assert.strictEqual(t.original, 'fog');
    assert.strictEqual(t.database, 'fog_test');
    assert.strictEqual(t.url, 'mongodb://10.0.0.5:27017/fog_test');
    assert.deepStrictEqual(t.overrides, {url: t.url, database: 'fog_test'});
  });

  it('adds the credentials and authSource in the installer shape, and decodes the name', () => {
    const t = resolve({host: 'h', port: 1, user: 'fakeuser', password: 'fake%40pass', database: 'my%20fog'});
    assert.strictEqual(t.original, 'my fog');
    assert.strictEqual(t.database, 'my fog_test');
    assert.strictEqual(t.url, 'mongodb://fakeuser:fake%40pass@h:1/my%20fog_test?authSource=my%20fog');
    assert.strictEqual(t.overrides.database, 'my%20fog_test');
  });

  it('throws when there is no database name', () => {
    assert.throws(() => resolve({url: 'mongodb://h:1'}));
    assert.throws(() => resolve({url: 'mongodb://h:1/'}));
    assert.throws(() => resolve({host: 'h'}));
  });

  // The installer-shape URL (tools/lib/database.js datastoreUrl), as
  // sails-mongo builds it: no `user:@` without a password, no `:undefined`
  // without a port.
  it('builds the installer-shape url without an empty password or a missing port', () => {
    assert.strictEqual(datastoreUrl({host: 'h', database: 'd', user: 'u'}), 'mongodb://u@h/d');
    assert.strictEqual(datastoreUrl({host: 'h', database: 'd'}), 'mongodb://h/d');
    assert.strictEqual(datastoreUrl({host: 'h', port: 1, database: 'd', user: 'u', password: 'p'}), 'mongodb://u:p@h:1/d');
  });
});
