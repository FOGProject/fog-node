const supertest = require('supertest');

// Every action is reachable only through an explicit route, never at its blueprint
// path. The reason is in config/blueprints.js (`actions: false`).
describe('Action blueprints::', () => {
  const get = (path) => supertest(sails.hooks.http.app).get(path);

  // The explicit routes by verb: `'GET /boot'` gives `GET /boot`. A key with no
  // verb (`'/hwinfo'`) binds every verb, so it gives `* /hwinfo`.
  const explicitRoutes = () => new Set(Object.keys(sails.config.routes).map((key) => {
    const m = key.trim().match(/^(get|post|put|patch|delete|all)\s+(.*)$/i);
    return m ? `${m[1].toUpperCase()} ${m[2].trim()}` : `* ${key.trim()}`;
  }));

  // The probe is a GET. Sails refuses a tokenless POST with 403 before it routes.
  // So a POST probe cannot tell a bound path from an unbound one. A path that an
  // explicit GET route owns (`/search`) is skipped.
  it('binds no action at its blueprint path', async () => {
    const explicit = explicitRoutes();
    const unbound = [];
    for (const identity of Object.keys(sails.getActions())) {
      const path = `/${identity}`;
      if (explicit.has(`* ${path}`) || explicit.has(`GET ${path}`)) continue;
      const res = await get(path);
      if (res.status !== 404) unbound.push(`${path} -> ${res.status}`);
    }
    if (unbound.length) {
      throw new Error(`action blueprint paths still answer:\n  ${unbound.join('\n  ')}`);
    }
  });

  // The query copies the shape of the real exploit link.
  for (const path of ['/user/reset-password', '/user/reset-api-token',
    '/account/change-password', '/account/reset-api-token']) {
    it(`GET ${path} is not routed`, () => get(`${path}?id=x&password=aaaaaaaa&passwordConfirm=aaaaaaaa`)
      .expect(404));
  }

  // The explicit POST routes still exist. A POST with a valid CSRF token reaches
  // routing, so an unrouted path gets 404 and a routed one does not.
  for (const path of ['/account/password', '/account/api-token']) {
    it(`POST ${path} is still routed`, async () => {
      const agent = supertest.agent(sails.hooks.http.app);
      const {body} = await agent.get('/csrfToken').expect(200);
      const res = await agent.post(path).set('X-CSRF-Token', body._csrf);
      if (res.status === 404) throw new Error(`POST ${path} is not routed`);
    });
  }
});

// /api/v1 is CSRF-exempt, so a cookie-authenticated mutation there must refuse a
// cross-site POST: one without `X-Requested-With`. The agent keeps the session
// cookie, as a browser does. Plugin routes skip the login policy, so a JWT would
// not set req.user there.
describe('Cross-site POST on /api/v1::', () => {
  let agent;
  before(async () => {
    agent = supertest.agent(sails.hooks.http.app);
    await agent.post('/api/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({username: 'mochatestadmin', password: 'mochatestadmin'})
      .expect(200);
    // The session authenticates later requests, so a 403 below is the guard's.
    await agent.get('/api/v1/user/me').expect(200);
  });

  it('POST /api/v1/image/scan is refused without X-Requested-With', () =>
    agent.post('/api/v1/image/scan').expect(403));

  // A plugin route is not CSRF-exempt, so Sails checks the token on it. Without
  // the token the POST gets 403. With it, the POST reaches the route: no such host.
  const wol = '/api/v1/host/000000000000000000000000/wol';
  it('POST /api/v1/host/:id/wol is refused without a CSRF token', () => agent.post(wol).expect(403));
  it('POST /api/v1/host/:id/wol works with a CSRF token', async () => {
    const {body} = await agent.get('/csrfToken').expect(200);
    await agent.post(wol).set('X-CSRF-Token', body._csrf).expect(404);
  });

  // The control: with a token and no session, the wol handler itself answers 403.
  // An unbound path would answer 404, so this proves the route is bound.
  it('POST /api/v1/host/:id/wol is bound (no session gets the handler 403)', async () => {
    const anon = supertest.agent(sails.hooks.http.app);
    const {body} = await anon.get('/csrfToken').expect(200);
    await anon.post(wol).set('X-CSRF-Token', body._csrf).expect(403);
  });
});
