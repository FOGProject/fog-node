const assert = require('assert');
const sails = require('sails');
const support = require('./support/pki');
const {freePort} = require('./support/port');
const testDb = require('../tools/lib/test-db');

// The suite never runs on the configured database (tools/lib/test-db.js). It
// lifts on the same name plus `_test`, emptied before each run.
let target;

// The agent listener (api/hooks/agent-tls) needs a PKI and a free port. 8443 is
// often taken (a dev server, test:ui, test:install), so the suite asks the OS
// for a free port (test/support/port.js).
let pkiDir;
let agentTlsPort;

// The shared PKI fixture is built before the lift, so the lift-time
// ensureServerCert (with the same SAN list) changes nothing in the read-only
// fixture. RSA-4096 generation is slow, hence the long timeout.
before(async function() {
  this.timeout(180000);
  pkiDir = await support.fixture();
  agentTlsPort = await freePort();
});

before(async function() {
  this.timeout(11000);
  target = await testDb.prepare();
  await new Promise((resolve, reject) => {
    sails.lift({
      // These were PORT=1338 and sails_hooks__grunt=false in the npm script.
      // That syntax fails in Windows cmd, so the options live here instead.
      port: 1338,
      hooks: {grunt: false},
      log: {level: 'debug'},
      datastores: {[target.datastore]: target.overrides},
      // config/bootstrap.js refuses to lift on any other database than
      // testDatabase, before its index writes.
      custom: {pkiDir, agentTlsPort, agentTlsSans: support.SANS, testDatabase: target.database}
    }, (err) => (err ? reject(err) : resolve()));
  });
  // The guard, before any test file runs: the database the models really
  // write to, read from the live connection. A failed root hook stops mocha.
  const name = User.getDatastore().manager.databaseName;
  if (!name.endsWith(testDb.SUFFIX) || name === target.original) {
    await new Promise((resolve) => sails.lower(() => resolve()));
    throw new Error(`Refusing to run: the models use the database "${name}", which must end in ${testDb.SUFFIX} and differ from the configured database.`);
  }
  const role = await Role.findOrCreate(
    {name: 'Mocha_Test_Admin'},
    {name: 'Mocha_Test_Admin', isAdmin: true, permissions: {}}
  );
  await User.findOrCreate(
    {username: 'mochatestadmin'},
    {
      username: 'mochatestadmin',
      password: 'mochatestadmin',
      email: 'mochatest@admin.com',
      roles: [role.id]
    }
  );
});
after(async () => {
  // The seam writes after the response finishes, so let the last write land.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await new Promise((resolve, reject) => sails.lower((err) => (err ? reject(err) : resolve())));
});

describe('Basic Tests ::', () => {
  it('Sails did not crash', () => {
    return true;
  });

  // The before() guard stops the run on a wrong database. This reports the
  // database that the run used.
  it('runs on the test database, not the configured one', () => {
    assert.strictEqual(User.getDatastore().manager.databaseName, target.database);
  });
});
