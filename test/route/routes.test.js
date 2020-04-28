const supertest = require('supertest');
describe('Route tests::', function() {
  var token = '';
  var hook = (method = 'get') =>
    (args) =>
      supertest(sails.hooks.http.app)[method](args);
  var request = {
    post: hook('post'),
    get: hook('get'),
    put: hook('put'),
    delete: hook('delete')
  };
  describe('/api/v1 test::', function() {
    it ('Should return message', function(done) {
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
        });
    });
  });
  hook = (method = 'get') =>
    (args) =>
      supertest(sails.hooks.http.app)[method](args)
        .set('Authorization', token);
  var request = {
    post: hook('post'),
    get: hook('get'),
    put: hook('put'),
    delete: hook('delete')
  };
  // These are Authenticated Requests.
  describe('Below are the authenticated request tests::', function() {
    describe('User list test::', function() {
      it ('Should return status 200 now that we have token', function(done) {
        request
          .get('/api/v1/user')
          .expect(200)
          .expect('Content-type', /json/, done);
      });
    });
    let userid;
    describe('User create test::', function() {
      it ('Should be able to create a new user::', function(done) {
        request
          .post('/api/v1/user')
          .send({
            email: 'testmochauser@testuser.test',
            username: 'testmochauser',
            password: 'testmochauser'
          })
          .expect(200, (err, info) => {
            userid = info.body.id;
            done();
          });
      });
    });
    describe('User update test::', function() {
      it ('Should be able to update the test user::', function(done) {
        request
          .put(`/api/v1/user/${userid}`)
          .send({
            email: 'testmocha3@testuser.test'
          })
          .expect(200, done);
      });
    });
    describe('User destroy test::', function() {
      it ('Should be able to delete the test user::', function(done) {
        request
          .delete(`/api/v1/user/${userid}`)
          .expect(200, done);
      });
    });
  });
});
