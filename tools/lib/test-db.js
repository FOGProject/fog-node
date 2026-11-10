/**
 * The test database, shared by the mocha suite (test/lifecycle.test.js) and
 * the UI smoke test (tools/smoke/ui.js).
 *
 * A test run never uses the configured database. It uses the configured name
 * plus the suffix `_test`, always: `fog` gives `fog_test`, and `fog_test`
 * gives `fog_test_test`. It empties that database first. Never print a URL:
 * it can hold credentials.
 */
const {datastoreUrl} = require('./database');

const SUFFIX = '_test';

// The datastore the models use, and its config. sails.config is not available
// before a lift, so read the files Sails merges: config/local.js over
// config/datastores.js.
function configured() {
  const models = require('../../config/models.js').models || {};
  const name = models.datastore || 'default';
  const local = require('../../config/local.js').datastores || {};
  const base = require('../../config/datastores.js').datastores || {};
  return {name, config: Object.assign({}, base[name], local[name])};
}

// Adds authSource=<the configured database> to the query when the URL has
// credentials and no authSource. The user lives in the configured database,
// and a login checked against the test database would fail.
function withAuthSource(query, authDatabase, hasCredentials) {
  if (!hasCredentials || /(^|[?&])authSource=/i.test(query || '')) return query || '';
  return (query ? query + '&' : '?') + 'authSource=' + authDatabase;
}

// Resolves the test database from a datastore config. The config is either
// `url` (npm run setup:dev) or `host`, `port` and `database` with an optional
// `user` and `password` (npm run setup, tools/setup/index.js), where the
// installer has already URI-encoded the parts. The same two shapes are in
// test/migrations/2.test.js.
//
// Returns {original, database, url, overrides}: the decoded configured name,
// the decoded test name, the test URL, and the datastore keys to override.
// `database` is overridden in both shapes, because sails-mongo lets a
// top-level `database` win over the URL (normalize-datastore-config). For the
// same reason, a url with a top-level `database` names the configured
// database by the top-level value.
function resolve(ds) {
  if (ds.url) {
    const match = /^(mongodb(?:\+srv)?:\/\/)([^/?]*)\/([^/?]*)(\?.*)?$/.exec(ds.url);
    const configuredName = ds.database || (match && match[3]);
    if (!match || !configuredName) throw new Error('The configured datastore url has no database name, so the test run cannot name a test database.');
    const original = decodeURIComponent(configuredName);
    const database = original + SUFFIX;
    const url = match[1] + match[2] + '/' + encodeURIComponent(database) +
      withAuthSource(match[4], configuredName, match[2].includes('@'));
    return {original, database, url, overrides: {url, database: encodeURIComponent(database)}};
  }
  if (!ds.host || !ds.database) throw new Error('The configured datastore has no url and no host and database, so the test run cannot name a test database.');
  const original = decodeURIComponent(ds.database);
  const database = original + SUFFIX;
  const url = datastoreUrl(Object.assign({}, ds, {database: encodeURIComponent(database)})) +
    withAuthSource('', ds.database, Boolean(ds.user));
  return {original, database, url, overrides: {url, database: encodeURIComponent(database)}};
}

// Resolves the test database, checks the name, and drops it. Returns
// {datastore, original, database, url, overrides}: the datastore name the
// models use is `datastore`.
async function prepare() {
  const {MongoClient} = require('mongodb');
  const target = configured();
  const test = resolve(target.config);
  // The guard. The drop below runs only on a name that ends in _test and
  // differs from the configured name.
  if (test.database === test.original || !test.database.endsWith(SUFFIX)) {
    throw new Error(`Refusing to run: the test database "${test.database}" must end in ${SUFFIX} and differ from the configured database.`);
  }
  // A wrong host or port fails in 5 s, not the driver default of 30 s, as in
  // tools/lib/database.js.
  const client = await MongoClient.connect(test.url, {useUnifiedTopology: true, serverSelectionTimeoutMS: 5000});
  try {
    await client.db(test.database).dropDatabase();
  } finally {
    await client.close();
  }
  return {datastore: target.name, original: test.original, database: test.database, url: test.url, overrides: test.overrides};
}

// The configured database name, or null when this checkout has no datastore
// config yet (a fresh clone). tools/smoke/install.js checks its own throwaway
// name against it before a drop.
function configuredName() {
  let target;
  try {
    target = configured();
  } catch (err) {
    // Only a missing config file means "no config yet". A broken one stops
    // the run instead of letting a drop through.
    if (err.code === 'MODULE_NOT_FOUND') { return null; }
    throw err;
  }
  return resolve(target.config).original;
}

module.exports = {SUFFIX, resolve, prepare, configuredName};
