const sails = require('sails');

before(function(done) {
  this.timeout(11000);
  sails.lift({
    log: {level: 'error'}
  }, function(err) {
    if (err) return done(err);
    done();
  });
});
after(function(done) {
  sails.lower(done);
});

describe('Basic Tests ::', () => {
  it('Sails did not crash', () => {
    return true;
  });
});
