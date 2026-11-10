const sails = require('sails');

// The names the suite creates. Every test names its users, hosts, tokens,
// attempted sign-in names and agent hostnames with one of the PREFIXES, and
// the suite admin below is the other actor. The `after` below removes the
// AuditLog rows that carry one of them and nothing else: the suite may run
// while a dev server on 1337 writes real audit rows to the same database
// (package.json custom-tests), and those rows are never touched.
const ADMIN = 'mochatestadmin';
const PREFIXES = ['mocha', 'mc', 'mpa', 'mph', 'testmochauser'];
// When the run started: only a row at or after it is the suite's.
let startedAt;

before(function(done) {
  this.timeout(11000);
  startedAt = Date.now();
  sails.lift({
    // These were PORT=1338 and sails_hooks__grunt=false in the npm script.
    // That syntax fails in Windows cmd, so the options live here instead.
    port: 1338,
    hooks: {grunt: false},
    log: {level: 'debug'}
  }, (err) => {
    if (err) return done(err);
    Role.findOrCreate(
      {name: 'Mocha_Test_Admin'},
      {
        name: 'Mocha_Test_Admin',
        isAdmin: true,
        permissions: {}
      }, (err, role) => {
        if (err) return done(err);
        User.findOrCreate(
          {username: 'mochatestadmin'},
          {
            username: 'mochatestadmin',
            password: 'mochatestadmin',
            email: 'mochatest@admin.com',
            roles: [role.id]
          }, (err) => {
            if (err) return done(err);
            done();
          }
        );
      }
    );
  });
});
after(async () => {
  // The seam writes after the response finishes, so let the last write land.
  await new Promise((resolve) => setTimeout(resolve, 200));
  await AuditLog.destroy({and: [
    {createdAt: {'>=': startedAt}},
    {or: [
      {createdBy: {in: [ADMIN]}},
      ...PREFIXES.map((prefix) => ({createdBy: {startsWith: prefix}})),
      ...PREFIXES.map((prefix) => ({subjectLabel: {startsWith: prefix}}))
    ]}
  ]});
  await Role.destroy({name: 'Mocha_Test_Admin'});
  await User.destroy({username: ADMIN});
  await new Promise((resolve, reject) => sails.lower((err) => (err ? reject(err) : resolve())));
});

describe('Basic Tests ::', () => {
  it('Sails did not crash', () => {
    return true;
  });
});

module.exports = {ADMIN, PREFIXES};
