const supertest = require('supertest');
var request = supertest;
var token = '';
describe('Route tests::', function() {
  describe('/api/v1 test::', function() {
    it ('Should return message', function(done) {
      request = supertest(sails.hooks.http.app);
      request
        .get('/api/v1')
        .expect(200)
        .expect('{\n  "message": "FOG API Backend"\n}', done);
    });
  });
  describe('/login url test::', function() {
    it ('Should return status 200', function(done) {
      request
        .get('/login')
        .expect(200, done);
    });
  });
  describe('/logout test::', function() {
    it ('Should return forbidden as no one is currently logged in', function(done) {
      request
        .get('/logout')
        .expect(403, done);
    });
  });
  describe('/api/v1/user not logged in test::', function() {
    it ('Should return forbidden', function(done) {
      request
        .get('/api/v1/user')
        .expect(403, done);
    });
  });
  describe('/api/v1/auth/login post test::', function() {
    it ('Should return status 200 and token', function(done) {
      request
        .post('/api/v1/auth/login')
        .send({
          username: 'mochatestadmin',
          password: 'mochatestadmin'
        })
        .expect(200)
        .expect('Content-type', /json/, (err, req) => {
          if (err) return done(err);
          token = req.body.token;
          if (!token) return done('No token received');
          done();
        })
        .set('Authorization', token, done);
    });
  });
  describe('/api/v1/user list test::', function() {
    it ('Should return status 200 now that we have token', function(done) {
      request
        .get('/api/v1/user')
        .set('Authorization', token)
        .expect(200)
        .expect('Content-type', /json/, done);
    });
  });
});
