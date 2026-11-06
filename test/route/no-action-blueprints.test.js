const supertest = require('supertest');

// Every action is reachable only through an explicit route, never at its blueprint
// path. The reason is in config/blueprints.js (`actions: false`).
describe('Action blueprints::', () => {
  const request = () => supertest(sails.hooks.http.app);
  const get = (path) => request().get(path);

  // The explicit routes by verb: `'GET /boot'` gives `GET /boot`. A key with no
  // verb (`'/hwinfo'`) binds every verb, so it gives `* /hwinfo`.
  const explicitRoutes = () => new Set(Object.keys(sails.config.routes).map((key) => {
    const m = key.trim().match(/^(get|post|put|patch|delete|all)\s+(.*)$/i);
    return m ? `${m[1].toUpperCase()} ${m[2].trim()}` : `* ${key.trim()}`;
  }));

  // The probe is a GET, because Sails refuses a tokenless POST with 403 before it
  // routes, so a POST probe cannot tell bound from unbound. A path that an
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
  before(() => {
    agent = supertest.agent(sails.hooks.http.app);
    return agent.post('/api/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({username: 'mochatestadmin', password: 'mochatestadmin'})
      .expect(200);
  });
  const post = (path) => agent.post(path);

  it('POST /api/v1/image/scan is refused without X-Requested-With', () =>
    post('/api/v1/image/scan').expect(403));

  // A plugin route is not CSRF-exempt, so Sails checks the token on it. Without
  // the token the POST gets 403. With it, the POST reaches the route: no such host.
  const wol = '/api/v1/host/000000000000000000000000/wol';
  it('POST /api/v1/host/:id/wol is refused without a CSRF token', () => post(wol).expect(403));
  it('POST /api/v1/host/:id/wol works with a CSRF token', async () => {
    const {body} = await agent.get('/csrfToken').expect(200);
    await post(wol).set('X-CSRF-Token', body._csrf).expect(404);
  });
});
