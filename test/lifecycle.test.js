const sails = require('sails');
var roleadmin = {};
var useradmin = {};

before(function(done) {
  this.timeout(11000);
  sails.lift({
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
          }, (err, user) => {
            if (err) return done(err);
            done();
          }
        );
      }
    );
  });
});
after((done) => {
  Role.destroy({name: 'Mocha_Test_Admin'}, (err) => {
    if (err) return done(err);
    User.destroy({username: 'mochatestadmin'}, (err) => {
      if (err) return done(err);
      sails.lower(done);
    });
  });
});

describe('Basic Tests ::', () => {
  it('Sails did not crash', () => {
    return true;
  });
});
