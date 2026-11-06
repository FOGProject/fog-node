const assert = require('assert');
const supertest = require('supertest');

// A server message travels to the next page as a session flash
// (api/helpers/flash.js), as in FOG 1.6, and views/layouts/layout.ejs shows it
// as a toast once (issue #151).
describe('Flash::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const NAME = 'mocha151-flash';
  // The toast calls the layout rendered.
  const toastCalls = (html) => html.match(/window\.fogToast\([^\n]*\);/g) || [];

  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    ({body} = await agent.get('/csrfToken').expect(200));
    return {agent, csrf: body._csrf};
  }

  it('pushes {type, text, title} onto req.session.fogFlash', () => {
    const req = {session: {}};
    // A sync helper runs at .with() (execStyle 'natural'): no .now().
    sails.helpers.flash.with({req, type: 'success', text: 'a'});
    sails.helpers.flash.with({req, type: 'error', text: 'b', title: 'T'});
    assert.deepStrictEqual(req.session.fogFlash, [
      {type: 'success', text: 'a', title: undefined},
      {type: 'error', text: 'b', title: 'T'}
    ]);
  });

  it('renders each entry as JSON a message cannot break out of, and clears the array', (done) => {
    const req = {session: {fogFlash: [{type: 'error', text: '</script><b>x</b>&', title: 'T'}]}, path: '/login', query: {}};
    sails.renderView('layouts/layout', {layout: false, req, body: ''}, (err, html) => {
      if (err) { return done(err); }
      try {
        assert.deepStrictEqual(toastCalls(html), [
          'window.fogToast("error", "\\u003c/script\\u003e\\u003cb\\u003ex\\u003c/b\\u003e\\u0026", "T");'
        ]);
        assert.deepStrictEqual(req.session.fogFlash, []);
      } catch (e) { return done(e); }
      return done();
    });
  });

  describe('a full-page save', () => {
    let admin;
    let host;
    before(async () => {
      await sails.models.host.destroy({name: NAME});
      admin = await signIn('mochatestadmin', 'mochatestadmin');
      host = await sails.models.host.create({name: NAME, macs: ['aabbccddee51']}).fetch();
    });
    after(() => sails.models.host.destroy({name: NAME}));

    it('redirects with no query, and the next page shows the toast once', async () => {
      await admin.agent.post(`/hosts/edit/${host.id}`).type('form').set(...HTML)
        .send({_csrf: admin.csrf, name: NAME, description: 'x'})
        .expect(302).expect('Location', `/hosts/edit/${host.id}`);
      const first = await admin.agent.get(`/hosts/edit/${host.id}`).set(...HTML).expect(200);
      assert.deepStrictEqual(toastCalls(first.text), ['window.fogToast("success", "Host updated!", "Host Update Success");']);
      const second = await admin.agent.get(`/hosts/edit/${host.id}`).set(...HTML).expect(200);
      assert.deepStrictEqual(toastCalls(second.text), []);
    });

    it('a JSON save sets no flash', async () => {
      await admin.agent.post(`/hosts/edit/${host.id}`).type('form')
        .set('Accept', 'application/json').set('X-Requested-With', 'XMLHttpRequest')
        .send({_csrf: admin.csrf, name: NAME, description: 'y'})
        .expect(200);
      const page = await admin.agent.get(`/hosts/edit/${host.id}`).set(...HTML).expect(200);
      assert.deepStrictEqual(toastCalls(page.text), []);
    });
  });
});
