const supertest = require('supertest');
describe('Route tests::', () =>  {
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
  describe('/api/v1 test::', () => {
    it ('Should return message', (done) => {
      request
        .get('/api/v1')
        .expect(200)
        .expect('{\n  "message": "FOG API Backend"\n}', done);
    });
  });
  describe('/login url test::', () => {
    it ('Should return status 200', (done) => {
      request
        .get('/login')
        .expect(200, done);
    });
  });
  describe('/logout test::', () => {
    it ('Should return forbidden as no one is currently logged in', (done) => {
      request
        .get('/logout')
        .expect(403, done);
    });
  });
  describe('/api/v1/user not logged in test::', () => {
    it ('Should return forbidden', (done) => {
      request
        .get('/api/v1/user')
        .expect(403, done);
    });
  });
  describe('/api/v1/auth/login post test::', () => {
    it ('Should return status 200 and token', (done) => {
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
  describe('Below are the authenticated request tests::', () => {
    describe('User list test::', () => {
      it ('Should return status 200 now that we have token', (done) => {
        request
          .get('/api/v1/user')
          .expect(200)
          .expect('Content-type', /json/, done);
      });
    });
    let userid;
    describe('User create test::', () => {
      it ('Should be able to create a new user::', (done) => {
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
    describe('User update test::', () => {
      it ('Should be able to update the test user::', (done) => {
        request
          .put(`/api/v1/user/${userid}`)
          .send({
            email: 'testmocha3@testuser.test'
          })
          .expect(200, done);
      });
    });
    describe('User destroy test::', () => {
      it ('Should be able to delete the test user::', (done) => {
        request
          .delete(`/api/v1/user/${userid}`)
          .expect(200, done);
      });
    });
  });
});
