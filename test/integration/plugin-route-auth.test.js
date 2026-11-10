const assert = require('assert');
const supertest = require('supertest');

// A plugin route whose value is a function runs the '*' policy chain of
// config/policies.js (api/hooks/plugins). Before, no policy ran, so a user
// signed in only through the "Remember Me" jwt cookie (no live session) got 403
// on /printers and /snapins while every core page worked.
describe('Plugin route auth chain::', () => {
  const app = () => sails.hooks.http.app;
  const HTML = ['Accept', 'text/html'];
  const JSON_ACCEPT = ['Accept', 'application/json'];
  const PATHS = ['/printers', '/printers/create', '/snapins', '/snapins/create'];
  const USERNAME = 'mocha-plugin-auth';
  const PASSWORD = 'mocha-plugin-auth-pw';
  const ROLE = 'mocha-plugin-auth-role';

  // Signs in through the login form with "Remember Me" on, as a browser does.
  // Returns the signed jwt cookie from the Set-Cookie header, and nothing else:
  // a request that sends only this cookie has no live session.
  async function jwtCookieFor(username, password) {
    const agent = supertest.agent(app());
    const {body} = await agent.get('/csrfToken').expect(200);
    const res = await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: body._csrf, 'remember-me': 'on'})
      .expect(302).expect('Location', '/');
    const jwt = res.headers['set-cookie'].find((c) => c.startsWith('jwt='));
    assert.ok(jwt, 'the login set no jwt cookie');
    return jwt.split(';')[0];
  }

  // Signs in with a session, as test/integration/limited-role.test.js does.
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    ({body} = await agent.get('/csrfToken').expect(200));
    return {agent, csrf: body._csrf};
  }

  const htmlTheme = (html) => {
    const m = /<html[^>]*\sdata-bs-theme="([^"]*)"/.exec(html);
    return m ? m[1] : null;
  };

  let adminJwt;
  let limitedJwt;
  const cleanup = async () => {
    const user = await User.findOne({username: USERNAME});
    if (user) { await UserPref.destroy({user: user.id}); }
    await User.destroy({username: USERNAME});
    await Role.destroy({name: ROLE});
  };

  before(async () => {
    await cleanup();
    // A role that reads hosts only: no stock.printer.read.
    const role = await Role.create({name: ROLE, permissions: {stock: {host: {read: true}}}}).fetch();
    await User.create({username: USERNAME, password: PASSWORD, email: 'mocha-plugin-auth@example.com', roles: [role.id]});
    adminJwt = await jwtCookieFor('mochatestadmin', 'mochatestadmin');
    limitedJwt = await jwtCookieFor(USERNAME, PASSWORD);
  });
  after(cleanup);

  it('answers 200 on the four plugin pages for an admin with only the jwt cookie', async () => {
    for (const path of PATHS) {
      await supertest(app()).get(path).set(...HTML).set('Cookie', adminJwt).expect(200);
    }
  });

  it('answers the four plugin pages as /hosts does with no credentials', async () => {
    for (const path of ['/hosts'].concat(PATHS)) {
      const res = await supertest(app()).get(path).set(...HTML);
      assert.strictEqual(res.status, 302, `${path} HTML status`);
      assert.ok(/\/login/.test(res.headers.location), `${path} redirects to /login`);
    }
    const hosts = await supertest(app()).get('/hosts').set(...JSON_ACCEPT);
    for (const path of PATHS) {
      await supertest(app()).get(path).set(...JSON_ACCEPT).expect(hosts.status);
    }
  });

  it('keeps the plugin can() check: a role without stock.printer.read gets 403', async () => {
    await supertest(app()).get('/printers').set(...HTML).set('Cookie', limitedJwt).expect(403);
  });

  it('renders the stored theme on /printers with only the jwt cookie', async () => {
    const admin = await User.findOne({username: 'mochatestadmin'});
    await UserPref.create({user: admin.id, key: 'display.theme', value: 'dark'});
    try {
      const res = await supertest(app()).get('/printers').set(...HTML).set('Cookie', adminJwt).expect(200);
      assert.strictEqual(htmlTheme(res.text), 'dark');
    } finally {
      await UserPref.destroy({user: admin.id, key: 'display.theme'});
    }
  });

  it('still answers 200 on the WOL route for a session user, with no MACs sent', async () => {
    const admin = await signIn('mochatestadmin', 'mochatestadmin');
    await Host.destroy({name: 'mocha-plugin-auth-host'});
    const host = await Host.create({name: 'mocha-plugin-auth-host', macs: []}).fetch();
    try {
      const res = await admin.agent.post(`/api/v1/host/${host.id}/wol`)
        .set(...JSON_ACCEPT).set('X-CSRF-Token', admin.csrf).expect(200);
      assert.deepStrictEqual(res.body.sent, []);
      assert.deepStrictEqual(res.body.failed, []);
    } finally {
      await Host.destroy({id: host.id});
    }
  });

  describe('the chain branches::', () => {
    const middleware = () => sails.hooks.policies.middleware;
    let chain;
    beforeEach(() => { chain = sails.config.policies['*']; });
    // Restore the chain and take the stub policies out, so no later test sees them.
    afterEach(() => {
      sails.config.policies['*'] = chain;
      delete middleware().mochastubfail;
      delete middleware().mochastubreject;
    });
    const get = () => supertest(app()).get('/printers').set(...HTML).set('Cookie', adminJwt);

    it('answers 403 when the chain is false', async () => {
      sails.config.policies['*'] = false;
      await get().expect(403);
    });

    it('answers 500 when the chain names a policy that does not exist', async () => {
      sails.config.policies['*'] = ['isLoggedIn', 'noSuchPolicy'];
      await get().expect(500);
    });

    it('answers 500 when a policy calls proceed(err)', async () => {
      middleware().mochastubfail = (req, res, proceed) => proceed(new Error('stubbed policy error'));
      sails.config.policies['*'] = ['mochaStubFail'];
      await get().expect(500);
    });

    it('answers 500 when an async policy rejects', async () => {
      middleware().mochastubreject = async () => { throw new Error('stubbed policy rejection'); };
      sails.config.policies['*'] = ['mochaStubReject'];
      await get().expect(500);
    });
  });
});
