const supertest = require('supertest');
describe('Route tests::', () =>  {
  var token = '';
  // `X-Requested-With` marks the request as same-origin AJAX, which is what
  // api/policies/apiCsrfGuard.js requires before it will let a session-
  // authenticated request mutate anything. Real clients send it for free
  // (jQuery sets it on every $.ajax; assets/fog/fog.common.js sets it on its
  // fetch calls), but supertest does not, so without it every POST/PUT/DELETE
  // below is refused with a 403.
  var hook = (method = 'get') =>
    (args) =>
      supertest(sails.hooks.http.app)[method](args)
        .set('X-Requested-With', 'XMLHttpRequest');
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
        .set('Authorization', token)
        .set('X-Requested-With', 'XMLHttpRequest');
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
            // Passing a callback to .expect() hands it the assertion error
            // instead of throwing, so this has to be checked by hand -- it was
            // previously dropped, which let a 403 here report as a pass and
            // surface instead as two confusing 403s from the update/destroy
            // tests below (they were requesting /api/v1/user/undefined).
            if (err) return done(err);
            userid = info.body.id;
            if (!userid) return done(new Error('Create returned no user id'));
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
