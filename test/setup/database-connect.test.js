const assert = require('assert');
const database = require('../../tools/lib/database');

// tools/lib/database.js connect takes a fogdb datastore object (issue #169).
// The installer's database check (tools/setup/lib/inquire.js verifyDB) passes
// {host, port, database, user, password}. CI never runs those prompts, so
// this is the test that the check still reports a bad answer.
describe('database connect', () => {
  it('calls back with an error for a datastore object that holds a bad port', function(done) {
    // The driver gives up after serverSelectionTimeoutMS (5 s).
    this.timeout(15000);
    database.connect({host: '127.0.0.1', port: 1, database: 'fog', user: '', password: ''}, (err, client) => {
      if (client) { client.close(); }
      try {
        assert.ok(err, 'connect to port 1 gave no error');
      } catch (e) { return done(e); }
      return done();
    });
  });

  it('connects with the url of the dev datastore, and the client gives its database', function(done) {
    this.timeout(15000);
    const ds = sails.config.datastores.fogdb;
    database.connect(ds, (err, client) => {
      if (err) { return done(err); }
      client.db().command({ping: 1}).then((res) => {
        client.close();
        assert.strictEqual(res.ok, 1);
        done();
      }, (pingErr) => {
        client.close();
        done(pingErr);
      });
    });
  });
});
