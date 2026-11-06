const assert = require('assert');
const crypto = require('crypto');
const supertest = require('supertest');

// Per-user preferences (issue #146): GET/POST /account/preferences, the
// UserPref model, and the stored theme on the rendered page.
//
// Two of these tests pass without the feature, on purpose. They are guards:
//   - the /api/v1/userpref probe fails if a `stock.userpref` entry in
//     config/permissions.js ever opens the generic routes to the model;
//   - the 404 on GET /account/save-preferences fails if action blueprints are
//     turned on again, which would let a cross-site GET write a preference.
describe('Account preferences::', () => {
  const app = () => sails.hooks.http.app;
  // Same-origin AJAX: api/policies/apiCsrfGuard.js lets it reach /api/v1 mutations.
  const AJAX = ['X-Requested-With', 'XMLHttpRequest'];

  // A request with no Accept header counts as JSON in Sails (req.wantsJSON).
  // A browser asks for HTML.
  const HTML = ['Accept', 'text/html'];

  // Signs in as a browser does: a CSRF token for the login form, then the
  // form POST. req.login regenerates the session, which drops the CSRF
  // secret, so the next token comes after the sign-in (a browser reads it
  // from the page it lands on).
  async function signIn(username, password) {
    const agent = supertest.agent(app());
    let {body} = await agent.get('/csrfToken').expect(200);
    await agent.post('/login').type('form').set(...HTML)
      .send({username, password, _csrf: body._csrf})
      .expect(302).expect('Location', '/');
    ({body} = await agent.get('/csrfToken').expect(200));
    return {agent, csrf: body._csrf};
  }
  const read = (s) => s.agent.get('/account/preferences').set('Accept', 'application/json');
  const write = (s, key, value) => s.agent.post('/account/preferences')
    .set('Accept', 'application/json').set('X-CSRF-Token', s.csrf).send({key, value});
  const rowsOf = (user) => UserPref.find({user: user.id}).sort('key ASC');
  // The data-bs-theme attribute of the <html> tag, or null when it has none.
  const htmlTheme = (html) => {
    const tag = /<html\b([^>]*)>/.exec(html);
    assert.ok(tag, 'the page has no <html> tag');
    const attr = /data-bs-theme="([^"]*)"/.exec(tag[1]);
    return attr ? attr[1] : null;
  };
  const themePref = (html) => {
    const m = /<span id="themePref"[^>]*data-theme-pref="([^"]*)"/.exec(html);
    return m ? m[1] : null;
  };
  const makeUser = (name) => User.create({username: name, password: name, email: `${name}@example.com`}).fetch();

  let adminUser;
  let otherUser;
  let admin;
  let other;
  before(async () => {
    await User.destroy({username: {in: ['mochaprefsother', 'mochaprefsgone1', 'mochaprefsgone2']}});
    adminUser = await User.findOne({username: 'mochatestadmin'});
    otherUser = await makeUser('mochaprefsother');
    admin = await signIn('mochatestadmin', 'mochatestadmin');
    other = await signIn('mochaprefsother', 'mochaprefsother');
  });
  afterEach(() => UserPref.destroy({user: {in: [adminUser.id, otherUser.id]}}));
  after(() => User.destroy({username: 'mochaprefsother'}));

  it('sets, reads and deletes a key', async () => {
    let res = await write(admin, 'display.theme', 'dark').expect(200);
    assert.deepStrictEqual(res.body, {'display.theme': 'dark'});
    await write(admin, 'display.timezone', 'America/Chicago').expect(200);
    res = await write(admin, 'dt.hosts', {order: [2, 0, 1], length: 25}).expect(200);
    assert.deepStrictEqual(res.body, {
      'display.theme': 'dark',
      'display.timezone': 'America/Chicago',
      'dt.hosts': {order: [2, 0, 1], length: 25}
    });
    res = await read(admin).expect(200);
    assert.strictEqual(res.body['display.theme'], 'dark');
    // '' and null both delete.
    await write(admin, 'display.theme', '').expect(200);
    res = await write(admin, 'display.timezone', null).expect(200);
    assert.deepStrictEqual(res.body, {'dt.hosts': {order: [2, 0, 1], length: 25}});
    assert.deepStrictEqual((await read(admin).expect(200)).body, res.body);
    assert.deepStrictEqual((await rowsOf(adminUser)).map((r) => r.key), ['dt.hosts']);
  });

  it('keeps one user\'s map apart from another user\'s', async () => {
    await write(other, 'display.theme', 'light').expect(200);
    const rowsBefore = await rowsOf(otherUser);
    await write(admin, 'display.theme', 'dark').expect(200);
    await write(admin, 'dt.users', [1]).expect(200);
    assert.deepStrictEqual((await read(other).expect(200)).body, {'display.theme': 'light'});
    assert.deepStrictEqual(await rowsOf(otherUser), rowsBefore);
    assert.deepStrictEqual((await read(admin).expect(200)).body, {'display.theme': 'dark', 'dt.users': [1]});
  });

  // No unique index (migrate: 'safe'), so two tabs can each create a row.
  it('reads the newest of duplicate rows, and a set or delete covers them all', async () => {
    await UserPref.create({user: adminUser.id, key: 'display.theme', value: 'light'});
    await new Promise((r) => setTimeout(r, 5));
    await UserPref.create({user: adminUser.id, key: 'display.theme', value: 'dark'});
    assert.deepStrictEqual((await read(admin).expect(200)).body, {'display.theme': 'dark'});
    await write(admin, 'display.theme', 'light').expect(200);
    assert.deepStrictEqual((await rowsOf(adminUser)).map((r) => r.value), ['light', 'light']);
    await write(admin, 'display.theme', '').expect(200);
    assert.strictEqual((await rowsOf(adminUser)).length, 0);
  });

  describe('rejects with 400 and writes nothing::', () => {
    const rejects = async (key, value) => {
      const rowsBefore = await rowsOf(adminUser);
      const res = await write(admin, key, value).expect(400);
      assert.strictEqual(typeof res.body.error, 'string', `no error message for ${key}`);
      assert.deepStrictEqual(await rowsOf(adminUser), rowsBefore, `${key} wrote a row`);
    };

    it('an unknown key', async () => {
      for (const key of ['foo.bar', 'display.other', 'dt.', `dt.${'a'.repeat(181)}`, 'dt.bad key', 'dt.a<b']) {
        await rejects(key, 'x');
      }
      // The longest key that the dt. form accepts.
      await write(admin, `dt.${'a'.repeat(180)}`, 'x').expect(200);
    });

    it('a bad theme value', async () => {
      await write(admin, 'display.theme', 'dark').expect(200);
      for (const value of ['purple', 'Dark', 1, {}, undefined]) await rejects('display.theme', value);
    });

    it('a bad timezone id', async () => {
      for (const value of ['Mars/Olympus', 'america/chicago', 5]) await rejects('display.timezone', value);
    });

    it('a value over 64 KB as JSON', async () => {
      // A string's JSON adds two quotes: 65535 + 2 bytes is one over.
      await rejects('dt.big', 'x'.repeat(64 * 1024 - 1));
      await write(admin, 'dt.big', 'x'.repeat(64 * 1024 - 2)).expect(200);
    });

    it('a 201st key', async () => {
      await UserPref.createEach(Array.from({length: 200}, (unused, i) => ({user: adminUser.id, key: `dt.k${i}`, value: i})));
      await rejects('dt.k200', 200);
      // A key the user already has is not a new key.
      await write(admin, 'dt.k0', 'changed').expect(200);
    });

    it('a write that takes the total over 1 MB', async () => {
      // 16 values of 65002 bytes: 1,040,032 of the 1,048,576 allowed.
      await UserPref.createEach(Array.from({length: 16}, (unused, i) => ({user: adminUser.id, key: `dt.fill${i}`, value: 'x'.repeat(65000)})));
      await rejects('dt.more', 'x'.repeat(10000));
      await write(admin, 'dt.more', 'x'.repeat(8000)).expect(200);
    });
  });

  describe('refuses::', () => {
    it('no session, with Accept: application/json (403 from the policy chain)', async () => {
      await supertest(app()).get('/account/preferences').set('Accept', 'application/json').expect(403);
      // A browser, which asks for HTML, goes to the login page instead.
      await supertest(app()).get('/account/preferences').set(...HTML).expect(302).expect('Location', '/login');
    });

    it('an API token, with Accept: application/json (403 from the action)', async () => {
      await write(other, 'display.theme', 'dark').expect(200);
      const token = `fpat_${crypto.randomBytes(16).toString('hex')}`;
      await User.updateOne({id: otherUser.id}).set({apiTokenHash: crypto.createHash('sha256').update(token).digest('hex')});
      try {
        // The token signs in: the policy chain lets it through.
        await supertest(app()).get('/api/v1/user/me').set('Authorization', `Bearer ${token}`).expect(200);
        const res = await supertest(app()).get('/account/preferences')
          .set('Authorization', `Bearer ${token}`).set('Accept', 'application/json').expect(403);
        assert.ok(!res.text.includes('dark'), 'the 403 carries the preferences');
      } finally {
        await User.updateOne({id: otherUser.id}).set({apiTokenHash: null});
      }
    });

    it('a signed-in POST with no CSRF token, and writes nothing', async () => {
      await admin.agent.post('/account/preferences').set('Accept', 'application/json')
        .send({key: 'display.theme', value: 'dark'}).expect(403);
      assert.strictEqual((await rowsOf(adminUser)).length, 0);
      // The same session with its token is let through.
      await write(admin, 'display.theme', 'dark').expect(200);
    });

    it('GET /account/save-preferences with a session (404), and writes nothing', async () => {
      await admin.agent.get('/account/save-preferences?key=display.theme&value=dark').set(...HTML).expect(404);
      assert.strictEqual((await rowsOf(adminUser)).length, 0);
    });

    it('every generic verb on /api/v1/userpref, even for Administrator', async () => {
      const marker = `probe-${crypto.randomBytes(6).toString('hex')}`;
      const row = await UserPref.create({user: adminUser.id, key: 'dt.probe', value: marker}).fetch();
      // The session reaches the generic routes: a stock model answers.
      await admin.agent.get('/api/v1/user').set(...AJAX).expect(200);
      const body = {user: otherUser.id, key: 'dt.forged', value: 'forged'};
      const probes = [
        ['get', '/api/v1/userpref'],
        ['post', '/api/v1/userpref'],
        ['patch', '/api/v1/userpref'],
        ['put', '/api/v1/userpref'],
        ['delete', '/api/v1/userpref'],
        ['get', `/api/v1/userpref/${row.id}`],
        ['post', `/api/v1/userpref/${row.id}`],
        ['patch', `/api/v1/userpref/${row.id}`],
        ['put', `/api/v1/userpref/${row.id}`],
        ['delete', `/api/v1/userpref/${row.id}`],
        ['get', '/api/v1/userpref/search?q=probe'],
        ['get', '/api/v1/userpref/datatable'],
        ['post', '/api/v1/userpref/datatable'],
        ['get', '/api/v1/userpref/columns']
      ];
      for (const [verb, path] of probes) {
        const res = await admin.agent[verb](path).set(...AJAX).set('Accept', 'application/json').send(body);
        assert.ok(res.status < 200 || res.status >= 300, `${verb.toUpperCase()} ${path} answered ${res.status}`);
        assert.ok(!res.text.includes(marker) && !res.text.includes(row.id), `${verb.toUpperCase()} ${path} returned the row`);
      }
      assert.deepStrictEqual(await rowsOf(adminUser), [row]);
      assert.strictEqual((await rowsOf(otherUser)).length, 0);
    });
  });

  it('destroying users removes their UserPref rows, and only theirs', async () => {
    const gone = [await makeUser('mochaprefsgone1'), await makeUser('mochaprefsgone2')];
    await UserPref.createEach([
      {user: gone[0].id, key: 'display.theme', value: 'dark'},
      {user: gone[0].id, key: 'dt.hosts', value: [1]},
      {user: gone[1].id, key: 'display.theme', value: 'light'},
      {user: otherUser.id, key: 'display.theme', value: 'dark'}
    ]);
    // Criteria that are not ids, and no fetch: true, as tools/setup/seed-dev.js does.
    await User.destroy({username: {in: ['mochaprefsgone1', 'mochaprefsgone2']}});
    assert.strictEqual(await UserPref.count({user: {in: gone.map((u) => u.id)}}), 0);
    assert.strictEqual(await UserPref.count({user: otherUser.id}), 1);
  });

  describe('the theme on the rendered page::', () => {
    it('stamps a stored Dark on <html> and in #themePref, on /hosts and on /snapins', async () => {
      await write(admin, 'display.theme', 'dark').expect(200);
      for (const path of ['/hosts', '/snapins']) {
        const res = await admin.agent.get(path).set(...HTML).expect(200);
        assert.strictEqual(htmlTheme(res.text), 'dark', `${path} <html>`);
        assert.strictEqual(themePref(res.text), 'dark', `${path} #themePref`);
      }
      await write(admin, 'display.theme', 'light').expect(200);
      assert.strictEqual(htmlTheme((await admin.agent.get('/hosts').set(...HTML).expect(200)).text), 'light');
    });

    it('leaves <html> to the pre-paint script with no stored theme', async () => {
      const res = await admin.agent.get('/hosts').set(...HTML).expect(200);
      assert.strictEqual(htmlTheme(res.text), null);
      assert.strictEqual(themePref(res.text), '');
    });

    // api/hooks/plugins wraps each plugin function route to run loadPreferences
    // first. Sails sends a rejected promise to next() (a 500) only when the
    // bound handler is itself an async function, so the wrapper must be one.
    // Otherwise the rejection is unhandled, and it stops the server.
    it('keeps a failing plugin route a 500 behind the loadPreferences wrapper', async () => {
      // The wol route (plugins/wol) awaits Host.findOne(). Make it reject.
      const host = sails.models.host;
      const findOne = host.findOne;
      host.findOne = () => Promise.reject(new Error('stubbed Host.findOne failure'));
      try {
        await admin.agent.post('/api/v1/host/000000000000000000000000/wol')
          .set('Accept', 'application/json').set('X-CSRF-Token', admin.csrf).expect(500);
      } finally {
        host.findOne = findOne;
      }
    });

    it('runs the pre-paint script before any stylesheet on /login', async () => {
      const res = await supertest(app()).get('/login').set(...HTML).expect(200);
      assert.strictEqual(htmlTheme(res.text), null);
      const script = res.text.indexOf('prefers-color-scheme');
      const sheet = res.text.indexOf('rel="stylesheet"');
      assert.ok(script !== -1 && sheet !== -1 && script < sheet, 'the pre-paint script is not before the first stylesheet');
      // fog.theme.js reads no stored choice on the login page.
      assert.strictEqual(themePref(res.text), null);
    });
  });
});
