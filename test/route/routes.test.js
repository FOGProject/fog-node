const supertest = require('supertest');
describe('Route tests::', function() {
  describe('/api/v1 test::', function() {
    it ('Should return message', function(done) {
      supertest(sails.hooks.http.app)
        .get('/api/v1')
        .expect(200)
        .expect('{\n  "message": "FOG API Backend"\n}', done);
    });
  });
  describe('/login test::', function() {
    it ('Should return status 200', function(done) {
      supertest(sails.hooks.http.app)
      .get('/login')
      .expect(200, done);
    });
  });
  describe('/logout test::', function() {
    it ('Should return forbidden as no one is currently logged in', function(done) {
      supertest(sails.hooks.http.app)
      .get('/logout')
      .expect(403, done);
    });
  });
});
